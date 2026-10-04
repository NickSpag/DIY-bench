import { describe, expect, test } from "vitest";
import { box, defineProject } from "../../core/model/index.ts";
import { allConfigs, computeSizes, configKey, configsToCheck, defaultConfig, evaluate, normalizeConfig } from "../../core/evaluate.ts";
import { mini } from "./helpers.ts";

const B1 = box([0, 10], [0, 20], [0, 0.75]);
const B2 = box([0, 10], [30, 50], [0, 0.75]);
const B3 = box([20, 30], [0, 20], [0, 0.75]);

// Three parts: a is removed in p2, b moves in p2, c is installed in p2 but cut in p1.
const three = mini((b) => {
  b.step({ id: "s4", phase: "p2", title: "Step four", text: "" });
  b.panel({ id: "a", name: "A", material: "ply", phase: "p1", step: "s1", box: B1, grain: "y", removedIn: "p2" });
  b.panel({ id: "b", name: "B", material: "ply", phase: "p1", step: "s2", box: B2, grain: "y", moves: { p2: B1 } });
  b.panel({ id: "c", name: "C", material: "ply", phase: "p2", step: "s4", cutIn: "p1", box: B3, grain: "y" });
});

const ids = (s: { parts: { part: { id: string } }[] }) => s.parts.map((e) => e.part.id);

describe("phase states", () => {
  const r = evaluate(three);

  test("included parts and placement per phase", () => {
    expect(ids(r.stateAt("p1"))).toEqual(["a", "b"]);
    expect(ids(r.stateAt("p2"))).toEqual(["b", "c"]);
    expect(r.stateAt("p1").parts.find((e) => e.part.id === "b")?.box).toEqual(B2);
    expect(r.stateAt("p2").parts.find((e) => e.part.id === "b")?.box).toEqual(B1); // moved
  });

  test("cutPhase is cutIn ?? phase", () => {
    expect(r.part("c")?.cutPhase).toBe("p1");
    expect(r.part("a")?.cutPhase).toBe("p1");
  });

  test("step states follow each part's own step, in declaration order", () => {
    expect(ids(r.stateAt("p1", "s1"))).toEqual(["a"]);
    expect(ids(r.stateAt("p1", "s2"))).toEqual(["a", "b"]);
    // In p2: a is gone from the first step on; b is already at its p2 placement; c arrives at s4.
    expect(ids(r.stateAt("p2", "s3"))).toEqual(["b"]);
    expect(r.stateAt("p2", "s3").parts[0].box).toEqual(B1);
    expect(ids(r.stateAt("p2", "s4"))).toEqual(["b", "c"]);
  });

  test("steps list their parts from part.step when they do not name them", () => {
    expect(r.steps.map((s) => [s.id, s.parts])).toEqual([["s1", ["a"]], ["s2", ["b"]], ["s3", []], ["s4", ["c"]]]);
  });

  test("stateAt is memoised and rejects unknown phases and steps", () => {
    expect(r.stateAt("p1")).toBe(r.stateAt("p1"));
    expect(() => r.stateAt("p9")).toThrow('unknown phase "p9"');
    expect(() => r.stateAt("p1", "s3")).toThrow('unknown step "s3"');
  });

  test("a context part with no phase is in every phase and step", () => {
    const r2 = evaluate(mini((b) => {
      b.context({ id: "floor", name: "Floor", role: "floor", box: box([-10, 40], [-1, 0], [-10, 10]) });
      b.panel({ id: "a", name: "A", material: "ply", phase: "p2", step: "s3", box: B1, grain: "y" });
    }));
    expect(ids(r2.stateAt("p1"))).toEqual(["floor"]);
    expect(ids(r2.stateAt("p1", "s1"))).toEqual(["floor"]);
    expect(ids(r2.stateAt("p2", "s3"))).toEqual(["floor", "a"]);
    expect(r2.part("floor")?.cutPhase).toBe("p1");
  });
});

describe("sizes", () => {
  test("thickness, length along the grain, width", () => {
    expect(computeSizes(box([0, 84], [0, 0.75], [0, 23.25]), 0.75, "x")).toMatchObject({ l: 84, w: 23.25, t: 0.75, lAxis: "x", wAxis: "z", tAxis: "y" });
    expect(computeSizes(box([0, 28], [0, 0.75], [0, 11.25]), 0.75, "z")).toMatchObject({ l: 11.25, w: 28, lAxis: "z" });
    expect(computeSizes(box([0, 28], [0, 0.75], [0, 11.25]), 0.75)).toMatchObject({ l: 28, w: 11.25, lAxis: "x" });
  });
  test("two axes match the thickness: the one that is neither the grain axis nor the largest", () => {
    // a ¾ × ¾ × 30 stick with grain along z: thickness is x (the first of x, y)
    expect(computeSizes(box([0, 0.75], [0, 0.75], [0, 30]), 0.75, "z")).toMatchObject({ tAxis: "x", lAxis: "z", wAxis: "y" });
    // grain along x leaves y as the thickness
    expect(computeSizes(box([0, 0.75], [0, 0.75], [0, 30]), 0.75, "x")).toMatchObject({ tAxis: "y", lAxis: "x", wAxis: "z" });
  });
});

describe("configurations", () => {
  const p = defineProject({
    ...mini(() => {}),
    options: {
      top: { label: "Top", choices: { "1": "1", "0.75": "¾" }, default: "1" },
      drawers: { label: "Drawers", choices: { "2": "2", "3": "3" }, default: "3" },
    },
  });
  test("defaults, cross product, keys", () => {
    expect(defaultConfig(p)).toEqual({ top: "1", drawers: "3" });
    expect(allConfigs(p).map(configKey)).toEqual(["top=1,drawers=3", "top=1,drawers=2", "top=0.75,drawers=3", "top=0.75,drawers=2"]);
    expect(configsToCheck(p).reduced).toBe(false);
    expect(configKey({})).toBe("default");
  });
  test("normalizeConfig fills defaults and rejects unknown options and choices", () => {
    expect(normalizeConfig(p, { top: "0.75" })).toEqual({ top: "0.75", drawers: "3" });
    expect(() => normalizeConfig(p, { color: "red" })).toThrow('unknown option "color"');
    expect(() => normalizeConfig(p, { top: "2" })).toThrow('unknown choice "2"');
  });
  test("past 32 configurations, only the default and single-option changes are checked", () => {
    const options: Record<string, { label: string; choices: Record<string, string>; default: string }> = {};
    for (let i = 0; i < 6; i++) options[`o${i}`] = { label: `o${i}`, choices: { a: "a", b: "b" }, default: "a" };
    const big = defineProject({ ...mini(() => {}), options });
    expect(allConfigs(big)).toHaveLength(64);
    const { configs, reduced } = configsToCheck(big);
    expect(reduced).toBe(true);
    expect(configs).toHaveLength(7);
  });
});
