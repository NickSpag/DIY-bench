// Spike: derive sheet layouts from the model: sheet-material parts grouped by material and cut phase,
// grain-matched strips packed as one item, owned stock first. Compare with the concept sheet's layout.
import closet from "./closet.ts";
import { evaluate, fmt } from "./evaluate.ts";
import { packMaterial } from "./packer.mjs";
import type { Axis, SheetMaterial } from "./dsl.ts";

const AX: Axis[] = ["x", "y", "z"];
const { b } = evaluate(closet, { drawers: process.argv[2] ?? "3" });
const groups = new Map<string, any[]>();
for (const p of b.parts) {
  if (p.kind !== "panel") continue;
  const m = closet.materials[p.material] as SheetMaterial;
  const ext = (a: Axis) => p.box[a][1] - p.box[a][0];
  const thin = AX.find(a => Math.abs(ext(a) - m.thickness) < 1e-9)!;
  const rest = AX.filter(a => a !== thin);
  const la = p.grain && p.grain !== thin ? p.grain : rest.sort((a, c) => ext(c) - ext(a))[0];
  const wa = rest.find(a => a !== la)!;
  const key = `${p.cutIn ?? p.phase}/${p.material}`;
  (groups.get(key) ?? groups.set(key, []).get(key)!).push({ id: p.id, l: ext(la), w: ext(wa), grain: p.grainLock === false ? "free" : "lock", strip: p.strip });
}
for (const [key, parts] of [...groups].sort()) {
  const [phase, mat] = key.split("/");
  const m = closet.materials[mat] as SheetMaterial;
  // grain-matched strips: lay members end to end along the grain, kerf between them
  const items: any[] = [], strips = new Map<string, any>();
  for (const q of parts) {
    if (!q.strip) { items.push(q); continue; }
    const s = strips.get(q.strip.id) ?? { id: `strip:${q.strip.id}`, l: -m.kerf!, w: q.w, grain: "lock", members: [] };
    s.l += q.l + m.kerf!; s.members.push(q.id); s.w = Math.max(s.w, q.w); strips.set(q.strip.id, s);
  }
  items.push(...strips.values());
  const stock = m.stock.map(s => ({ id: s.id, L: s.length, W: s.width, qty: s.owned ?? Infinity, owned: !!s.owned }));
  const r = packMaterial({ stock, parts: items, kerf: m.kerf });
  console.log(`${phase} ${m.name}: ${r.sheets.map((s: any) => s.stock.id).join(" + ")}`);
  for (const s of r.sheets) console.log(`   ${s.stock.id}: ${s.placed.map((p: any) => `${p.id}${p.turned ? " (turned)" : ""} ${fmt(p.l)}×${fmt(p.w)}`).join(", ")}`);
  for (const s of strips.values()) console.log(`   strip ${s.id} = ${fmt(s.l)} × ${fmt(s.w)}: ${s.members.join(", ")}`);
}
