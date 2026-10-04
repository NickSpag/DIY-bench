// What the viewer tells the agent (section 10.4 of the spec): the project, configuration,
// phase, step and drawing view on screen, and the selected parts with enough detail that a
// hook can print them without evaluating anything. The app builds it; the dev server writes
// it to .diy-bench/state.json.
import type { Box, Config, Resolved } from "./model/types.ts";
import { fmtPartSize } from "./query.ts";

export type ViewerPartSummary = {
  id: string; name: string; where?: string; kind: string; material?: string;
  size?: string; // "6⅞ × 23⁵⁄₁₆ × 23/32", in display units
  box?: Box; // placement in the phase (and step) on screen
  src?: string; // "projects/closet-built-in/project.ts:193"
};

export type ViewerState = {
  version: 1; updatedAt: string;
  project: string; title: string; units: "in" | "mm"; config: Config; // units: of `box` below
  phase: string; step: string | null; drawingView: string; viewTitle: string;
  hovered?: ViewerPartSummary[]; selected: ViewerPartSummary[];
  issues: { errors: number; warnings: number };
  modelError: string | null; // set when the viewer is showing the last good model
};

/** Summary of one part as it stands at a phase (and step). Unknown ids give null. */
export function viewerPartSummary(
  r: Resolved, id: string, at: { phase: string; step?: string | null; display: "in" | "mm" },
): ViewerPartSummary | null {
  const p = r.part(id);
  if (!p) return null;
  const s: ViewerPartSummary = { id: p.id, name: p.name, kind: p.kind };
  if (p.where !== undefined) s.where = p.where;
  if (p.kind === "panel" || p.kind === "board") s.material = p.material;
  else if (p.kind === "hardware") s.material = p.item;
  const size = fmtPartSize(r, p, at.display);
  if (size) s.size = size;
  let entry: { box?: Box } | undefined;
  try {
    entry = r.stateAt(at.phase, at.step ?? undefined).parts.find((e) => e.part.id === id);
  } catch {
    entry = undefined;
  }
  const box = entry?.box ?? p.bounds;
  if (box) s.box = box;
  if (p.src) s.src = `${p.src.file}:${p.src.line}`;
  return s;
}

export function viewerState(
  r: Resolved,
  ui: { phase: string; step: string | null; drawingView: string; selected: string[]; hovered?: string[]; display: "in" | "mm"; modelError: string | null },
  now: Date = new Date(),
): ViewerState {
  const at = { phase: ui.phase, step: ui.step, display: ui.display };
  const sums = (ids: string[]) => ids.map((id) => viewerPartSummary(r, id, at)).filter((x): x is ViewerPartSummary => x !== null);
  const st: ViewerState = {
    version: 1,
    updatedAt: now.toISOString(),
    project: r.project.id,
    title: r.project.title,
    units: r.project.units,
    config: r.config,
    phase: ui.phase,
    step: ui.step,
    drawingView: ui.drawingView,
    viewTitle: r.views.find((v) => v.id === ui.drawingView)?.title ?? "",
    selected: sums(ui.selected),
    issues: {
      errors: r.issues.filter((i) => i.severity === "error").length,
      warnings: r.issues.filter((i) => i.severity === "warning").length,
    },
    modelError: ui.modelError,
  };
  if (ui.hovered && ui.hovered.length) st.hovered = sums(ui.hovered);
  return st;
}

