// Spike: evaluate the closet fixture: invariants per phase and option, then a grouped cut list.
import { Builder, OVERLAPPING_JOINTS, type Axis, type Box, type Part, type Project, type SheetMaterial } from "./dsl.ts";
import closet from "./closet.ts";

const EPS = 1e-9;
const AXES: Axis[] = ["x", "y", "z"];
const ext = (b: Box, a: Axis) => b[a][1] - b[a][0];
const FR: Record<number, string> = { 1: "⅛", 2: "¼", 3: "⅜", 4: "½", 5: "⅝", 6: "¾", 7: "⅞" };
export function fmt(n: number): string {
  const s16 = Math.round(n * 16), approx = Math.abs(s16 / 16 - n) > 1e-6 ? "≈" : "";
  const w = Math.floor(s16 / 16), r = s16 % 16;
  const frac = r === 0 ? "" : r % 2 === 0 ? FR[r / 2] : `${toSup(r)}⁄${toSub(16)}`;
  return approx + (w || !frac ? String(w) : "") + frac;
}
const toSup = (n: number) => String(n).replace(/\d/g, d => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+d]);
const toSub = (n: number) => String(n).replace(/\d/g, d => "₀₁₂₃₄₅₆₇₈₉"[+d]);

function cylBox(p: any): Box | undefined {
  if (p.box) return p.box;
  if (!p.cylinder) return undefined;
  const c = p.cylinder, r = c.diameter / 2, other = AXES.filter(a => a !== c.axis);
  const bx: any = { [c.axis]: [c.from, c.to] };
  bx[other[0]] = [c.center[0] - r, c.center[0] + r]; bx[other[1]] = [c.center[1] - r, c.center[1] + r];
  return bx as Box;
}

export function evaluate(project: Project<any>, opt: Record<string, string>) {
  const b = new Builder();
  project.build(b, opt as any);
  const phases = project.phases.map(p => p.id);
  const idx = (ph: string) => { const i = phases.indexOf(ph); if (i < 0) throw new Error(`unknown phase "${ph}"`); return i; };
  const issues: { severity: "error" | "warning"; code: string; message: string; parts?: string[] }[] = [];
  const ids = new Set(b.parts.map(p => p.id));

  // references must resolve
  for (const p of b.parts) for (const j of (p as any).joins ?? []) if (!ids.has(j.to)) issues.push({ severity: "error", code: "unknown-ref", message: `${p.id} joins unknown part ${j.to}`, parts: [p.id] });
  for (const s of b.steps) for (const id of s.parts ?? []) if (!ids.has(id)) issues.push({ severity: "error", code: "unknown-ref", message: `step ${s.id} lists unknown part ${id}` });
  for (const p of b.parts) if ((p as any).step && !b.steps.some(s => s.id === (p as any).step)) issues.push({ severity: "error", code: "unknown-step", message: `${p.id} names unknown step ${(p as any).step}` });

  // panels and boards: one axis equals the material thickness; banded faces are edges
  for (const p of b.parts) {
    if (p.kind !== "panel" && p.kind !== "board") continue;
    const m = project.materials[p.material];
    if (!m) { issues.push({ severity: "error", code: "unknown-material", message: `${p.id}: ${p.material}` }); continue; }
    const thin = AXES.filter(a => Math.abs(ext(p.box, a) - m.thickness) < EPS);
    if (thin.length === 0) issues.push({ severity: "error", code: "thickness", message: `${p.id}: no axis is ${m.thickness}″ (${AXES.map(a => fmt(ext(p.box, a))).join(" × ")})`, parts: [p.id] });
    if (p.kind === "board" && m.type === "board" && m.width && !AXES.some(a => Math.abs(ext(p.box, a) - m.width!) < EPS))
      issues.push({ severity: "error", code: "board-width", message: `${p.id}: no axis is the ${m.width}″ board width`, parts: [p.id] });
    if (p.grain && thin.length === 1 && p.grain === thin[0]) issues.push({ severity: "error", code: "grain-axis", message: `${p.id}: grain cannot run through the thickness`, parts: [p.id] });
    const faceAxis: Record<string, Axis> = { left: "x", right: "x", bottom: "y", top: "y", back: "z", front: "z" };
    for (const f of Object.keys(p.band ?? {})) if (thin.length === 1 && faceAxis[f] === thin[0]) issues.push({ severity: "error", code: "band-face", message: `${p.id}: ${f} is a broad face, not an edge`, parts: [p.id] });
    const finish = p.finish ?? m.finish;
    if ((p.exposure ?? "exposed") === "exposed" && finish === "none") issues.push({ severity: "warning", code: "unfinished-exposed", message: `${p.id} shows but has no finish`, parts: [p.id] });
  }
  for (const p of b.parts) if (p.kind !== "context" && !(p as any).step) issues.push({ severity: "warning", code: "no-step", message: `${p.id} is not installed in any step`, parts: [p.id] });

  // overlaps per phase state: built parts with each other and with walls; declared dado/groove/rabbet/notch joints allow it
  const allowed = new Set<string>();
  for (const p of b.parts) for (const j of (p as any).joins ?? []) if (OVERLAPPING_JOINTS.includes(j.by)) { allowed.add(`${p.id}|${j.to}`); allowed.add(`${j.to}|${p.id}`); }
  for (const ph of phases) {
    const state = b.parts.filter(p => {
      const from = (p as any).phase ? idx((p as any).phase) : 0, until = (p as any).removedIn ? idx((p as any).removedIn) : Infinity;
      return from <= idx(ph) && idx(ph) < until;
    }).map(p => {
      const moves = Object.entries((p as any).moves ?? {}).filter(([k]) => idx(k) <= idx(ph)).sort((a, c) => idx(a[0]) - idx(c[0]));
      return { p, box: moves.length ? moves[moves.length - 1][1] as Box : cylBox(p) };
    }).filter(s => s.box && !(s.p.kind === "context" && (s.p as any).role === "contents"));
    for (let i = 0; i < state.length; i++) for (let j = i + 1; j < state.length; j++) {
      const a = state[i], c = state[j];
      if (a.p.kind === "context" && c.p.kind === "context") continue;
      if (allowed.has(`${a.p.id}|${c.p.id}`)) continue;
      const ov = AXES.map(ax => Math.min(a.box![ax][1], c.box![ax][1]) - Math.max(a.box![ax][0], c.box![ax][0]));
      if (ov.every(v => v > 1e-6)) issues.push({ severity: "error", code: "overlap", message: `${ph}: ${a.p.id} overlaps ${c.p.id} by ${ov.map(fmt).join(" × ")}`, parts: [a.p.id, c.p.id] });
    }
  }
  for (const c of b.checks) if (!c.pass) issues.push({ severity: c.severity, code: `check:${c.id}`, message: `${c.label}${c.detail ? ` (${c.detail})` : ""}` });

  // cut list: length along grain (or the longer side), width, thickness; grouped
  const rows = new Map<string, { phase: string; material: string; name: string; l: number; w: number; t: number; ids: string[]; tags: string[] }>();
  for (const p of b.parts) {
    if (p.kind !== "panel" && p.kind !== "board") continue;
    const m = project.materials[p.material];
    const thin = AXES.find(a => Math.abs(ext(p.box, a) - m.thickness) < EPS)!;
    const rest = AXES.filter(a => a !== thin);
    const lenAxis = p.grain && p.grain !== thin ? p.grain : rest.sort((a, c) => ext(p.box, c) - ext(p.box, a))[0];
    const widAxis = rest.find(a => a !== lenAxis)!;
    const l = ext(p.box, lenAxis), w = ext(p.box, widAxis);
    const tags = [
      p.exposure === "hidden" ? "hidden" : p.exposure === "limited" ? (p.exposureNote ?? "limited") : "",
      (p.finish ?? m.finish) === "clear" && m.finish === "none" ? "needs finish" : "",
      p.fitToSite ? "cut to fit" : "", p.grainLock === false ? "grain free" : "",
      Object.keys(p.band ?? {}).length ? `band ${Object.keys(p.band!).join(", ")}` : "",
    ].filter(Boolean);
    const phase = p.cutIn ?? p.phase;
    const key = [phase, p.material, p.name, l, w, tags.join("|")].join("/");
    const row = rows.get(key) ?? { phase, material: p.material, name: p.name, l, w, t: m.thickness, ids: [], tags };
    row.ids.push(p.id); rows.set(key, row);
  }
  return { b, issues, rows: [...rows.values()] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const drawers of ["3", "2"]) {
    const t0 = performance.now();
    const { b, issues, rows } = evaluate(closet, { drawers });
    const ms = (performance.now() - t0).toFixed(1);
    console.log(`\n=== drawers=${drawers}: ${b.parts.filter(p => p.kind !== "context").length} parts, ${b.parts.filter(p => p.kind === "context").length} context, ${b.steps.length} steps, ${b.checks.length} checks, ${b.views.length} views, ${ms} ms`);
    for (const i of issues) console.log(`  ${i.severity.toUpperCase()} ${i.code}: ${i.message}`);
    if (drawers === "3") for (const r of rows.sort((a, c) => a.phase.localeCompare(c.phase) || a.material.localeCompare(c.material) || c.l * c.w - a.l * a.w))
      console.log(`  ${r.phase} ${r.material.padEnd(12)} ${String(r.ids.length).padStart(2)} × ${r.name.padEnd(28)} ${fmt(r.l)} × ${fmt(r.w)} × ${fmt(r.t)}  ${r.tags.join("; ")}`);
    const band = b.parts.filter(p => p.kind === "panel" && p.band?.front).reduce((a, p: any) => a + (p.box.x[1] - p.box.x[0] > p.box.y[1] - p.box.y[0] ? p.box.x[1] - p.box.x[0] : p.box.y[1] - p.box.y[0]), 0);
    console.log(`  banded front edges: ${band}″ (${(band / 12).toFixed(2)} ft)`);
    const adj = b.parts.filter(p => p.id.startsWith("center-shelf-adj")).map((p: any) => `${p.id}: p1 ${p.box.y[0]} → ${p.removedIn ? "removed in p2" : "p2 " + p.moves.p2.y[0]}`);
    console.log("  " + adj.join("; "));
  }
}
