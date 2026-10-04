// Box operations on axis-aligned boxes. Pure functions; no DOM, no Node.
import type { Axis, Box, Cylinder, Face, Look, Range } from "./model/types.ts";

export const AXES: readonly Axis[] = ["x", "y", "z"];
export const EPS = 1e-6;

export const FACE_AXIS: Record<Face, Axis> = { left: "x", right: "x", bottom: "y", top: "y", back: "z", front: "z" };
export const FACE_SIDE: Record<Face, 0 | 1> = { left: 0, right: 1, bottom: 0, top: 1, back: 0, front: 1 };

/** Extent of a box along an axis. */
export const ext = (b: Box, a: Axis): number => b[a][1] - b[a][0];
export const size = (b: Box): [number, number, number] => [ext(b, "x"), ext(b, "y"), ext(b, "z")];
export const center = (b: Box): [number, number, number] => AXES.map((a) => (b[a][0] + b[a][1]) / 2) as [number, number, number];
export const volume = (b: Box): number => ext(b, "x") * ext(b, "y") * ext(b, "z");

export const near = (a: number, b: number, eps = EPS): boolean => Math.abs(a - b) < eps;

/** Per-axis overlap lengths of two boxes (negative or zero where they are apart or touching). */
export function overlapAmounts(a: Box, b: Box): [number, number, number] {
  return AXES.map((ax) => Math.min(a[ax][1], b[ax][1]) - Math.max(a[ax][0], b[ax][0])) as [number, number, number];
}

/** True when the boxes share positive volume beyond the tolerance. Faces that only touch do not overlap. */
export function overlaps(a: Box, b: Box, eps = EPS): boolean {
  return overlapAmounts(a, b).every((v) => v > eps);
}

/** The intersection of two boxes, or null when they do not overlap. */
export function intersect(a: Box, b: Box): Box | null {
  const r = {} as { x: Range; y: Range; z: Range };
  for (const ax of AXES) {
    const lo = Math.max(a[ax][0], b[ax][0]), hi = Math.min(a[ax][1], b[ax][1]);
    if (!(hi > lo)) return null;
    r[ax] = [lo, hi];
  }
  return r;
}

/** The bounding box of several boxes, or null for none. */
export function extent(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  const r = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] } as { x: [number, number]; y: [number, number]; z: [number, number] };
  for (const b of boxes) for (const ax of AXES) {
    r[ax][0] = Math.min(r[ax][0], b[ax][0]);
    r[ax][1] = Math.max(r[ax][1], b[ax][1]);
  }
  return r;
}

/** True when `inner` lies inside `outer` (within the tolerance). */
export function contains(outer: Box, inner: Box, eps = EPS): boolean {
  return AXES.every((ax) => inner[ax][0] >= outer[ax][0] - eps && inner[ax][1] <= outer[ax][1] + eps);
}

export function boxEquals(a: Box, b: Box, eps = EPS): boolean {
  return AXES.every((ax) => near(a[ax][0], b[ax][0], eps) && near(a[ax][1], b[ax][1], eps));
}

/** The bounding box of a cylinder. */
export function cylinderBounds(c: Cylinder): Box {
  const r = c.diameter / 2;
  const others = AXES.filter((a) => a !== c.axis);
  const b = {} as { x: Range; y: Range; z: Range };
  b[c.axis] = [c.from, c.to];
  b[others[0]] = [c.center[0] - r, c.center[0] + r];
  b[others[1]] = [c.center[1] - r, c.center[1] + r];
  return b;
}

/** The axes whose extent equals `t`. */
export function axesOfExtent(b: Box, t: number, eps = EPS): Axis[] {
  return AXES.filter((a) => near(ext(b, a), t, eps));
}

// ---------- projection to drawing views (section 7.3.1) ----------

/** A box projected into a view: u to the right, v up, d toward the viewer (larger is nearer). */
export type ViewBox = { u: Range; v: Range; d: Range };

const neg = (r: Range): Range => [-r[1], -r[0]];

export function projectBox(b: Box, look: Look): ViewBox {
  switch (look) {
    case "-z": return { u: b.x, v: b.y, d: b.z };
    case "+z": return { u: neg(b.x), v: b.y, d: neg(b.z) };
    case "+x": return { u: b.z, v: b.y, d: neg(b.x) };
    case "-x": return { u: neg(b.z), v: b.y, d: b.x };
    case "-y": return { u: b.x, v: neg(b.z), d: b.y };
  }
}

/** Projects a world point to view coordinates (u, v) and depth d. */
export function projectPoint(p: readonly [number, number, number], look: Look): [number, number, number] {
  const [x, y, z] = p;
  switch (look) {
    case "-z": return [x, y, z];
    case "+z": return [-x, y, -z];
    case "+x": return [z, y, -x];
    case "-x": return [-z, y, x];
    case "-y": return [x, -z, y];
  }
}
