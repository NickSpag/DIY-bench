// Visible and hidden edges of projected boxes (section 7.3.3 of the spec). Each rectangle's four
// edges are split against the interiors of the rectangles in front of it: covered pieces are
// hidden, the rest visible. An edge that lies on an occluder's boundary is not covered, so where
// a shelf meets a partition the shared line is solid, never dashed.
import type { Range } from "../model/types.ts";

export const EPS = 1e-9;

export type Rect = { u: Range; v: Range };
/** A horizontal segment (v = at, u from..to) or a vertical one (u = at, v from..to). */
export type Seg = { o: "h" | "v"; at: number; from: number; to: number };
export type DepthRect = Rect & { id: string; d: Range; occludes: boolean };

export function rectEdges(r: Rect): Seg[] {
  return [
    { o: "h", at: r.v[0], from: r.u[0], to: r.u[1] },
    { o: "h", at: r.v[1], from: r.u[0], to: r.u[1] },
    { o: "v", at: r.u[0], from: r.v[0], to: r.v[1] },
    { o: "v", at: r.u[1], from: r.v[0], to: r.v[1] },
  ];
}

/** The open interval of `s` covered by the interior of `q`, or null. */
export function coveredBy(s: Seg, q: Rect): Range | null {
  const [across, along] = s.o === "h" ? [q.v, q.u] : [q.u, q.v];
  if (!(across[0] + EPS < s.at && s.at < across[1] - EPS)) return null; // on or outside the boundary: not covered
  const lo = Math.max(s.from, along[0]), hi = Math.min(s.to, along[1]);
  return hi - lo > EPS ? [lo, hi] : null;
}

/** Splits a segment into the pieces covered by any of the rectangles and the rest. */
export function splitSeg(s: Seg, occluders: Rect[]): { visible: Seg[]; hidden: Seg[] } {
  const cover: Range[] = [];
  for (const q of occluders) {
    const c = coveredBy(s, q);
    if (c) cover.push(c);
  }
  cover.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const c of cover) {
    const last = merged[merged.length - 1];
    if (last && c[0] <= last[1] + EPS) last[1] = Math.max(last[1], c[1]);
    else merged.push([c[0], c[1]]);
  }
  const visible: Seg[] = [], hidden: Seg[] = [];
  let cur = s.from;
  for (const [a, b] of merged) {
    if (a - cur > EPS) visible.push({ ...s, from: cur, to: a });
    hidden.push({ ...s, from: a, to: b });
    cur = b;
  }
  if (s.to - cur > EPS) visible.push({ ...s, from: cur, to: s.to });
  return { visible, hidden };
}

/** Joins collinear segments that touch or overlap. */
export function mergeSegs(segs: Seg[]): Seg[] {
  const key = (s: Seg) => `${s.o}:${s.at.toFixed(9)}`;
  const groups = new Map<string, Seg[]>();
  for (const s of segs) {
    const k = key(s);
    const g = groups.get(k);
    if (g) g.push(s);
    else groups.set(k, [s]);
  }
  const out: Seg[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.from - b.from || a.to - b.to);
    let cur = { ...g[0] };
    for (const s of g.slice(1)) {
      if (s.from <= cur.to + EPS) cur.to = Math.max(cur.to, s.to);
      else {
        out.push(cur);
        cur = { ...s };
      }
    }
    out.push(cur);
  }
  return out;
}

/** Q occludes P when it lies entirely in front of P: Q.dmin ≥ P.dmax. Overlapping (jointed) parts never occlude each other. */
export const inFront = (q: { d: Range }, p: { d: Range }): boolean => q.d[0] >= p.d[1] - EPS;

/** Visible and hidden edges of every rectangle, against every occluding rectangle in front of it. */
export function edgesOf(rects: DepthRect[]): Map<string, { visible: Seg[]; hidden: Seg[] }> {
  const out = new Map<string, { visible: Seg[]; hidden: Seg[] }>();
  for (const p of rects) {
    const occ = rects.filter((q) => q !== p && q.occludes && inFront(q, p));
    const visible: Seg[] = [], hidden: Seg[] = [];
    for (const e of rectEdges(p)) {
      const s = splitSeg(e, occ);
      visible.push(...s.visible);
      hidden.push(...s.hidden);
    }
    out.set(p.id, { visible: mergeSegs(visible), hidden: mergeSegs(hidden) });
  }
  return out;
}

/** Outline pieces of a union of rectangles: edges not shared with another rectangle of the set. */
export function unionBoundary(rects: Rect[]): Seg[] {
  const out: Seg[] = [];
  for (const r of rects) {
    for (const [i, e] of rectEdges(r).entries()) {
      // the side of the edge outside r: below/above for h edges 0/1, left/right for v edges 2/3
      const outward = i === 0 || i === 2 ? -1 : 1;
      const cover: Range[] = [];
      for (const q of rects) {
        if (q === r) continue;
        const [across, along] = e.o === "h" ? [q.v, q.u] : [q.u, q.v];
        const touches = outward < 0 ? across[0] < e.at - EPS && across[1] >= e.at - EPS : across[1] > e.at + EPS && across[0] <= e.at + EPS;
        if (!touches) continue;
        const lo = Math.max(e.from, along[0]), hi = Math.min(e.to, along[1]);
        if (hi - lo > EPS) cover.push([lo, hi]);
      }
      const asRects: Rect[] = cover.map((c) => (e.o === "h" ? { u: c, v: [e.at - 1, e.at + 1] } : { u: [e.at - 1, e.at + 1], v: c }));
      out.push(...splitSeg(e, asRects).visible);
    }
  }
  return mergeSegs(out);
}
