// Helpers that describe a resolved panel or board: its length, width and thickness
// axes, its banded edges and its cut size. Shared by evaluation, invariants and the cut list.
import type { Axis, Box, Face, Part, Resolved, ResolvedCutPart, Sizes } from "./model/types.ts";
import { AXES, axesOfExtent, ext, FACE_AXIS, FACE_SIDE } from "./geometry.ts";

/** True for panels and boards: the parts that appear in the cut list. */
export const isCutPart = <P extends Part>(p: P): p is Extract<P, { kind: "panel" | "board" }> =>
  p.kind === "panel" || p.kind === "board";

/**
 * Length, width and thickness axes of a panel or board (section 6.2):
 * thickness is the axis whose extent equals the material thickness (if several, the one
 * that is neither the grain axis nor the largest); length is the grain axis when set,
 * otherwise the larger remaining axis; width is the last one.
 */
export function computeSizes(b: Box, thickness: number, grain?: Axis): Sizes {
  let candidates = axesOfExtent(b, thickness);
  let tAxis: Axis;
  if (candidates.length === 0) {
    tAxis = [...AXES].sort((a, c) => ext(b, a) - ext(b, c))[0]; // no match: the thinnest axis (the thickness invariant reports it)
  } else if (candidates.length === 1) {
    tAxis = candidates[0];
  } else {
    const largest = [...AXES].sort((a, c) => ext(b, c) - ext(b, a))[0];
    const narrowed = candidates.filter((a) => a !== grain && a !== largest);
    candidates = narrowed.length ? narrowed : candidates.filter((a) => a !== grain);
    tAxis = candidates[0] ?? axesOfExtent(b, thickness)[0];
  }
  const rest = AXES.filter((a) => a !== tAxis);
  const lAxis = grain && grain !== tAxis ? grain : ext(b, rest[1]) > ext(b, rest[0]) ? rest[1] : rest[0];
  const wAxis = rest.find((a) => a !== lAxis) as Axis;
  return { l: ext(b, lAxis), w: ext(b, wAxis), t: ext(b, tAxis), lAxis, wAxis, tAxis };
}

export type EdgeName = "l1" | "l2" | "w1" | "w2";

/** Names a part face as an edge: faces across the width axis run along the length (l1, l2); faces across the length axis are w1, w2. */
export function edgeOfFace(sizes: Sizes, face: Face): EdgeName | null {
  const a = FACE_AXIS[face], side = FACE_SIDE[face];
  if (a === sizes.wAxis) return side === 0 ? "l1" : "l2";
  if (a === sizes.lAxis) return side === 0 ? "w1" : "w2";
  return null; // a broad face
}

/** Banded edges of a part, by edge name → banding id. */
export function bandedEdges(p: ResolvedCutPart): Partial<Record<EdgeName, string>> {
  const out: Partial<Record<EdgeName, string>> = {};
  if (!p.sizes) return out;
  for (const [face, id] of Object.entries(p.band ?? {}) as [Face, string][]) {
    const e = edgeOfFace(p.sizes, face);
    if (e) out[e] = id;
  }
  return out;
}

/** Length of a banded edge: an l-edge runs the part's length, a w-edge its width. */
export const edgeLength = (sizes: Sizes, e: EdgeName): number => (e[0] === "l" ? sizes.l : sizes.w);

/** Cut size: finished + oversize, less the banding thickness on the opposite edges when banding reduces the cut size. */
export function cutSize(p: ResolvedCutPart, banding: Resolved["banding"]): { l: number; w: number; t: number } {
  const s = p.sizes as Sizes;
  const m = p.materialDef;
  const over = m?.oversize ?? 0;
  const edges = bandedEdges(p);
  const less = (names: EdgeName[]) => names.reduce((acc, e) => {
    const bd = edges[e] !== undefined ? banding[edges[e] as string] : undefined;
    return acc + (bd && bd.reducesCutSize ? bd.thickness : 0);
  }, 0);
  return { l: s.l + over - less(["w1", "w2"]), w: s.w + over - less(["l1", "l2"]), t: s.t };
}

export const defaultKerf = (units: "in" | "mm"): number => (units === "in" ? 0.125 : 3);
