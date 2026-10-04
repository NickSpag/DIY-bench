// Dimensions and labels (section 7.3.4 of the spec). A dimension measures between two refs
// along one world axis and is drawn where that axis lands on screen; its offset is the position
// of the dimension line on the other screen axis, in view coordinates (u right, v up). Drawing
// follows the concept sheet's dimH/dimV: a line, 45° slashes and short extension ticks at both
// ends, and the length as text beside the line, on the side away from the drawing.
import type { Axis, Box, Dim, Label, Look, Resolved, View } from "../model/types.ts";
import { parseRef } from "../invariants.ts";
import { fmtLength } from "../units.ts";
import { screenAxis } from "./view-mapping.ts";
import { esc, num } from "./svg.ts";

export type Bounds = { u0: number; u1: number; v0: number; v1: number };

type Resolve = (id: string) => Box | undefined;

/** A ref's world coordinate and axis, or null when it cannot be resolved here. */
function refValue(ref: Dim["from"], boxOf: Resolve): { value: number; axis?: Axis; part?: string } | null {
  if (typeof ref === "number") return { value: ref };
  const p = parseRef(ref);
  if (!p) return null;
  const b = boxOf(p.part);
  if (!b) return null;
  return { value: b[p.axis][p.side], axis: p.axis, part: p.part };
}

export type DimLayout = {
  index: number; parts: string[]; text: string;
  orient: "h" | "v"; // h: measured along u; v: along v
  a: number; b: number; // screen coordinates along the measured axis, a < b
  at: number; // the dimension line's position on the other axis
  textSide: 1 | -1; // which side of the line the text goes (+: up or right)
};

/** Lays out a view's dimensions; those whose axis is the view's depth, or whose refs are not here, are skipped. */
export function layoutDims(view: View, boxOf: Resolve, content: Bounds, fmt: (n: number) => string): DimLayout[] {
  const out: DimLayout[] = [];
  for (const [index, dim] of (view.dims ?? []).entries()) {
    const f = refValue(dim.from, boxOf), t = refValue(dim.to, boxOf);
    if (!f || !t) continue;
    const axis = f.axis ?? t.axis;
    if (!axis || (f.axis && t.axis && f.axis !== t.axis)) continue;
    const m = screenAxis(view.look, axis);
    if (!m) continue;
    const s0 = m.sign * f.value, s1 = m.sign * t.value;
    const len = Math.abs(t.value - f.value);
    const lenText = fmt(len);
    const text = dim.text ? dim.text.replace("{}", lenText) : lenText;
    const parts = [...new Set([f.part, t.part].filter((x): x is string => !!x))];
    const orient = m.screen === "u" ? "h" : "v";
    const mid = orient === "h" ? (content.v0 + content.v1) / 2 : (content.u0 + content.u1) / 2;
    out.push({ index, parts, text, orient, a: Math.min(s0, s1), b: Math.max(s0, s1), at: dim.offset, textSide: dim.offset >= mid ? 1 : -1 });
  }
  return out;
}

/** Approximate advance of monospace text, in font-size units. */
const textWidth = (t: string, fs: number) => [...t].length * fs * 0.6;

export function dimExtent(d: DimLayout, s: number): Bounds {
  const fs = 2.2 * s, tick = 1.4 * s, gap = 0.9 * s;
  const tw = textWidth(d.text, fs);
  const lo = d.textSide > 0 ? -tick : -(gap + fs * 1.05 + 0.2 * s);
  const hi = d.textSide > 0 ? gap + fs * 1.05 + 0.2 * s : tick;
  const mid = (d.a + d.b) / 2;
  const along0 = Math.min(d.a - tick, mid - tw / 2), along1 = Math.max(d.b + tick, mid + tw / 2);
  return d.orient === "h"
    ? { u0: along0, u1: along1, v0: d.at + lo, v1: d.at + hi }
    : { u0: d.at + lo, u1: d.at + hi, v0: along0, v1: along1 };
}

export function dimSvg(view: View, d: DimLayout, s: number): string {
  const t = 0.8 * s, tick = 1.4 * s, gap = 0.9 * s, fs = 2.2 * s;
  const ids = d.parts.join(" ");
  const attrs = `class="dim"${ids ? ` data-part="${esc(ids)}"` : ""} data-dim="${esc(view.id)}:${d.index}"`;
  const e = dimExtent(d, s);
  const hit = `<rect class="dim-hit" x="${num(e.u0)}" y="${num(-e.v1)}" width="${num(e.u1 - e.u0)}" height="${num(e.v1 - e.v0)}"/>`;
  if (d.orient === "h") {
    const y = -d.at, x0 = d.a, x1 = d.b;
    const path = `M${num(x0)} ${num(y)}H${num(x1)}` +
      `M${num(x0 - t)} ${num(y + t)}L${num(x0 + t)} ${num(y - t)}M${num(x1 - t)} ${num(y + t)}L${num(x1 + t)} ${num(y - t)}` +
      `M${num(x0)} ${num(y - tick)}V${num(y + tick)}M${num(x1)} ${num(y - tick)}V${num(y + tick)}`;
    const ty = d.textSide > 0 ? y - gap : y + gap + fs * 0.78;
    return `<g ${attrs}>${hit}<path d="${path}"/><text x="${num((x0 + x1) / 2)}" y="${num(ty)}" text-anchor="middle">${esc(d.text)}</text></g>`;
  }
  const x = d.at, y0 = -d.b, y1 = -d.a; // SVG y grows downward
  const path = `M${num(x)} ${num(y0)}V${num(y1)}` +
    `M${num(x - t)} ${num(y0 + t)}L${num(x + t)} ${num(y0 - t)}M${num(x - t)} ${num(y1 + t)}L${num(x + t)} ${num(y1 - t)}` +
    `M${num(x - tick)} ${num(y0)}H${num(x + tick)}M${num(x - tick)} ${num(y1)}H${num(x + tick)}`;
  // Text reads bottom to top (rotated −90°); its baseline sits on the side away from the drawing.
  const tx = d.textSide > 0 ? x + gap + fs * 0.78 : x - gap;
  const ty = (y0 + y1) / 2;
  return `<g ${attrs}>${hit}<path d="${path}"/><text x="${num(tx)}" y="${num(ty)}" text-anchor="middle" transform="rotate(-90 ${num(tx)} ${num(ty)})">${esc(d.text)}</text></g>`;
}

// ---------- labels ----------

export type LabelLayout = { parts: string[]; text: string; u: number; v: number; anchor: "start" | "middle" | "end"; rotate: number };

const TOKENS = /\{(x0|x1|y0|y1|z0|z1|x|y|z|len)\}/g;

/** Lays out a view's labels. A label on a part that is thin on screen sits just above it, unless dx/dy say otherwise. */
export function layoutLabels(
  view: View, r: Resolved, boxOf: Resolve, project: (b: Box) => { u: [number, number]; v: [number, number] },
  fmtMarks: (n: number) => string, s: number,
): LabelLayout[] {
  const out: LabelLayout[] = [];
  for (const l of view.labels ?? []) {
    let u: number, v: number;
    const parts: string[] = [];
    let text = l.text;
    if (l.part) {
      const b = boxOf(l.part);
      if (!b) continue;
      parts.push(l.part);
      const p = r.part(l.part);
      const pr = project(b);
      u = (pr.u[0] + pr.u[1]) / 2;
      v = (pr.v[0] + pr.v[1]) / 2;
      const fs = 1.7 * s;
      if (l.dy === undefined && pr.v[1] - pr.v[0] < fs * 2) v = pr.v[1] + 0.55 * s; // above a thin part
      else v -= fs * 0.35; // optically centred
      const len = p && (p.kind === "panel" || p.kind === "board") && p.sizes ? p.sizes.l
        : p && p.kind === "hardware" && p.cylinder ? p.cylinder.to - p.cylinder.from
        : Math.max(b.x[1] - b.x[0], b.y[1] - b.y[0], b.z[1] - b.z[0]);
      text = text.replace(TOKENS, (_, k: string) => {
        if (k === "len") return fmtMarks(len);
        const ax = k[0] as Axis;
        const val = k.length === 1 ? (b[ax][0] + b[ax][1]) / 2 : b[ax][Number(k[1]) as 0 | 1];
        return fmtMarks(val);
      });
    } else if (l.at) {
      [u, v] = l.at;
    } else continue;
    out.push({ parts, text, u: u + (l.dx ?? 0), v: v + (l.dy ?? 0), anchor: l.anchor ?? "middle", rotate: l.rotate ?? 0 });
  }
  return out;
}

export function labelSvg(l: LabelLayout): string {
  const x = num(l.u), y = num(-l.v);
  const rot = l.rotate ? ` transform="rotate(${num(-l.rotate)} ${x} ${y})"` : "";
  const dp = l.parts.length ? ` data-part="${esc(l.parts.join(" "))}"` : "";
  return `<text class="lbl"${dp} x="${x}" y="${y}" text-anchor="${l.anchor}"${rot}>${esc(l.text)}</text>`;
}

export function labelExtent(l: LabelLayout, s: number): Bounds {
  const fs = 1.7 * s, w = textWidth(l.text, fs);
  const u0 = l.anchor === "start" ? l.u : l.anchor === "end" ? l.u - w : l.u - w / 2;
  return { u0, u1: u0 + w, v0: l.v - fs * 0.3, v1: l.v + fs };
}

export type { Look, Label };
