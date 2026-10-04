// The cut list as CSV (section 7.6). Sizes use the display rules of section 5.6, so
// 23/32″ plywood reads 23/32, not ≈¾.
import type { Resolved } from "../model/types.ts";
import type { CutList } from "../cutlist.ts";
import { fmtLength, fmtThickness } from "../units.ts";

export const CSV_COLUMNS = ["phase", "material", "name", "qty", "cut length", "cut width", "thickness", "tags", "ids", "notes"] as const;

const cell = (v: string | number): string => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function cutListCsv(r: Resolved, cl: CutList): string {
  const units = r.project.units;
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of cl.rows) {
    const m = r.materials[row.material];
    lines.push([
      row.phase, row.materialName, row.name, row.qty,
      fmtLength(row.cut.l, { units }), fmtLength(row.cut.w, { units }),
      m ? fmtThickness(m, { units }) : fmtLength(row.cut.t, { units }),
      row.tags.join("; "), row.ids.join(" "), row.notes.join(" "),
    ].map(cell).join(","));
  }
  return lines.join("\n") + "\n";
}

/** Parses CSV text (RFC 4180 quoting) into rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
