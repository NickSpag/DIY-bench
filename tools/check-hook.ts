// The check that runs after every agent edit to a project (section 10.2 of the spec), shared by
// .claude/hooks/check-after-edit.ts and `wb check --changed <file> --hook`.
//
// For each affected project: evaluate every configuration, nest the default one, and compare it
// with the last good model in .diy-bench/last-good/<id>.json.
// - Any error: exit 2 with at most 15 lines on stderr, errors first. Claude Code shows exit-2
//   stderr to the model.
// - Otherwise: exit 0 with {"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":…}}
//   on stdout, a summary of at most 10 lines, and the new last good model written.
import { stripTypeScriptTypes } from "node:module";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { configKey, configsToCheck, defaultConfig, evaluate, EvaluationError } from "../core/evaluate.ts";
import { diff, diffDoc, diffSummary } from "../core/diff.ts";
import { srcFromStack } from "../core/model/builder.ts";
import type { AnyProject, Config, Issue, Src } from "../core/model/types.ts";
import { projectModules } from "./hook-scope.ts";
import { readLastGood, writeLastGood } from "./last-good.ts";
import { loadProject, ROOT } from "./projects.ts";

export type HookResult = { code: 0 | 2; stdout: string; stderr: string };

const MAX_ERROR_LINES = 15;
const MAX_SUMMARY_LINES = 10;
const RANK: Record<string, number> = { error: 0, warning: 1, info: 2 };

const where = (src: Src | undefined) => (src ? `${src.file}:${src.line}` : "");
const firstLine = (s: string) => s.split("\n").map((l) => l.trim()).find(Boolean) ?? s;

/** A load failure (syntax error, top-level throw) as a message, a source line and a code frame. */
function loadFailure(id: string, e: unknown): { message: string; src: Src; frame: string[] } {
  const err = e instanceof Error ? e : new Error(String(e));
  let src: Src = srcFromStack(err.stack);
  const frame: string[] = [];
  if ((err as { code?: string }).code === "ERR_INVALID_TYPESCRIPT_SYNTAX") {
    // Node's message gives the line but not the file: find the module that fails to strip.
    for (const file of projectModules(ROOT, id)) {
      if (!/\.[cm]?ts$/.test(file)) continue;
      try {
        stripTypeScriptTypes(readFileSync(file, "utf8"));
      } catch (e2) {
        const m = /-\[(\d+):(\d+)\]/.exec((e2 as Error).message);
        src = { file: relative(ROOT, file).split("\\").join("/"), line: m ? Number(m[1]) : 1, col: m ? Number(m[2]) : 1 };
        break;
      }
    }
    const lines = err.message.split("\n");
    const at = lines.findIndex((l) => /^\s*\d+ \|/.test(l) && src && new RegExp(`^\\s*${src.line} \\|`).test(l));
    if (at >= 0) frame.push(lines[at].replace(/^\s+/, "  "), ...(lines[at + 1]?.trim().startsWith(":") ? [lines[at + 1].replace(/^\s+/, "  ")] : []));
  }
  return { message: firstLine(err.message).replace(/^x\s+/, ""), src, frame };
}

type Checked = { id: string; project: AnyProject; configs: Config[]; issues: { issue: Issue; configs: string[] }[] };

/** Evaluates every configuration and merges issues that recur across them. */
function checkAll(id: string, project: AnyProject): Checked {
  const { configs } = configsToCheck(project);
  const merged = new Map<string, { issue: Issue; configs: string[] }>();
  for (const config of configs) {
    let issues: Issue[];
    try {
      issues = evaluate(project, config).issues;
    } catch (e) {
      const src = e instanceof EvaluationError ? e.src : srcFromStack((e as Error)?.stack);
      issues = [{ severity: "error", code: "evaluation", message: (e as Error)?.message ?? String(e), ...(src ? { src } : {}) }];
    }
    for (const i of issues) {
      const k = `${i.severity}|${i.code}|${i.message}|${where(i.src)}`;
      const m = merged.get(k);
      if (m) m.configs.push(configKey(config));
      else merged.set(k, { issue: i, configs: [configKey(config)] });
    }
  }
  const issues = [...merged.values()].sort((a, b) => (RANK[a.issue.severity] ?? 3) - (RANK[b.issue.severity] ?? 3));
  return { id, project, configs, issues };
}

function issueLine(c: Checked, m: { issue: Issue; configs: string[] }, prefix: string): string {
  const cfg = c.configs.length > 1 && m.configs.length === c.configs.length ? "every configuration" : m.configs.join(" and ");
  const loc = where(m.issue.src);
  return `${prefix}${c.id} (${cfg}): ${m.issue.severity.toUpperCase()} ${m.issue.code}: ${m.issue.message}${loc ? ` — ${loc}` : ""}`;
}

/** Checks the given projects as the PostToolUse hook does. */
export async function checkForHook(ids: string[]): Promise<HookResult> {
  const failures: string[] = [];
  const summaries: string[] = [];
  for (const id of ids) {
    let project: AnyProject;
    try {
      project = await loadProject(id);
    } catch (e) {
      const f = loadFailure(id, e);
      failures.push(`wb check failed: ${id}: cannot load: ${f.message}${f.src ? ` — ${where(f.src)}` : ""}`, ...f.frame);
      continue;
    }
    const c = checkAll(id, project);
    const errors = c.issues.filter((m) => m.issue.severity === "error");
    const warnings = c.issues.filter((m) => m.issue.severity === "warning");
    if (errors.length) {
      for (const m of c.issues) failures.push(issueLine(c, m, "wb check failed: "));
      continue;
    }
    const n = c.configs.length;
    const head = `[diy-bench] ${id} ok in ${n} configuration${n === 1 ? "" : "s"} · ${warnings.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : "no issues"}`;
    const lines = [head, ...warnings.slice(0, 3).map((m) => issueLine(c, m, "  ")), ...(warnings.length > 3 ? [`  and ${warnings.length - 3} more warnings (./wb check --all-configs)`] : [])];
    // Compare the default configuration with the last good model, then record it as the new one.
    try {
      const doc = diffDoc(evaluate(project, defaultConfig(project)));
      const last = readLastGood(id);
      if (!last) lines.push("no earlier good model to compare with; this one is now the baseline");
      else if (configKey(last.config) !== configKey(doc.config)) lines.push(`the last good model was ${configKey(last.config)}; compare with ./wb diff`);
      else {
        const s = diffSummary(diff(last, doc), doc);
        if (s.same) lines.push("no change in parts, cut list or sheets vs the last good model");
        else lines.push(s.parts, `${s.cutlist}; ${s.sheets}`);
      }
      writeLastGood(id, doc);
    } catch (e) {
      lines.push(`could not compare with the last good model: ${firstLine((e as Error).message)}`);
    }
    summaries.push(...lines);
  }
  if (failures.length) {
    const lines = failures.length > MAX_ERROR_LINES
      ? [...failures.slice(0, MAX_ERROR_LINES - 1), `… and ${failures.length - (MAX_ERROR_LINES - 1)} more lines; run ./wb check --all-configs`]
      : failures;
    return { code: 2, stdout: "", stderr: lines.join("\n") + "\n" };
  }
  const context = summaries.slice(0, MAX_SUMMARY_LINES).join("\n");
  return { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } }) + "\n", stderr: "" };
}
