// Golden files (spec section 13.2): what every project produces in every configuration,
// written to projects/<id>/expected/ by `wb snapshot --update` and compared by tests/golden.test.ts.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { allConfigs, configKey, evaluate } from "../core/evaluate.ts";
import { toJson } from "../core/json.ts";
import { cutList } from "../core/cutlist.ts";
import { cutListText } from "../core/export/text.ts";
import { fmtSrc } from "../core/model/builder.ts";
import type { AnyProject, Box, Resolved } from "../core/model/types.ts";
import { loadProject, projectDir } from "./projects.ts";

/** The resolved model as a stable document: parts with their box in each phase, steps, checks and issues. */
export function resolvedDoc(r: Resolved): unknown {
  return {
    project: r.project,
    config: r.config,
    phases: r.phases.map((p) => p.id),
    parts: r.parts.map((p) => {
      const boxes: Record<string, Box | null> = {};
      for (const ph of r.phases) {
        const e = r.stateAt(ph.id).parts.find((s) => s.part.id === p.id);
        if (e) boxes[ph.id] = e.box ?? null;
      }
      return {
        id: p.id, kind: p.kind, name: p.name, where: p.where,
        material: p.kind === "panel" || p.kind === "board" ? p.material : undefined,
        item: p.kind === "hardware" ? p.item : undefined,
        role: p.kind === "context" ? p.role : undefined,
        phase: p.phase, step: p.kind === "context" ? undefined : p.step, cutPhase: p.cutPhase, removedIn: p.removedIn,
        size: p.kind === "panel" || p.kind === "board" ? (p.sizes ? [p.sizes.l, p.sizes.w, p.sizes.t] : null) : undefined,
        boxes,
        src: fmtSrc(p.src),
      };
    }),
    steps: r.steps.map((s) => ({ id: s.id, phase: s.phase, parts: s.parts })),
    checks: r.checks.map((c) => ({ id: c.id, pass: c.pass, severity: c.severity })),
    issues: r.issues.map((i) => ({ ...i, src: i.src ? fmtSrc(i.src) : undefined })),
  };
}

/** Every golden file of one project, by file name. */
export function goldenFiles(project: AnyProject): Map<string, string> {
  const files = new Map<string, string>();
  for (const config of allConfigs(project)) {
    const key = configKey(config);
    const r = evaluate(project, config);
    files.set(`resolved.${key}.json`, toJson(resolvedDoc(r)));
    const cl = cutList(r);
    files.set(`cutlist.${key}.json`, toJson(cl));
    files.set(`cutlist.${key}.txt`, cutListText(r, cl));
  }
  return files;
}

export type SnapshotResult = { project: string; changed: string[]; added: string[]; removed: string[]; diffs: Map<string, string> };

/** Compares (or with update, rewrites) a project's expected/ folder. */
export async function snapshot(id: string, update: boolean): Promise<SnapshotResult> {
  const project = await loadProject(id);
  const want = goldenFiles(project);
  const dir = join(projectDir(id), "expected");
  const have = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith(".")) : [];
  const res: SnapshotResult = { project: id, changed: [], added: [], removed: [], diffs: new Map() };
  for (const [name, text] of want) {
    const file = join(dir, name);
    if (!existsSync(file)) res.added.push(name);
    else {
      const old = readFileSync(file, "utf8");
      if (old !== text) {
        res.changed.push(name);
        res.diffs.set(name, unifiedDiff(old, text, `expected/${name}`, 40));
      }
    }
  }
  for (const name of have) if (!want.has(name)) res.removed.push(name);
  if (update) {
    mkdirSync(dir, { recursive: true });
    for (const name of [...res.added, ...res.changed]) writeFileSync(join(dir, name), want.get(name) as string);
    for (const name of res.removed) rmSync(join(dir, name));
  }
  return res;
}

/** A unified diff of two texts, cut to `maxLines` lines of output. */
export function unifiedDiff(a: string, b: string, name: string, maxLines = 40): string {
  const x = a.split("\n"), y = b.split("\n");
  // Trim the common head and tail, then run an LCS on the middle.
  let head = 0;
  while (head < x.length && head < y.length && x[head] === y[head]) head++;
  let tail = 0;
  while (tail < x.length - head && tail < y.length - head && x[x.length - 1 - tail] === y[y.length - 1 - tail]) tail++;
  const xs = x.slice(head, x.length - tail), ys = y.slice(head, y.length - tail);
  const n = xs.length, m = ys.length;
  const ops: string[] = [];
  if (n * m > 4_000_000) {
    for (const l of xs) ops.push(`-${l}`);
    for (const l of ys) ops.push(`+${l}`);
  } else {
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = xs[i] === ys[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && xs[i] === ys[j]) { ops.push(` ${xs[i]}`); i++; j++; }
      else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { ops.push(`+${ys[j]}`); j++; }
      else { ops.push(`-${xs[i]}`); i++; }
    }
  }
  const ctx = x.slice(Math.max(0, head - 3), head).map((l) => ` ${l}`);
  const lines = [`--- ${name}`, `+++ ${name} (new)`, `@@ -${head + 1 - ctx.length} +${head + 1 - ctx.length} @@`, ...ctx, ...ops];
  return (lines.length > maxLines ? [...lines.slice(0, maxLines), `… ${lines.length - maxLines} more lines`] : lines).join("\n");
}
