// Small, deterministic SVG writing helpers for the drawings. Numbers are rounded to 4 decimals,
// so the same model always gives byte-identical output.
import { round4 } from "../units.ts";
import type { Seg } from "./hidden.ts";

export const num = (n: number): string => String(round4(n));
export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A rectangle in view coordinates (u right, v up) as SVG (y = −v). */
export function rectAttrs(u: readonly [number, number], v: readonly [number, number]): string {
  return `x="${num(u[0])}" y="${num(-v[1])}" width="${num(u[1] - u[0])}" height="${num(v[1] - v[0])}"`;
}

/** Path data for segments in view coordinates. */
export function segPath(segs: Seg[]): string {
  return segs
    .map((s) => (s.o === "h" ? `M${num(s.from)} ${num(-s.at)}H${num(s.to)}` : `M${num(s.at)} ${num(-s.from)}V${num(-s.to)}`))
    .join("");
}

/** The stylesheet every drawing carries. Colours come from the app's theme tokens, with the
 * concept sheet's light palette as fallbacks so a saved file reads on its own. Sizes scale with
 * --s, set on the <svg> from the view's extent. --hl, --hl-mix and --hl-w come from the app's
 * selection stylesheet and tint whatever is selected. */
export const DRAWING_STYLE = `
.wb-drawing text { font-family: var(--f-mono, ui-monospace, "SF Mono", Menlo, monospace); }
.wb-drawing .f-wall { fill: color-mix(in oklab, var(--wallface, #eff2f2) var(--hl-mix, 100%), var(--hl, #000)); }
.wb-drawing .f-floor { fill: color-mix(in oklab, var(--ink, #1c2529) var(--hl-mix, 100%), var(--hl, #000)); }
.wb-drawing .f-wood { fill: color-mix(in oklab, var(--wood, #ddb987) var(--hl-mix, 100%), var(--hl, #000)); }
.wb-drawing .f-face { fill: color-mix(in oklab, var(--face, #e8cc9c) var(--hl-mix, 100%), var(--hl, #000)); }
.wb-drawing .f-hardwood { fill: color-mix(in oklab, var(--wood-dark, #a77d45) var(--hl-mix, 100%), var(--hl, #000)); }
.wb-drawing .f-pine { fill: color-mix(in oklab, var(--pine, #ecdcb6) var(--hl-mix, 100%), var(--hl, #000)); }
.wb-drawing .f-metal { fill: color-mix(in oklab, var(--metal, #8d979c) var(--hl-mix, 100%), var(--hl, #000)); fill-opacity: 0.55; }
.wb-drawing .f-rod { fill: color-mix(in oklab, var(--ink-soft, #56646b) var(--hl-mix, 100%), var(--hl, #000)); }
.wb-drawing .f-cut { fill: color-mix(in oklab, var(--cut-wood, #b58c55) var(--hl-mix, 100%), var(--hl, #000)); }
.wb-drawing .f-cutwall { fill: color-mix(in oklab, var(--hatch, #8f9ba1) var(--hl-mix, 100%), var(--hl, #000)); fill-opacity: 0.25; }
.wb-drawing .f-contents { fill: color-mix(in oklab, var(--fabric-1, #8a9ca7) var(--hl-mix, 100%), var(--hl, #000)); fill-opacity: 0.16; }
.wb-drawing .hatch-ln { stroke: var(--hatch, #8f9ba1); stroke-width: calc(0.13px * var(--s, 1)); }
.wb-drawing .c-line { fill: none; stroke: color-mix(in oklab, var(--ink-soft, #56646b) var(--hl-mix, 100%), var(--hl, #000)); stroke-width: calc(0.16px * var(--s, 1) * var(--hl-w, 1)); stroke-dasharray: calc(0.8px * var(--s, 1)) calc(0.6px * var(--s, 1)); }
.wb-drawing .e { fill: none; stroke-linecap: square; stroke: color-mix(in oklab, var(--wood-dark, #a77d45) var(--hl-mix, 100%), var(--hl, #000)); stroke-width: calc(0.16px * var(--s, 1) * var(--hl-w, 1)); }
.wb-drawing .e.e-ctx { stroke: color-mix(in oklab, var(--ink, #1c2529) var(--hl-mix, 100%), var(--hl, #000)); stroke-width: calc(0.3px * var(--s, 1) * var(--hl-w, 1)); }
.wb-drawing .e.e-metal { stroke: color-mix(in oklab, var(--ink-soft, #56646b) var(--hl-mix, 100%), var(--hl, #000)); }
.wb-drawing .e.e-cut { stroke: color-mix(in oklab, var(--ink, #1c2529) var(--hl-mix, 100%), var(--hl, #000)); stroke-width: calc(0.32px * var(--s, 1) * var(--hl-w, 1)); }
.wb-drawing .hid { fill: none; stroke: color-mix(in oklab, var(--ink-soft, #56646b) var(--hl-mix, 100%), var(--hl, #000)); stroke-width: calc(0.12px * var(--s, 1) * var(--hl-w, 1)); stroke-dasharray: calc(0.7px * var(--s, 1)) calc(0.45px * var(--s, 1)); }
.wb-drawing .veil { pointer-events: none; }
.wb-drawing .v-fill { fill: var(--veil, rgba(28, 37, 41, 0.08)); }
.wb-drawing .v-open { fill: none; stroke: var(--dim, #2b5d8c); stroke-width: calc(0.32px * var(--s, 1)); stroke-dasharray: calc(1.4px * var(--s, 1)) calc(0.8px * var(--s, 1)); }
.wb-drawing .dim { cursor: pointer; }
.wb-drawing .dim path { fill: none; stroke: color-mix(in oklab, var(--dim, #2b5d8c) var(--hl-mix, 100%), var(--hl, #000)); stroke-width: calc(0.18px * var(--s, 1) * var(--hl-w, 1)); }
.wb-drawing .dim text { fill: color-mix(in oklab, var(--dim, #2b5d8c) var(--hl-mix, 100%), var(--hl, #000)); font-size: calc(2.2px * var(--s, 1)); font-weight: 500; }
.wb-drawing .dim-hit { fill: transparent; stroke: none; }
.wb-drawing .lbl { fill: color-mix(in oklab, var(--ink-soft, #56646b) var(--hl-mix, 100%), var(--hl, #000)); font-size: calc(1.7px * var(--s, 1)); paint-order: stroke; stroke: var(--sheet, #fafbfb); stroke-width: calc(0.6px * var(--s, 1)); stroke-linejoin: round; }
`;
