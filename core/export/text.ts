// Plain-text cut list and shopping list, modelled on the concept sheet's "Copy as text".
import type { Resolved } from "../model/types.ts";
import type { CutList, CutRow } from "../cutlist.ts";
import type { ShoppingList } from "../shopping.ts";
import { configKey } from "../evaluate.ts";
import { fmtLength, fmtThickness } from "../units.ts";

const qtyUnit = (qty: number, unit: string): string => {
  if (unit === "each") return `${qty}`;
  if (unit === "ft") return `${qty} ft`;
  return `${qty} ${unit}${qty === 1 ? "" : "s"}`;
};

function header(r: Resolved, what: string): string {
  const key = configKey(r.config);
  return `${r.project.title.toUpperCase()} · ${what} (${r.project.units})${key === "default" ? "" : ` · ${key}`}`;
}

export function fmtRowSize(r: Resolved, row: CutRow): string {
  const units = r.project.units;
  const m = r.materials[row.material];
  const t = m ? fmtThickness(m, { units }) : fmtLength(row.cut.t, { units });
  return `${fmtLength(row.cut.l, { units })} × ${fmtLength(row.cut.w, { units })} × ${t}`;
}

function rowLines(r: Resolved, row: CutRow): string[] {
  // Which instances, when there are few enough to read: "(left; right)".
  const where = row.where.length && row.where.length <= 3 ? ` (${row.where.join("; ")})` : "";
  const tags = row.tags.length ? `  [${row.tags.join("; ")}]` : "";
  const cutNo = r.phases.findIndex((p) => p.id === row.cutPhase) + 1;
  const cut = row.phase !== row.cutPhase ? `  cut in phase ${cutNo || row.cutPhase}` : "";
  const lines = [`  ${row.qty} × ${row.name}${where}  —  ${fmtRowSize(r, row)}${tags}${cut}`];
  for (const n of row.notes) lines.push(`      ${n}`);
  return lines;
}

const hardwareLine = (h: { qty: number; unit: string; name: string; notes: string[]; spec?: string }, extra = ""): string => {
  const detail = [...h.notes, h.spec ?? ""].filter(Boolean).join("; ");
  return `  ${qtyUnit(h.qty, h.unit)} × ${h.name}${detail ? `  —  ${detail}` : ""}${extra}`;
};

export function cutListText(r: Resolved, cl: CutList): string {
  const units = r.project.units;
  const L = (n: number) => fmtLength(n, { units });
  const out: string[] = [header(r, "CUT LIST")];
  for (const [i, ph] of r.phases.entries()) {
    const rows = cl.rows.filter((row) => row.phase === ph.id);
    const hw = cl.hardware.filter((h) => h.ids.some((id) => r.part(id)?.phase === ph.id));
    if (rows.length === 0 && hw.length === 0) continue;
    out.push("", `PHASE ${i + 1} · ${ph.title.toUpperCase()}`);
    let lastMaterial = "";
    for (const row of rows) {
      if (row.material !== lastMaterial) {
        if (lastMaterial) out.push("");
        out.push(row.materialName);
        lastMaterial = row.material;
      }
      out.push(...rowLines(r, row));
    }
    if (hw.length) {
      if (rows.length) out.push("");
      out.push("Hardware");
      for (const h of hw) {
        const mine = h.ids.filter((id) => r.part(id)?.phase === ph.id);
        const qty = mine.reduce((a, id) => {
          const p = r.part(id);
          return a + (p?.kind === "hardware" ? p.qty : 0);
        }, 0);
        out.push(hardwareLine({ ...h, qty }));
      }
    }
  }
  if (cl.banding.length) {
    out.push("", "EDGE BANDING");
    for (const b of cl.banding) out.push(`  ${b.name}: ${L(b.length)} (${b.ids.length} parts)`);
  }
  if (cl.boards.length) {
    out.push("", "BOARD TOTALS");
    for (const b of cl.boards) out.push(`  ${b.name}: ${b.pieces} piece${b.pieces === 1 ? "" : "s"}, ${L(b.totalLength)} in all`);
  }
  return out.join("\n") + "\n";
}

export function shoppingText(r: Resolved, s: ShoppingList): string {
  const units = r.project.units;
  const L = (n: number) => fmtLength(n, { units });
  const money = (n: number) => `$${n.toFixed(2)}`;
  const out: string[] = [header(r, "SHOPPING LIST")];
  if (s.sheets.length) {
    out.push("", "SHEETS TO BUY");
    for (const x of s.sheets) out.push(`  ${x.count} × ${x.stock.replace(/(\d)x(\d)/g, "$1×$2")} · ${x.materialName}${x.cost !== undefined ? `  ${money(x.cost)}` : ""}`);
  }
  if (s.owned.length) {
    out.push("", "OWNED PIECES USED");
    for (const x of s.owned) out.push(`  ${x.used} × ${x.stock} · ${x.materialName}`);
  }
  if (s.boards.length) {
    out.push("", "BOARDS");
    for (const b of s.boards) {
      const sug = b.suggested.length ? `; buy ${b.suggested.map((x) => `${x.count} @ ${L(x.length)}`).join(", ")}` : "";
      out.push(`  ${b.name}: ${b.pieces} piece${b.pieces === 1 ? "" : "s"}, ${L(b.totalLength)} in all${sug}`);
    }
  }
  if (s.hardware.length) {
    out.push("", "HARDWARE");
    for (const h of s.hardware) out.push(hardwareLine(h, h.cost !== undefined ? `  ${money(h.cost)}` : ""));
  }
  if (s.banding.length) {
    out.push("", "EDGE BANDING");
    for (const b of s.banding) {
      const ft = units === "in" ? ` (${(b.withWaste / 12).toFixed(1)} ft)` : "";
      out.push(`  ${b.name}: ${L(b.withWaste)}${ft} with 10% waste; ${L(b.length)} on the parts`);
    }
  }
  if (s.total !== undefined) out.push("", `TOTAL ${money(s.total)}`);
  return out.join("\n") + "\n";
}
