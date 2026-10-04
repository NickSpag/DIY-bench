// Build steps (section 7.4 of the spec): the project's steps grouped by phase, each with the
// parts it installs or works on. A phase's first step also lists what is taken out and what
// moves at the start of that phase.
import type { Box, Phase, Resolved, Src } from "./model/types.ts";

export type BuildStep = {
  id: string; title: string; text: string; phase: string;
  parts: string[]; // step.parts, or else the parts whose `step` is this step
  src: Src;
  number: number; // 1-based within the phase
  takeOut: string[]; // first step of a phase: parts removed in this phase
  moves: { id: string; from?: Box; to: Box }[]; // first step of a phase: parts that move in this phase
};

export type PhaseSteps = { phase: Phase; steps: BuildStep[] };

export function buildSteps(r: Resolved): PhaseSteps[] {
  return r.phases.map((phase, pi) => {
    const prev = pi > 0 ? r.phases[pi - 1].id : undefined;
    const prevBoxes = new Map<string, Box | undefined>();
    if (prev) for (const e of r.stateAt(prev).parts) prevBoxes.set(e.part.id, e.box);
    const takeOut = r.parts.filter((p) => p.removedIn === phase.id).map((p) => p.id);
    const moves = r.parts
      .filter((p) => p.moves && p.moves[phase.id])
      .map((p) => {
        const to = (p.moves as Record<string, Box>)[phase.id];
        const from = prevBoxes.get(p.id);
        return from ? { id: p.id, from, to } : { id: p.id, to };
      });
    const steps = r.steps
      .filter((s) => s.phase === phase.id)
      .map((s, i): BuildStep => ({
        id: s.id, title: s.title, text: s.text, phase: s.phase, parts: [...s.parts], src: s.src,
        number: i + 1,
        takeOut: i === 0 ? takeOut : [],
        moves: i === 0 ? moves : [],
      }));
    return { phase, steps };
  });
}

/** The step before or after `step` across phases, for a stepper; null at either end. */
export function neighbourStep(groups: PhaseSteps[], phase: string, step: string | null, dir: -1 | 1): { phase: string; step: string } | null {
  const flat = groups.flatMap((g) => g.steps.map((s) => ({ phase: g.phase.id, step: s.id })));
  if (flat.length === 0) return null;
  if (step === null) {
    // From "the whole phase": forward goes to the phase's first step, backward to the previous phase's last step.
    const i = flat.findIndex((f) => f.phase === phase);
    if (dir === 1) return i >= 0 ? flat[i] : null;
    const j = i < 0 ? -1 : i - 1;
    return j >= 0 ? flat[j] : null;
  }
  const k = flat.findIndex((f) => f.step === step);
  const n = k + dir;
  return k < 0 || n < 0 || n >= flat.length ? null : flat[n];
}
