// View mapping (section 7.3.1 of the spec): world (x, y, z) → view (u right, v up, d toward the
// viewer). SVG x = u and SVG y = −v.
import type { Axis, Look, Range } from "../model/types.ts";
export { projectBox, projectPoint, type ViewBox } from "../geometry.ts";

/** The world axis a view looks along. */
export const lookAxis = (look: Look): Axis => (look[1] as Axis);

/** The depth d of a cut plane at world coordinate c on the look axis (d grows toward the viewer). */
export function cutDepth(look: Look, c: number): number {
  // d = −coordinate when looking along +axis, +coordinate when looking along −axis.
  return look[0] === "+" ? -c : c;
}

/** Where a world axis lands on screen in a view: u or v with a sign, or null for the depth axis. */
export function screenAxis(look: Look, axis: Axis): { screen: "u" | "v"; sign: 1 | -1 } | null {
  switch (look) {
    case "-z": return axis === "x" ? { screen: "u", sign: 1 } : axis === "y" ? { screen: "v", sign: 1 } : null;
    case "+z": return axis === "x" ? { screen: "u", sign: -1 } : axis === "y" ? { screen: "v", sign: 1 } : null;
    case "+x": return axis === "z" ? { screen: "u", sign: 1 } : axis === "y" ? { screen: "v", sign: 1 } : null;
    case "-x": return axis === "z" ? { screen: "u", sign: -1 } : axis === "y" ? { screen: "v", sign: 1 } : null;
    case "-y": return axis === "x" ? { screen: "u", sign: 1 } : axis === "z" ? { screen: "v", sign: -1 } : null;
  }
}

/** Maps a world range on an axis to a screen range (sorted). */
export function toScreen(look: Look, axis: Axis, r: Range): Range | null {
  const m = screenAxis(look, axis);
  if (!m) return null;
  return m.sign === 1 ? [r[0], r[1]] : [-r[1], -r[0]];
}
