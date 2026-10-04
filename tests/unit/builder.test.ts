import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { box, Builder, parseStack, span, srcFromStack } from "../../core/model/index.ts";
import { evaluate, EvaluationError } from "../../core/evaluate.ts";
import { mini } from "./helpers.ts";

const SOURCE = readFileSync(new URL(import.meta.url), "utf8").split("\n");
/** The 1-based line of this file holding a marker comment. */
const lineOf = (marker: string) => SOURCE.findIndex((l) => l.includes(`// ${marker}`) && !l.includes("lineOf")) + 1;

const panel = (id: string) => ({ id, name: "P", material: "ply", phase: "p1", box: box([0, 10], [0, 20], [0, 0.75]), grain: "x" as const });

test("span and box", () => {
  expect(span(2, 3)).toEqual([2, 5]);
  expect(box([0, 1], [2, 3], [4, 5])).toEqual({ x: [0, 1], y: [2, 3], z: [4, 5] });
});

test("a duplicate id throws", () => {
  const b = new Builder();
  b.panel(panel("a"));
  expect(() => b.panel(panel("a"))).toThrow('duplicate part id "a"');
});

test("a non-kebab id throws", () => {
  const b = new Builder();
  expect(() => b.panel(panel("Shelf_1"))).toThrow("not kebab-case");
  expect(() => b.panel(panel("shelf--1"))).toThrow("not kebab-case");
  expect(() => b.panel(panel("-shelf"))).toThrow("not kebab-case");
});

test("a reversed range throws", () => {
  const b = new Builder();
  expect(() => b.panel({ ...panel("a"), box: box([10, 0], [0, 1], [0, 1]) })).toThrow("reversed");
  expect(() => b.panel({ ...panel("b"), box: box([0, 1], [0, 0], [0, 1]) })).toThrow("box.y");
  expect(() => b.hardware({ id: "rod", name: "Rod", item: "rod", qty: 1, phase: "p1", cylinder: { axis: "x", from: 5, to: 1, center: [0, 0], diameter: 1 } })).toThrow("cylinder");
  expect(() => b.panel({ ...panel("c"), moves: { p2: box([0, 1], [3, 2], [0, 1]) } })).toThrow("moves.p2.y");
});

test("part and boxOf", () => {
  const b = new Builder();
  b.panel(panel("a"));
  b.hardware({ id: "h", name: "H", item: "pin", qty: 1, phase: "p1" });
  expect(b.part("a").id).toBe("a");
  expect(b.boxOf("a")).toEqual(panel("a").box);
  expect(() => b.part("zz")).toThrow('no part "zz"');
  expect(() => b.boxOf("h")).toThrow("has no box");
});

test("the test file's own call sites resolve to the right src line", () => {
  const b = new Builder();
  const line = Number(new Error().stack?.split("\n")[1]?.match(/:(\d+):\d+\)?$/)?.[1]) + 1;
  b.panel(panel("here"));
  const src = b.part("here").src;
  expect(src?.file).toBe("tests/unit/builder.test.ts");
  expect(src?.line).toBe(line);
  expect(src?.col).toBe(5);
});

test("call sites inside a project's build function point at the project", () => {
  const r = evaluate(mini((b) => {
    b.panel({ ...panel("inside"), step: "s1" }); // marker:inside
  }), {});
  const src = r.part("inside")?.src;
  expect(src?.file).toBe("tests/unit/builder.test.ts");
  expect(src?.line).toBe(lineOf("marker:inside"));
});

test("evaluate wraps a throwing build in EvaluationError with the throwing line", () => {
  const project = mini((b) => {
    b.panel(panel("x"));
    b.panel(panel("x")); // marker:throws
  });
  let err: unknown;
  try {
    evaluate(project, {});
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(EvaluationError);
  expect((err as EvaluationError).message).toContain("duplicate");
  expect((err as EvaluationError).src?.file).toBe("tests/unit/builder.test.ts");
  expect((err as EvaluationError).src?.line).toBe(lineOf("marker:throws"));
});

test("stack parsing handles V8, Firefox and dev-server URLs", () => {
  expect(parseStack("Error\n    at f (file:///a/b.ts:3:4)\n    at node:internal/x:1:1")).toEqual([{ file: "/a/b.ts", path: "/a/b.ts", line: 3, col: 4 }]);
  expect(srcFromStack("f@http://127.0.0.1:5180/projects/x/project.ts?t=123:7:9")).toEqual({ file: "/projects/x/project.ts", line: 7, col: 9 });
  expect(srcFromStack("nothing here")).toBeNull();
});
