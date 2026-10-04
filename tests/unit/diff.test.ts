// Compare (spec milestone M7): core/diff.ts on the closet's two configurations and on a
// synthetic project, and `wb diff` from the command line.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import closet from "../../projects/closet-built-in/project.ts";
import { evaluate } from "../../core/evaluate.ts";
import { changeText, diff, diffDoc, diffText } from "../../core/diff.ts";
import { box, span } from "../../core/model/index.ts";
import { mini } from "./helpers.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const wbJson = (args: string[]) => JSON.parse(execFileSync(join(ROOT, "wb"), [...args, "--json"], { cwd: ROOT, encoding: "utf8" }));

describe("wb diff --against opt:top=0.75", () => {
  const d = wbJson(["diff", "--project", "closet-built-in", "--against", "opt:top=0.75"]);
  const change = (id: string, field: string) => d.parts.changed.find((c: any) => c.id === id && c.field === field);

  test("the hardwood top: thickness 1 → ¾, y 49 to 50 becomes 49 to 49¾, material hw-1in → hw-34", () => {
    expect(change("center-top", "thickness")).toMatchObject({ from: 1, to: 0.75 });
    expect(change("center-top", "box@p2").from.y).toEqual([49, 50]);
    expect(change("center-top", "box@p2").to.y).toEqual([49, 49.75]);
    expect(change("center-top", "material")).toMatchObject({ from: "hw-1in", to: "hw-34" });
  });

  test("the third adjustable shelf in phase 2: 59⅝ → 59½", () => {
    const c = change("center-shelf-adj-3", "box@p2");
    expect(c.from.y[0]).toBe(59.625);
    expect(c.to.y[0]).toBe(59.5);
    expect(d.parts.changed.map((x: any) => x.id).sort()).toEqual(["center-shelf-adj-3", "center-top", "center-top", "center-top"]);
    expect(d.parts.added).toEqual([]);
    expect(d.parts.removed).toEqual([]);
  });

  test("the cut list: the Hardwood top row moves from Hardwood 1″ to Hardwood ¾″", () => {
    const rows = d.cutlist.changed.filter((c: any) => c.key === "center-top");
    expect(rows.find((c: any) => c.field === "material")).toMatchObject({ from: "hw-1in", to: "hw-34" });
    expect(rows.find((c: any) => c.field === "materialName")).toMatchObject({ from: "Hardwood, 1″ thick", to: "Hardwood, ¾″ thick" });
    expect(d.cutlist.added).toEqual([]);
    expect(d.cutlist.removed).toEqual([]);
  });

  test("the sheet purchases do not change", () => {
    expect(d.sheets.same).toBe(true);
    expect(d.sheets.from).toEqual(d.sheets.to);
  });
});

test("wb diff against a git ref and against the last good model", () => {
  const head = wbJson(["diff", "--project", "closet-built-in", "--against", "HEAD"]);
  expect(head.parts.changed).toEqual([]);
  execFileSync(join(ROOT, "wb"), ["check", "--project", "closet-built-in"], { cwd: ROOT });
  const lg = wbJson(["diff", "--project", "closet-built-in", "--against", "last-good"]);
  expect(lg.parts).toEqual({ added: [], removed: [], changed: [] });
});

test("diff on a synthetic project: added, removed and resized parts", () => {
  const a = evaluate(mini((b) => {
    b.panel({ id: "side", name: "Side", material: "ply", phase: "p1", step: "s1", box: box([0, 0.75], [0, 30], [0, 12]), grain: "y" });
    b.panel({ id: "shelf", name: "Shelf", material: "ply", phase: "p1", step: "s1", box: box([0.75, 20], span(10, 0.75), [0, 12]), grain: "x" });
  }));
  const b = evaluate(mini((b) => {
    b.panel({ id: "side", name: "Side", material: "ply", phase: "p1", step: "s1", box: box([0, 0.75], [0, 32], [0, 12]), grain: "y" });
    b.panel({ id: "top", name: "Top", material: "ply", phase: "p1", step: "s1", box: box([0.75, 20], span(31.25, 0.75), [0, 12]), grain: "x" });
  }));
  const d = diff(diffDoc(a), diffDoc(b));
  expect(d.parts.added).toEqual(["top"]);
  expect(d.parts.removed).toEqual(["shelf"]);
  expect(d.parts.changed.find((c) => c.id === "side" && c.field === "length")).toMatchObject({ from: 30, to: 32 });
  expect(changeText(d.parts.changed.find((c) => c.field === "box@p1")!, "in")).toBe("p1: y 0 to 30 → 0 to 32");
  expect(d.cutlist.added.map((r) => r.name)).toEqual(["Top"]);
  expect(d.cutlist.removed.map((r) => r.name)).toEqual(["Shelf"]);
  expect(diffText(d, "in")).toContain("parts: 1 added, 1 removed, 1 changed");
});

test("a model compared with itself has no changes", () => {
  const r = evaluate(closet, { top: "1" });
  const d = diff(diffDoc(r), diffDoc(evaluate(closet, { top: "1" })));
  expect(d.parts.changed).toEqual([]);
  expect(d.cutlist.changed).toEqual([]);
  expect(d.sheets.same).toBe(true);
});
