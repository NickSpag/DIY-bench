// The cut list (section 7.1 of the spec): panels and boards grouped into rows of
// interchangeable pieces, grain-matched strips, board totals, hardware and edge banding.
import type { Resolved, ResolvedCutPart, Sizes } from "./model/types.ts";
import { bandedEdges, cutSize, defaultKerf, edgeLength, isCutPart, type EdgeName } from "./parts.ts";
import { fmtLength, round4 } from "./units.ts";

export type Size3 = { l: number; w: number; t: number };

export type CutRow = {
  type: "part" | "strip"; // a strip row is the one piece that several faces are later cut from
  phase: string; // the phase the row is listed in: the cut phase, except strip members, listed in their install phase
  cutPhase: string; // the phase the pieces are cut in
  material: string; materialName: string; kind: "panel" | "board";
  name: string; qty: number; ids: string[]; where: string[];
  finished: Size3;
  cut: Size3;
  band: Partial<Record<EdgeName, string>>; // long edges l1/l2, short edges w1/w2 → banding id
  tags: string[]; // derived, never typed by hand
  notes: string[]; // unique notes of the members
  strip?: string; // strip id, on the strip row and on its members' rows
};

export type Strip = {
  id: string; name: string; phase: string; material: string;
  l: number; w: number; // l = Σ member l + kerf × (n − 1); w = the widest member
  members: string[]; // in strip order
};

export type HardwareRow = {
  item: string; name: string; unit: string; qty: number; ids: string[];
  spec?: string; notes: string[]; // notes: lengths of cut-to-length stock, "2 @ 26¼, 1 @ 27"
};

export type CutList = {
  rows: CutRow[];
  strips: Strip[];
  boards: { material: string; name: string; pieces: number; totalLength: number }[];
  hardware: HardwareRow[];
  banding: { banding: string; name: string; length: number; ids: string[] }[];
};

const sizeOf = (s: Sizes): Size3 => ({ l: s.l, w: s.w, t: s.t });

/** The cut-list tags of one part, in the order of section 7.1. */
export function partTags(p: ResolvedCutPart): string[] {
  const tags: string[] = [];
  const m = p.materialDef;
  if (p.exposure === "hidden") tags.push("hidden");
  else if (p.exposure === "limited") tags.push(p.exposureNote ?? "limited");
  if (m && m.finish === "none" && (p.finishApplied === "clear" || p.finishApplied === "paint")) tags.push("needs finish");
  if (p.finishApplied === "paint") tags.push("paint");
  if (p.fitToSite) tags.push("cut to fit");
  if (p.grainLock === false) tags.push("grain free");
  const faces = Object.keys(p.band ?? {});
  if (faces.length) tags.push(`band ${faces.join(", ")}`);
  if (p.strip) tags.push(`from strip ${p.strip.name}`);
  return tags;
}

/** The strips of a resolved model, members in order. */
export function strips(r: Resolved): Strip[] {
  const byId = new Map<string, ResolvedCutPart[]>();
  for (const p of r.parts) {
    if (isCutPart(p) && p.strip && p.sizes) {
      const list = byId.get(p.strip.id) ?? [];
      list.push(p);
      byId.set(p.strip.id, list);
    }
  }
  const out: Strip[] = [];
  for (const [id, members] of byId) {
    members.sort((a, b) => (a.strip?.order ?? 0) - (b.strip?.order ?? 0));
    const first = members[0];
    const m = first.materialDef;
    const kerf = m && m.type === "sheet" ? m.kerf ?? defaultKerf(r.project.units) : defaultKerf(r.project.units);
    const cuts = members.map((p) => cutSize(p, r.banding));
    out.push({
      id, name: first.strip?.name ?? id, phase: first.cutPhase, material: first.material,
      l: cuts.reduce((a, c) => a + c.l, 0) + kerf * (members.length - 1),
      w: Math.max(...cuts.map((c) => c.w)),
      members: members.map((p) => p.id),
    });
  }
  return out;
}

export function cutList(r: Resolved, opts: { phase?: string } = {}): CutList {
  const phaseIdx = new Map(r.phases.map((p, i) => [p.id, i]));
  const matIdx = new Map(Object.keys(r.materials).map((k, i) => [k, i]));
  const wanted = (phase: string) => opts.phase === undefined || opts.phase === phase;
  const units = r.project.units;

  // ---------- rows ----------
  const groups = new Map<string, CutRow>();
  const cutParts = r.parts.filter(isCutPart).filter((p) => p.sizes && p.materialDef);
  for (const p of cutParts) {
    const phase = p.strip ? p.phase : p.cutPhase;
    if (!wanted(phase)) continue;
    const m = p.materialDef;
    if (!m) continue;
    const finished = sizeOf(p.sizes as Sizes);
    const cut = cutSize(p, r.banding);
    const band = bandedEdges(p);
    const tags = partTags(p);
    const key = JSON.stringify([phase, p.cutPhase, p.material, p.name, round4(cut.l), round4(cut.w), round4(cut.t),
      Object.entries(band).sort(), [...tags].sort()]);
    let row = groups.get(key);
    if (!row) {
      row = {
        type: "part", phase, cutPhase: p.cutPhase, material: p.material, materialName: m.name, kind: p.kind,
        name: p.name, qty: 0, ids: [], where: [], finished, cut, band, tags, notes: [],
      };
      if (p.strip) row.strip = p.strip.id;
      groups.set(key, row);
    }
    row.qty++;
    row.ids.push(p.id);
    if (p.where !== undefined && !row.where.includes(p.where)) row.where.push(p.where);
    if (p.notes && !row.notes.includes(p.notes)) row.notes.push(p.notes);
  }
  const rows = [...groups.values()];

  // ---------- strips ----------
  const allStrips = strips(r).filter((s) => wanted(s.phase));
  for (const s of allStrips) {
    const m = r.materials[s.material];
    const memberNames = s.members.map((id) => {
      const p = r.part(id);
      return p ? `${p.name}${p.where ? ` (${p.where})` : ""}` : id;
    });
    const t = m?.thickness ?? 0;
    const phaseNo = (phaseIdx.get(s.phase) ?? -1) + 1 || s.phase;
    rows.push({
      type: "strip", phase: s.phase, cutPhase: s.phase, material: s.material, materialName: m?.name ?? s.material,
      kind: "panel", name: s.name, qty: 1, ids: [...s.members], where: [],
      finished: { l: s.l, w: s.w, t }, cut: { l: s.l, w: s.w, t }, band: {}, tags: [],
      notes: [`Cut it in phase ${phaseNo} and set it aside. It yields, in order along the grain: ${memberNames.join(", ")}.`],
      strip: s.id,
    });
  }

  // ---------- sort ----------
  const kindRank = (row: CutRow) => (r.materials[row.material]?.type === "sheet" ? 0 : 1);
  rows.sort((a, b) =>
    (phaseIdx.get(a.phase) ?? 0) - (phaseIdx.get(b.phase) ?? 0) ||
    kindRank(a) - kindRank(b) ||
    (matIdx.get(a.material) ?? 0) - (matIdx.get(b.material) ?? 0) ||
    b.cut.l * b.cut.w - a.cut.l * a.cut.w ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // ---------- boards ----------
  const boards: CutList["boards"] = [];
  for (const [key, m] of Object.entries(r.materials)) {
    if (m.type !== "board") continue;
    const mine = rows.filter((row) => row.type === "part" && row.material === key);
    if (mine.length === 0) continue;
    boards.push({
      material: key, name: m.name,
      pieces: mine.reduce((a, row) => a + row.qty, 0),
      totalLength: mine.reduce((a, row) => a + row.qty * row.cut.l, 0),
    });
  }

  // ---------- hardware ----------
  const hardware: HardwareRow[] = [];
  for (const [item, h] of Object.entries(r.hardware)) {
    const parts = r.parts.filter((p) => p.kind === "hardware" && p.item === item && wanted(p.phase));
    if (parts.length === 0) continue;
    const row: HardwareRow = { item, name: h.name, unit: h.unit, qty: 0, ids: [], notes: [] };
    if (h.spec) row.spec = h.spec;
    const lengths = new Map<number, number>();
    for (const p of parts) {
      if (p.kind !== "hardware") continue;
      row.qty += p.qty;
      row.ids.push(p.id);
      if (p.length !== undefined) lengths.set(round4(p.length), (lengths.get(round4(p.length)) ?? 0) + p.qty);
      if (p.notes && !row.notes.includes(p.notes)) row.notes.push(p.notes);
    }
    if (lengths.size) {
      row.notes.unshift([...lengths].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${n} @ ${fmtLength(l, { units })}`).join(", "));
    }
    hardware.push(row);
  }

  // ---------- banding ----------
  const banding: CutList["banding"] = [];
  for (const [id, bd] of Object.entries(r.banding)) {
    let length = 0;
    const ids: string[] = [];
    for (const p of cutParts) {
      if (!wanted(p.cutPhase) || !p.sizes) continue;
      const edges = Object.entries(bandedEdges(p)).filter(([, b]) => b === id) as [EdgeName, string][];
      if (edges.length === 0) continue;
      for (const [e] of edges) length += edgeLength(p.sizes, e);
      ids.push(p.id);
    }
    if (ids.length) banding.push({ banding: id, name: bd.name, length, ids });
  }

  return { rows, strips: allStrips, boards, hardware, banding };
}

/** The cut-list row that lists a part (a strip member's own row, not the strip). */
export function rowOf(cl: CutList, id: string): CutRow | undefined {
  return cl.rows.find((row) => row.type === "part" && row.ids.includes(id));
}
