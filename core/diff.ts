// Comparing two evaluations (D10's compare mode, `wb diff`): which parts were added, removed
// or changed (material, size, placement in each phase), how the cut list changed, and whether
// the sheet purchases changed. A DiffDoc is a plain, serialisable summary of one evaluation, so
// the last good model can be kept on disk and compared later.
import type { Box, Config, Resolved } from "./model/types.ts";
import { cutList } from "./cutlist.ts";
import { nest, type Nesting } from "./nesting.ts";
import { fmtLength } from "./units.ts";
import { normalize } from "./json.ts";
import { configKey } from "./evaluate.ts";

export type DiffPart = { name: string; kind: string; material?: string; size?: { l: number; w: number; t: number }; boxes: Record<string, Box | null> };
export type DiffRow = { key: string; phase: string; material: string; materialName: string; name: string; qty: number; ids: string[]; cut: { l: number; w: number; t: number } };
export type Purchases = { phase: string; material: string; bought: Record<string, number>; owned: Record<string, number> }[];

export type DiffDoc = {
  project: string; config: Config; units: "in" | "mm"; phases: string[];
  parts: Record<string, DiffPart>;
  cutRows: DiffRow[];
  sheets: Purchases;
};

export type Change = { id: string; field: string; from: unknown; to: unknown };
export type Diff = {
  from: { config: Config }; to: { config: Config };
  parts: { added: string[]; removed: string[]; changed: Change[] };
  cutlist: { added: DiffRow[]; removed: DiffRow[]; changed: { key: string; field: string; from: unknown; to: unknown }[] };
  sheets: { from: Purchases; to: Purchases; same: boolean };
};

// Values keep full precision (an exact 32nd must not print as ≈); comparisons round to 4 decimals.
const round9 = (n: number) => Math.round(n * 1e9) / 1e9;
const r4box = (b: Box): Box => ({ x: [round9(b.x[0]), round9(b.x[1])], y: [round9(b.y[0]), round9(b.y[1])], z: [round9(b.z[0]), round9(b.z[1])] });

export function diffDoc(r: Resolved, nestings?: Nesting[]): DiffDoc {
  const parts: Record<string, DiffPart> = {};
  const boxesById = new Map<string, Record<string, Box | null>>();
  for (const ph of r.phases) {
    for (const e of r.stateAt(ph.id).parts) {
      const rec = boxesById.get(e.part.id) ?? {};
      rec[ph.id] = e.box ? r4box(e.box) : null;
      boxesById.set(e.part.id, rec);
    }
  }
  for (const p of r.parts) {
    const d: DiffPart = { name: p.name, kind: p.kind, boxes: boxesById.get(p.id) ?? {} };
    if (p.kind === "panel" || p.kind === "board") {
      d.material = p.material;
      if (p.sizes) d.size = { l: round9(p.sizes.l), w: round9(p.sizes.w), t: round9(p.sizes.t) };
    } else if (p.kind === "hardware") d.material = p.item;
    parts[p.id] = d;
  }
  const cutRows = cutList(r).rows.map((row) => ({
    key: `${row.type === "strip" ? "strip:" : ""}${row.ids.join(" ")}`, phase: row.phase, material: row.material, materialName: row.materialName,
    name: row.name, qty: row.qty, ids: row.ids, cut: { l: round9(row.cut.l), w: round9(row.cut.w), t: round9(row.cut.t) },
  }));
  const sheets = (nestings ?? nest(r)).map((n) => ({ phase: n.phase, material: n.material, bought: n.bought, owned: n.owned }));
  return { project: r.project.id, config: r.config, units: r.project.units, phases: r.phases.map((p) => p.id), parts, cutRows, sheets };
}

const same = (a: unknown, b: unknown) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));

export function diff(a: DiffDoc, b: DiffDoc): Diff {
  const ids = (d: DiffDoc) => Object.keys(d.parts);
  const added = ids(b).filter((id) => !(id in a.parts));
  const removed = ids(a).filter((id) => !(id in b.parts));
  const changed: Change[] = [];
  for (const id of ids(a)) {
    const p = a.parts[id], q = b.parts[id];
    if (!q) continue;
    if (p.name !== q.name) changed.push({ id, field: "name", from: p.name, to: q.name });
    const num = (x: number, y: number) => same(x, y);
    if (p.material !== q.material) changed.push({ id, field: "material", from: p.material ?? null, to: q.material ?? null });
    if (p.size && q.size) {
      for (const [k, field] of [["l", "length"], ["w", "width"], ["t", "thickness"]] as const) {
        if (!num(p.size[k], q.size[k])) changed.push({ id, field, from: p.size[k], to: q.size[k] });
      }
    }
    const phases = [...new Set([...Object.keys(p.boxes), ...Object.keys(q.boxes)])];
    for (const ph of phases) {
      const x = p.boxes[ph], y = q.boxes[ph];
      if (x === undefined || y === undefined) changed.push({ id, field: `in@${ph}`, from: x !== undefined, to: y !== undefined });
      else if (!same(x, y)) changed.push({ id, field: `box@${ph}`, from: x, to: y });
    }
  }
  const rowsA = new Map(a.cutRows.map((r) => [r.key, r])), rowsB = new Map(b.cutRows.map((r) => [r.key, r]));
  const cl: Diff["cutlist"] = { added: [], removed: [], changed: [] };
  for (const [k, r] of rowsB) if (!rowsA.has(k)) cl.added.push(r);
  for (const [k, r] of rowsA) {
    const s = rowsB.get(k);
    if (!s) {
      cl.removed.push(r);
      continue;
    }
    for (const f of ["phase", "material", "materialName", "name", "qty"] as const) if (r[f] !== s[f]) cl.changed.push({ key: k, field: f, from: r[f], to: s[f] });
    if (!same(r.cut, s.cut)) cl.changed.push({ key: k, field: "cut", from: r.cut, to: s.cut });
  }
  return {
    from: { config: a.config }, to: { config: b.config },
    parts: { added, removed, changed },
    cutlist: cl,
    sheets: { from: a.sheets, to: b.sheets, same: same(a.sheets, b.sheets) },
  };
}

/** Which axes of a box moved, as text: "y 49 to 50 → 49 to 49¾". */
export function boxChange(from: Box, to: Box, L: (n: number) => string): string {
  return (["x", "y", "z"] as const)
    .filter((a) => from[a][0] !== to[a][0] || from[a][1] !== to[a][1])
    .map((a) => `${a} ${L(from[a][0])} to ${L(from[a][1])} → ${L(to[a][0])} to ${L(to[a][1])}`)
    .join(", ");
}

/** One change as text in display units. */
export function changeText(c: Change, units: "in" | "mm"): string {
  const L = (n: number) => fmtLength(n, { units });
  if (c.field.startsWith("box@")) return `${c.field.slice(4)}: ${boxChange(c.from as Box, c.to as Box, L)}`;
  if (c.field.startsWith("in@")) return `${c.to ? "added in" : "gone from"} ${c.field.slice(3)}`;
  if (typeof c.from === "number" && typeof c.to === "number") return `${c.field} ${L(c.from)} → ${L(c.to)}`;
  return `${c.field} ${String(c.from)} → ${String(c.to)}`;
}

const purchasesText = (p: Purchases) =>
  p.map((n) => `${n.phase} ${n.material}: ${[...Object.entries(n.bought).map(([k, v]) => `buy ${v} × ${k}`), ...Object.entries(n.owned).map(([k, v]) => `use ${v} × ${k}`)].join(", ")}`).join("; ");

export function diffText(d: Diff, units: "in" | "mm"): string {
  const L = (n: number) => fmtLength(n, { units });
  const lines = [`${configKey(d.from.config)} → ${configKey(d.to.config)}`];
  const { added, removed, changed } = d.parts;
  if (!added.length && !removed.length && !changed.length) lines.push("parts: no changes");
  else {
    lines.push(`parts: ${added.length} added, ${removed.length} removed, ${new Set(changed.map((c) => c.id)).size} changed`);
    for (const id of added) lines.push(`  + ${id}`);
    for (const id of removed) lines.push(`  - ${id}`);
    for (const c of changed) lines.push(`  ~ ${c.id}: ${changeText(c, units)}`);
  }
  const cl = d.cutlist;
  if (!cl.added.length && !cl.removed.length && !cl.changed.length) lines.push("cut list: no changes");
  else {
    lines.push(`cut list: ${cl.added.length} rows added, ${cl.removed.length} removed, ${new Set(cl.changed.map((c) => c.key)).size} changed`);
    const row = (r: DiffRow) => `${r.qty} × ${r.name} (${r.phase}, ${r.materialName})  ${L(r.cut.l)} × ${L(r.cut.w)}`;
    for (const r of cl.added) lines.push(`  + ${row(r)}`);
    for (const r of cl.removed) lines.push(`  - ${row(r)}`);
    for (const c of cl.changed) {
      const v = (x: unknown) => (x && typeof x === "object" ? `${L((x as { l: number }).l)} × ${L((x as { w: number }).w)} × ${L((x as { t: number }).t)}` : String(x));
      lines.push(`  ~ ${c.key}: ${c.field} ${v(c.from)} → ${v(c.to)}`);
    }
  }
  lines.push(d.sheets.same ? `sheets: same purchases (${purchasesText(d.sheets.to)})` : `sheets: ${purchasesText(d.sheets.from)} → ${purchasesText(d.sheets.to)}`);
  return lines.join("\n");
}
