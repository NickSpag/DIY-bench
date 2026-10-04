// Sheet layouts (section 7.2 of the spec): a guillotine packer with several stock sizes,
// owned pieces used before anything is bought, per-part grain lock, kerf and trim, and
// grain-matched strips packed as one piece. Ported from spikes/fixture/packer.mjs.
import type { Resolved, ResolvedCutPart, SheetMaterial, Units } from "./model/types.ts";
import { fmtThickness } from "./units.ts";
import { strips } from "./cutlist.ts";
import { cutSize, defaultKerf, isCutPart } from "./parts.ts";

const EPS = 1e-6;

export type Rect = { x: number; y: number; l: number; w: number };
export type StripMember = { id: string; name: string; x: number; l: number }; // x along the sheet length, absolute
export type Placement = Rect & {
  ids: string[]; // the part, or a strip's members
  name: string; // the part's cut-list name, or the strip's name
  turned: boolean; // true when the part's length runs across the sheet
  needsFinish: boolean; // unfinished material that gets a clear coat or paint
  strip?: string;
  members?: StripMember[];
};
export type SheetLayout = {
  stock: string; owned: boolean; length: number; width: number; // length along the grain
  placements: Placement[];
  offcuts: Rect[]; // free rectangles with both sides at least 3″ (75 mm)
};
export type UnplacedReason = "no-stock" | "too-big" | "no-space";
export type Nesting = {
  phase: string; material: string; materialName: string; units: Units; kerf: number; trim: number;
  thickness: string; // display text by the rule of section 5.6
  finished: boolean; // the material has a finish of its own (not "none")
  sheets: SheetLayout[];
  unplaced: { id: string; reason: UnplacedReason }[];
  bought: Record<string, number>; // stock id → sheets bought
  owned: Record<string, number>; // stock id → owned pieces used
  strategy: string; // the sort order, split rule and preferred stock that won
};

// ---------- the packer (independent of the model, so it can be property-tested) ----------

export type PackItem = {
  id: string; l: number; w: number; turnable: boolean;
  ids?: string[]; name?: string; needsFinish?: boolean; strip?: string; members?: StripMember[];
};
export type PackStock = { id: string; length: number; width: number; qty: number; owned: boolean; trim?: number };
export type SplitRule = "shorterLeftover" | "longerLeftover" | "alongGrain";
export type PackedSheet = { stock: PackStock; free: Rect[]; placed: (Rect & { item: PackItem; turned: boolean })[] };
export type PackResult = { sheets: PackedSheet[]; unplaced: { item: PackItem; reason: UnplacedReason }[]; strategy: string };

const ORDERS: Record<string, (a: PackItem, b: PackItem) => number> = {
  area: (a, b) => b.l * b.w - a.l * a.w,
  long: (a, b) => Math.max(b.l, b.w) - Math.max(a.l, a.w),
  perim: (a, b) => b.l + b.w - (a.l + a.w),
};
const SPLITS: SplitRule[] = ["shorterLeftover", "longerLeftover", "alongGrain"];

const orientations = (p: PackItem) => {
  const o = [{ l: p.l, w: p.w, turned: false }];
  if (p.turnable && Math.abs(p.l - p.w) > EPS) o.push({ l: p.w, w: p.l, turned: true });
  return o;
};
const usable = (s: PackStock) => ({ l: s.length - 2 * (s.trim ?? 0), w: s.width - 2 * (s.trim ?? 0) });
const fitsStock = (p: PackItem, s: PackStock) => {
  const u = usable(s);
  return orientations(p).some((o) => o.l <= u.l + EPS && o.w <= u.w + EPS);
};

/** Fewer unplaced first, then fewer purchased square units, then fewer sheets, then a bigger largest offcut. */
export function packScore(r: PackResult): number {
  const bought = r.sheets.filter((s) => !s.stock.owned).reduce((a, s) => a + s.stock.length * s.stock.width, 0);
  const largestFree = Math.max(0, ...r.sheets.flatMap((s) => s.free.map((f) => f.l * f.w)));
  return r.unplaced.length * 1e15 + bought * 1e6 + r.sheets.length * 1e3 - largestFree / 1e3;
}

/** Packs items onto stock, trying every sort order, split rule and preferred stock; returns the best. */
export function pack(items: PackItem[], stock: PackStock[], kerf: number): PackResult {
  let best: PackResult | null = null;
  let bestScore = Infinity;
  for (const [oname, order] of Object.entries(ORDERS)) {
    const sorted = [...items].sort(order);
    for (const split of SPLITS) {
      for (const prefer of [null, ...stock.map((s) => s.id)]) {
        const res = run(sorted, stock, kerf, split, prefer);
        res.strategy = `${oname}/${split}/prefer=${prefer ?? "none"}`;
        const sc = packScore(res);
        if (sc < bestScore - 1e-9) {
          best = res;
          bestScore = sc;
        }
      }
    }
  }
  return best ?? { sheets: [], unplaced: [], strategy: "none" };
}

function run(items: PackItem[], stock: PackStock[], kerf: number, split: SplitRule, prefer: string | null): PackResult {
  const remaining = new Map(stock.map((s) => [s.id, s.qty]));
  const sheets: PackedSheet[] = [];
  const unplaced: PackResult["unplaced"] = [];
  for (const p of items) {
    if (tryPlace(sheets, p, kerf, split)) continue;
    // Open a new sheet: owned stock first, then the preferred stock, then the smallest that fits.
    const candidates = stock
      .filter((s) => (remaining.get(s.id) ?? 0) > 0 && fitsStock(p, s))
      .sort((a, b) => (Number(b.owned) - Number(a.owned)) || (Number(b.id === prefer) - Number(a.id === prefer)) || (a.length * a.width - b.length * b.width));
    if (candidates.length === 0) {
      const reason: UnplacedReason = !stock.some((s) => fitsStock(p, s)) ? "too-big" : "no-stock";
      unplaced.push({ item: p, reason });
      continue;
    }
    const s = candidates[0];
    remaining.set(s.id, (remaining.get(s.id) ?? 0) - 1);
    const u = usable(s);
    const t = s.trim ?? 0;
    sheets.push({ stock: s, free: [{ x: t, y: t, l: u.l, w: u.w }], placed: [] });
    if (!tryPlace(sheets, p, kerf, split)) unplaced.push({ item: p, reason: "no-space" });
  }
  return { sheets, unplaced, strategy: "" };
}

/** Best short-side fit across every free rectangle of every open sheet; then a guillotine split of what is left. */
function tryPlace(sheets: PackedSheet[], p: PackItem, kerf: number, split: SplitRule): boolean {
  let best: { si: number; fi: number; o: { l: number; w: number; turned: boolean }; ss: number } | null = null;
  sheets.forEach((sh, si) => sh.free.forEach((f, fi) => {
    for (const o of orientations(p)) {
      if (o.l <= f.l + EPS && o.w <= f.w + EPS) {
        const ss = Math.min(f.l - o.l, f.w - o.w);
        if (!best || ss < best.ss - EPS) best = { si, fi, o, ss };
      }
    }
  }));
  if (!best) return false;
  const { si, fi, o } = best as { si: number; fi: number; o: { l: number; w: number; turned: boolean } };
  const sh = sheets[si];
  const f = sh.free.splice(fi, 1)[0];
  sh.placed.push({ x: f.x, y: f.y, l: o.l, w: o.w, item: p, turned: o.turned });
  const rl = f.l - o.l - kerf; // the strip beside the part, along the length
  const rw = f.w - o.w - kerf; // the strip beside the part, across the width
  // true: the first cut runs along the length (a rip), the full length of f
  const ripFirst = split === "alongGrain" ? true : split === "shorterLeftover" ? rl < rw : !(rl < rw);
  const rects: Rect[] = ripFirst
    ? [{ x: f.x + o.l + kerf, y: f.y, l: rl, w: o.w }, { x: f.x, y: f.y + o.w + kerf, l: f.l, w: rw }]
    : [{ x: f.x + o.l + kerf, y: f.y, l: rl, w: f.w }, { x: f.x, y: f.y + o.w + kerf, l: o.l, w: rw }];
  for (const r of rects) if (r.l > EPS && r.w > EPS) sh.free.push(r);
  return true;
}

// ---------- from the model ----------

const offcutMin = (units: "in" | "mm") => (units === "in" ? 3 : 75);

/** Sheet layouts, one per (cut phase, sheet material), in phase order. Owned pieces used in one phase are gone in the next. */
export function nest(r: Resolved, opts: { phase?: string } = {}): Nesting[] {
  const units = r.project.units;
  const out: Nesting[] = [];
  const ownedLeft = new Map<string, number>(); // `${material}/${stock}` → pieces left
  const allStrips = strips(r);
  for (const ph of r.phases) {
    for (const [key, mat] of Object.entries(r.materials)) {
      if (mat.type !== "sheet") continue;
      const parts = r.parts.filter((p): p is ResolvedCutPart => isCutPart(p) && p.kind === "panel" && p.material === key && p.cutPhase === ph.id && !!p.sizes);
      if (parts.length === 0) continue;
      const m = mat as SheetMaterial;
      const kerf = m.kerf ?? defaultKerf(units);
      const needsFinish = (p: ResolvedCutPart) => m.finish === "none" && (p.finishApplied === "clear" || p.finishApplied === "paint");
      const items: PackItem[] = [];
      for (const p of parts) {
        if (p.strip) continue;
        const c = cutSize(p, r.banding);
        items.push({ id: p.id, ids: [p.id], name: p.name, l: c.l, w: c.w, turnable: p.grainLock === false || !m.grained, needsFinish: needsFinish(p) });
      }
      for (const s of allStrips.filter((s) => s.material === key && s.phase === ph.id)) {
        const members = s.members.map((id) => r.part(id) as ResolvedCutPart);
        items.push({
          id: `strip:${s.id}`, ids: [...s.members], name: s.name, l: s.l, w: s.w, turnable: false, strip: s.id,
          needsFinish: members.some(needsFinish),
          members: members.map((p) => ({ id: p.id, name: p.name, x: 0, l: cutSize(p, r.banding).l })),
        });
      }
      const stock: PackStock[] = m.stock.map((s) => {
        const k = `${key}/${s.id}`;
        if (s.owned && !ownedLeft.has(k)) ownedLeft.set(k, s.owned);
        const qty = s.owned ? ownedLeft.get(k) ?? 0 : s.buy ? Infinity : 0;
        return { id: s.id, length: s.length, width: s.width, qty, owned: !!s.owned, trim: m.trim ?? 0 };
      });
      const res = pack(items, stock, kerf);
      const bought: Record<string, number> = {};
      const owned: Record<string, number> = {};
      const sheets: SheetLayout[] = res.sheets.map((sh) => {
        const rec = sh.stock.owned ? owned : bought;
        rec[sh.stock.id] = (rec[sh.stock.id] ?? 0) + 1;
        return {
          stock: sh.stock.id, owned: sh.stock.owned, length: sh.stock.length, width: sh.stock.width,
          placements: sh.placed.map((pl) => {
            const it = pl.item;
            const placement: Placement = {
              ids: it.ids ?? [it.id], name: it.name ?? it.id, x: pl.x, y: pl.y, l: pl.l, w: pl.w,
              turned: pl.turned, needsFinish: !!it.needsFinish,
            };
            if (it.strip) {
              placement.strip = it.strip;
              let x = pl.x;
              placement.members = (it.members ?? []).map((mb) => {
                const out = { id: mb.id, name: mb.name, x, l: mb.l };
                x += mb.l + kerf;
                return out;
              });
            }
            return placement;
          }),
          offcuts: sh.free.filter((f) => f.l >= offcutMin(units) - EPS && f.w >= offcutMin(units) - EPS)
            .sort((a, b) => b.l * b.w - a.l * a.w || a.x - b.x || a.y - b.y),
        };
      });
      for (const [id, n] of Object.entries(owned)) ownedLeft.set(`${key}/${id}`, (ownedLeft.get(`${key}/${id}`) ?? 0) - n);
      if (opts.phase !== undefined && opts.phase !== ph.id) continue;
      out.push({
        phase: ph.id, material: key, materialName: m.name, units, kerf, trim: m.trim ?? 0,
        thickness: fmtThickness(m, { units }), finished: m.finish !== "none",
        sheets,
        unplaced: res.unplaced.flatMap((u) => (u.item.ids ?? [u.item.id]).map((id) => ({ id, reason: u.reason }))),
        bought, owned, strategy: res.strategy,
      });
    }
  }
  return out;
}

/** Where a part sits in the sheet layouts, or null. */
export function placementOf(ns: Nesting[], id: string): { phase: string; material: string; stock: string; sheet: number; placement: Placement } | null {
  for (const n of ns) {
    for (const [i, sh] of n.sheets.entries()) {
      for (const pl of sh.placements) {
        if (pl.ids.includes(id)) return { phase: n.phase, material: n.material, stock: sh.stock, sheet: i, placement: pl };
      }
    }
  }
  return null;
}
