// The shopping list (section 7.5 of the spec): sheets to buy (from the sheet layouts),
// owned pieces used, board lengths, hardware and edge banding with waste.
import type { Resolved } from "./model/types.ts";
import { cutList } from "./cutlist.ts";
import { nest, type Nesting } from "./nesting.ts";
import { defaultKerf } from "./parts.ts";

export type ShoppingList = {
  sheets: { material: string; materialName: string; stock: string; count: number; cost?: number }[]; // purchased only
  owned: { material: string; materialName: string; stock: string; used: number }[];
  boards: {
    material: string; name: string; pieces: number; totalLength: number;
    suggested: { length: number; count: number }[]; // first-fit into stockLengths; empty when the material has none
  }[];
  hardware: { item: string; name: string; qty: number; unit: string; spec?: string; notes: string[]; cost?: number }[];
  banding: { banding: string; name: string; length: number; withWaste: number }[]; // +10 %
  total?: number; // sum of the known costs, when any cost is known
};

export const BANDING_WASTE = 0.1;

/**
 * Board lengths to buy: first-fit decreasing of the pieces into boards of the longest
 * stock length, with kerf between pieces; each board is then shortened to the shortest
 * stock length that still holds its pieces. A piece longer than every stock length gets
 * a board of its own length.
 */
export function suggestBoards(pieces: number[], stockLengths: number[], kerf: number): { length: number; count: number }[] {
  if (stockLengths.length === 0 || pieces.length === 0) return [];
  const lengths = [...stockLengths].sort((a, b) => a - b);
  const longest = lengths[lengths.length - 1];
  const boards: { cap: number; used: number }[] = [];
  for (const p of [...pieces].sort((a, b) => b - a)) {
    const b = boards.find((bd) => bd.used + kerf + p <= bd.cap + 1e-9);
    if (b) b.used += kerf + p;
    else boards.push({ cap: Math.max(longest, p), used: p });
  }
  const counts = new Map<number, number>();
  for (const b of boards) {
    const len = lengths.find((l) => l >= b.used - 1e-9) ?? b.cap;
    counts.set(len, (counts.get(len) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => a[0] - b[0]).map(([length, count]) => ({ length, count }));
}

export function shoppingList(r: Resolved, opts: { phase?: string; nestings?: Nesting[] } = {}): ShoppingList {
  const cl = cutList(r, { phase: opts.phase });
  const ns = opts.nestings ?? nest(r, { phase: opts.phase });
  let total = 0;
  let anyCost = false;
  const addCost = (c: number | undefined) => {
    if (c !== undefined) {
      total += c;
      anyCost = true;
    }
  };

  const sheets: ShoppingList["sheets"] = [];
  const owned: ShoppingList["owned"] = [];
  const sheetCount = new Map<string, number>();
  const ownedCount = new Map<string, number>();
  for (const n of ns) {
    for (const [stock, c] of Object.entries(n.bought)) sheetCount.set(`${n.material}\u0000${stock}`, (sheetCount.get(`${n.material}\u0000${stock}`) ?? 0) + c);
    for (const [stock, c] of Object.entries(n.owned)) ownedCount.set(`${n.material}\u0000${stock}`, (ownedCount.get(`${n.material}\u0000${stock}`) ?? 0) + c);
  }
  for (const [key, m] of Object.entries(r.materials)) {
    if (m.type !== "sheet") continue;
    for (const s of m.stock) {
      const k = `${key}\u0000${s.id}`;
      const count = sheetCount.get(k);
      if (count) {
        const row: ShoppingList["sheets"][number] = { material: key, materialName: m.name, stock: s.id, count };
        if (s.cost !== undefined) {
          row.cost = s.cost * count;
          addCost(row.cost);
        }
        sheets.push(row);
      }
      const used = ownedCount.get(k);
      if (used) owned.push({ material: key, materialName: m.name, stock: s.id, used });
    }
  }

  const boards: ShoppingList["boards"] = cl.boards.map((b) => {
    const m = r.materials[b.material];
    const pieces = cl.rows.filter((row) => row.type === "part" && row.material === b.material).flatMap((row) => Array(row.qty).fill(row.cut.l) as number[]);
    const stockLengths = m.type === "board" ? m.stockLengths ?? [] : [];
    const kerf = (m.type === "board" ? m.kerf : undefined) ?? defaultKerf(r.project.units);
    return { material: b.material, name: b.name, pieces: b.pieces, totalLength: b.totalLength, suggested: suggestBoards(pieces, stockLengths, kerf) };
  });

  const hardware: ShoppingList["hardware"] = cl.hardware.map((h) => {
    const row: ShoppingList["hardware"][number] = { item: h.item, name: h.name, qty: h.qty, unit: h.unit, notes: h.notes };
    if (h.spec) row.spec = h.spec;
    const unitCost = r.hardware[h.item]?.cost;
    if (unitCost !== undefined) {
      row.cost = unitCost * h.qty;
      addCost(row.cost);
    }
    return row;
  });

  const banding = cl.banding.map((b) => ({ banding: b.banding, name: b.name, length: b.length, withWaste: b.length * (1 + BANDING_WASTE) }));

  const list: ShoppingList = { sheets, owned, boards, hardware, banding };
  if (anyCost) list.total = total;
  return list;
}
