// The app's pure helpers: source-map decoding, the highlight stylesheet, selection toggling,
// the viewer state for the agent, and the URL reader.
import { expect, test } from "vitest";
import closet from "../../projects/closet-built-in/project.ts";
import { evaluate } from "../../core/evaluate.ts";
import { viewerState } from "../../core/viewer.ts";
import { decodeMappings, lookup } from "../../app/srcmap.ts";
import { highlightCss } from "../../app/highlight-css.ts";
import { toggleIds } from "../../app/store-pure.ts";
import { readUrl } from "../../app/url-read.ts";

test("source maps: VLQ mappings decode, and lookup takes the nearest segment at or before the column", () => {
  // line 1: col 0 → src 0:0; line 2: col 0 → src 1:0, col 2 → src 1:2 ("AACA,EAAE")
  const map = decodeMappings("AAAA;AACA,EAAE");
  expect(map).toEqual([[[0, 0, 0]], [[0, 1, 0], [2, 1, 2]]]);
  expect(lookup(map, 2, 1)).toEqual({ line: 2, col: 1 });
  expect(lookup(map, 2, 5)).toEqual({ line: 2, col: 3 });
  expect(lookup(map, 9, 1)).toBeNull();
  // negative deltas and multi-digit values: "gBAAgB" is genCol 16, src 0, line 0, col 16
  expect(decodeMappings("gBAAgB")[0][0]).toEqual([16, 0, 16]);
  expect(decodeMappings("AAAA,DAAD")[0]).toEqual([[-1, 0, -1], [0, 0, 0]]);
});

test("highlight stylesheet: one --hl rule per selected id, quotes escaped", () => {
  const css = highlightCss(["partition-left", 'odd"id'], []);
  expect(css).toContain('[data-part~="partition-left"] { --hl: var(--hl-select);');
  expect(css).toContain('[data-part~="odd\\"id"]');
  expect(highlightCss([], [])).toBe("");
});

test("shift-click toggling: adds missing ids, removes them when all are already selected", () => {
  expect(toggleIds(["a"], ["b"])).toEqual(["a", "b"]);
  expect(toggleIds(["a", "b"], ["b"])).toEqual(["a"]);
  expect(toggleIds(["a"], ["a", "b"])).toEqual(["a", "b"]);
  expect(toggleIds(["a", "b"], ["a", "b"])).toEqual([]);
});

test("viewer state: selected parts carry a display size, their box at the phase and src", () => {
  const r = evaluate(closet, { top: "1" });
  const st = viewerState(r, { phase: "p2", step: null, drawingView: "front", selected: ["center-shelf-adj-3", "nope"], display: "in", modelError: null }, new Date(0));
  expect(st).toMatchObject({ version: 1, project: "closet-built-in", title: "Closet Built-In", phase: "p2", viewTitle: "Front elevation", issues: { errors: 0, warnings: 0 } });
  expect(st.selected).toHaveLength(1);
  expect(st.selected[0]).toMatchObject({ id: "center-shelf-adj-3", size: "22⁷⁄₁₆ × 22½ × 23/32", material: "ply-pre" });
  expect(st.selected[0].box?.y[0]).toBe(59.625);
  expect(st.selected[0].src).toMatch(/^projects\/closet-built-in\/project\.ts:\d+$/);
  const mm = viewerState(r, { phase: "p1", step: null, drawingView: "front", selected: ["partition-left"], display: "mm", modelError: "x" });
  expect(mm.selected[0].size).toBe("2133.5 × 590.5 × 18.5");
  expect(mm.modelError).toBe("x");
});

test("URL state: options, phase, step, view and tab", () => {
  expect(readUrl("?project=closet-built-in&opt.top=0.75&phase=p1&step=p1-stand&view=plan&tab=sheets")).toEqual({
    project: "closet-built-in", config: { top: "0.75" }, phase: "p1", step: "p1-stand", view: "plan", tab: "sheets",
  });
  expect(readUrl("")).toEqual({ config: {} });
});
