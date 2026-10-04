// drawView (section 7.3 of the spec): one declared view of the model, at a phase or step, as a
// deterministic SVG. Every element that belongs to a part carries data-part, so the app's
// selection stylesheet can highlight it and a click can select it.
import type { Box, Range, Resolved, ResolvedPart, View } from "../model/types.ts";
import { fmtLength } from "../units.ts";
import { edgesOf, inFront, rectEdges, unionBoundary, type DepthRect, type Rect, type Seg } from "./hidden.ts";
import { classify, keptDepth, type Role } from "./section.ts";
import { lookAxis, projectBox } from "./view-mapping.ts";
import { DRAWING_STYLE, esc, num, rectAttrs, segPath } from "./svg.ts";
import { dimExtent, dimSvg, labelExtent, labelSvg, layoutDims, layoutLabels, type Bounds } from "./dims.ts";

export { classify } from "./section.ts";
export { edgesOf, splitSeg, unionBoundary } from "./hidden.ts";
export { cutDepth, screenAxis, lookAxis } from "./view-mapping.ts";

export type DrawOptions = { phase: string; step?: string | null; display: "in" | "mm"; hiddenLines?: boolean };

/** One part as the view sees it. */
export type DrawItem = {
  id: string; part: ResolvedPart; role: Role;
  u: Range; v: Range; d: Range; // projected rectangle and depth range
  circle?: { u: number; v: number; r: number }; // a cylinder seen along its axis
  fill: string; // fill class
};

/** Fill class of a part: wall, floor, wood, face, hardwood, pine, metal or rod. */
function fillClass(p: ResolvedPart): string {
  if (p.kind === "context") return p.role === "floor" ? "f-floor" : p.role === "contents" ? "f-contents" : "f-wall";
  if (p.kind === "hardware") return p.cylinder ? "f-rod" : "f-metal";
  const m = p.materialDef;
  if (!m) return "f-wood";
  if (m.type === "sheet") return m.finish === "none" && p.finishApplied && p.finishApplied !== "none" ? "f-face" : "f-wood";
  return m.finish === "none" ? "f-pine" : "f-hardwood";
}

/** The parts of a view, classified and projected, in declaration order. Exposed for tests. */
export function viewItems(r: Resolved, view: View, opts: { phase: string; step?: string | null }): DrawItem[] {
  const state = r.stateAt(opts.phase, opts.step ?? undefined);
  const axis = lookAxis(view.look);
  const veil = new Set(view.veil ?? []);
  const showContents = view.showContents ?? true;
  const items: DrawItem[] = [];
  for (const { part, box } of state.parts) {
    if (!box) continue;
    const isContents = part.kind === "context" && part.role === "contents";
    if (isContents && !showContents) continue;
    if (view.depth && !(box[axis][1] > view.depth[0] && box[axis][0] < view.depth[1])) continue;
    const pb = projectBox(box, view.look);
    const role = classify(view, pb.d, { veil: veil.has(part.id), contents: isContents });
    const item: DrawItem = { id: part.id, part, role, u: pb.u, v: pb.v, d: pb.d, fill: fillClass(part) };
    if (part.kind === "hardware" && part.cylinder && part.cylinder.axis === axis) {
      item.circle = { u: (pb.u[0] + pb.u[1]) / 2, v: (pb.v[0] + pb.v[1]) / 2, r: part.cylinder.diameter / 2 };
    }
    items.push(item);
  }
  return items;
}

const union = (a: Bounds, b: Bounds): Bounds => ({ u0: Math.min(a.u0, b.u0), u1: Math.max(a.u1, b.u1), v0: Math.min(a.v0, b.v0), v1: Math.max(a.v1, b.v1) });

export function drawView(r: Resolved, viewId: string, opts: DrawOptions): string {
  const view = r.views.find((v) => v.id === viewId);
  if (!view) throw new Error(`no view "${viewId}"; views are: ${r.views.map((v) => v.id).join(", ") || "none"}`);
  const units = r.project.units;
  const fmt = (n: number) => fmtLength(n, { units, display: opts.display });
  const fmtMarks = (n: number) => fmtLength(n, { units, display: opts.display, marks: true });
  const hiddenLines = opts.hiddenLines ?? view.hiddenLines ?? false;

  const all = viewItems(r, view, opts);
  const shown = all.filter((i) => i.role !== "removed");
  if (shown.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" class="wb-drawing" viewBox="0 0 100 20" data-view="${esc(view.id)}" data-phase="${esc(opts.phase)}"><text x="50" y="10" text-anchor="middle" font-size="3">Nothing to draw at this phase</text></svg>\n`;
  }

  // Content bounds and the scale of text and lines.
  let content: Bounds = { u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity };
  for (const i of shown) content = union(content, { u0: i.u[0], u1: i.u[1], v0: i.v[0], v1: i.v[1] });
  const s = view.scale ?? Math.max(content.u1 - content.u0, content.v1 - content.v0) / 100;

  // A floor seen edge-on is a dark bar, as on the concept sheet; seen from above it is a surface.
  for (const i of shown) if (i.fill === "f-floor" && Math.min(i.u[1] - i.u[0], i.v[1] - i.v[0]) > 1.5 * s) i.fill = "f-wall";
  const state = r.stateAt(opts.phase, opts.step ?? undefined);
  const boxes = new Map(state.parts.filter((e) => e.box).map((e) => [e.part.id, e.box as Box]));
  const boxOf = (id: string) => boxes.get(id);

  const dims = layoutDims(view, boxOf, content, fmt);
  const labels = layoutLabels(view, r, boxOf, (b) => {
    const pb = projectBox(b, view.look);
    return { u: [pb.u[0], pb.u[1]], v: [pb.v[0], pb.v[1]] };
  }, fmtMarks, s);

  let bounds = content;
  for (const d of dims) bounds = union(bounds, dimExtent(d, s));
  for (const l of labels) bounds = union(bounds, labelExtent(l, s));
  const margin = 0.06 * Math.max(bounds.u1 - bounds.u0, bounds.v1 - bounds.v0);
  const vb = [bounds.u0 - margin, -bounds.v1 - margin, bounds.u1 - bounds.u0 + 2 * margin, bounds.v1 - bounds.v0 + 2 * margin];

  const pid = `wbd-hatch-${view.id}-${opts.phase}${opts.step ? `-${opts.step}` : ""}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  const hatch = 1.6 * s;
  const hatchRect = (i: DrawItem) => `<rect class="hatch" data-part="${esc(i.id)}" ${rectAttrs(i.u, i.v)} fill="url(#${pid})"/>`;
  const dp = (id: string) => `data-part="${esc(id)}"`;

  // ---------- fills: beyond parts far to near, then cut parts ----------
  const beyond = shown.filter((i) => i.role === "beyond").sort((a, b) => a.d[1] - b.d[1] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cut = shown.filter((i) => i.role === "cut").sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const contents = shown.filter((i) => i.role === "contents");
  const veil = shown.filter((i) => i.role === "veil");

  const fillEl = (i: DrawItem, cls: string) => i.circle
    ? `<circle ${dp(i.id)} class="${cls}" cx="${num(i.circle.u)}" cy="${num(-i.circle.v)}" r="${num(i.circle.r)}"/>`
    : `<rect ${dp(i.id)} class="${cls}" ${rectAttrs(i.u, i.v)}/>`;
  const partClass = (i: DrawItem) => `part k-${i.part.kind}${i.part.kind === "panel" || i.part.kind === "board" ? ` m-${i.part.material}` : ""}`;

  const fills: string[] = beyond.map((i) => fillEl(i, `${partClass(i)} ${i.fill}`));
  const cutEls: string[] = [];
  for (const i of cut) {
    const isRoom = i.part.kind === "context";
    cutEls.push(fillEl(i, `${partClass(i)} ${isRoom ? "f-cutwall" : i.part.kind === "hardware" ? i.fill : "f-cut"}`));
    if (isRoom) cutEls.push(hatchRect(i));
  }

  // ---------- edges: visible and hidden pieces of each beyond part's outline ----------
  const depthRects: DepthRect[] = [];
  for (const i of [...beyond, ...cut]) {
    depthRects.push({ id: i.id, u: i.u, v: i.v, d: i.role === "cut" ? keptDepth(view, i.d) : i.d, occludes: true });
  }
  // Each beyond part against every beyond or cut part entirely in front of it (cut parts count
  // only up to the plane). Cut parts are drawn whole, after and above the beyond parts.
  const edgeMap = edgesOf(depthRects);
  const circleCovered = (i: DrawItem) => {
    const c = i.circle as { u: number; v: number; r: number };
    const me = depthRects.find((x) => x.id === i.id) as DepthRect;
    return depthRects.some((q) => q !== me && inFront(q, me) && q.u[0] < c.u - c.r && c.u + c.r < q.u[1] && q.v[0] < c.v - c.r && c.v + c.r < q.v[1]);
  };

  const circleEdge = (i: DrawItem, cls: string) => {
    const c = i.circle as { u: number; v: number; r: number };
    return `<circle ${dp(i.id)} class="${cls}" cx="${num(c.u)}" cy="${num(-c.v)}" r="${num(c.r)}"/>`;
  };
  const edgeCls = (i: DrawItem) => (i.part.kind === "context" ? "e e-ctx" : i.part.kind === "hardware" ? "e e-metal" : "e");
  const hiddenEls: string[] = [], edgeEls: string[] = [];
  for (const i of beyond) {
    if (i.circle) {
      if (!circleCovered(i)) edgeEls.push(circleEdge(i, edgeCls(i)));
      else if (hiddenLines) hiddenEls.push(circleEdge(i, "hid"));
      continue;
    }
    const e = edgeMap.get(i.id);
    if (!e) continue;
    if (e.visible.length) edgeEls.push(`<path ${dp(i.id)} class="${edgeCls(i)}" d="${segPath(e.visible)}"/>`);
    if (hiddenLines && e.hidden.length) hiddenEls.push(`<path ${dp(i.id)} class="hid" d="${segPath(e.hidden)}"/>`);
  }
  for (const i of cut) {
    if (i.circle) cutEls.push(circleEdge(i, "e e-cut"));
    else cutEls.push(`<path ${dp(i.id)} class="e e-cut" d="${segPath(rectEdges(i))}"/>`);
  }

  // ---------- contents: translucent, dashed outline ----------
  const contentEls = contents.map((i) => `<g ${dp(i.id)}><rect class="f-contents" ${rectAttrs(i.u, i.v)}/><rect class="c-line" ${rectAttrs(i.u, i.v)}/></g>`);

  // ---------- veil: translucent fill and hatch, outlined only along the opening ----------
  const veilEls: string[] = [];
  for (const i of veil) veilEls.push(`<rect class="v-fill" ${dp(i.id)} ${rectAttrs(i.u, i.v)}/>`, hatchRect(i));
  if (veil.length) {
    const rects: Rect[] = veil.map((i) => ({ u: i.u, v: i.v }));
    const vb0 = { u0: Math.min(...veil.map((i) => i.u[0])), u1: Math.max(...veil.map((i) => i.u[1])), v0: Math.min(...veil.map((i) => i.v[0])), v1: Math.max(...veil.map((i) => i.v[1])) };
    const onOuter = (sg: Seg) => sg.o === "h"
      ? Math.abs(sg.at - vb0.v0) < 1e-9 || Math.abs(sg.at - vb0.v1) < 1e-9
      : Math.abs(sg.at - vb0.u0) < 1e-9 || Math.abs(sg.at - vb0.u1) < 1e-9;
    const opening = unionBoundary(rects).filter((sg) => !onOuter(sg));
    if (opening.length) veilEls.push(`<path class="v-open" d="${segPath(opening)}"/>`);
  }

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" class="wb-drawing" viewBox="${vb.map(num).join(" ")}" data-view="${esc(view.id)}" data-phase="${esc(opts.phase)}"${opts.step ? ` data-step="${esc(opts.step)}"` : ""} style="--s: ${num(s)}">`,
    `<style>${DRAWING_STYLE}</style>`,
    `<defs><pattern id="${pid}" patternUnits="userSpaceOnUse" width="${num(hatch)}" height="${num(hatch)}" patternTransform="rotate(45)"><line class="hatch-ln" x1="0" y1="0" x2="0" y2="${num(hatch)}"/></pattern></defs>`,
    `<g class="fills">${fills.join("")}</g>`,
    `<g class="contents">${contentEls.join("")}</g>`,
    `<g class="hidden">${hiddenEls.join("")}</g>`,
    `<g class="edges">${edgeEls.join("")}</g>`,
    `<g class="cut">${cutEls.join("")}</g>`,
    `<g class="veil">${veilEls.join("")}</g>`,
    `<g class="dims">${dims.map((d) => dimSvg(view, d, s)).join("")}</g>`,
    `<g class="labels">${labels.map(labelSvg).join("")}</g>`,
    `</svg>`,
  ];
  return out.join("\n") + "\n";
}
