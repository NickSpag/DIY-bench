// Build steps (spec section 7.4) on the closet, and the stepper's walk across phases.
import { expect, test } from "vitest";
import closet from "../../projects/closet-built-in/project.ts";
import { evaluate } from "../../core/evaluate.ts";
import { buildSteps, neighbourStep } from "../../core/steps.ts";

const r = evaluate(closet, { top: "1" });
const groups = buildSteps(r);

test("two phases and nine numbered steps", () => {
  expect(groups.map((g) => g.phase.id)).toEqual(["p1", "p2"]);
  expect(groups.map((g) => g.steps.map((s) => `${s.number}:${s.id}`))).toEqual([
    ["1:p1-bench", "2:p1-cleats", "3:p1-stand", "4:p1-tie", "5:p1-finish"],
    ["1:p2-frame", "2:p2-drawers", "3:p2-top", "4:p2-faces"],
  ]);
});

test("a step lists step.parts when given, else the parts that name it", () => {
  const step = (id: string) => groups.flatMap((g) => g.steps).find((s) => s.id === id)!;
  expect(step("p1-bench").parts).toEqual(["partition-left", "partition-right"]);
  expect(step("p2-frame").parts).toEqual(["hamper-frame-side", "hamper-frame-rail", "hamper-frame-back"]);
  expect(step("p1-bench").src?.line).toBeGreaterThan(0);
});

test("the first step of phase 2 takes out the two lower shelves and moves the third and the hamper", () => {
  const first = groups[1].steps[0];
  expect(first.takeOut).toEqual(["center-shelf-adj-1", "center-shelf-adj-2"]);
  expect(first.moves.map((m) => m.id)).toEqual(["center-shelf-adj-3", "rolling-hamper"]);
  const adj3 = first.moves[0];
  expect(adj3.from?.y[0]).toBe(55.75);
  expect(adj3.to.y[0]).toBe(59.625);
  expect(groups[1].steps[1].takeOut).toEqual([]);
  expect(groups[0].steps[0].moves).toEqual([]);
});

test("the stepper walks forward and back across phases", () => {
  expect(neighbourStep(groups, "p1", null, 1)).toEqual({ phase: "p1", step: "p1-bench" });
  expect(neighbourStep(groups, "p1", "p1-finish", 1)).toEqual({ phase: "p2", step: "p2-frame" });
  expect(neighbourStep(groups, "p2", "p2-frame", -1)).toEqual({ phase: "p1", step: "p1-finish" });
  expect(neighbourStep(groups, "p2", null, -1)).toEqual({ phase: "p2", step: "p2-faces" });
  // past either end: all steps, the whole phase with nothing highlighted
  expect(neighbourStep(groups, "p2", "p2-faces", 1)).toEqual({ phase: "p2", step: null });
  expect(neighbourStep(groups, "p1", "p1-bench", -1)).toEqual({ phase: "p1", step: null });
});
