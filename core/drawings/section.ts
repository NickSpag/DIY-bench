// Classifying parts for a view (section 7.3.2 of the spec): in an elevation every part is seen
// beyond (veil parts and contents aside); in a section or plan the cut plane removes the parts
// between it and the viewer, cuts the parts it passes through, and leaves the rest beyond.
import type { Range, View } from "../model/types.ts";
import { cutDepth } from "./view-mapping.ts";

export type Role = "beyond" | "cut" | "removed" | "veil" | "contents";

const EPS = 1e-9;

export function classify(view: View, d: Range, opts: { veil: boolean; contents: boolean }): Role {
  if (view.kind !== "elevation" && view.cut !== undefined) {
    const cd = cutDepth(view.look, view.cut);
    if (d[0] >= cd - EPS) return "removed";
    if (d[0] < cd && cd < d[1]) return opts.contents ? "contents" : "cut";
  }
  if (opts.contents) return "contents";
  if (opts.veil) return "veil";
  return "beyond";
}

/** The part of a cut part that remains behind the plane, in depth. */
export function keptDepth(view: View, d: Range): Range {
  if (view.kind === "elevation" || view.cut === undefined) return d;
  const cd = cutDepth(view.look, view.cut);
  return [d[0], Math.min(d[1], cd)];
}
