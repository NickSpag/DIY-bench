// Drawings (spec section 7.3, milestone M6): orientation, hidden lines, sections, coverage of
// every visible part, the front view's dimensions, and determinism.
import { describe, expect, test } from "vitest";
import closet from "../../projects/closet-built-in/project.ts";
import { evaluate } from "../../core/evaluate.ts";
import { drawView, viewItems } from "../../core/drawings/index.ts";
import { edgesOf, splitSeg, unionBoundary, type DepthRect, type Seg } from "../../core/drawings/hidden.ts";
import { cutDepth, screenAxis } from "../../core/drawings/view-mapping.ts";
import { projectPoint } from "../../core/geometry.ts";
import type { Look } from "../../core/model/types.ts";

const r = evaluate(closet, { top: "1" });
const svg = (view: string, phase = "p2") => drawView(r, view, { phase, display: "in" });

/** The first rect whose data-part is exactly `id` with a fill class, as numbers. */
function rectOf(text: string, id: string): { x: number; y: number; w: number; h: number } {
  const re = new RegExp(`<rect data-part="${id}" class="[^"]*" x="([-\\d.]+)" y="([-\\d.]+)" width="([-\\d.]+)" height="([-\\d.]+)"`);
  const m = re.exec(text);
  if (!m) throw new Error(`no rect for ${id}`);
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}
const allRects = (text: string) => [...text.matchAll(/<rect data-part="([^"]+)" class="[^"]*" x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)]
  .map((m) => ({ id: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }));

describe("view mapping", () => {
  test("each look maps world axes to u, v and d as in the table", () => {
    const p = [1, 2, 3] as const;
    const want: Record<Look, number[]> = { "-z": [1, 2, 3], "+z": [-1, 2, -3], "+x": [3, 2, -1], "-x": [-3, 2, 1], "-y": [1, -3, 2] };
    for (const [look, w] of Object.entries(want)) expect(projectPoint(p, look as Look)).toEqual(w);
    expect(screenAxis("-y", "z")).toEqual({ screen: "v", sign: -1 });
    expect(screenAxis("+x", "x")).toBeNull();
    expect(cutDepth("+x", 14)).toBe(-14);
    expect(cutDepth("-y", 45)).toBe(45);
  });
});

describe("orientation", () => {
  test("front: partition-left is left of partition-right", () => {
    const t = svg("front");
    expect(rectOf(t, "partition-left").x).toBeLessThan(rectOf(t, "partition-right").x);
  });
  test("section A (look +x): the back wall's cut is left of everything", () => {
    const t = svg("section-a");
    const wall = /<g class="cut">.*?<rect data-part="wall-back" class="[^"]*" x="([-\d.]+)"/s.exec(t);
    expect(wall).not.toBeNull();
    const wx = Number((wall as RegExpExecArray)[1]);
    for (const rc of allRects(t)) if (rc.id !== "wall-back") expect(rc.x).toBeGreaterThanOrEqual(wx);
  });
  test("plan (look -y): the back wall is above the partitions", () => {
    const t = svg("plan");
    const wall = allRects(t).find((x) => x.id === "wall-back") as { y: number };
    expect(wall.y).toBeLessThan(rectOf(t, "partition-left").y);
    expect(wall.y).toBeLessThan(rectOf(t, "partition-right").y);
  });
});

describe("hidden lines on synthetic boxes", () => {
  const rect = (id: string, u: [number, number], v: [number, number], d: [number, number]): DepthRect => ({ id, u, v, d, occludes: true });
  const len = (segs: Seg[]) => segs.reduce((a, s) => a + (s.to - s.from), 0);

  test("two boxes side by side: no hidden segments", () => {
    const e = edgesOf([rect("a", [0, 10], [0, 10], [0, 5]), rect("b", [10, 20], [0, 10], [0, 5])]);
    expect(e.get("a")?.hidden).toEqual([]);
    expect(e.get("b")?.hidden).toEqual([]);
    expect(len(e.get("a")?.visible ?? [])).toBe(40);
  });

  test("a small box fully in front of a large one: the large box's covered edges are hidden, the small box's all visible", () => {
    // the small box straddles the large box's bottom edge
    const e = edgesOf([rect("big", [0, 20], [0, 20], [0, 5]), rect("small", [5, 10], [-2, 4], [5, 8])]);
    expect(e.get("small")?.hidden).toEqual([]);
    expect(len(e.get("small")?.visible ?? [])).toBe(22);
    expect(e.get("big")?.hidden).toEqual([{ o: "h", at: 0, from: 5, to: 10 }]);
    expect(len(e.get("big")?.visible ?? [])).toBe(75);
  });

  test("a shelf butting a partition: the shared edge is drawn solid, never dashed", () => {
    // partition u 0..¾ (deep, nearer face at d 23¼), shelf u ¾..23 (same front)
    const e = edgesOf([rect("partition", [0, 0.75], [0, 84], [0, 23.25]), rect("shelf", [0.75, 23], [70, 70.75], [0, 23.25])]);
    const shared = (id: string) => (e.get(id)?.visible ?? []).filter((s) => s.o === "v" && s.at === 0.75);
    expect(shared("partition")).toHaveLength(1);
    expect(shared("shelf")).toEqual([{ o: "v", at: 0.75, from: 70, to: 70.75 }]);
    expect(e.get("partition")?.hidden).toEqual([]);
    expect(e.get("shelf")?.hidden).toEqual([]);
  });

  test("boxes that overlap in depth (a joint) do not occlude each other", () => {
    const e = edgesOf([rect("side", [0, 1], [0, 10], [0, 20]), rect("bottom", [0.5, 9], [1, 1.25], [0.5, 19.5])]);
    expect(e.get("side")?.hidden).toEqual([]);
    expect(e.get("bottom")?.hidden).toEqual([]);
  });

  test("splitting and the outline of a union", () => {
    expect(splitSeg({ o: "h", at: 1, from: 0, to: 10 }, [{ u: [2, 4], v: [0, 2] }, { u: [3, 6], v: [0, 2] }]).hidden).toEqual([{ o: "h", at: 1, from: 2, to: 6 }]);
    // an L of two rects: the shared edge is interior, not boundary
    const b = unionBoundary([{ u: [0, 1], v: [0, 3] }, { u: [1, 3], v: [2, 3] }]);
    expect(b.some((s) => s.o === "v" && s.at === 1 && s.from < 2.5 && s.to > 2.5)).toBe(false);
    expect(b).toContainEqual({ o: "v", at: 1, from: 0, to: 2 });
  });
});

describe("sections", () => {
  const roles = (view: string, phase = "p2") => new Map(viewItems(r, r.views.find((v) => v.id === view)!, { phase }).map((i) => [i.id, i.role]));
  test("section B (cut at x 40): the fixed shelf and the hardwood top are cut, the right partition is beyond", () => {
    const m = roles("section-b");
    expect(m.get("center-shelf-fixed")).toBe("cut");
    expect(m.get("center-top")).toBe("cut");
    expect(m.get("partition-right")).toBe("beyond");
    expect(m.get("partition-left")).toBe("removed");
  });
  test("plan (cut at y 45): the left partition is cut and the left top shelf removed", () => {
    const m = roles("plan");
    expect(m.get("partition-left")).toBe("cut");
    expect(m.get("top-shelf-left")).toBe("removed");
  });
  test("the cut walls are hatched and the front view has a veil with a dashed opening", () => {
    expect(svg("plan")).toMatch(/class="hatch" data-part="wall-back"/);
    const f = svg("front");
    expect(f).toMatch(/class="v-fill" data-part="header"/);
    expect(f).toMatch(/<path class="v-open" d="[^"]+"/);
  });
  test("section B draws hidden lines; the front view does not", () => {
    expect(svg("section-b")).toMatch(/<path data-part="[^"]+" class="hid"/);
    expect(svg("front")).not.toMatch(/class="hid"/);
    expect(drawView(r, "front", { phase: "p2", display: "in", hiddenLines: true })).toMatch(/class="hid"/);
  });
});

describe("coverage", () => {
  test.each(r.views.flatMap((v) => r.phases.map((p) => [v.id, p.id])))("%s at %s: every visible part has an element with its id", (view, phase) => {
    const text = svg(view, phase);
    const ids = new Set([...text.matchAll(/data-part="([^"]+)"/g)].flatMap((m) => m[1].split(" ")));
    const v = r.views.find((x) => x.id === view)!;
    for (const i of viewItems(r, v, { phase })) {
      if (i.role !== "removed") expect(ids, `${i.id} in ${view} ${phase}`).toContain(i.id);
    }
  });
});

describe("front-view dimensions", () => {
  test("9 dimensions, in declaration order, with the measured parts in data-part", () => {
    const t = svg("front");
    const dims = [...t.matchAll(/<g class="dim"( data-part="([^"]*)")? data-dim="front:(\d+)">.*?<text[^>]*>([^<]*)<\/text><\/g>/g)];
    expect(dims).toHaveLength(9);
    expect(dims.map((d) => d[4])).toEqual(["80", "28", "24", "28", "15¾", "48½ opening", "15¾", "95½", "80½ opening"]);
    expect(dims[2][2]).toBe("partition-left partition-right");
    expect(dims.map((d) => Number(d[3]))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  test("labels fill their tokens with formatted lengths", () => {
    const t = svg("front");
    expect(t).toContain(">rod 81½″<");
    expect(t).toContain(">shelf 70″ · 12″ deep<");
  });
  test("metric display", () => {
    expect(drawView(r, "front", { phase: "p2", display: "mm" })).toContain(">2032<");
  });
});

describe("determinism", () => {
  test("two runs give byte-identical output", () => {
    for (const v of r.views) for (const p of r.phases) {
      const a = drawView(r, v.id, { phase: p.id, display: "in" });
      const b = drawView(evaluate(closet, { top: "1" }), v.id, { phase: p.id, display: "in" });
      expect(a).toBe(b);
    }
  });
  test("an unknown view throws, naming the views", () => {
    expect(() => drawView(r, "nope", { phase: "p1", display: "in" })).toThrow(/front, section-a, section-b, plan/);
  });
});
