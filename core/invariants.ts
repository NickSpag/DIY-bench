// The checks that run on every evaluation (section 6.4 of the spec).
// Each returns Issues; evaluate() collects them into Resolved.issues.
import type { Axis, Box, Face, Issue, Range, Resolved, ResolvedCutPart, ResolvedPart, Src } from "./model/types.ts";
import { AXES, axesOfExtent, contains, EPS, ext, extent, FACE_AXIS, overlapAmounts } from "./geometry.ts";
import { cutSize, isCutPart } from "./parts.ts";
import { fmtLength } from "./units.ts";
import type { Nesting } from "./nesting.ts";

/** Joint kinds that let two parts overlap. */
export const OVERLAPPING_JOINTS = new Set(["dado", "groove", "rabbet", "notch"]);

const REF = /^(.+)\.([xyz])([01])$/;

export function runInvariants(r: Resolved): Issue[] {
  const issues: Issue[] = [];
  const units = r.project.units;
  const L = (n: number) => fmtLength(n, { units });
  const ids = new Set(r.parts.map((p) => p.id));
  const phaseIds = new Set(r.phases.map((p) => p.id));
  const stepIds = new Set(r.steps.map((s) => s.id));
  const push = (severity: Issue["severity"], code: string, message: string, extra: { parts?: string[]; phases?: string[]; src?: Src } = {}) => {
    const i: Issue = { severity, code, message };
    if (extra.parts) i.parts = extra.parts;
    if (extra.phases) i.phases = extra.phases;
    if (extra.src !== undefined) i.src = extra.src;
    issues.push(i);
  };
  const forPart = (p: ResolvedPart) => ({ parts: [p.id], src: p.src });

  // ---------- references ----------
  for (const p of r.parts) {
    if (p.kind === "context") continue;
    for (const j of p.joins ?? []) {
      if (!ids.has(j.to)) push("error", "unknown-ref", `${p.id} joins unknown part "${j.to}"`, forPart(p));
    }
  }
  for (const s of r.steps) {
    for (const id of s.parts) if (!ids.has(id)) push("error", "unknown-ref", `step ${s.id} lists unknown part "${id}"`, { src: s.src });
  }
  for (const v of r.views) {
    for (const id of v.veil ?? []) if (!ids.has(id)) push("error", "unknown-ref", `view ${v.id}: veil names unknown part "${id}"`);
    for (const l of v.labels ?? []) {
      if (l.part !== undefined && !ids.has(l.part)) push("error", "unknown-ref", `view ${v.id}: label names unknown part "${l.part}"`);
    }
    (v.dims ?? []).forEach((d, i) => {
      for (const ref of [d.from, d.to]) {
        if (typeof ref === "number") continue;
        const m = REF.exec(ref);
        if (!m) {
          push("error", "unknown-ref", `view ${v.id}: dimension ${i + 1} ref "${ref}" is not of the form part.x0 (axis x, y or z; side 0 or 1)`);
        } else if (!ids.has(m[1])) {
          push("error", "unknown-ref", `view ${v.id}: dimension ${i + 1} names unknown part "${m[1]}"`);
        } else if (!r.part(m[1])?.bounds) {
          push("error", "unknown-ref", `view ${v.id}: dimension ${i + 1} names "${m[1]}", which has no geometry`, { parts: [m[1]] });
        }
      }
      const axes = [d.from, d.to].filter((x): x is Exclude<typeof x, number> => typeof x === "string").map((x) => REF.exec(x)?.[2]).filter(Boolean);
      if (axes.length === 2 && axes[0] !== axes[1]) {
        push("error", "unknown-ref", `view ${v.id}: dimension ${i + 1} measures between different axes (${d.from} to ${d.to})`);
      }
    });
  }

  // ---------- names ----------
  const checkPhase = (owner: string, what: string, ph: string | undefined, extra: { parts?: string[]; src?: Src }) => {
    if (ph !== undefined && !phaseIds.has(ph)) push("error", "unknown-phase", `${owner}: ${what} "${ph}" is not a phase`, extra);
  };
  for (const p of r.parts) {
    const ex = forPart(p);
    if (p.kind === "context") {
      checkPhase(p.id, "phase", p.phase, ex);
    } else {
      checkPhase(p.id, "phase", p.phase, ex);
      if (p.step !== undefined && !stepIds.has(p.step)) push("error", "unknown-step", `${p.id}: step "${p.step}" is not a step`, ex);
    }
    checkPhase(p.id, "removedIn", p.removedIn, ex);
    for (const q of Object.keys(p.moves ?? {})) checkPhase(p.id, "moves", q, ex);
    if (isCutPart(p)) {
      checkPhase(p.id, "cutIn", p.cutIn, ex);
      const m = r.materials[p.material];
      if (!m) {
        push("error", "unknown-material", `${p.id}: material "${p.material}" is not defined`, ex);
      } else if ((p.kind === "panel") !== (m.type === "sheet")) {
        push("error", "unknown-material", `${p.id}: a ${p.kind} needs a ${p.kind === "panel" ? "sheet" : "board"} material, but "${p.material}" is a ${m.type} (use b.${m.type === "sheet" ? "panel" : "board"})`, ex);
      }
      for (const [face, bid] of Object.entries(p.band ?? {})) {
        if (!(bid in r.banding)) push("error", "unknown-banding", `${p.id}: banding "${bid}" on the ${face} face is not defined`, ex);
      }
    }
    if (p.kind === "hardware" && !(p.item in r.hardware)) push("error", "unknown-hardware", `${p.id}: hardware item "${p.item}" is not in the catalogue`, ex);
  }
  for (const s of r.steps) {
    if (!phaseIds.has(s.phase)) push("error", "unknown-phase", `step ${s.id}: phase "${s.phase}" is not a phase`, { src: s.src });
  }

  // ---------- ranges ----------
  const badRange = (rg: Range | undefined) => rg !== undefined && !(rg[0] < rg[1]);
  const badBox = (b: Box | undefined) => b !== undefined && AXES.some((a) => badRange(b[a]));
  for (const p of r.parts) {
    const boxes: [string, Box | undefined][] = [["box", p.bounds], ...Object.entries(p.moves ?? {}).map(([k, b]) => [`moves.${k}`, b] as [string, Box])];
    for (const [what, b] of boxes) if (badBox(b)) push("error", "range-order", `${p.id}: ${what} has a range with from ≥ to`, forPart(p));
  }
  for (const v of r.views) if (badRange(v.depth)) push("error", "range-order", `view ${v.id}: depth range has from ≥ to`);

  // ---------- panels and boards ----------
  for (const p of r.parts) {
    if (!isCutPart(p) || !p.materialDef || !p.sizes || badBox(p.box)) continue;
    const m = p.materialDef;
    const ex = forPart(p);
    const thin = axesOfExtent(p.box, m.thickness);
    const dims = AXES.map((a) => L(ext(p.box, a))).join(" × ");
    if (thin.length === 0) push("error", "thickness", `${p.id}: no axis is the material's ${L(m.thickness)} thickness (${dims})`, ex);
    if (m.type === "board" && m.width !== undefined && axesOfExtent(p.box, m.width).length === 0) {
      push("error", "board-width", `${p.id}: no axis is the ${L(m.width)} width of ${m.name} (${dims})`, ex);
    }
    if (thin.length > 0 && p.grain !== undefined && p.grain === p.sizes.tAxis) {
      push("error", "grain-axis", `${p.id}: grain runs along ${p.grain}, which is the thickness axis`, ex);
    }
    if (p.kind === "panel" && m.type === "sheet" && m.grained && p.grain === undefined) {
      push("error", "grain-axis", `${p.id}: ${m.name} is grained, so the panel needs a grain axis`, ex);
    }
    if (thin.length > 0) {
      for (const face of Object.keys(p.band ?? {}) as Face[]) {
        if (FACE_AXIS[face] === p.sizes.tAxis) push("error", "band-face", `${p.id}: the ${face} face is a broad face, not an edge, so it cannot be banded`, ex);
      }
    }
  }

  // ---------- overlap ----------
  const allowed = new Set<string>();
  for (const p of r.parts) {
    if (p.kind === "context") continue;
    for (const j of p.joins ?? []) {
      if (OVERLAPPING_JOINTS.has(j.by)) {
        allowed.add(`${p.id}|${j.to}`);
        allowed.add(`${j.to}|${p.id}`);
      }
    }
  }
  const order = new Map(r.parts.map((p, i) => [p.id, i]));
  const found = new Map<string, { a: ResolvedPart; b: ResolvedPart; phases: string[]; amounts: number[] }>();
  for (const ph of r.phases) {
    const state = r.stateAt(ph.id).parts.filter((s) => s.box && !badBox(s.box) && !(s.part.kind === "context" && s.part.role === "contents"));
    for (let i = 0; i < state.length; i++) {
      for (let j = i + 1; j < state.length; j++) {
        const a = state[i], b = state[j];
        if (a.part.kind === "context" && b.part.kind === "context") continue;
        if (allowed.has(`${a.part.id}|${b.part.id}`)) continue;
        const ov = overlapAmounts(a.box as Box, b.box as Box);
        if (!ov.every((v) => v > EPS)) continue;
        const [first, second] = (order.get(a.part.id) ?? 0) <= (order.get(b.part.id) ?? 0) ? [a.part, b.part] : [b.part, a.part];
        const key = `${first.id}|${second.id}`;
        const f = found.get(key);
        if (f) f.phases.push(ph.id);
        else found.set(key, { a: first, b: second, phases: [ph.id], amounts: ov });
      }
    }
  }
  for (const { a, b, phases, amounts } of found.values()) {
    const src = b.kind !== "context" ? b.src : a.src;
    push("error", "overlap", `${phases.join(", ")}: ${a.id} overlaps ${b.id} by ${amounts.map(L).join(" × ")}`, { parts: [a.id, b.id], phases, src });
  }

  // ---------- outside the room ----------
  const room = extent(r.parts.filter((p) => p.kind === "context" && (p.role === "wall" || p.role === "floor") && p.bounds && !badBox(p.bounds)).map((p) => p.bounds as Box));
  if (room) {
    for (const p of r.parts) {
      if (p.kind === "context") continue;
      const boxes = [p.bounds, ...Object.values(p.moves ?? {})].filter((b): b is Box => b !== undefined && !badBox(b));
      if (boxes.some((b) => !contains(room, b))) push("warning", "outside-room", `${p.id} lies outside the room (the walls and floor)`, forPart(p));
    }
  }

  // ---------- finish and steps ----------
  for (const p of r.parts) {
    if (isCutPart(p) && p.materialDef && (p.exposure ?? "exposed") === "exposed" && p.finishApplied === "none") {
      push("warning", "unfinished-exposed", `${p.id} is exposed but gets no finish (${p.materialDef.name}); set finish, or exposure "hidden" or "limited"`, forPart(p));
    }
  }
  for (const p of r.parts) {
    if (p.kind !== "context" && p.step === undefined) push("warning", "no-step", `${p.id} is not installed in any step`, forPart(p));
  }

  // ---------- strips ----------
  const strips = new Map<string, ResolvedCutPart[]>();
  for (const p of r.parts) {
    if (isCutPart(p) && p.strip) {
      const list = strips.get(p.strip.id) ?? [];
      list.push(p);
      strips.set(p.strip.id, list);
    }
  }
  for (const [sid, members] of strips) {
    const first = members[0];
    const ids = members.map((m) => m.id);
    const bad = (why: string) => push("error", "strip-mismatch", `strip ${sid}: ${why}`, { parts: ids, src: first.src });
    if (members.some((m) => m.material !== first.material)) bad(`members use different materials (${[...new Set(members.map((m) => m.material))].join(", ")})`);
    else if (first.materialDef?.type !== "sheet") bad(`members must be sheet-material panels`);
    if (members.some((m) => m.cutPhase !== first.cutPhase)) bad(`members are cut in different phases (${[...new Set(members.map((m) => m.cutPhase))].join(", ")})`);
    const widths = members.filter((m) => m.sizes).map((m) => (m.sizes as { w: number }).w);
    if (widths.some((w) => Math.abs(w - widths[0]) > EPS)) bad(`members have different widths across the strip (${widths.map(L).join(", ")})`);
    const orders = members.map((m) => m.strip?.order);
    if (new Set(orders).size !== orders.length) bad(`members share an order number`);
  }

  // ---------- cut precision ----------
  const step = units === "in" ? 1 / 32 : 0.5;
  for (const p of r.parts) {
    if (!isCutPart(p) || !p.sizes) continue;
    const c = cutSize(p, r.banding);
    const off = (n: number) => Math.abs(Math.round(n / step) * step - n) > EPS;
    if (off(c.l) || off(c.w)) {
      push("warning", "cut-precision", `${p.id}: cut size ${L(c.l)} × ${L(c.w)} is not a multiple of ${units === "in" ? "1/32″" : "0.5 mm"} (${c.l.toFixed(4)} × ${c.w.toFixed(4)}); round the value that produced it`, forPart(p));
    }
  }

  // ---------- design rules ----------
  for (const c of r.checks) {
    if (!c.pass) push(c.severity, `check:${c.id}`, `${c.label}${c.detail ? ` (${c.detail})` : ""}`, { src: c.src });
  }

  return issues;
}

const UNPLACED_WHY: Record<string, string> = {
  "too-big": "it is larger than every stock size",
  "no-stock": "the material has no stock left (owned pieces used up and nothing to buy)",
  "no-space": "no sheet had room",
};

/** `nesting:unplaced` errors for the parts the sheet layouts could not place. */
export function nestingIssues(r: Resolved, ns: Nesting[]): Issue[] {
  const out: Issue[] = [];
  for (const n of ns) {
    for (const u of n.unplaced) {
      const p = r.part(u.id);
      const i: Issue = {
        severity: "error", code: "nesting:unplaced",
        message: `${n.phase} ${n.material}: ${u.id} could not be placed on a sheet: ${UNPLACED_WHY[u.reason]} (${u.reason})`,
        parts: [u.id], phases: [n.phase],
      };
      if (p) i.src = p.src;
      out.push(i);
    }
  }
  return out;
}

/** Splits a dimension reference "part.x0" into its part, axis and side, or null. */
export function parseRef(ref: string): { part: string; axis: Axis; side: 0 | 1 } | null {
  const m = REF.exec(ref);
  return m ? { part: m[1], axis: m[2] as Axis, side: Number(m[3]) as 0 | 1 } : null;
}
