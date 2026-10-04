// evaluate(project, config) → Resolved (section 6 of the spec).
// Runs the project's build function, resolves every part's bounds, sizes and material,
// and answers "what is in the build at this phase or step" through stateAt.
import { Builder, srcFromStack } from "./model/builder.ts";
import type {
  AnyProject, Box, Config, Material, OptionDef, Part, PhaseState, Resolved, ResolvedCutPart, ResolvedPart, ResolvedStep, Src,
} from "./model/types.ts";
import { cylinderBounds } from "./geometry.ts";
import { runInvariants } from "./invariants.ts";
import { computeSizes } from "./parts.ts";

export * from "./parts.ts";

/** Thrown when a project's build function throws. Carries the line in the project that threw. */
export class EvaluationError extends Error {
  readonly src: Src;
  constructor(message: string, src: Src, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EvaluationError";
    this.src = src;
  }
}

// ---------- configurations ----------

export const optionEntries = (project: AnyProject): [string, OptionDef][] =>
  Object.entries(project.options as Record<string, OptionDef>);

export function defaultConfig(project: AnyProject): Config {
  const c: Config = {};
  for (const [k, o] of optionEntries(project)) c[k] = o.default;
  return c;
}

/** Fills missing options with their defaults and rejects unknown options or choices. */
export function normalizeConfig(project: AnyProject, config: Config = {}): Config {
  const out: Config = {};
  for (const k of Object.keys(config)) {
    if (!(k in project.options)) throw new Error(`unknown option "${k}"; options are: ${Object.keys(project.options).join(", ") || "none"}`);
  }
  for (const [k, o] of optionEntries(project)) {
    const v = config[k] ?? o.default;
    if (!(v in o.choices)) throw new Error(`option ${k}: unknown choice "${v}"; choices are: ${Object.keys(o.choices).join(", ")}`);
    out[k] = v;
  }
  return out;
}

/** Every combination of option choices, the default configuration first. */
export function allConfigs(project: AnyProject): Config[] {
  let out: Config[] = [{}];
  for (const [k, o] of optionEntries(project)) {
    const choices = [o.default, ...Object.keys(o.choices).filter((c) => c !== o.default)];
    out = out.flatMap((c) => choices.map((v) => ({ ...c, [k]: v })));
  }
  return out;
}

export const MAX_FULL_CONFIGS = 32;

/** The configurations to check: all of them, or past 32 the default plus each single-option deviation. */
export function configsToCheck(project: AnyProject): { configs: Config[]; reduced: boolean } {
  const all = allConfigs(project);
  if (all.length <= MAX_FULL_CONFIGS) return { configs: all, reduced: false };
  const d = defaultConfig(project);
  const configs = [d];
  for (const [k, o] of optionEntries(project)) {
    for (const v of Object.keys(o.choices)) if (v !== o.default) configs.push({ ...d, [k]: v });
  }
  return { configs, reduced: true };
}

/** "top=1", or "default" for a project with no options. Keys in declaration order. */
export function configKey(config: Config): string {
  const entries = Object.entries(config);
  return entries.length === 0 ? "default" : entries.map(([k, v]) => `${k}=${v}`).join(",");
}

// ---------- evaluate ----------

function resolvePart(p: Part, materials: Record<string, Material>, firstPhase: string): ResolvedPart {
  if (p.kind === "panel" || p.kind === "board") {
    const material = materials[p.material];
    const r: ResolvedCutPart = { ...p, bounds: p.box, cutPhase: p.cutIn ?? p.phase };
    if (material) {
      r.materialDef = material;
      r.sizes = computeSizes(p.box, material.thickness, p.grain);
      r.finishApplied = p.finish ?? material.finish;
    }
    return r;
  }
  if (p.kind === "hardware") {
    const bounds = p.box ?? (p.cylinder ? cylinderBounds(p.cylinder) : undefined);
    return bounds ? { ...p, bounds, cutPhase: p.phase } : { ...p, cutPhase: p.phase };
  }
  return { ...p, bounds: p.box, cutPhase: p.phase ?? firstPhase };
}

export function evaluate(project: AnyProject, config: Config = {}): Resolved {
  const cfg = normalizeConfig(project, config);
  const b = new Builder();
  try {
    project.build(b, cfg);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    throw new EvaluationError(err.message, srcFromStack(err.stack), { cause: e });
  }

  const phases = project.phases;
  const firstPhase = phases[0]?.id ?? "";
  const parts = b.parts.map((p) => resolvePart(p, project.materials, firstPhase));
  const byId = new Map(parts.map((p) => [p.id, p]));

  const steps: ResolvedStep[] = b.steps.map((s) => ({
    ...s,
    parts: s.parts ? [...s.parts] : parts.filter((p) => p.kind !== "context" && p.step === s.id).map((p) => p.id),
  }));

  const phaseIdx = new Map(phases.map((p, i) => [p.id, i]));
  const NEVER = Number.POSITIVE_INFINITY;
  const idxOf = (ph: string | undefined, missing: number) => (ph === undefined ? missing : phaseIdx.get(ph) ?? NEVER);

  const placementAt = (p: ResolvedPart, iP: number): Box | undefined => {
    let best: Box | undefined;
    let bestIdx = -1;
    for (const [q, mb] of Object.entries(p.moves ?? {})) {
      const iq = phaseIdx.get(q);
      if (iq !== undefined && iq <= iP && iq > bestIdx) {
        best = mb;
        bestIdx = iq;
      }
    }
    return best ?? p.bounds;
  };

  const memo = new Map<string, PhaseState>();
  const stateAt = (phase: string, step?: string): PhaseState => {
    const key = `${phase}|${step ?? ""}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const iP = phaseIdx.get(phase);
    if (iP === undefined) throw new Error(`unknown phase "${phase}"; phases are: ${phases.map((p) => p.id).join(", ")}`);
    let included: (p: ResolvedPart) => boolean;
    if (step === undefined) {
      included = (p) => idxOf(p.phase, -1) <= iP && idxOf(p.removedIn, NEVER) > iP;
    } else {
      const inPhase = steps.filter((s) => s.phase === phase).map((s) => s.id);
      const k = inPhase.indexOf(step);
      if (k < 0) throw new Error(`unknown step "${step}" in phase "${phase}"; its steps are: ${inPhase.join(", ") || "none"}`);
      included = (p) => {
        const ip = idxOf(p.phase, -1);
        if (idxOf(p.removedIn, NEVER) <= iP) return false;
        if (ip < iP) return true;
        if (ip > iP) return false;
        // Added in this phase: present once its step is reached. A part with no step
        // (or a step outside this phase) is present from the phase's first step.
        const pstep = p.kind === "context" ? undefined : p.step;
        const ks = pstep === undefined ? -1 : inPhase.indexOf(pstep);
        return ks <= k;
      };
    }
    const state: PhaseState = {
      phase,
      ...(step === undefined ? {} : { step }),
      parts: parts.filter(included).map((part) => {
        const bx = placementAt(part, iP);
        return bx ? { part, box: bx } : { part };
      }),
    };
    memo.set(key, state);
    return state;
  };

  const r: Resolved = {
    project: { id: project.id, title: project.title, units: project.units },
    config: cfg,
    phases: phases.map((p) => ({ ...p })),
    materials: project.materials,
    banding: project.banding,
    hardware: project.hardware,
    parts,
    steps,
    checks: b.checks,
    views: b.views,
    issues: [],
    part: (id) => byId.get(id),
    stateAt,
  };
  r.issues = runInvariants(r);
  return r;
}
