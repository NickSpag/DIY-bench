// Questions asked of a Resolved model by the CLI, the agent and the app's Parts panel.
import type { Box, JointKind, ResolvedPart, Resolved } from "./model/types.ts";
import { fmtSrc } from "./model/builder.ts";
import { fmtLength, fmtThickness } from "./units.ts";

export type PartSummary = {
  id: string; name: string; where?: string; kind: ResolvedPart["kind"];
  material?: string; // material key, for panels and boards
  item?: string; // hardware catalogue key
  role?: string; // context role
  size?: { l: number; w: number; t: number };
  box?: Box; // placement at the phase asked for, else the part's own box
  phase?: string; step?: string; cutPhase: string; removedIn?: string;
  src: string; // "file:line:col", or "" when unknown
};

export function partSummary(p: ResolvedPart, box?: Box): PartSummary {
  const s: PartSummary = { id: p.id, name: p.name, kind: p.kind, cutPhase: p.cutPhase, src: fmtSrc(p.src) };
  if (p.where !== undefined) s.where = p.where;
  if (p.kind === "panel" || p.kind === "board") {
    s.material = p.material;
    if (p.sizes) s.size = { l: p.sizes.l, w: p.sizes.w, t: p.sizes.t };
  }
  if (p.kind === "hardware") s.item = p.item;
  if (p.kind === "context") s.role = p.role;
  const b = box ?? p.bounds;
  if (b) s.box = b;
  if (p.phase !== undefined) s.phase = p.phase;
  if (p.kind !== "context" && p.step !== undefined) s.step = p.step;
  if (p.removedIn !== undefined) s.removedIn = p.removedIn;
  return s;
}

export type JointView = { part: string; by: JointKind; note?: string };

export type PartDetail = {
  part: PartSummary & Record<string, unknown>;
  joints: { to: JointView[]; from: JointView[] }; // to: joints this part declares; from: joints other parts declare to it
  step: { id: string; phase: string; title: string } | null;
  stepsListing: string[]; // steps whose parts list names this part
  phases: { phase: string; box?: Box }[]; // where it is in each phase it is part of
  src: string;
};

/** Everything known about one part. Throws if the id is unknown. */
export function partDetail(r: Resolved, id: string): PartDetail {
  const p = r.part(id);
  if (!p) throw new Error(`no part "${id}"`);
  const { materialDef: _m, bounds: _b, src: _s, ...rest } = p;
  const to: JointView[] = (p.kind === "context" ? [] : p.joins ?? []).map((j) => ({ part: j.to, by: j.by, ...(j.note ? { note: j.note } : {}) }));
  const from: JointView[] = [];
  for (const q of r.parts) {
    if (q.kind === "context" || q.id === id) continue;
    for (const j of q.joins ?? []) if (j.to === id) from.push({ part: q.id, by: j.by, ...(j.note ? { note: j.note } : {}) });
  }
  const stepId = p.kind === "context" ? undefined : p.step;
  const st = stepId ? r.steps.find((s) => s.id === stepId) : undefined;
  const phases: PartDetail["phases"] = [];
  for (const ph of r.phases) {
    const entry = r.stateAt(ph.id).parts.find((s) => s.part.id === id);
    if (entry) phases.push(entry.box ? { phase: ph.id, box: entry.box } : { phase: ph.id });
  }
  return {
    part: { ...rest, ...partSummary(p) },
    joints: { to, from },
    step: st ? { id: st.id, phase: st.phase, title: st.title } : null,
    stepsListing: r.steps.filter((s) => s.parts.includes(id)).map((s) => s.id),
    phases,
    src: fmtSrc(p.src),
  };
}

/** "84 × 23¼ × 23/32" for a panel or board, using the thickness display rule. */
export function fmtPartSize(r: Resolved, p: ResolvedPart): string {
  if ((p.kind === "panel" || p.kind === "board") && p.sizes && p.materialDef) {
    const u = r.project.units;
    return `${fmtLength(p.sizes.l, { units: u })} × ${fmtLength(p.sizes.w, { units: u })} × ${fmtThickness(p.materialDef, { units: u })}`;
  }
  if (p.bounds) {
    const u = r.project.units;
    const b = p.bounds;
    return (["x", "y", "z"] as const).map((a) => fmtLength(b[a][1] - b[a][0], { units: u })).join(" × ") + " (x × y × z)";
  }
  return "";
}
