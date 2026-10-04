// Loads and evaluates the current project (section 9.9 of the spec). This module accepts its
// own hot updates: an edit to any projects/*/project.ts, a helper it imports or a notes.md
// re-runs this module, which re-evaluates and pushes the result into the long-lived store.
// No page reload, so the camera, selection and layout stay as they were.
import { useWb } from "./store.ts";
import { evaluate, EvaluationError, normalizeConfig, defaultConfig } from "../core/evaluate.ts";
import { srcFromStack } from "../core/model/builder.ts";
import type { AnyProject, Config, Resolved } from "../core/model/types.ts";
import { createRemapper, remapResolved } from "./srcmap.ts";

const modules = import.meta.glob<{ default: AnyProject }>("../projects/*/project.ts");
const notes = import.meta.glob<string>("../projects/*/notes.md", { query: "?raw", import: "default" });
const idOf = (key: string) => key.split("/")[2];
export const projectIds = Object.keys(modules).map(idOf).sort();

/** The configuration to use: the requested choices where valid, the defaults elsewhere. */
function usableConfig(project: AnyProject, want: Config): Config {
  const out: Config = { ...defaultConfig(project) };
  for (const [k, v] of Object.entries(want)) {
    const o = (project.options as Record<string, { choices: Record<string, string> }>)[k];
    if (o && v in o.choices) out[k] = v;
  }
  return normalizeConfig(project, out);
}

let seq = 0;

async function load(): Promise<void> {
  const my = ++seq;
  const s = useWb.getState();
  const id = projectIds.includes(s.projectId) ? s.projectId : projectIds[0];
  if (!id) {
    useWb.setState({ projects: projectIds, error: { message: "No projects found in projects/*/project.ts" } });
    return;
  }
  const remap = createRemapper();
  try {
    const mod = await modules[`../projects/${id}/project.ts`]();
    const project = mod.default;
    if (!project || typeof project.build !== "function") throw new Error(`projects/${id}/project.ts does not default-export a project (export default defineProject({...}))`);
    const noteText = notes[`../projects/${id}/notes.md`] ? await notes[`../projects/${id}/notes.md`]() : "";
    const config = usableConfig(project, s.projectId === id ? s.config : {});
    const t0 = performance.now();
    const r: Resolved = evaluate(project, config);
    const ms = performance.now() - t0;
    await remapResolved(r, remap);
    if (my !== seq) return;
    apply(id, project, r, noteText, ms);
  } catch (e) {
    if (my !== seq) return;
    const err = e instanceof Error ? e : new Error(String(e));
    let src = e instanceof EvaluationError ? e.src : srcFromStack(err.stack);
    if (src && !/^projects\//.test(src.file)) src = e instanceof EvaluationError ? src : null;
    src = await remap(src);
    if (my !== seq) return;
    const prev = useWb.getState();
    useWb.setState({
      projects: projectIds,
      projectId: prev.resolved ? prev.projectId : id,
      error: { message: err.message, ...(src ? { src } : {}) },
    });
    console.warn("[diy-bench] evaluation failed; showing the last good model.", err);
  }
}

function apply(id: string, project: AnyProject, r: Resolved, noteText: string, ms: number): void {
  const s = useWb.getState();
  const phases = r.phases.map((p) => p.id);
  const phase = phases.includes(s.phase) ? s.phase : phases[phases.length - 1] ?? "";
  const stepIds = r.steps.filter((st) => st.phase === phase).map((st) => st.id);
  const step = s.step !== null && stepIds.includes(s.step) ? s.step : null;
  const views = r.views.map((v) => v.id);
  const drawingView = views.includes(s.drawingView) ? s.drawingView : views[0] ?? "";
  const selected = s.selected.filter((x) => r.part(x));
  let compare = s.compare;
  if (compare) {
    try {
      compare = usableConfig(project, compare);
    } catch {
      compare = null;
    }
  }
  useWb.setState({
    projects: projectIds, projectId: id, project,
    resolved: r, lastGood: r, error: null,
    config: r.config, phase, step, drawingView,
    selected: selected.length === s.selected.length ? s.selected : selected,
    notes: noteText, compare,
    loads: s.loads + 1,
  });
  if (import.meta.env.DEV) {
    const w = window.__wb ?? (window.__wb = {});
    w.evalMs = ms;
    w.loads = s.loads + 1;
  }
}

// Re-evaluate when the project or configuration changes. The subscription belongs to this
// module instance; a hot update disposes it and the new instance subscribes again.
const unsubscribe = useWb.subscribe((st, prev) => {
  if (st.projectId !== prev.projectId || st.config !== prev.config) {
    if (st.resolved && st.projectId === st.resolved.project.id && sameConfig(st.config, st.resolved.config)) return;
    void load();
  }
});

function sameConfig(a: Config, b: Config): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

void load();

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => unsubscribe());
}
