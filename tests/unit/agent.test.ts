// M8: the pieces behind the hooks and the agent commands: the viewer state as text, the diff
// summary, the Control check, which projects an edit affects, and the `wb new` templates.
import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import closet from "../../projects/closet-built-in/project.ts";
import { evaluate } from "../../core/evaluate.ts";
import { diff, diffDoc, diffSummary } from "../../core/diff.ts";
import { viewerState } from "../../core/viewer.ts";
import { fmtAge, viewerContextLines } from "../../core/viewer-text.ts";
import { controlProblem } from "../../core/control.ts";
import { affectedProjects } from "../../tools/hook-scope.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("viewer state as text: the app's state for a selected drawer face", () => {
  const r = evaluate(closet, { top: "1" });
  const now = new Date("2026-10-04T12:00:00Z");
  const st = viewerState(r, { phase: "p2", step: null, drawingView: "front", selected: ["drawer-face-2"], display: "in", modelError: null }, now);
  expect(st.units).toBe("in");
  const lines = viewerContextLines(st, now.getTime() + 12 * 60_000);
  expect(lines[0]).toBe("[diy-bench] closet-built-in · top=1 · phase p2 · view: front elevation (state 12 min old)");
  expect(lines[1]).toMatch(/^\[diy-bench\] selected: drawer-face-2 "Drawer face" \(drawer 2\) · 6⅞ × 23⁵⁄₁₆ × 23\/32 ply-raw · x \S+–\S+ y 36–42⅞ z 23¼–\S+ · projects\/closet-built-in\/project\.ts:\d+$/);
  expect(viewerContextLines(st, now.getTime() + 30 * 3600_000)).toEqual([]);
  expect(viewerContextLines(st, now.getTime() + 30 * 3600_000, { ignoreAge: true })[0]).toContain("(state 30 h old)");
  expect([fmtAge(0), fmtAge(59_999), fmtAge(60_000), fmtAge(7_200_000)]).toEqual(["0 s", "59 s", "1 min", "2 h"]);
  expect(viewerContextLines(null)).toEqual([]);
  expect(viewerContextLines({ version: 1, project: "x", updatedAt: "yesterday-ish" })).toEqual([]);
});

test("diff summary: the ¾″ top against the 1″ top", () => {
  const a = diffDoc(evaluate(closet, { top: "1" }));
  const b = diffDoc(evaluate(closet, { top: "0.75" }));
  const s = diffSummary(diff(a, b), b);
  expect(s.same).toBe(false);
  expect(s.parts).toMatch(/^changed vs last good: /);
  expect(s.parts).toBe("changed vs last good: center-shelf-adj-3 p2: moved down ⅛; center-top material hw-1in → hw-34, thickness 1 → ¾");
  expect(s.sheets).toBe("sheets: unchanged");
  const same = diffSummary(diff(a, a), a);
  expect(same).toEqual({ same: true, parts: "parts: unchanged", cutlist: "cut list: unchanged", sheets: "sheets: unchanged" });
});

test("controlProblem accepts a well-formed Control and names what is wrong with others", () => {
  expect(controlProblem({ id: "a", select: ["x"], phase: "p1", step: null, config: { top: "1" }, tab: "sheets", frame: true })).toBeNull();
  expect(controlProblem(null)).toBe("expected a JSON object");
  expect(controlProblem({ select: ["x"] })).toBe("id must be a non-empty string");
  expect(controlProblem({ id: "a", select: "x" })).toBe("select must be an array of part ids");
  expect(controlProblem({ id: "a", tab: "garage" })).toMatch(/^tab must be one of/);
  expect(controlProblem({ id: "a", config: { top: 1 } })).toBe("config must map option keys to choices");
  expect(controlProblem({ id: "a", nope: 1 })).toBe("unknown field nope");
});

test("affectedProjects: a project file and its helpers, never the tool's own files", () => {
  const p = join(ROOT, "projects", "closet-built-in", "project.ts");
  expect(affectedProjects(p, ROOT)).toEqual(["closet-built-in"]);
  expect(affectedProjects("projects/closet-built-in/project.ts", ROOT)).toEqual(["closet-built-in"]);
  for (const f of ["core/units.ts", "core/model/index.ts", "app/App.tsx", "tools/wb.ts", "projects/closet-built-in/notes.md", "README.md", "/etc/hosts"]) {
    expect(affectedProjects(f, ROOT), f).toEqual([]);
  }
});

test("wb new: every template evaluates with no issues, and its golden files are written", () => {
  const repo = mkdtempSync(join(tmpdir(), "wb-new-"));
  try {
    for (const d of ["core", "tools"]) cpSync(join(ROOT, d), join(repo, d), { recursive: true });
    for (const f of ["package.json", "wb"]) cpSync(join(ROOT, f), join(repo, f));
    const wb = (args: string[]) => spawnSync(join(repo, "wb"), args, { cwd: repo, encoding: "utf8" });
    for (const t of ["blank", "shelf", "cabinet", "closet"]) {
      const r = wb(["new", `my-${t}`, "--template", t, "--title", `My "${t}"`]);
      expect(r.stderr, t).toBe("");
      expect(r.status, t).toBe(0);
      expect(readFileSync(join(repo, "projects", `my-${t}`, "project.ts"), "utf8")).toContain(`title: "My \\"${t}\\""`);
      expect(readFileSync(join(repo, "projects", `my-${t}`, "notes.md"), "utf8")).toContain("## Assumptions");
    }
    const check = wb(["check", "--all-configs", "--json"]);
    expect(check.status).toBe(0);
    const res = JSON.parse(check.stdout) as { results: { project: string; issues: unknown[] }[] };
    expect(res.results.map((x) => [x.project, x.issues.length])).toEqual([["my-blank", 0], ["my-cabinet", 0], ["my-closet", 0], ["my-shelf", 0]]);
    expect(wb(["snapshot"]).status).toBe(0);
    expect(wb(["new", "my-shelf", "--template", "shelf"]).status).toBe(2); // exists
    expect(wb(["new", "Bad_Id"]).status).toBe(2);
    expect(wb(["new", "x", "--template", "boat"]).status).toBe(2);
    writeFileSync(join(repo, "projects", "my-blank", "project.ts"), "syntax error here");
    expect(wb(["check", "--project", "my-blank"]).status).toBe(1);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}, 30_000);
