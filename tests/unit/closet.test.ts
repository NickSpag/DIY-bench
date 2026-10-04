// The closet fixture's expected values (spec section 13.1, "Model").
import { describe, expect, test } from "vitest";
import closet from "../../projects/closet-built-in/project.ts";
import { evaluate } from "../../core/evaluate.ts";
import type { Resolved } from "../../core/model/index.ts";

const CONFIGS = [{ top: "1" }, { top: "0.75" }];
const built = (r: Resolved) => r.parts.filter((p) => p.kind !== "context");
const builtAt = (r: Resolved, phase: string) => r.stateAt(phase).parts.filter((e) => e.part.kind !== "context");
const yAt = (r: Resolved, phase: string, id: string) => r.stateAt(phase).parts.find((e) => e.part.id === id)?.box?.y[0];

describe.each(CONFIGS)("closet %j", (config) => {
  const r = evaluate(closet, config);

  test("part, step, check and view counts", () => {
    const count = (k: string) => r.parts.filter((p) => p.kind === k).length;
    expect(built(r)).toHaveLength(58);
    expect([count("panel"), count("board"), count("hardware")]).toEqual([33, 17, 8]);
    expect(count("context")).toBe(17);
    expect(r.steps).toHaveLength(9);
    expect(r.checks).toHaveLength(6);
    expect(r.views).toHaveLength(4);
  });

  test("built parts in each phase state", () => {
    expect(builtAt(r, "p1")).toHaveLength(33);
    expect(builtAt(r, "p2")).toHaveLength(56);
  });

  test("no issues", () => {
    expect(r.issues).toEqual([]);
  });

  test("adjustable shelves: 28, 42, 55¾ in p1; two removed and one moved in p2", () => {
    expect(["center-shelf-adj-1", "center-shelf-adj-2", "center-shelf-adj-3"].map((id) => yAt(r, "p1", id))).toEqual([28, 42, 55.75]);
    expect(yAt(r, "p2", "center-shelf-adj-1")).toBeUndefined();
    expect(yAt(r, "p2", "center-shelf-adj-2")).toBeUndefined();
    expect(r.part("center-shelf-adj-1")?.removedIn).toBe("p2");
    expect(yAt(r, "p2", "center-shelf-adj-3")).toBe(config.top === "1" ? 59.625 : 59.5);
  });

  test("the hardwood top follows the option", () => {
    const top = r.part("center-top");
    expect(top?.bounds?.y).toEqual(config.top === "1" ? [49, 50] : [49, 49.75]);
    expect(top?.kind === "board" && top.material).toBe(config.top === "1" ? "hw-1in" : "hw-34");
  });

  test("drawer-face-2 is defined at project.ts:193:9", () => {
    expect(r.part("drawer-face-2")?.src).toEqual({ file: "projects/closet-built-in/project.ts", line: 193, col: 9 });
  });

  test("the center column is 22⁹⁄₁₆ inside", () => {
    const l = r.part("partition-left")?.bounds, rt = r.part("partition-right")?.bounds;
    expect((rt?.x[0] ?? 0) - (l?.x[1] ?? 0)).toBeCloseTo(22.5625, 9);
  });
});
