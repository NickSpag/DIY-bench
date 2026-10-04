// Sheet layouts: the closet against spec section 13.1 "Sheets", a seeded property test of the
// packer, the nesting:unplaced invariant and the sheet SVG.
import { describe, expect, test } from "vitest";
import closet from "../../projects/closet-built-in/project.ts";
import { evaluate } from "../../core/evaluate.ts";
import { nest, pack, type PackItem, type PackResult, type PackStock, type Rect } from "../../core/nesting.ts";
import { sheetSvg } from "../../core/sheet-svg.ts";
import { box } from "../../core/model/index.ts";
import { mini, SHEET } from "./helpers.ts";

const EPS = 1e-6;

describe.each(["1", "0.75"])("closet sheets, top=%s", (top) => {
  const r = evaluate(closet, { top });
  const ns = nest(r);
  const layout = ns.map((n) => n.sheets.map((s) => [n.phase, n.material, s.stock, s.owned, s.placements.flatMap((p) => p.ids).sort()]));

  test("sheet assignments as in section 13.1", () => {
    const drawerBox = [1, 2, 3].flatMap((i) => [`drawer-${i}-side-l`, `drawer-${i}-side-r`, `drawer-${i}-front`, `drawer-${i}-back`]);
    expect(layout).toEqual([
      [["p1", "ply-pre", "4x8", false, ["partition-left", "partition-right", "shelf-right-70"].sort()],
        ["p1", "ply-pre", "4x4", false, ["center-shelf-fixed", "center-shelf-adj-1", "center-shelf-adj-2", "center-shelf-adj-3"].sort()]],
      [["p1", "ply-raw", "owned-56x48", true, ["hamper-face", "drawer-face-1", "drawer-face-2", "drawer-face-3",
        "top-shelf-left", "top-shelf-right", "top-shelf-center", "nailer-top", "nailer-70"].sort()]],
      [["p2", "ply-half", "4x8", false, ["hamper-frame-side", "hamper-frame-back", ...drawerBox].sort()]],
      [["p2", "ply-quarter", "4x4", false, ["drawer-1-bottom", "drawer-2-bottom", "drawer-3-bottom"]]],
    ]);
  });

  test("the faces strip is one 48⅝ × 23⁵⁄₁₆ placement with its members end to end", () => {
    const strip = ns[1].sheets[0].placements.find((p) => p.strip === "faces");
    expect(strip).toMatchObject({ l: 48.625, w: 23.3125, turned: false, needsFinish: true });
    expect(strip?.members?.map((m) => [m.id, m.x, m.l])).toEqual([
      ["hamper-face", 0, 27.625], ["drawer-face-1", 27.75, 7.875], ["drawer-face-2", 35.75, 6.875], ["drawer-face-3", 42.75, 5.875],
    ]);
  });

  test("purchases: one 4×8 and one 4×4 of prefinished, one 4×8 of ½″, one 4×4 of ¼″; the owned piece used once", () => {
    expect(ns.map((n) => [n.material, n.bought, n.owned])).toEqual([
      ["ply-pre", { "4x8": 1, "4x4": 1 }, {}],
      ["ply-raw", {}, { "owned-56x48": 1 }],
      ["ply-half", { "4x8": 1 }, {}],
      ["ply-quarter", { "4x4": 1 }, {}],
    ]);
    expect(ns.every((n) => n.unplaced.length === 0)).toBe(true);
  });

  test("locked parts are not turned; grain-free parts may be", () => {
    for (const n of ns) for (const s of n.sheets) for (const p of s.placements) {
      const part = r.part(p.ids[0]);
      if (p.turned) expect(part?.kind === "panel" && part.grainLock).toBe(false);
    }
  });

  test("a phase filter returns that phase's layouts", () => {
    expect(nest(r, { phase: "p2" }).map((n) => n.material)).toEqual(["ply-half", "ply-quarter"]);
  });
});

test("the closet nests in under 50 ms", () => {
  const r = evaluate(closet);
  const t0 = performance.now();
  nest(r);
  expect(performance.now() - t0).toBeLessThan(50);
});

// ---------- property test ----------

/** The reference page's LCG. */
function rnd(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const usable = (s: PackStock) => ({ l: s.length - 2 * (s.trim ?? 0), w: s.width - 2 * (s.trim ?? 0) });
const fitsSomeStock = (it: PackItem, stock: PackStock[]) => stock.some((s) => {
  const u = usable(s);
  return (it.l <= u.l + EPS && it.w <= u.w + EPS) || (it.turnable && it.w <= u.l + EPS && it.l <= u.w + EPS);
});

/** Recursively splits the rectangles by full-length cuts along x or y that cross none of them. */
function guillotine(rects: Rect[]): boolean {
  if (rects.length <= 1) return true;
  for (const axis of ["x", "y"] as const) {
    const lo = (r: Rect) => (axis === "x" ? r.x : r.y), len = (r: Rect) => (axis === "x" ? r.l : r.w);
    for (const c of rects.map((r) => lo(r) + len(r))) {
      const before = rects.filter((r) => lo(r) + len(r) <= c + EPS);
      const after = rects.filter((r) => lo(r) >= c - EPS);
      if (before.length && after.length && before.length + after.length === rects.length) {
        return guillotine(before) && guillotine(after);
      }
    }
  }
  return false;
}

function checkResult(items: PackItem[], stock: PackStock[], kerf: number, res: PackResult): void {
  const placed = res.sheets.flatMap((s) => s.placed.map((p) => p.item.id));
  const unplaced = res.unplaced.map((u) => u.item.id);
  expect([...placed, ...unplaced].sort()).toEqual(items.map((i) => i.id).sort());
  for (const u of res.unplaced) {
    if (u.reason === "too-big") expect(fitsSomeStock(u.item, stock)).toBe(false);
    else {
      expect(u.reason).toBe("no-stock");
      expect(fitsSomeStock(u.item, stock)).toBe(true);
    }
  }
  const used = new Map<string, number>();
  for (const sh of res.sheets) {
    used.set(sh.stock.id, (used.get(sh.stock.id) ?? 0) + 1);
    const t = sh.stock.trim ?? 0;
    for (const p of sh.placed) {
      expect(p.x).toBeGreaterThanOrEqual(t - EPS);
      expect(p.y).toBeGreaterThanOrEqual(t - EPS);
      expect(p.x + p.l).toBeLessThanOrEqual(sh.stock.length - t + EPS);
      expect(p.y + p.w).toBeLessThanOrEqual(sh.stock.width - t + EPS);
      if (!p.item.turnable) expect(p.turned).toBe(false);
      expect(p.turned ? [p.w, p.l] : [p.l, p.w]).toEqual([p.item.l, p.item.w]);
    }
    for (let i = 0; i < sh.placed.length; i++) for (let j = i + 1; j < sh.placed.length; j++) {
      const a = sh.placed[i], b = sh.placed[j];
      const apart = a.x + a.l + kerf <= b.x + EPS || b.x + b.l + kerf <= a.x + EPS || a.y + a.w + kerf <= b.y + EPS || b.y + b.w + kerf <= a.y + EPS;
      expect(apart, `placements ${a.item.id} and ${b.item.id} overlap once the kerf is included`).toBe(true);
    }
    expect(guillotine(sh.placed)).toBe(true);
  }
  for (const s of stock) expect(used.get(s.id) ?? 0).toBeLessThanOrEqual(s.qty);
}

test("property: 300 seeded random part sets pack validly", () => {
  const sixteenth = (v: number) => Math.round(v * 16) / 16;
  for (let seed = 1; seed <= 300; seed++) {
    const r = rnd(seed);
    const kerf = r() < 0.5 ? 0.125 : 0.0625;
    const nStock = 1 + Math.floor(r() * 3);
    const stock: PackStock[] = [];
    for (let i = 0; i < nStock; i++) {
      const owned = r() < 0.35;
      stock.push({
        id: `s${i}`, length: sixteenth(24 + r() * 72), width: sixteenth(24 + r() * 24),
        qty: owned ? 1 + Math.floor(r() * 2) : r() < 0.85 ? Infinity : 0, owned, trim: r() < 0.2 ? 0.25 : 0,
      });
    }
    const nItems = 1 + Math.floor(r() * 30);
    const items: PackItem[] = [];
    for (let i = 0; i < nItems; i++) {
      items.push({ id: `p${i}`, l: sixteenth(2 + r() * (r() < 0.1 ? 110 : 60)), w: sixteenth(2 + r() * (r() < 0.1 ? 55 : 30)), turnable: r() < 0.4 });
    }
    checkResult(items, stock, kerf, pack(items, stock, kerf));
  }
});

// ---------- nesting:unplaced ----------

describe("nesting:unplaced", () => {
  const panel = (id: string, l: number, w: number) => ({ id, name: "P", material: "ply", phase: "p1", step: "s1", box: box([0, l], [0, w], [0, 0.75]), grain: "x" as const, exposure: "hidden" as const });
  test("a part larger than every stock is too-big", () => {
    const r = evaluate(mini((b) => b.panel(panel("huge", 100, 40))));
    expect(r.issues).toEqual([expect.objectContaining({ code: "nesting:unplaced", parts: ["huge"], phases: ["p1"], message: expect.stringContaining("(too-big)") })]);
  });
  test("an owned-only material that runs out is no-stock", () => {
    const owned = { ...SHEET, stock: [{ id: "owned", length: 48, width: 24, owned: 1 }] };
    const r = evaluate(mini((b) => { b.panel(panel("a", 40, 20)); b.panel({ ...panel("b", 40, 20), box: box([50, 90], [0, 20], [0, 0.75]) }); }, { materials: { ply: owned } }));
    expect(r.issues.map((i) => [i.code, i.parts, i.message.endsWith("(no-stock)")])).toEqual([["nesting:unplaced", ["b"], true]]);
  });
  test("parts that fit raise nothing", () => {
    expect(evaluate(mini((b) => b.panel(panel("ok", 90, 40)))).issues).toEqual([]);
  });
});

// ---------- SVG ----------

describe("sheetSvg", () => {
  const r = evaluate(closet);
  const ns = nest(r);

  test("every placement carries data-part with its ids", () => {
    for (const n of ns) {
      const svg = sheetSvg(n);
      const placements = n.sheets.flatMap((s) => s.placements);
      const tagged = [...svg.matchAll(/<g class="wb-placement" data-part="([^"]+)"/g)].map((m) => m[1]);
      expect(tagged).toEqual(placements.map((p) => p.ids.join(" ")));
    }
  });

  test("strip members are drawn and tagged one by one", () => {
    const svg = sheetSvg(ns[1]);
    const members = [...svg.matchAll(/<g class="wb-strip-member" data-part="([^"]+)"/g)].map((m) => m[1]);
    expect(members).toEqual(["hamper-face", "drawer-face-1", "drawer-face-2", "drawer-face-3"]);
    expect(svg).toContain('class="wb-part k-raw k-needs-finish"');
  });

  test("titles, a grain arrow per sheet, hatch for unfinished material only", () => {
    const pre = sheetSvg(ns[0]);
    expect(pre).toContain("4×8 · 23/32″ prefinished maple plywood (sold as ¾″), 96 × 48");
    expect(pre.match(/class="wb-grain-arrow"/g)).toHaveLength(2);
    expect(pre).not.toContain('fill="url(#');
    expect(sheetSvg(ns[1])).toContain('fill="url(#wb-raw-p1-ply-raw)"');
  });

  test("is deterministic and well formed", () => {
    for (const n of ns) {
      const a = sheetSvg(n);
      expect(sheetSvg(nest(evaluate(closet))[ns.indexOf(n)])).toBe(a);
      expect(a.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(a.match(/<g\b/g)?.length).toBe(a.match(/<\/g>/g)?.length);
      expect(a).not.toMatch(/NaN|undefined/);
    }
  });
});
