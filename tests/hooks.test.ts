// M8 acceptance: the two Claude Code hooks, run as Claude Code runs them (a node process with
// the hook input on stdin). The selection hook reads a fixture state.json; the check hook runs
// in a temporary copy of the repo, so the real closet and .diy-bench/ are never touched.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NODE = [process.execPath, "--experimental-strip-types", "--disable-warning=ExperimentalWarning"];

type Run = { code: number; stdout: string; stderr: string; ms: number };

function run(script: string, input: unknown, env: Record<string, string | undefined> = {}, cwd = ROOT): Run {
  const t0 = performance.now();
  const e: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...process.env, ...env })) if (v !== undefined) e[k] = v;
  const r = spawnSync(NODE[0], [...NODE.slice(1), script], { input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8", cwd, env: e });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr, ms: performance.now() - t0 };
}

// ---------- selection hook ----------

describe("selection hook (UserPromptSubmit)", () => {
  const HOOK = join(ROOT, ".claude", "hooks", "selection-context.ts");
  let dir: string;
  const writeState = (s: unknown) => {
    mkdirSync(join(dir, ".diy-bench"), { recursive: true });
    writeFileSync(join(dir, ".diy-bench", "state.json"), typeof s === "string" ? s : JSON.stringify(s));
  };
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const face2 = {
    id: "drawer-face-2", name: "Drawer face", where: "drawer 2", kind: "panel", material: "ply-raw", size: "6⅞ × 23⁵⁄₁₆ × 23/32",
    box: { x: [28.3749, 51.6885], y: [36, 42.875], z: [23.25, 23.97] }, src: "projects/closet-built-in/project.ts:193",
  };
  const state = (over: Record<string, unknown> = {}) => ({
    version: 1, updatedAt: ago(40_000), project: "closet-built-in", title: "Closet Built-In", units: "in", config: { top: "1" },
    phase: "p2", step: null, drawingView: "front", viewTitle: "Front elevation", selected: [face2],
    issues: { errors: 0, warnings: 0 }, modelError: null, ...over,
  });
  // The hook takes its root from CLAUDE_PROJECT_DIR first, as under Claude Code.
  const hook = (input: unknown = {}) => run(HOOK, input, { CLAUDE_PROJECT_DIR: dir });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "wb-sel-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("a fresh state prints the two-line format of section 10.2", () => {
    writeState(state());
    const r = hook({ hook_event_name: "UserPromptSubmit", prompt: "make this 2 inches shorter", cwd: dir });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      "[diy-bench] closet-built-in · top=1 · phase p2 · view: front elevation (state 40 s old)\n" +
      "[diy-bench] selected: drawer-face-2 \"Drawer face\" (drawer 2) · 6⅞ × 23⁵⁄₁₆ × 23/32 ply-raw · x ≈28⅜–≈51¹¹⁄₁₆ y 36–42⅞ z 23¼–≈24 · projects/closet-built-in/project.ts:193\n",
    );
  });

  test("the cwd in the hook input is used when CLAUDE_PROJECT_DIR is not set", () => {
    writeState(state());
    const r = run(HOOK, { cwd: dir }, { CLAUDE_PROJECT_DIR: undefined });
    expect(r.stdout).toContain("selected: drawer-face-2");
  });

  test("nothing selected says so; a step, an error count and a failing file are on the lines", () => {
    writeState(state({ selected: [], step: "p2-faces", issues: { errors: 2, warnings: 0 }, modelError: "boom\nat line 3" }));
    const lines = hook().stdout.trim().split("\n");
    expect(lines[0]).toBe("[diy-bench] closet-built-in · top=1 · phase p2, step p2-faces · view: front elevation · 2 errors in the model (state 40 s old)");
    expect(lines[1]).toBe("[diy-bench] the file fails to evaluate, so the viewer shows the last good model: boom at line 3");
    expect(lines[2]).toBe("[diy-bench] selected: nothing");
  });

  test("more than 5 selected parts are summarised on one line; hover follows the selection", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((x) => ({ ...face2, id: `drawer-1-side-${x}` }));
    writeState(state({ selected: many, hovered: [{ ...face2, id: "pulls" }] }));
    const lines = hook().stdout.trim().split("\n");
    expect(lines[1]).toBe("[diy-bench] selected: 6 parts (drawer-1-side-a, drawer-1-side-b, drawer-1-side-c, drawer-1-side-d, drawer-1-side-e, drawer-1-side-f)");
    expect(lines[2]).toMatch(/^\[diy-bench\] hovered: pulls "Drawer face"/);
    expect(lines.length).toBeLessThanOrEqual(8);
  });

  test("a state 3 h old prints the stale line", () => {
    writeState(state({ updatedAt: ago(3 * 3600_000 + 60_000) }));
    expect(hook().stdout).toBe("[diy-bench] viewer state is 3 h old; confirm which part the user means\n");
  });

  test("a state 25 h old, a missing file, a corrupt file or another version prints nothing and exits 0", () => {
    writeState(state({ updatedAt: ago(25 * 3600_000) }));
    expect(hook()).toMatchObject({ code: 0, stdout: "", stderr: "" });
    writeState("{ not json");
    expect(hook()).toMatchObject({ code: 0, stdout: "", stderr: "" });
    writeState(state({ version: 2 }));
    expect(hook()).toMatchObject({ code: 0, stdout: "", stderr: "" });
    writeState({ version: 1, updatedAt: ago(1000), project: "x", selected: "nonsense", config: 5 });
    expect(hook().code).toBe(0);
    rmSync(join(dir, ".diy-bench"), { recursive: true, force: true });
    expect(hook()).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(run(HOOK, "not json at all", { CLAUDE_PROJECT_DIR: dir })).toMatchObject({ code: 0, stdout: "" });
  });

  test("viewer errors: one or two lines, each error once per session, render pages and reloaded pages left out", () => {
    writeState(state({ selected: [] }));
    const page = (id: string, render: string | null = null) => ({ id, loadedAt: ago(600_000), url: "http://127.0.0.1:5180/", render });
    const rec = (message: string, at: number, over: Record<string, unknown> = {}) =>
      ({ kind: "error", message, project: "closet-built-in", page: page("p1"), firstAt: ago(at), lastAt: ago(at), count: 1, ...over });
    writeFileSync(join(dir, ".diy-bench", "errors.json"), JSON.stringify({ version: 1, updatedAt: ago(0), errors: [
      rec("TypeError: x is undefined", 30_000, { kind: "react", count: 3, source: "app/panels/Viewport3D.tsx:120" }),
      rec("render page only", 20_000, { page: page("r1", "front") }),
      rec("before the reload", 40_000, { stale: true }),
      rec("long ago", 3600_000),
    ] }));
    const session = { session_id: "s-1", cwd: dir };
    const first = hook(session).stdout.trim().split("\n");
    expect(first).toEqual([
      "[diy-bench] closet-built-in · top=1 · phase p2 · view: front elevation (state 40 s old)",
      "[diy-bench] selected: nothing",
      "[diy-bench] viewer error: 30 s ago, 3 times, render crash: TypeError: x is undefined · app/panels/Viewport3D.tsx:120",
    ]);
    // The same session's next prompt has heard of it; another session has not.
    expect(hook(session).stdout).not.toContain("viewer error");
    expect(hook({ session_id: "s-2", cwd: dir }).stdout).toContain("[diy-bench] viewer error: 30 s ago");
    // Errors are printed even when no viewer state was ever written (the page never loaded).
    rmSync(join(dir, ".diy-bench", "state.json"));
    expect(hook({ cwd: dir }).stdout).toBe("[diy-bench] viewer error: 30 s ago, 3 times, render crash: TypeError: x is undefined · app/panels/Viewport3D.tsx:120\n");
    writeFileSync(join(dir, ".diy-bench", "errors.json"), "{ not json");
    expect(hook({ cwd: dir })).toMatchObject({ code: 0, stdout: "", stderr: "" });
    rmSync(join(dir, ".diy-bench", "errors.json"));
  });

  test("it runs in under 300 ms", () => {
    writeState(state());
    hook(); // warm the file cache
    const times = [hook(), hook(), hook()].map((r) => r.ms).sort((a, b) => a - b);
    expect(times[1]).toBeLessThan(300);
  });
});

// ---------- check hook ----------

describe("check hook (PostToolUse on Edit|Write)", () => {
  let repo: string;
  let project: string;
  let original: string;
  const hook = (file: string, tool = "Edit") =>
    run(join(repo, ".claude", "hooks", "check-after-edit.ts"), { hook_event_name: "PostToolUse", tool_name: tool, tool_input: { file_path: file }, cwd: repo });
  const context = (r: Run) => (JSON.parse(r.stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }).hookSpecificOutput;
  const edit = (from: string, to: string) => {
    const text = readFileSync(project, "utf8");
    expect(text.split(from).length, `exactly one ${from}`).toBe(2);
    writeFileSync(project, text.replace(from, to));
  };

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "wb-check-"));
    for (const d of ["core", "tools", "projects", ".claude/hooks"]) cpSync(join(ROOT, d), join(repo, d), { recursive: true, filter: (src) => !src.includes(`${"/"}expected`) });
    cpSync(join(ROOT, "package.json"), join(repo, "package.json"));
    cpSync(join(ROOT, "wb"), join(repo, "wb"));
    project = join(repo, "projects", "closet-built-in", "project.ts");
    original = readFileSync(project, "utf8");
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  test("on the valid closet it exits 0 with additionalContext starting [diy-bench] closet-built-in ok", () => {
    const r = hook(project);
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);
    const out = context(r);
    expect(out.hookEventName).toBe("PostToolUse");
    expect(out.additionalContext).toMatch(/^\[diy-bench\] closet-built-in ok in 2 configurations · no issues\n/);
    expect(hook(project).stdout).toContain("no change in parts, cut list or sheets");
  });

  test("after partitionHeight 84 → 82 the summary names partition-left and 84 → 82", () => {
    writeFileSync(project, original);
    expect(hook(project).code).toBe(0); // the baseline
    // The upper left rod comes down with the shelf above it, or the nosing would hit it.
    edit("partitionHeight: 84,", "partitionHeight: 82,");
    edit("leftUpper: 81.5,", "leftUpper: 79.5,");
    const r = hook(project, "Write");
    expect(r.code).toBe(0);
    const text = context(r).additionalContext;
    const lines = text.split("\n");
    expect(lines.length).toBeLessThanOrEqual(10);
    expect(lines[1]).toMatch(/^changed vs last good: partition-left, partition-right length 84 → 82; /);
    expect(text).toContain("moved down 2");
    expect(lines[2]).toBe("cut list: 1 row changed (Partition 84 × 23¼ → 82 × 23¼); sheets: unchanged");
    writeFileSync(project, original);
  });

  test("an overlap exits 2 with the overlap and project.ts:line on stderr", () => {
    writeFileSync(project, original);
    edit("const topAt = P.hamper.bay + zones.reduce((a, h) => a + h, 0);", "const topAt = P.hamper.bay + zones.reduce((a, h) => a + h, 0) - 1;");
    const r = hook(project);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("overlap");
    expect(r.stderr).toMatch(/project\.ts:\d+/);
    expect(r.stderr.split("\n").filter(Boolean).length).toBeLessThanOrEqual(15);
    expect(r.stderr).toMatch(/^wb check failed: closet-built-in \(top=1\): ERROR overlap: p2: drawer-face-3 overlaps center-top by .+ — projects\/closet-built-in\/project\.ts:\d+$/m);
    writeFileSync(project, original);
  });

  test("a syntax error and a thrown error exit 2 with the file and line", () => {
    writeFileSync(project, original);
    edit("partitionHeight: 84,", "partitionHeight: 84,,]");
    const line = original.split("\n").findIndex((l) => l.includes("partitionHeight: 84,")) + 1;
    let r = hook(project);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain(`cannot load`);
    expect(r.stderr).toContain(`projects/closet-built-in/project.ts:${line}`);
    writeFileSync(project, original);
    edit("const topT = Number(opt.top);", "const topT = Number(opt.top); if (topT < 1) throw new Error(\"boom from the test\");");
    r = hook(project);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/closet-built-in \(top=0\.75\): ERROR evaluation: boom from the test — projects\/closet-built-in\/project\.ts:\d+/);
    writeFileSync(project, original);
  });

  test("a helper module a project imports is checked as that project", () => {
    writeFileSync(project, original);
    const helper = join(repo, "projects", "closet-built-in", "dims.ts");
    writeFileSync(helper, "export const PH = 84;\n");
    writeFileSync(project, original.replace("partitionHeight: 84,", "partitionHeight: PH,").replace(/^(import .*\n)/m, "$1import { PH } from \"./dims.ts\";\n"));
    expect(hook(project).code).toBe(0);
    let r = hook(helper);
    expect(r.code).toBe(0);
    expect(context(r).additionalContext).toMatch(/^\[diy-bench\] closet-built-in ok/);
    writeFileSync(helper, "export const PH = -5;\n"); // a reversed range
    r = hook(helper);
    expect(r.code).toBe(2);
    rmSync(helper);
    writeFileSync(project, original);
  });

  test("edits outside the projects exit 0 silently and fast", () => {
    for (const f of [
      join(repo, "core", "units.ts"), join(repo, "tools", "wb.ts"), join(repo, "app", "App.tsx"), join(repo, "docs", "research", "spec.md"),
      join(repo, "AGENTS.md"), join(repo, "projects", "closet-built-in", "notes.md"), join(repo, "projects", "closet-built-in", "unused.ts"),
      "/etc/hosts", "relative/nowhere.ts",
    ]) {
      const r = hook(f);
      expect(r, f).toMatchObject({ code: 0, stdout: "", stderr: "" });
      expect(r.ms, f).toBeLessThan(1000);
    }
    expect(run(join(repo, ".claude", "hooks", "check-after-edit.ts"), "garbage")).toMatchObject({ code: 0, stdout: "" });
    expect(run(join(repo, ".claude", "hooks", "check-after-edit.ts"), { tool_input: {} })).toMatchObject({ code: 0, stdout: "" });
  });

  test("a full run on the closet takes under 3 s", () => {
    writeFileSync(project, original);
    hook(project);
    const r = hook(project);
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(3000);
  });

  test("wb check --changed <file> --hook behaves the same", () => {
    writeFileSync(project, original);
    const wb = (args: string[]) => {
      const r = spawnSync(join(repo, "wb"), args, { encoding: "utf8", cwd: repo });
      return { code: r.status, stdout: r.stdout, stderr: r.stderr };
    };
    expect(wb(["check", "--changed", project, "--hook"]).stdout).toMatch(/"additionalContext":"\[diy-bench\] closet-built-in ok/);
    expect(wb(["check", "--changed", join(repo, "core", "units.ts"), "--hook"])).toMatchObject({ code: 0, stdout: "" });
    expect(wb(["check", "--changed", project]).stdout).toContain("closet-built-in top=1: ok, no issues");
    edit("const topAt = P.hamper.bay + zones.reduce((a, h) => a + h, 0);", "const topAt = P.hamper.bay + zones.reduce((a, h) => a + h, 0) - 1;");
    expect(wb(["check", "--changed", project, "--hook"]).code).toBe(2);
    writeFileSync(project, original);
  });
});

// ---------- the hooks in a real Claude Code session ----------

describe.skipIf(process.env.RUN_CLAUDE_TESTS !== "1")("live: claude -p sees the selection", () => {
  test("the model names the selected part from state.json", () => {
    const repo = mkdtempSync(join(tmpdir(), "wb-live-"));
    try {
      for (const d of ["core", "tools", "projects", ".claude"]) cpSync(join(ROOT, d), join(repo, d), { recursive: true });
      for (const f of ["package.json", "wb", "AGENTS.md", "CLAUDE.md"]) cpSync(join(ROOT, f), join(repo, f));
      mkdirSync(join(repo, ".diy-bench"), { recursive: true });
      writeFileSync(join(repo, ".diy-bench", "state.json"), JSON.stringify({
        version: 1, updatedAt: new Date().toISOString(), project: "closet-built-in", title: "Closet Built-In", units: "in", config: { top: "1" },
        phase: "p2", step: null, drawingView: "front", viewTitle: "Front elevation",
        selected: [{ id: "drawer-face-2", name: "Drawer face", where: "drawer 2", kind: "panel", material: "ply-raw", size: "6⅞ × 23⁵⁄₁₆ × 23/32", src: "projects/closet-built-in/project.ts:193" }],
        issues: { errors: 0, warnings: 0 }, modelError: null,
      }));
      const r = spawnSync("claude", ["-p", "Which part do I have selected in the viewer? Reply with only its id, no tools.", "--model", "haiku"], {
        cwd: repo, encoding: "utf8", timeout: 120_000, env: { ...process.env, CLAUDE_PROJECT_DIR: undefined } as NodeJS.ProcessEnv,
      });
      expect(r.stdout).toContain("drawer-face-2");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 150_000);
});
