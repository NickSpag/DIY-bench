// The DIY-bench command-line tool (section 11.1 of the spec).
// Exit codes: 0 ok; 1 model errors or failed checks of severity error; 2 usage error;
// 3 viewer not running (show, state). `check --hook` exits 2 on errors, as hooks do.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { evaluate, EvaluationError, configKey, configsToCheck, defaultConfig, normalizeConfig, optionEntries } from "../core/evaluate.ts";
import { diff, diffDoc, diffText, type DiffDoc } from "../core/diff.ts";
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
import { RENDER_TARGETS_FIXED, render } from "./render.ts";
import { snapshot } from "./golden.ts";
import { listProjectIds, loadProject, loadProjectFile, pickProjectId, projectDir, ROOT, UsageError } from "./projects.ts";
import { lastGoodFile, writeLastGood } from "./last-good.ts";
import { stateDir } from "./files.ts";
import { affectedProjects } from "./hook-scope.ts";
import { checkForHook } from "./check-hook.ts";
import { findServer, readErrors, readState } from "./server.ts";
import { viewerContextLines } from "../core/viewer-text.ts";
import { errorListLines } from "../core/viewer-errors.ts";
import { CONTROL_TABS, type Control } from "../core/control.ts";
import { KEBAB } from "../core/model/builder.ts";

const USAGE = `usage: wb <command> [flags]

commands:
  list                         the projects
  check [--all-configs]        evaluate and report issues (all projects unless --project)
        [--changed file] [--hook]   only the projects that file belongs to; --hook prints as the edit hook does
  parts [--kind k] [--phase p] the parts, or the parts in the build at a phase
  part <id>                    one part: its joints, step, phases and source line
  cutlist [--format text|csv|json] [--phase p]   the cut list (all phases unless --phase)
  shopping [--phase p]         sheets, boards, hardware and banding to buy
  sheets [--phase p] [--svg dir]   sheet layouts (all phases unless --phase); --svg writes one SVG per phase and material
  diff [--against a]           what changes: a = opt:key=value[,…] (switching options), a git ref, or last-good (default)
  snapshot [--update]          compare (or rewrite) projects/<id>/expected/ (all projects unless --project)
  new <id> --template t [--title "…"]   start a project from a template: blank, shelf, cabinet, closet
  status                       the dev server, what the viewer shows and its recent errors
  state                        what the viewer shows and has selected, and its recent errors (exit 3 if no viewer in 24 h)
  show [--select ids] [--phase p] [--step s] [--opt k=v] [--view id] [--tab t] [--frame]
                               point the user's open viewer at something (exit 3 if none is open)
  render --view target [--phase p] [--step s] [--opt k=v] [--select ids] [--size 1600x1000] [--out f.png]
                               a PNG of one panel; target: a drawing view id, 3d-front, 3d-iso, 3d-top, sheets, cutlist

common flags:
  --project <id>   default: the only project, else the viewer's current project
  --opt key=value  repeatable; default: each option's default
  --phase <id>     default: the last phase (where the command uses one)
  --json           machine-readable output`;

type Flags = {
  project?: string; opt?: string[]; phase?: string; json?: boolean; "all-configs"?: boolean;
  kind?: string; format?: string; svg?: string; update?: boolean; help?: boolean; against?: string;
  changed?: string; hook?: boolean; select?: string; hover?: string; step?: string; view?: string; tab?: string;
  frame?: boolean; size?: string; out?: string; template?: string; title?: string;
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
  if (flags.changed !== undefined) {
    // The projects an edited file belongs to (the edit hook's question); none is not an error.
    const ids = affectedProjects(resolve(flags.changed), ROOT);
    if (flags.hook) {
      if (ids.length === 0) return 0;
      const r = await checkForHook(ids);
      process.stdout.write(r.stdout);
      process.stderr.write(r.stderr);
      return r.code;
    }
    if (ids.length === 0) {
      out(`${flags.changed} is not part of any project; nothing to check`);
      return 0;
    }
    return cmdCheckIds(flags, ids);
  }
  if (flags.hook) throw new UsageError("--hook needs --changed <file>");
  return cmdCheckIds(flags, flags.project !== undefined ? [pickProjectId(flags.project)] : listProjectIds());
}

async function cmdCheckIds(flags: Flags, ids: string[]): Promise<number> {
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
      // The last good model, for `wb diff --against last-good`: the configuration asked for,
      // or the default one when checking them all.
      if (errors === 0 && (!flags["all-configs"] || configKey(config) === configKey(defaultConfig(project)))) {
        try {
          writeLastGood(id, diffDoc(evaluate(project, config)));
        } catch {
          // a failed write only loses the diff baseline
        }
      }
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


/** The project as it was at a git ref, evaluated with today's core/. */
async function projectAtRef(id: string, ref: string): Promise<AnyProject> {
  const dir = mkdtempSync(join(tmpdir(), "wb-diff-"));
  try {
    let tar: Buffer;
    try {
      tar = execFileSync("git", ["archive", "--format=tar", ref, `projects/${id}`], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
    } catch (e) {
      throw new UsageError(`cannot read projects/${id} at "${ref}": ${String((e as { stderr?: Buffer }).stderr ?? e).trim()}`);
    }
    writeFileSync(join(dir, "p.tar"), tar);
    execFileSync("tar", ["-xf", join(dir, "p.tar"), "-C", dir]);
    symlinkSync(join(ROOT, "core"), join(dir, "core"));
    return await loadProjectFile(join(dir, "projects", id, "project.ts"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function cmdDiff(flags: Flags): Promise<number> {
  const id = pickProjectId(flags.project);
  const project = await loadProject(id);
  const config = parseOpts(project, flags.opt);
  const r = evaluate(project, config);
  const here = diffDoc(r);
  const against = flags.against ?? "last-good";
  let d;
  if (against.startsWith("opt:")) {
    // What would change if the options were switched: from the current model to the other one.
    const other: Config = { ...config };
    for (const kv of against.slice(4).split(",").filter(Boolean)) {
      const i = kv.indexOf("=");
      if (i <= 0) throw new UsageError(`--against opt: expects key=value, got "${kv}"`);
      other[kv.slice(0, i)] = kv.slice(i + 1);
    }
    let cfg: Config;
    try {
      cfg = normalizeConfig(project, other);
    } catch (e) {
      throw new UsageError((e as Error).message);
    }
    d = diff(here, diffDoc(evaluate(project, cfg)));
  } else if (against === "last-good") {
    // What changed since the last model that checked clean.
    const file = lastGoodFile(id);
    if (!existsSync(file)) throw new UsageError(`no last good model for ${id} yet; ./wb check records one when the model has no errors`);
    d = diff(JSON.parse(readFileSync(file, "utf8")) as DiffDoc, here);
  } else {
    // What changed since a git ref.
    const old = await projectAtRef(id, against);
    let cfg: Config;
    try {
      cfg = normalizeConfig(old, config);
    } catch {
      cfg = defaultConfig(old);
    }
    d = diff(diffDoc(evaluate(old, cfg)), here);
  }
  out(flags.json ? toJson(d) : diffText(d, r.project.units));
  return 0;
}

// ---------- the viewer: status, state, show, render ----------

const NO_SERVER = "the dev server is not running; start it with `npm run dev` (or the VS Code task \"diy-bench: dev\")";

async function cmdStatus(flags: Flags): Promise<number> {
  const server = await findServer();
  const state = readState();
  const errors = readErrors();
  if (flags.json) {
    out(JSON.stringify({ server: server ? { url: server.url, pid: server.pid, startedAt: server.startedAt } : null, state, errors: errors?.errors ?? [] }, null, 2));
    return 0;
  }
  const lines = [server ? `dev server: ${server.url} (pid ${server.pid}, started ${server.startedAt})` : "dev server: not running (npm run dev)"];
  if (state) lines.push(...viewerContextLines(state, Date.now(), { ignoreAge: true }).map((l) => l.replace(/^\[diy-bench\] /, "viewer: ")));
  else lines.push("viewer: no state in the last 24 h; open the app to see a project");
  lines.push(...errorListLines(errors).map((l) => l.replace(/^\[diy-bench\] /, "")));
  out(lines.join("\n"));
  return 0;
}

// The viewer's errors are printed even without a state: a page that never loaded writes none.
async function cmdState(flags: Flags): Promise<number> {
  const state = readState();
  const errors = readErrors();
  if (flags.json) {
    if (state || errors) out(JSON.stringify(state ? { ...state, errors: errors?.errors ?? [] } : { errors: errors?.errors ?? [] }, null, 2));
  } else {
    const lines = [...(state ? viewerContextLines(state, Date.now(), { ignoreAge: true }) : []), ...errorListLines(errors)];
    if (lines.length) out(lines.join("\n"));
  }
  if (!state) {
    process.stderr.write("wb: the viewer has not written state in the last 24 h; open the app (./wb status)\n");
    return 3;
  }
  return 0;
}

const idList = (s: string | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Fails with the ids that are not parts of the model. */
function checkIds(r: Resolved, ids: string[], flag: string): void {
  const bad = ids.filter((id) => !r.part(id));
  if (bad.length) throw new UsageError(`${flag}: no part ${bad.join(", ")} in ${r.project.id} (./wb parts lists them)`);
}

async function cmdShow(flags: Flags): Promise<number> {
  const state = readState();
  const id = flags.project !== undefined ? pickProjectId(flags.project) : state && listProjectIds().includes(state.project) ? state.project : pickProjectId(undefined);
  const project = await loadProject(id);
  const config = flags.opt ? parseOpts(project, flags.opt) : state?.project === id ? normalizeConfig(project, state.config) : defaultConfig(project);
  const r = evaluate(project, config);
  const c: Control = { id: randomBytes(8).toString("hex") };
  if (flags.project !== undefined || state?.project !== id) c.project = id;
  if (flags.opt) c.config = config;
  if (flags.step !== undefined) {
    const st = r.steps.find((x) => x.id === flags.step);
    if (!st) throw new UsageError(`no step "${flags.step}"; steps are: ${r.steps.map((x) => x.id).join(", ")}`);
    if (flags.phase !== undefined && flags.phase !== st.phase) throw new UsageError(`step ${st.id} is in phase ${st.phase}, not ${flags.phase}`);
    c.phase = st.phase;
    c.step = st.id;
  } else if (flags.phase !== undefined) {
    c.phase = pickPhase(r, flags.phase);
    c.step = null;
  }
  if (flags.view !== undefined) {
    if (!r.views.some((v) => v.id === flags.view)) throw new UsageError(`no view "${flags.view}"; views are: ${r.views.map((v) => v.id).join(", ")}`);
    c.view = flags.view;
  }
  if (flags.tab !== undefined) {
    if (!(CONTROL_TABS as readonly string[]).includes(flags.tab)) throw new UsageError(`--tab must be one of ${CONTROL_TABS.join(", ")}`);
    c.tab = flags.tab;
  }
  if (flags.select !== undefined) {
    c.select = idList(flags.select);
    checkIds(r, c.select, "--select");
  }
  if (flags.hover !== undefined) {
    c.hover = idList(flags.hover);
    checkIds(r, c.hover, "--hover");
  }
  if (flags.frame) c.frame = true;
  if (Object.keys(c).filter((k) => k !== "id" && (k !== "project" || flags.project !== undefined)).length === 0) {
    throw new UsageError("wb show needs something to show: --select, --phase, --step, --opt, --view, --tab, --frame or --project");
  }

  const server = await findServer();
  if (!server) {
    if (flags.json) out(JSON.stringify({ delivered: false }));
    process.stderr.write(`wb: ${NO_SERVER}\n`);
    return 3;
  }
  let reply: { delivered: boolean; ok?: boolean; message?: string };
  try {
    const res = await fetch(`${server.url}/__wb/control`, {
      method: "POST", headers: { "content-type": "application/json", "x-wb-token": server.token }, body: JSON.stringify(c),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`the dev server answered ${res.status}: ${await res.text()}`);
    reply = (await res.json()) as typeof reply;
  } catch (e) {
    if (flags.json) out(JSON.stringify({ delivered: false }));
    process.stderr.write(`wb: could not reach the dev server at ${server.url}: ${(e as Error).message}\n`);
    return 3;
  }
  if (reply.message) process.stderr.write(`wb: the viewer says: ${reply.message}\n`);
  if (flags.json) out(JSON.stringify({ delivered: reply.delivered }));
  else out(reply.delivered ? `shown in the viewer at ${server.url}` : `no viewer is open at ${server.url}; open it to see this`);
  return reply.delivered ? 0 : 3;
}

async function cmdRender(flags: Flags): Promise<number> {
  const target = flags.view;
  if (!target) throw new UsageError(`wb render needs --view: a drawing view id, ${RENDER_TARGETS_FIXED.join(", ")}`);
  const { project, resolved: r } = await loadAndEvaluate(flags);
  if (!(RENDER_TARGETS_FIXED as readonly string[]).includes(target) && !r.views.some((v) => v.id === target)) {
    throw new UsageError(`unknown --view "${target}"; use a drawing view (${r.views.map((v) => v.id).join(", ")}) or ${RENDER_TARGETS_FIXED.join(", ")}`);
  }
  let phase: string | undefined;
  let step: string | undefined;
  if (flags.step !== undefined) {
    const st = r.steps.find((x) => x.id === flags.step);
    if (!st) throw new UsageError(`no step "${flags.step}"; steps are: ${r.steps.map((x) => x.id).join(", ")}`);
    phase = st.phase;
    step = st.id;
  } else if (flags.phase !== undefined) phase = pickPhase(r, flags.phase);
  const select = idList(flags.select);
  checkIds(r, select, "--select");
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(flags.size ?? "1600x1000");
  if (!m) throw new UsageError("--size must be WIDTHxHEIGHT, e.g. 1600x1000");
  const file = resolve(flags.out ?? join(stateDir(), "renders", `${project.id}.${target}${phase ? `.${phase}` : ""}.png`));
  const res = await render({ project: project.id, target, config: r.config, phase, step, select, width: Number(m[1]), height: Number(m[2]), out: file });
  out(flags.json ? JSON.stringify(res) : `wrote ${res.file.startsWith(process.cwd() + "/") ? relative(process.cwd(), res.file) : res.file} (${res.width} × ${res.height})`);
  return 0;
}

// ---------- new ----------

const TEMPLATES = ["blank", "shelf", "cabinet", "closet"] as const;

async function cmdNew(flags: Flags, id: string | undefined): Promise<number> {
  if (!id) throw new UsageError(`usage: wb new <id> --template ${TEMPLATES.join("|")} [--title "…"]`);
  if (!KEBAB.test(id)) throw new UsageError(`the id must be kebab-case (lowercase letters, digits and single hyphens): "${id}"`);
  const template = flags.template ?? "blank";
  if (!(TEMPLATES as readonly string[]).includes(template)) throw new UsageError(`--template must be one of ${TEMPLATES.join(", ")}`);
  const dir = projectDir(id);
  if (existsSync(dir)) throw new UsageError(`projects/${id} already exists`);
  const title = flags.title ?? id.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const fill = (text: string) => text.replaceAll("__ID__", id).replaceAll("__TITLE__", title.replace(/["\\]/g, "\\$&"));
  const tdir = join(ROOT, "tools", "templates", template);
  mkdirSync(join(dir, "expected"), { recursive: true });
  writeFileSync(join(dir, "project.ts"), fill(readFileSync(join(tdir, "project.ts.tmpl"), "utf8")));
  writeFileSync(join(dir, "notes.md"), fill(readFileSync(join(tdir, "notes.md.tmpl"), "utf8")));
  await snapshot(id, true);
  if (flags.json) out(JSON.stringify({ project: id, dir: relative(ROOT, dir), files: ["project.ts", "notes.md", "expected/"] }));
  else out(`created ${relative(ROOT, dir)}/ (project.ts, notes.md, expected/) from the ${template} template`);
  return 0;
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
      against: { type: "string" }, changed: { type: "string" }, hook: { type: "boolean" },
      select: { type: "string" }, hover: { type: "string" }, step: { type: "string" }, view: { type: "string" },
      tab: { type: "string" }, frame: { type: "boolean" }, size: { type: "string" }, out: { type: "string" },
      template: { type: "string" }, title: { type: "string" },
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
    case "diff": return cmdDiff(flags);
    case "status": return cmdStatus(flags);
    case "state": return cmdState(flags);
    case "show": return cmdShow(flags);
    case "render": return cmdRender(flags);
    case "new": return cmdNew(flags, args[0]);
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
