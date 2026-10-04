// Sheet layouts as SVG (section 7.2 of the spec). Deterministic: the same Nesting gives
// byte-identical output. Every placement carries data-part with its part ids, so the app's
// highlight stylesheet can select it; colours come from CSS custom properties with defaults.
import type { Nesting, Placement, SheetLayout } from "./nesting.ts";
import { fmtLength, round4 } from "./units.ts";

const num = (n: number): string => String(round4(n));
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "4x8" → "4×8"; other stock ids unchanged. */
export const stockLabel = (id: string): string => id.replace(/(\d)x(\d)/g, "$1×$2");

export function sheetTitle(n: Nesting, sh: SheetLayout): string {
  const L = (v: number) => fmtLength(v, { units: n.units });
  return `${stockLabel(sh.stock)}${sh.owned && !/owned/i.test(sh.stock) ? " (owned)" : ""} · ${n.materialName}, ${L(sh.length)} × ${L(sh.width)}`;
}

const STYLE = `
.wb-sheet-board { fill: var(--sheet-board, #f4f1ea); stroke: var(--ink, #222); stroke-width: var(--sheet-stroke, 0.3); }
.wb-part { stroke: var(--wood-dark, #8a6a3f); stroke-width: 0.2; }
.wb-part.k-fin { fill: var(--face, #e8d3ad); }
.wb-part.k-raw { stroke: var(--ink-soft, #6b7378); }
.wb-part.k-needs-finish { stroke: var(--dim, #2f6fb2); stroke-width: 0.45; }
.wb-hatch-bg { fill: var(--sheet-board, #f4f1ea); }
.wb-hatch-line { stroke: var(--hatch, #8f9ba1); stroke-width: 0.25; }
.wb-strip-cut { stroke: var(--ink-soft, #6b7378); stroke-width: 0.2; stroke-dasharray: 0.8 0.5; fill: none; }
.wb-offcut { fill: none; stroke: var(--ink-soft, #6b7378); stroke-width: 0.18; stroke-dasharray: 0.8 0.6; }
.wb-title { fill: var(--ink-soft, #6b7378); }
.wb-label { fill: var(--ink, #222); }
.wb-size { fill: var(--ink-soft, #6b7378); }
.wb-offcut-label { fill: var(--ink-soft, #6b7378); }
.wb-grain { stroke: var(--dim, #2f6fb2); stroke-width: 0.3; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.wb-grain-label { fill: var(--dim, #2f6fb2); }
`;

/** Label text sized to fit a rectangle, rotated when the rectangle is taller than wide. */
function label(x: number, y: number, l: number, w: number, lines: { text: string; cls: string }[], fs: number): string {
  const vertical = w > l * 1.2;
  const along = vertical ? w : l, across = vertical ? l : w;
  const longest = Math.max(...lines.map((t) => [...t.text].length));
  const size = Math.min(fs, (along * 0.9) / (longest * 0.62), (across * 0.8) / (lines.length * 1.25));
  if (size < fs * 0.25) return "";
  const cx = x + l / 2, cy = y + w / 2;
  const total = lines.length * size * 1.2;
  const out = lines.map((t, i) => {
    const dy = -total / 2 + size * (1.2 * i + 0.9);
    return `<text class="${t.cls}" x="${num(cx)}" y="${num(cy + dy)}" font-size="${num(size)}" text-anchor="middle">${esc(t.text)}</text>`;
  });
  return vertical ? `<g transform="rotate(-90 ${num(cx)} ${num(cy)})">${out.join("")}</g>` : out.join("");
}

function placementSvg(n: Nesting, p: Placement, fs: number, patternId: string): string {
  const L = (v: number) => fmtLength(v, { units: n.units });
  const kind = n.finished ? "k-fin" : p.needsFinish ? "k-raw k-needs-finish" : "k-raw";
  const fill = n.finished ? "" : ` fill="url(#${patternId})"`;
  const ids = p.ids.join(" ");
  const partSize = p.turned ? `${L(p.w)} × ${L(p.l)}` : `${L(p.l)} × ${L(p.w)}`;
  const parts: string[] = [];
  parts.push(`<g class="wb-placement" data-part="${esc(ids)}"${p.strip ? ` data-strip="${esc(p.strip)}"` : ""}${p.turned ? ` data-turned="true"` : ""}>`);
  parts.push(`<title>${esc(`${p.name} · ${partSize}${p.turned ? " (turned)" : ""} · ${ids}`)}</title>`);
  parts.push(`<rect class="wb-part ${kind}" x="${num(p.x)}" y="${num(p.y)}" width="${num(p.l)}" height="${num(p.w)}"${fill}/>`);
  if (p.members && p.members.length) {
    for (const m of p.members) {
      parts.push(`<g class="wb-strip-member" data-part="${esc(m.id)}"><title>${esc(`${m.name} · ${L(m.l)} × ${L(p.w)} · ${m.id}`)}</title>` +
        `<rect class="wb-strip-cut" x="${num(m.x)}" y="${num(p.y)}" width="${num(m.l)}" height="${num(p.w)}"/>` +
        label(m.x, p.y, m.l, p.w, [{ text: m.name, cls: "wb-label" }, { text: L(m.l), cls: "wb-size" }], fs) + `</g>`);
    }
  } else {
    parts.push(label(p.x, p.y, p.l, p.w, [{ text: p.name, cls: "wb-label" }, { text: partSize, cls: "wb-size" }], fs));
  }
  parts.push(`</g>`);
  return parts.join("");
}

/** One SVG for one Nesting: its sheets stacked top to bottom, each with a title and a grain arrow. */
export function sheetSvg(n: Nesting): string {
  const L = (v: number) => fmtLength(v, { units: n.units });
  const maxL = Math.max(1, ...n.sheets.map((s) => s.length));
  const fs = maxL / 40;
  const titleH = fs * 2.2;
  const gap = fs * 3.5; // room for the grain arrow under each sheet
  const patternId = `wb-raw-${n.phase}-${n.material}`;
  const body: string[] = [];
  let y = titleH;
  for (const [i, sh] of n.sheets.entries()) {
    body.push(`<g class="wb-sheet" data-sheet="${i}" data-stock="${esc(sh.stock)}" data-owned="${sh.owned}" transform="translate(0 ${num(y)})">`);
    const title = sheetTitle(n, sh);
    const titleFs = Math.min(fs, sh.length / ([...title].length * 0.62)); // fit the title to the sheet's length
    body.push(`<text class="wb-title" x="0" y="${num(-fs * 0.7)}" font-size="${num(titleFs)}">${esc(title)}</text>`);
    // grain arrow along the sheet's length, under its bottom-right corner
    const ay = sh.width + fs * 1.1, ax1 = sh.length, ax0 = Math.max(sh.length * 0.6, sh.length - fs * 8);
    body.push(`<g class="wb-grain-arrow"><path class="wb-grain" d="M${num(ax0)} ${num(ay)}H${num(ax1)}M${num(ax1 - fs * 0.6)} ${num(ay - fs * 0.35)}L${num(ax1)} ${num(ay)}L${num(ax1 - fs * 0.6)} ${num(ay + fs * 0.35)}"/>` +
      `<text class="wb-grain-label" x="${num(ax0 - fs * 0.4)}" y="${num(ay + fs * 0.3)}" font-size="${num(fs * 0.8)}" text-anchor="end">grain</text></g>`);
    body.push(`<rect class="wb-sheet-board" x="0" y="0" width="${num(sh.length)}" height="${num(sh.width)}"/>`);
    for (const o of sh.offcuts) {
      body.push(`<g class="wb-offcut-g"><rect class="wb-offcut" x="${num(o.x)}" y="${num(o.y)}" width="${num(o.l)}" height="${num(o.w)}"/>` +
        label(o.x, o.y, o.l, o.w, [{ text: `offcut ${L(o.l)} × ${L(o.w)}`, cls: "wb-offcut-label" }], fs * 0.8) + `</g>`);
    }
    for (const p of sh.placements) body.push(placementSvg(n, p, fs, patternId));
    body.push(`</g>`);
    y += sh.width + gap + titleH;
  }
  const m = fs;
  const height = Math.max(y - titleH - fs, titleH); // the last sheet keeps the room for its grain arrow
  const vb = [-m, -m, maxL + 2 * m, height + 2 * m].map(num).join(" ");
  const hatch = fs * 0.6;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" class="wb-sheets" data-phase="${esc(n.phase)}" data-material="${esc(n.material)}" font-family="ui-monospace, monospace">`,
    `<style>${STYLE}</style>`,
    `<defs><pattern id="${patternId}" patternUnits="userSpaceOnUse" width="${num(hatch)}" height="${num(hatch)}" patternTransform="rotate(45)">` +
      `<rect class="wb-hatch-bg" width="${num(hatch)}" height="${num(hatch)}"/><line class="wb-hatch-line" x1="0" y1="0" x2="0" y2="${num(hatch)}"/></pattern></defs>`,
    ...body,
    `</svg>`,
  ].join("\n") + "\n";
}
