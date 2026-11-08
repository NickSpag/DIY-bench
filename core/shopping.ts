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
    fromOwned: { length: number; cuts: number[] }[]; // owned boards used, longest first, with the pieces cut from each
    layout: BoardLayout[]; // every board, owned ones first, with the parts cut from it
  }[];
  hardware: { item: string; name: string; qty: number; unit: string; spec?: string; notes: string[]; cost?: number }[];
  banding: { banding: string; name: string; length: number; withWaste: number }[]; // +10 %
  total?: number; // sum of the known costs, when any cost is known
};

export const BANDING_WASTE = 0.1;

/** One board, owned or to buy, and the parts cut from it in order. */
export type BoardLayout = { length: number; owned: boolean; cuts: { id: string; name: string; l: number }[] };

/**
 * Every board a material needs: the owned boards that get used (best fit, longest piece first), then boards
 * to buy for the rest (first-fit decreasing into the longest stock length, each then shortened to the
 * shortest stock length that holds it; a piece longer than all of them gets a board of its own length).
 * With no stock lengths there is nothing to plan purchases against, so only the owned boards are laid out.
 */
export function planBoards(cuts: BoardLayout["cuts"], owned: number[], stockLengths: number[], kerf: number): BoardLayout[] {
  const sorted = [...cuts].sort((a, b) => b.l - a.l || (a.id < b.id ? -1 : 1));
  const own = [...owned].sort((a, b) => b - a).map((length) => ({ length, used: 0, owned: true, cuts: [] as BoardLayout["cuts"] }));
  const room = (bd: { length: number; used: number; cuts: unknown[] }) => bd.length - bd.used - (bd.cuts.length ? kerf : 0);
  const rest: BoardLayout["cuts"] = [];
  for (const c of sorted) {
    const fit = own.filter((bd) => room(bd) >= c.l - 1e-9).sort((a, b) => room(a) - room(b))[0];
    if (!fit) { rest.push(c); continue; }
    fit.used += (fit.cuts.length ? kerf : 0) + c.l;
    fit.cuts.push(c);
  }
  const lengths = [...stockLengths].sort((a, b) => a - b);
  const longest = lengths[lengths.length - 1] ?? 0;
  const buy: { length: number; used: number; owned: boolean; cuts: BoardLayout["cuts"] }[] = [];
  for (const c of lengths.length ? rest : []) {
    const bd = buy.find((x) => x.used + kerf + c.l <= x.length + 1e-9);
    if (bd) { bd.used += kerf + c.l; bd.cuts.push(c); }
    else buy.push({ length: Math.max(longest, c.l), used: c.l, owned: false, cuts: [c] });
  }
  for (const bd of buy) bd.length = lengths.find((l) => l >= bd.used - 1e-9) ?? bd.length;
  return [...own.filter((bd) => bd.cuts.length), ...buy].map(({ length, owned: o, cuts: cs }) => ({ length, owned: o, cuts: cs }));
}

/**
 * Board lengths to buy: first-fit decreasing of the pieces into boards of the longest
 * stock length, with kerf between pieces; each board is then shortened to the shortest
 * stock length that still holds its pieces. A piece longer than every stock length gets
 * a board of its own length.
 */
export function suggestBoards(pieces: number[], stockLengths: number[], kerf: number): { length: number; count: number }[] {
  if (stockLengths.length === 0 || pieces.length === 0) return [];
  return buyBoards(pieces, stockLengths, kerf);
}

/**
 * Pieces cut from boards the user owns first: longest piece first, each into the owned board with the
 * least room left that still holds it (best fit). What no owned board holds is left over to buy.
 */
export function useOwnedBoards(pieces: number[], owned: number[], kerf: number): { fromOwned: { length: number; cuts: number[] }[]; rest: number[] } {
  const boards = [...owned].sort((a, b) => b - a).map((length) => ({ length, used: 0, cuts: [] as number[] }));
  const rest: number[] = [];
  for (const p of [...pieces].sort((a, b) => b - a)) {
    const room = (bd: { length: number; used: number; cuts: number[] }) => bd.length - bd.used - (bd.cuts.length ? kerf : 0);
    const fit = boards.filter((bd) => room(bd) >= p - 1e-9).sort((a, b) => room(a) - room(b))[0];
    if (!fit) { rest.push(p); continue; }
    fit.used += (fit.cuts.length ? kerf : 0) + p;
    fit.cuts.push(p);
  }
  return { fromOwned: boards.filter((bd) => bd.cuts.length).map(({ length, cuts }) => ({ length, cuts })), rest };
}

function buyBoards(pieces: number[], stockLengths: number[], kerf: number): { length: number; count: number }[] {
  if (pieces.length === 0) return [];
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
    const rows = cl.rows.filter((row) => row.type === "part" && row.material === b.material);
    const pieces = rows.flatMap((row) => Array(row.qty).fill(row.cut.l) as number[]);
    const cuts = rows.flatMap((row) => row.ids.map((id) => ({ id, name: row.name, l: row.cut.l })));
    const stockLengths = m.type === "board" ? m.stockLengths ?? [] : [];
    const kerf = (m.type === "board" ? m.kerf : undefined) ?? defaultKerf(r.project.units);
    const { fromOwned, rest } = useOwnedBoards(pieces, m.type === "board" ? m.owned ?? [] : [], kerf);
    const layout = planBoards(cuts, m.type === "board" ? m.owned ?? [] : [], stockLengths, kerf);
    return { material: b.material, name: b.name, pieces: b.pieces, totalLength: b.totalLength, suggested: suggestBoards(rest, stockLengths, kerf), fromOwned, layout };
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
