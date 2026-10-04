// The 3D viewport (section 9.3): every part of the current phase or step as a box (or a
// cylinder) with edges, picking that respects the section plane, selection outlines and tints,
// explode, standard views, an orthographic toggle and a view cube. The <Canvas> and the camera
// controls stay mounted across model reloads, so an edit never moves the camera.
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { CameraControls, CameraControlsImpl, Edges, GizmoHelper, GizmoViewcube, Html, Outlines } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { useWb, type Section } from "../store.ts";
import { css } from "../theme.ts";
import { useFmt } from "../fmt.ts";
import { fmtPartSize } from "../../core/query.ts";
import { extent } from "../../core/geometry.ts";
import type { Box, Resolved, ResolvedPart } from "../../core/model/types.ts";

type Vec3 = [number, number, number];

/** What the keyboard and the tests can ask of the viewport. */
export const viewportApi: {
  standardView?: (n: 1 | 2 | 3 | 4 | 5, animate?: boolean) => void;
  frame?: () => void;
  controls?: CameraControls | null;
} = {};

// ---------- colours from the theme ----------

type Palette = Record<"bg" | "wood" | "raw" | "face" | "hardwood" | "pine" | "metal" | "edge" | "wall" | "wallEdge" | "select" | "step" | "fabric" | "grid1" | "grid2" | "ink", string>;

function readPalette(): Palette {
  const v = (n: string, fb: string) => css(n) || fb;
  return {
    bg: v("--viewport-bg", "#e9eded"), wood: v("--wood", "#ddb987"), raw: v("--raw-3d", "#c9a674"), face: v("--face", "#e8cc9c"),
    hardwood: v("--hardwood", "#b98a52"), pine: v("--pine", "#ecdcb6"), metal: v("--metal", "#8d979c"), edge: v("--edge", "#5a4220"),
    wall: v("--wallface", "#eff2f2"), wallEdge: v("--ink-faint", "#8a979d"), select: v("--hl-select", "#e2531b"), step: v("--hl-step", "#2f8f6a"),
    fabric: v("--fabric-1", "#8a9ca7"), grid1: v("--rule-strong", "#b9c4c7"), grid2: v("--rule", "#d2dadc"), ink: v("--ink", "#1c2529"),
  };
}

function usePalette(): Palette {
  const theme = useWb((s) => s.theme);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setTick((t) => t + 1);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(readPalette, [theme, tick]);
}

function partColor(p: ResolvedPart, pal: Palette): string {
  if (p.kind === "hardware") return pal.metal;
  if (p.kind === "context") return p.color ?? (p.role === "contents" ? pal.fabric : pal.wall);
  const m = p.materialDef;
  if (!m) return pal.wood;
  if (m.color) return m.color;
  if (m.type === "sheet") {
    if (m.finish !== "none") return pal.wood;
    return p.finishApplied && p.finishApplied !== "none" ? pal.face : pal.raw;
  }
  return m.finish === "none" ? pal.pine : pal.hardwood;
}

// ---------- geometry helpers ----------

const centreOf = (b: Box): Vec3 => [(b.x[0] + b.x[1]) / 2, (b.y[0] + b.y[1]) / 2, (b.z[0] + b.z[1]) / 2];
const sizeOf = (b: Box): Vec3 => [b.x[1] - b.x[0], b.y[1] - b.y[0], b.z[1] - b.z[0]];

/** The plane that keeps `axis < at` (or `axis > at` when flipped); three.js clips the negative side. */
export function sectionPlane(s: Section, plane = new THREE.Plane()): THREE.Plane {
  const n = new THREE.Vector3(s.axis === "x" ? 1 : 0, s.axis === "y" ? 1 : 0, s.axis === "z" ? 1 : 0);
  if (s.flip) plane.set(n, -s.at);
  else plane.set(n.negate(), s.at);
  return plane;
}

type Entry = { part: ResolvedPart; box: Box; ghost: boolean };

/** What the scene shows at the current phase or step, with explode offsets. */
function sceneEntries(r: Resolved, phase: string, step: string | null): { entries: Entry[]; centre: Vec3; extentBox: Box | null } {
  let state;
  try {
    state = r.stateAt(phase, step ?? undefined);
  } catch {
    state = r.stateAt(r.phases[r.phases.length - 1].id);
  }
  const present = new Set(state.parts.map((e) => e.part.id));
  const entries: Entry[] = [];
  for (const e of state.parts) if (e.box) entries.push({ part: e.part, box: e.box, ghost: false });
  if (step) {
    // Parts the step works on that are not installed yet (p1-bench lists the partitions) are ghosts.
    const st = r.steps.find((s) => s.id === step);
    for (const id of st?.parts ?? []) {
      if (present.has(id)) continue;
      const p = r.part(id);
      if (p?.bounds) entries.push({ part: p, box: p.bounds, ghost: true });
    }
  }
  const built = entries.filter((e) => !e.ghost && e.part.kind !== "context").map((e) => e.box);
  const ex = extent(built);
  return { entries, centre: ex ? centreOf(ex) : [0, 0, 0], extentBox: ex };
}

/** Floors are drawn except the lowest, which the grid stands in for (it is drawn at that floor's
 *  level). Landings, stair treads and the storeys above are drawn. */
function drawnFloor(p: { kind: string; role?: string }, b: Box, lowest: number): boolean {
  return p.kind === "context" && p.role === "floor" && b.y[1] > lowest + 1e-6;
}
const lowestFloor = (items: { part: { kind: string; role?: string }; box?: Box }[]): number =>
  Math.min(...items.filter((e) => e.part.kind === "context" && e.part.role === "floor" && e.box).map((e) => (e.box as Box).y[1]));

/** Explode offset of a part: (centre(part) − centre(all built parts)) × k. Context parts do not move. */
export function explodeOffset(e: { part: ResolvedPart; box: Box }, centre: Vec3, k: number): Vec3 {
  if (e.part.kind === "context" || k === 0) return [0, 0, 0];
  const c = centreOf(e.box);
  return [(c[0] - centre[0]) * k, (c[1] - centre[1]) * k, (c[2] - centre[2]) * k];
}

/** The explode factor, eased over 300 ms (instantly under prefers-reduced-motion). */
function useAnimated(target: number): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now(), v0 = from.current;
    if (reduce || v0 === target) {
      from.current = target;
      setValue(target);
      return;
    }
    let raf = 0;
    const tick = (t: number) => {
      const u = Math.min(1, (t - start) / 300);
      const e = 1 - Math.pow(1 - u, 3);
      const v = u >= 1 ? target : v0 + (target - v0) * e;
      from.current = v;
      setValue(v);
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

// ---------- parts ----------

const meshes = new Map<string, THREE.Mesh>();
const noRaycast = () => null;

function PartMesh({ e, offset, pal, planes, selected, inStep, section }: {
  e: Entry; offset: Vec3; pal: Palette; planes: THREE.Plane[]; selected: boolean; inStep: boolean; section: THREE.Plane | null;
}) {
  const p = e.part;
  const c = centreOf(e.box);
  const pos: Vec3 = [c[0] + offset[0], c[1] + offset[1], c[2] + offset[2]];
  const isContext = p.kind === "context";
  const isContents = isContext && p.role === "contents";
  const translucent = e.ghost || isContext || (p.kind === "hardware" && !p.cylinder);
  const opacity = e.ghost ? 0.22 : isContents ? 0.28 : isContext ? (p.id.startsWith("baseboard") ? 0.55 : p.role === "floor" ? 0.85 : 0.1) : p.kind === "hardware" ? 0.45 : 1;
  const color = partColor(p, pal);
  const emissive = selected ? pal.select : inStep ? pal.step : "#000000";
  const emissiveIntensity = selected ? 0.55 : inStep ? 0.32 : 0;
  const pickable = !isContext && !e.ghost;

  const ref = (m: THREE.Mesh | null) => {
    if (m) {
      m.userData.partId = p.id;
      m.userData.ghost = e.ghost;
      meshes.set(p.id, m);
    } else if (meshes.get(p.id)?.userData.partId === p.id) {
      meshes.delete(p.id);
    }
  };

  const onClick = (ev: ThreeEvent<MouseEvent>) => {
    // three.js raycasting ignores clipping planes: skip hits on the removed side, without
    // stopping propagation, so the next part along the ray gets the click.
    if (section && section.distanceToPoint(ev.point) < 0) return;
    ev.stopPropagation();
    if (ev.delta > 4) return; // a drag that orbited the camera, not a click
    useWb.getState().select([p.id], { toggle: ev.nativeEvent.shiftKey, source: "3d" });
  };

  let geometry: ReactNode;
  let rotation: Vec3 = [0, 0, 0];
  if (p.kind === "hardware" && p.cylinder) {
    const cy = p.cylinder;
    geometry = <cylinderGeometry args={[cy.diameter / 2, cy.diameter / 2, cy.to - cy.from, 28]} />;
    rotation = cy.axis === "x" ? [0, 0, Math.PI / 2] : cy.axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  } else {
    geometry = <boxGeometry args={sizeOf(e.box)} />;
  }

  return (
    <mesh
      ref={ref} position={pos} rotation={rotation}
      onClick={pickable ? onClick : undefined}
      raycast={pickable ? undefined : noRaycast}
      renderOrder={translucent ? 2 : 0}
    >
      {geometry}
      <meshStandardMaterial
        color={color} emissive={emissive} emissiveIntensity={emissiveIntensity}
        roughness={0.85} metalness={p.kind === "hardware" ? 0.35 : 0}
        transparent={translucent} opacity={opacity} depthWrite={!translucent}
        clippingPlanes={planes} clipShadows side={translucent ? THREE.DoubleSide : THREE.FrontSide}
        polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1}
      />
      {(
        <Edges
          threshold={15}
          color={isContext ? pal.wallEdge : selected ? pal.select : pal.edge}
          lineWidth={selected ? 1.6 : 1}
          transparent opacity={isContext ? (p.role === "floor" ? 0.8 : 0.35) : e.ghost ? 0.4 : 0.75}
          clippingPlanes={planes}
        />
      )}
      {selected && <Outlines thickness={3.5} screenspace color={pal.select} clippingPlanes={planes} />}
      {selected && (
        // Drawn again on top of everything, so a selected part stays visible behind others (a frame behind lattice).
        <mesh raycast={noRaycast} renderOrder={10}>
          {geometry}
          <meshBasicMaterial color={pal.select} transparent opacity={0.18} depthTest={false} depthWrite={false} clippingPlanes={planes} />
          <Edges threshold={15} color={pal.select} lineWidth={1.4} depthTest={false} transparent opacity={0.95} renderOrder={11} clippingPlanes={planes} />
        </mesh>
      )}
    </mesh>
  );
}

function SceneParts({ pal, plane }: { pal: Palette; plane: THREE.Plane }) {
  const r = useWb((s) => s.resolved);
  const phase = useWb((s) => s.phase);
  const step = useWb((s) => s.step);
  const selected = useWb((s) => s.selected);
  const explode = useWb((s) => s.explode);
  const section = useWb((s) => s.section);
  const showContents = useWb((s) => s.showContents);
  const showRoom = useWb((s) => s.showRoom);
  const k = useAnimated(explode);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    sectionPlane(section, plane);
    invalidate();
  }, [section, plane, invalidate]);

  const planesOn = useMemo(() => [plane], [plane]);
  const planes = section.enabled ? planesOn : NO_PLANES;
  if (!r) return null;
  const { entries, centre } = sceneEntries(r, phase, step);
  const stepParts = new Set(step ? r.steps.find((s) => s.id === step)?.parts ?? [] : []);
  const sel = new Set(selected);
  // Room walls that would hide the build are left out: the ones a drawing view draws as a veil
  // (the front returns and the header) and anything entirely above the built parts (the ceiling).
  const veiled = new Set(r.views.flatMap((v) => v.veil ?? []));
  const builtTop = Math.max(...entries.filter((e) => e.part.kind !== "context").map((e) => e.box.y[1]));
  const lowest = lowestFloor(entries);
  const shown = entries.filter((e) => {
    if (e.part.kind !== "context") return true;
    if (e.part.role === "contents") return showContents;
    if (!showRoom) return false;
    // The grid stands in for the lowest floor. Other floors (landings, stair treads, the
    // storey above or below) are drawn.
    if (e.part.role === "floor") return drawnFloor(e.part, e.box, lowest);
    return !veiled.has(e.part.id) && e.box.y[0] < builtTop;
  });
  return (
    <group>
      {shown.map((e) => (
        <PartMesh key={e.part.id} e={e} offset={explodeOffset(e, centre, k)} pal={pal} planes={planes}
          selected={sel.has(e.part.id)} inStep={stepParts.has(e.part.id) && !sel.has(e.part.id)}
          section={section.enabled ? plane : null} />
      ))}
    </group>
  );
}
const NO_PLANES: THREE.Plane[] = [];

// ---------- tooltip ----------

function Tooltip() {
  const r = useWb((s) => s.resolved);
  const selected = useWb((s) => s.selected);
  const phase = useWb((s) => s.phase);
  const step = useWb((s) => s.step);
  const explode = useWb((s) => s.explode);
  const f = useFmt();
  const [, force] = useState(0);
  useEffect(() => {
    // the mesh positions settle after the explode animation
    const t = setTimeout(() => force((n) => n + 1), 350);
    return () => clearTimeout(t);
  }, [explode, phase, step, selected]);
  if (!r || selected.length !== 1) return null;
  const p = r.part(selected[0]);
  const m = meshes.get(selected[0]);
  if (!p || !m || m.userData.ghost) return null;
  const mat = p.kind === "panel" || p.kind === "board" ? p.materialDef?.name ?? p.material : p.kind === "hardware" ? r.hardware[p.item]?.name ?? p.item : p.role;
  const phaseNo = r.phases.findIndex((x) => x.id === p.phase) + 1;
  const pos = m.position;
  return (
    <Html position={[pos.x, pos.y, pos.z]} zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
      <div className="tooltip-card" data-testid="tooltip">
        <div className="nm">{p.name}</div>
        {p.where && <div className="wh">{p.where}</div>}
        <div className="sz">{fmtPartSize(r, p, f.display)}</div>
        <div className="mt">{mat}{phaseNo > 0 ? ` · phase ${phaseNo}` : ""}{p.kind !== "context" && p.step ? ` · ${p.step}` : ""}</div>
        {p.src && <div className="src">{p.src.file.split("/").pop()}:{p.src.line}</div>}
      </div>
    </Html>
  );
}

// ---------- camera ----------

const DIRS: Record<1 | 2 | 3 | 4 | 5, Vec3> = {
  1: [0, 0, 1], // front: from the room, looking at the back wall
  2: [0, 1, 0], // top
  3: [-1, 0, 0], // left: from the left, looking +x
  4: [1, 0, 0], // right
  5: [0.85, 0.62, 1.25], // isometric, from the front right and above
};

function CameraRig({ boxRef }: { boxRef: React.MutableRefObject<Box | null> }) {
  const controls = useRef<CameraControls>(null);
  const set = useThree((s) => s.set);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const mode = useWb((s) => s.camera.mode);
  const persp = useMemo(() => {
    const c = new THREE.PerspectiveCamera(35, 1, 0.5, 5000);
    c.position.set(150, 120, 220);
    return c;
  }, []);
  const ortho = useMemo(() => {
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, -5000, 10000);
    c.position.set(150, 120, 220);
    return c;
  }, []);
  const fitted = useRef(false);
  const dom = useThree((s) => s.gl.domElement);

  // ⌘-drag (or Ctrl-drag) pans, like a right-drag. A capturing listener on the canvas runs
  // before camera-controls' own pointerdown handler, so the left button's action is set per drag.
  useEffect(() => {
    const { ACTION } = CameraControlsImpl;
    const onDown = (e: PointerEvent) => {
      const cc = controls.current;
      if (cc) cc.mouseButtons.left = e.metaKey || e.ctrlKey ? ACTION.TRUCK : ACTION.ROTATE;
    };
    dom.addEventListener("pointerdown", onDown, { capture: true });
    return () => dom.removeEventListener("pointerdown", onDown, { capture: true });
  }, [dom]);

  // Switch between perspective and orthographic, keeping the view: same target, same
  // direction, and an orthographic zoom that shows what the perspective camera showed.
  useEffect(() => {
    const cc = controls.current;
    if (!cc) return;
    const target = cc.getTarget(new THREE.Vector3());
    const pos = cc.getPosition(new THREE.Vector3());
    const dist = pos.distanceTo(target);
    const halfFov = THREE.MathUtils.degToRad(persp.fov / 2);
    // camera-controls keeps its own zoom and writes it to the camera on every update, so the
    // zoom goes through zoomTo rather than onto the camera.
    if (mode === "orthographic" && cc.camera !== ortho) {
      const zoom = size.height / (2 * dist * Math.tan(halfFov));
      ortho.position.copy(pos);
      ortho.up.copy(persp.up);
      ortho.zoom = zoom;
      ortho.updateProjectionMatrix();
      cc.camera = ortho;
      set({ camera: ortho });
      void cc.zoomTo(zoom, false);
    } else if (mode === "perspective" && cc.camera !== persp) {
      const d = size.height / (2 * ortho.zoom * Math.tan(halfFov));
      const dir = pos.clone().sub(target).normalize();
      persp.position.copy(target).addScaledVector(dir, d);
      persp.zoom = 1;
      persp.updateProjectionMatrix();
      cc.camera = persp;
      set({ camera: persp });
      void cc.zoomTo(1, false);
      void cc.setLookAt(persp.position.x, persp.position.y, persp.position.z, target.x, target.y, target.z, false);
    }
    void cc.setLookAt(...(cc.camera.position.toArray() as Vec3), target.x, target.y, target.z, false);
    invalidate();
  }, [mode, ortho, persp, set, size.height, invalidate]);

  // r3f sizes only the camera it created, so both of ours are sized here, on every resize.
  useLayoutEffect(() => {
    persp.aspect = size.width / Math.max(1, size.height);
    persp.updateProjectionMatrix();
    ortho.left = -size.width / 2;
    ortho.right = size.width / 2;
    ortho.top = size.height / 2;
    ortho.bottom = -size.height / 2;
    ortho.updateProjectionMatrix();
    (persp as unknown as { manual: boolean }).manual = true;
    (ortho as unknown as { manual: boolean }).manual = true;
    invalidate();
  }, [size.width, size.height, persp, ortho, invalidate]);

  useLayoutEffect(() => {
    set({ camera: mode === "orthographic" ? ortho : persp });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const standardView = (n: 1 | 2 | 3 | 4 | 5, animate = true) => {
    const cc = controls.current, b = boxRef.current;
    if (!cc || !b) return;
    const c = centreOf(b);
    const d = DIRS[n];
    const len = Math.hypot(...d);
    const R = 300;
    void cc.setLookAt(c[0] + (d[0] / len) * R, c[1] + (d[1] / len) * R, c[2] + (d[2] / len) * R, c[0], c[1], c[2], false);
    const b3 = new THREE.Box3(new THREE.Vector3(b.x[0], b.y[0], b.z[0]), new THREE.Vector3(b.x[1], b.y[1], b.z[1]));
    const pad = Math.max(...sizeOf(b)) * 0.06;
    if (n === 5) {
      const sphere = b3.getBoundingSphere(new THREE.Sphere());
      sphere.radius *= 1.06;
      void cc.fitToSphere(sphere, animate);
    }
    else void cc.fitToBox(b3, animate, { paddingLeft: pad, paddingRight: pad, paddingTop: pad, paddingBottom: pad });
    invalidate();
  };

  const frame = () => {
    const cc = controls.current;
    if (!cc) return;
    const sel = useWb.getState().selected.map((id) => meshes.get(id)).filter((m): m is THREE.Mesh => !!m);
    const box = new THREE.Box3();
    if (sel.length) for (const m of sel) box.expandByObject(m);
    else {
      const b = boxRef.current;
      if (!b) return;
      box.set(new THREE.Vector3(b.x[0], b.y[0], b.z[0]), new THREE.Vector3(b.x[1], b.y[1], b.z[1]));
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    sphere.radius = Math.max(sphere.radius * 1.15, 4);
    void cc.fitToSphere(sphere, true);
    invalidate();
  };

  useEffect(() => {
    viewportApi.standardView = standardView;
    viewportApi.frame = frame;
    viewportApi.controls = controls.current;
    if (import.meta.env.DEV && window.__wb) window.__wb.controls = controls.current;
  });

  // The first model frames the isometric view; later models never move the camera.
  const r = useWb((s) => s.resolved);
  useEffect(() => {
    if (!fitted.current && r && boxRef.current && controls.current) {
      fitted.current = true;
      standardView(5, false);
    }
  });

  return (
    <CameraControls
      ref={controls}
      makeDefault
      camera={persp}
      smoothTime={0.18}
      draggingSmoothTime={0.08}
      dollyToCursor
      dollySpeed={3.25}
      minDistance={2}
      maxDistance={2000}
    />
  );
}

// ---------- the canvas ----------

function Scene() {
  const pal = usePalette();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 40), []);
  const r = useWb((s) => s.resolved);
  const phase = useWb((s) => s.phase);
  const showRoom = useWb((s) => s.showRoom);
  const boxRef = useRef<Box | null>(null);
  const groundRef = useRef(0);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  // The extent used for standard views: built parts in the final phase, so views do not jump between phases.
  if (r) {
    const last = r.phases[r.phases.length - 1]?.id;
    const parts = last ? r.stateAt(last).parts : [];
    const lowest = lowestFloor(parts);
    // With the room shown, floors above or below the build (landings, stairs) are framed too.
    const framed = parts.filter((e) => e.box && (e.part.kind !== "context" || (showRoom && drawnFloor(e.part, e.box, lowest))));
    const ex = last ? extent(framed.map((e) => e.box as Box)) : null;
    boxRef.current = ex;
    groundRef.current = Number.isFinite(lowest) ? lowest : 0;
  }
  useEffect(() => {
    scene.background = new THREE.Color(pal.bg);
    invalidate();
  }, [pal, scene, invalidate]);

  // Test hooks (dev builds only): meshes by id, the camera, the section and part centres on screen.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = (window.__wb ??= {});
    w.meshes = meshes;
    w.section = { plane, get state() { return useWb.getState().section; } };
    Object.defineProperty(w, "camera", { configurable: true, get: () => camera });
    w.gl = gl;
    w.invalidate = invalidate;
    // Every part along the ray through a screen point, nearest first, ignoring the section:
    // what three.js's raycaster reports on its own (the trap that picking must filter).
    w.rayHits = (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, camera);
      const pickable = [...meshes.values()].filter((m) => m.userData.partId && !m.userData.ghost && r?.part(m.userData.partId)?.kind !== "context");
      return rc.intersectObjects(pickable, false).map((h) => ({ id: h.object.userData.partId as string, z: h.point.z, kept: plane.distanceToPoint(h.point) >= 0 }));
    };
    w.project = (id: string) => {
      const m = meshes.get(id);
      if (!m) return null;
      m.updateWorldMatrix(true, false);
      const v = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    };
  }, [camera, gl, plane, invalidate, size, r]);

  void phase;
  const ex = boxRef.current;
  const gridSize = ex ? Math.ceil(Math.max(ex.x[1] - ex.x[0], ex.z[1] - ex.z[0]) * 1.6 / 12) * 12 : 120;
  const gridCentre: Vec3 = ex ? [(ex.x[0] + ex.x[1]) / 2, 0, (ex.z[0] + ex.z[1]) / 2] : [0, 0, 0];

  return (
    <>
      <hemisphereLight args={["#ffffff", "#b9b2a5", 1.6]} />
      <directionalLight position={[60, 140, 120]} intensity={1.5} />
      <directionalLight position={[-120, 60, -40]} intensity={0.45} />
      <SceneParts pal={pal} plane={plane} />
      {showRoom && <gridHelper key={`${pal.grid1}${gridSize}`} args={[gridSize, gridSize / 6, pal.grid1, pal.grid2]} position={[gridCentre[0], groundRef.current + 0.01, gridCentre[2]]} raycast={noRaycast} />}
      <Tooltip />
      <CameraRig boxRef={boxRef} />
      <GizmoHelper alignment="bottom-right" margin={[62, 62]}>
        <GizmoViewcube
          color={pal.wall} textColor={pal.ink} strokeColor={pal.wallEdge} hoverColor={pal.wood} opacity={0.95}
          faces={["Right", "Left", "Top", "Bottom", "Front", "Back"]}
        />
      </GizmoHelper>
    </>
  );
}

// ---------- toolbar ----------

function Toolbar() {
  const mode = useWb((s) => s.camera.mode);
  const explode = useWb((s) => s.explode);
  const section = useWb((s) => s.section);
  const showRoom = useWb((s) => s.showRoom);
  const showContents = useWb((s) => s.showContents);
  const r = useWb((s) => s.resolved);
  const set = useWb((s) => s.set);
  const f = useFmt();
  const ex = r ? extent(r.parts.filter((p) => p.kind !== "context" && p.bounds).map((p) => p.bounds as Box)) : null;
  const range = ex ? ex[section.axis] : ([0, 100] as const);
  return (
    <div className="vp-tools" data-testid="vp-tools">
      <div className="seg" role="group" aria-label="Camera">
        <button type="button" aria-pressed={mode === "perspective"} title="Perspective  (O toggles)" onClick={() => set({ camera: { mode: "perspective" } })}>Persp</button>
        <button type="button" aria-pressed={mode === "orthographic"} title="Orthographic  (O toggles)" onClick={() => set({ camera: { mode: "orthographic" } })}>Ortho</button>
      </div>
      <div className="seg" role="group" aria-label="Standard views">
        {(["Front", "Top", "Left", "Right", "Iso"] as const).map((t, i) => (
          <button key={t} type="button" title={`${t} view  (${i + 1})`} onClick={() => viewportApi.standardView?.((i + 1) as 1 | 2 | 3 | 4 | 5)}>{t}</button>
        ))}
        <button type="button" title="Frame the selection, or everything  (F)" onClick={() => viewportApi.frame?.()}>Fit</button>
      </div>
      <div className="seg" role="group" aria-label="Explode" style={{ alignItems: "center", padding: "0 8px", gap: 6 }}>
        <span className="tb-label" title="Explode  (E)">Explode</span>
        <input type="range" min={0} max={1.5} step={0.05} value={explode} aria-label="Explode" data-testid="explode"
          onChange={(e) => set({ explode: Number(e.target.value) })} />
      </div>
      <div className="seg" role="group" aria-label="Section" style={{ alignItems: "center" }}>
        <button type="button" aria-pressed={!section.enabled} title="No section  (S toggles)" onClick={() => set({ section: { ...section, enabled: false } })}>Cut off</button>
        {(["x", "y", "z"] as const).map((a) => (
          <button key={a} type="button" aria-pressed={section.enabled && section.axis === a} title={`Section across ${a}`}
            onClick={() => {
              const rg = ex ? ex[a] : ([0, 100] as const);
              const at = section.axis === a ? section.at : Math.round(((rg[0] + rg[1]) / 2) * 16) / 16;
              set({ section: { ...section, axis: a, at, enabled: true }, sectionSync: false });
            }}>{a}</button>
        ))}
        {section.enabled && <>
          <input type="range" min={range[0]} max={range[1]} step={1 / 16} value={section.at} aria-label="Section position" style={{ margin: "0 6px" }}
            onChange={(e) => set({ section: { ...section, at: Number(e.target.value) }, sectionSync: false })} />
          <span className="num" style={{ fontSize: "0.72rem", padding: "0 6px 0 0", minWidth: "3.6em" }}>{f.L(section.at)}</span>
          <button type="button" title="Keep the other side" onClick={() => set({ section: { ...section, flip: !section.flip } })}>{section.flip ? "keep >" : "keep <"}</button>
        </>}
      </div>
      <div className="seg" role="group" aria-label="Show">
        <button type="button" aria-pressed={showRoom} title="Walls, floor and grid" onClick={() => set({ showRoom: !showRoom })}>Room</button>
        <button type="button" aria-pressed={showContents} title="Clothes, bins and other contents" onClick={() => set({ showContents: !showContents })}>Contents</button>
      </div>
    </div>
  );
}

export function Viewport3D() {
  return (
    <div className="viewport" data-testid="viewport">
      <Canvas
        gl={{ localClippingEnabled: true, preserveDrawingBuffer: true, antialias: true }}
        frameloop="demand"
        dpr={[1, 2]}
        onPointerMissed={(e) => {
          if (e.type === "click" && !e.shiftKey) useWb.getState().clearSelection();
        }}
      >
        <Scene />
      </Canvas>
      <Toolbar />
      <div className="vp-hint">drag to orbit · ⌘-drag or right-drag to pan · scroll to zoom · 1–5 views · F frame</div>
    </div>
  );
}
