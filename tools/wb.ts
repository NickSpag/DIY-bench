// The DIY-bench command-line tool (section 11.1 of the spec).
// Exit codes: 0 ok; 1 model errors or failed checks of severity error; 2 usage error.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { evaluate, EvaluationError, configKey, configsToCheck, normalizeConfig, optionEntries } from "../core/evaluate.ts";
import { fmtSrc } from "../core/model/builder.ts";
import type { AnyProject, Config, Issue, Resolved } from "../core/model/types.ts";
import { toJson } from "../core/json.ts";
import { fmtPartSize, partDetail, partSummary } from "../core/query.ts";
import { fmtLength } from "../core/units.ts";
import { cutList, rowOf } from "../core/cutlist.ts";
import { shoppingList } from "../core/shopping.ts";
import { nest, placementOf, type Nesting } from "../core/nesting.ts";
import { sheetSvg, sheetTitle, stockLabel } from "../core/sheet-svg.ts";
import { cutListCsv } from "../core/export/csv.ts";
import { cutListText, fmtRowSize, shoppingText } from "../core/export/text.ts";
import { snapshot } from "./golden.ts";
import { listProjectIds, loadProject, pickProjectId, UsageError } from "./projects.ts";

const USAGE = `usage: wb <command> [flags]

commands:
  list                         the projects
  check [--all-configs]        evaluate and report issues (all projects unless --project)
  parts [--kind k] [--phase p] the parts, or the parts in the build at a phase
  part <id>                    one part: its joints, step, phases and source line
  cutlist [--format text|csv|json] [--phase p]   the cut list (all phases unless --phase)
  shopping [--phase p]         sheets, boards, hardware and banding to buy
  sheets [--phase p] [--svg dir]   sheet layouts (all phases unless --phase); --svg writes one SVG per phase and material
  snapshot [--update]          compare (or rewrite) projects/<id>/expected/ (all projects unless --project)

common flags:
  --project <id>   default: the only project, else the viewer's current project
  --opt key=value  repeatable; default: each option's default
  --phase <id>     default: the last phase (where the command uses one)
  --json           machine-readable output`;

type Flags = {
  project?: string; opt?: string[]; phase?: string; json?: boolean; "all-configs"?: boolean;
  kind?: string; format?: string; svg?: string; update?: boolean; help?: boolean;
};

const out = (s: string) => process.stdout.write(s.endsWith("\n") ? s : s + "\n");

function parseOpts(project: AnyProject, opts: string[] | undefined): Config {
  const c: Config = {};
  for (const kv of opts ?? []) {
    const i = kv.indexOf("=");
    if (i <= 0) throw new UsageError(`--opt expects key=value, got "${kv}"`);
    c[kv.slice(0, i)] = kv.slice(i + 1);
  }
  try {
    return normalizeConfig(project, c);
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
}

function pickPhase(r: Resolved, phase: string | undefined): string {
  if (phase === undefined) return r.phases[r.phases.length - 1]?.id ?? "";
  if (!r.phases.some((p) => p.id === phase)) throw new UsageError(`unknown phase "${phase}"; phases are: ${r.phases.map((p) => p.id).join(", ")}`);
  return phase;
}

async function loadAndEvaluate(flags: Flags): Promise<{ project: AnyProject; resolved: Resolved }> {
  const id = pickProjectId(flags.project);
  const project = await loadProject(id);
  const config = parseOpts(project, flags.opt);
  return { project, resolved: evaluate(project, config) };
}

const fmtIssue = (i: Issue) => `  ${i.severity.toUpperCase()} ${i.code}: ${i.message}${i.src ? `  (${fmtSrc(i.src)})` : ""}`;

// ---------- commands ----------

async function cmdList(flags: Flags): Promise<number> {
  const ids = listProjectIds();
  if (!flags.json) {
    out(ids.length === 0 ? "no projects" : ids.join("\n"));
    return 0;
  }
  const projects = [];
  for (const id of ids) {
    const p = await loadProject(id);
    projects.push({
      id, title: p.title,
      options: Object.fromEntries(optionEntries(p).map(([k, o]) => [k, { label: o.label, choices: o.choices, default: o.default }])),
      phases: p.phases,
    });
  }
  out(toJson({ projects }));
  return 0;
}

async function cmdCheck(flags: Flags): Promise<number> {
  const ids = flags.project !== undefined ? [pickProjectId(flags.project)] : listProjectIds();
  if (ids.length === 0) throw new UsageError("no projects");
  const results: { project: string; config: Config; issues: Issue[] }[] = [];
  const lines: string[] = [];
  let ok = true;
  for (const id of ids) {
    let project: AnyProject;
    try {
      project = await loadProject(id);
    } catch (e) {
      if (e instanceof UsageError) throw e;
      ok = false;
      const issue: Issue = { severity: "error", code: "load", message: (e as Error).message };
      results.push({ project: id, config: {}, issues: [issue] });
      lines.push(`${id}: cannot load`, fmtIssue(issue));
      continue;
    }
    let configs: Config[];
    let reduced = false;
    if (flags["all-configs"]) ({ configs, reduced } = configsToCheck(project));
    else configs = [parseOpts(project, flags.opt)];
    if (reduced) lines.push(`${id}: more than 32 configurations; checking the default and each single-option change`);
    for (const config of configs) {
      let issues: Issue[];
      try {
        issues = evaluate(project, config).issues;
      } catch (e) {
        const src = e instanceof EvaluationError ? e.src : null;
        issues = [{ severity: "error", code: "evaluation", message: (e as Error).message, ...(src ? { src } : {}) }];
      }
      results.push({ project: id, config, issues });
      const errors = issues.filter((i) => i.severity === "error").length;
      const warnings = issues.filter((i) => i.severity === "warning").length;
      if (errors) ok = false;
      lines.push(`${id} ${configKey(config)}: ${issues.length === 0 ? "ok, no issues" : `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`}`);
      for (const i of issues) lines.push(fmtIssue(i));
    }
  }
  out(flags.json ? toJson({ ok, results }) : lines.join("\n"));
  return ok ? 0 : 1;
}

async function cmdParts(flags: Flags): Promise<number> {
  const { resolved: r } = await loadAndEvaluate(flags);
  const kinds = ["panel", "board", "hardware", "context"];
  if (flags.kind !== undefined && !kinds.includes(flags.kind)) throw new UsageError(`--kind must be one of ${kinds.join(", ")}`);
  let entries: { part: Resolved["parts"][number]; box?: Resolved["parts"][number]["bounds"] }[];
  if (flags.phase !== undefined) entries = r.stateAt(pickPhase(r, flags.phase)).parts;
  else entries = r.parts.map((part) => ({ part }));
  entries = entries.filter((e) => flags.kind === undefined || e.part.kind === flags.kind);
  if (flags.json) {
    out(toJson({ parts: entries.map((e) => partSummary(e.part, e.box)) }));
    return 0;
  }
  const rows = entries.map(({ part: p }) => [
    p.id, p.kind, p.name + (p.where ? ` (${p.where})` : ""), fmtPartSize(r, p),
    p.kind === "panel" || p.kind === "board" ? p.material : p.kind === "hardware" ? p.item : p.role,
    p.phase ?? "", p.kind === "context" ? "" : p.step ?? "",
  ]);
  out(table(["id", "kind", "name", "size", "material", "phase", "step"], rows));
  return 0;
}

async function cmdPart(flags: Flags, id: string | undefined): Promise<number> {
  if (!id) throw new UsageError("usage: wb part <id>");
  const { resolved: r } = await loadAndEvaluate(flags);
  if (!r.part(id)) throw new UsageError(`no part "${id}" in ${r.project.id}`);
  const cl = cutList(r);
  const row = rowOf(cl, id);
  const placed = placementOf(nest(r), id);
  const d = { ...partDetail(r, id), cutRow: row ?? null, placement: placed };
  if (flags.json) {
    out(toJson(d));
    return 0;
  }
  const p = r.part(id) as Resolved["parts"][number];
  const u = r.project.units;
  const L = (n: number) => fmtLength(n, { units: u });
  const lines = [
    `${p.id} · ${p.name}${p.where ? ` (${p.where})` : ""} · ${p.kind}`,
    `  size: ${fmtPartSize(r, p)}`,
  ];
  if (p.kind === "panel" || p.kind === "board") {
    lines.push(`  material: ${p.material}${p.materialDef ? ` (${p.materialDef.name})` : ""}${p.grain ? `, grain along ${p.grain}` : ""}`);
  }
  if (p.kind === "hardware") lines.push(`  item: ${p.item} × ${p.qty}`);
  lines.push(`  phase: ${p.phase ?? "all"}${p.cutPhase !== p.phase ? `, cut in ${p.cutPhase}` : ""}${p.removedIn ? `, removed in ${p.removedIn}` : ""}`);
  if (d.step) lines.push(`  step: ${d.step.id} (${d.step.title})`);
  for (const ph of d.phases) {
    if (ph.box) lines.push(`  ${ph.phase}: x ${L(ph.box.x[0])} to ${L(ph.box.x[1])}, y ${L(ph.box.y[0])} to ${L(ph.box.y[1])}, z ${L(ph.box.z[0])} to ${L(ph.box.z[1])}`);
  }
  for (const j of d.joints.to) lines.push(`  joins ${j.part} by ${j.by}${j.note ? ` (${j.note})` : ""}`);
  for (const j of d.joints.from) lines.push(`  joined by ${j.part} (${j.by})${j.note ? ` (${j.note})` : ""}`);
  if (row) lines.push(`  cut list: ${row.qty} × ${row.name}  —  ${fmtRowSize(r, row)}${row.tags.length ? `  [${row.tags.join("; ")}]` : ""} (phase ${row.phase})`);
  if (placed) {
    const pl = placed.placement;
    lines.push(`  sheet: ${placed.phase} ${placed.material}, sheet ${placed.sheet + 1} (${placed.stock}), at ${L(pl.x)}, ${L(pl.y)}${pl.turned ? ", turned" : ""}${pl.strip ? `, in strip ${pl.strip}` : ""}`);
  }
  if (p.kind !== "context" && p.notes) lines.push(`  notes: ${p.notes}`);
  lines.push(`  src: ${d.src}`);
  out(lines.join("\n"));
  return 0;
}

async function cmdCutlist(flags: Flags): Promise<number> {
  const { resolved: r } = await loadAndEvaluate(flags);
  const phase = flags.phase === undefined ? undefined : pickPhase(r, flags.phase);
  const cl = cutList(r, { phase });
  const format = flags.json ? "json" : flags.format ?? "text";
  if (format === "json") out(toJson(cl));
  else if (format === "csv") out(cutListCsv(r, cl));
  else if (format === "text") out(cutListText(r, cl));
  else throw new UsageError(`--format must be text, csv or json`);
  return 0;
}

async function cmdShopping(flags: Flags): Promise<number> {
  const { resolved: r } = await loadAndEvaluate(flags);
  const phase = flags.phase === undefined ? undefined : pickPhase(r, flags.phase);
  const list = shoppingList(r, { phase });
  out(flags.json ? toJson(list) : shoppingText(r, list));
  return 0;
}

export function sheetsText(ns: Nesting[]): string {
  const lines: string[] = [];
  for (const n of ns) {
    const L = (v: number) => fmtLength(v, { units: n.units });
    const buy = Object.entries(n.bought).map(([k, c]) => `${c} × ${stockLabel(k)}`).join(", ");
    const own = Object.entries(n.owned).map(([k, c]) => `${c} × ${k}`).join(", ");
    lines.push(`${n.phase} · ${n.materialName} · kerf ${L(n.kerf)}${buy ? ` · buy ${buy}` : ""}${own ? ` · owned ${own}` : ""}`);
    for (const [i, sh] of n.sheets.entries()) {
      lines.push(`  sheet ${i + 1}: ${sheetTitle(n, sh)}`);
      for (const p of sh.placements) {
        const size = p.turned ? `${L(p.w)} × ${L(p.l)} (turned)` : `${L(p.l)} × ${L(p.w)}`;
        lines.push(`    ${p.strip ? `strip ${p.strip}` : p.ids.join(" ")}: ${p.name}, ${size} at ${L(p.x)}, ${L(p.y)}`);
        for (const m of p.members ?? []) lines.push(`      ${m.id}: ${L(m.l)} at ${L(m.x)}`);
      }
      if (sh.offcuts.length) lines.push(`    offcuts: ${sh.offcuts.map((o) => `${L(o.l)} × ${L(o.w)}`).join(", ")}`);
    }
    for (const u of n.unplaced) lines.push(`  UNPLACED ${u.id}: ${u.reason}`);
    lines.push(`  strategy: ${n.strategy}`, "");
  }
  return lines.join("\n");
}

async function cmdSheets(flags: Flags): Promise<number> {
  const { resolved: r } = await loadAndEvaluate(flags);
  const phase = flags.phase === undefined ? undefined : pickPhase(r, flags.phase);
  const ns = nest(r, { phase });
  const written: string[] = [];
  if (flags.svg !== undefined) {
    const dir = resolve(flags.svg);
    mkdirSync(dir, { recursive: true });
    for (const n of ns) {
      const file = join(dir, `sheets.${configKey(r.config)}.${n.phase}.${n.material}.svg`);
      writeFileSync(file, sheetSvg(n));
      written.push(file);
    }
  }
  if (flags.json) out(toJson(flags.svg !== undefined ? { nestings: ns, files: written } : ns));
  else out(sheetsText(ns) + (written.length ? `\nwrote ${written.length} SVG file${written.length === 1 ? "" : "s"}:\n${written.map((f) => `  ${f}`).join("\n")}` : ""));
  return ns.some((n) => n.unplaced.length) ? 1 : 0;
}

async function cmdSnapshot(flags: Flags): Promise<number> {
  const ids = flags.project !== undefined ? [pickProjectId(flags.project)] : listProjectIds();
  let same = true;
  const lines: string[] = [];
  const results = [];
  for (const id of ids) {
    const res = await snapshot(id, !!flags.update);
    const n = res.added.length + res.changed.length + res.removed.length;
    if (n) same = false;
    results.push({ project: id, added: res.added, changed: res.changed, removed: res.removed });
    if (n === 0) lines.push(`${id}: golden files match`);
    else {
      lines.push(`${id}: ${flags.update ? "updated" : "differs"}: ${res.added.length} added, ${res.changed.length} changed, ${res.removed.length} removed`);
      for (const f of res.added) lines.push(`  + ${f}`);
      for (const f of res.removed) lines.push(`  - ${f}`);
      for (const f of res.changed) lines.push(`  ~ ${f}`, ...(flags.update ? [] : (res.diffs.get(f) ?? "").split("\n").map((l) => `    ${l}`)));
    }
  }
  out(flags.json ? toJson({ ok: same || !!flags.update, results }) : lines.join("\n"));
  return same || flags.update ? 0 : 1;
}

// ---------- text helpers ----------

export function table(head: string[], rows: string[][]): string {
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => [...(r[i] ?? "")].length)));
  const line = (cells: string[]) => cells.map((c, i) => c + " ".repeat(w[i] - [...c].length)).join("  ").trimEnd();
  return [line(head), ...rows.map(line)].join("\n");
}

// ---------- main ----------

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      project: { type: "string" }, opt: { type: "string", multiple: true }, phase: { type: "string" },
      json: { type: "boolean" }, "all-configs": { type: "boolean" }, kind: { type: "string" },
      format: { type: "string" }, svg: { type: "string" }, update: { type: "boolean" }, help: { type: "boolean", short: "h" },
    },
  });
  const flags = values as Flags;
  const [command, ...args] = positionals;
  if (command === undefined || flags.help) {
    out(USAGE);
    return 0;
  }
  switch (command) {
    case "list": return cmdList(flags);
    case "check": return cmdCheck(flags);
    case "parts": return cmdParts(flags);
    case "part": return cmdPart(flags, args[0]);
    case "cutlist": return cmdCutlist(flags);
    case "shopping": return cmdShopping(flags);
    case "sheets": return cmdSheets(flags);
    case "snapshot": return cmdSnapshot(flags);
    default: throw new UsageError(`unknown command "${command}"\n\n${USAGE}`);
  }
}

// Set exitCode rather than calling process.exit, so piped output is flushed in full.
main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    if (e instanceof UsageError || (e instanceof TypeError && "code" in e && String(e.code).startsWith("ERR_PARSE_ARGS"))) {
      process.stderr.write(`wb: ${(e as Error).message}\n`);
      process.exitCode = 2;
    } else if (e instanceof EvaluationError) {
      process.stderr.write(`wb: the project failed to evaluate: ${e.message}${e.src ? `\n  at ${fmtSrc(e.src)}` : ""}\n`);
      process.exitCode = 1;
    } else {
      process.stderr.write(`wb: ${(e as Error)?.stack ?? String(e)}\n`);
      process.exitCode = 1;
    }
  },
);
