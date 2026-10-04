// Cut list tab (section 9.5): rows by phase, then by material; clicking a row selects every
// piece in it. Below the rows: boards, hardware, banding and the shopping list.
import { useEffect, useRef, useState } from "react";
import { useWb } from "../store.ts";
import { derive } from "../derive.ts";
import { useFmt } from "../fmt.ts";
import { pickFromEvent, revealSelected } from "../pick.ts";
import type { CutRow } from "../../core/cutlist.ts";
import { cutListText } from "../../core/export/text.ts";
import { cutListCsv } from "../../core/export/csv.ts";
import { configKey } from "../../core/evaluate.ts";
import { stockLabel } from "../../core/sheet-svg.ts";

const tagClass = (t: string) =>
  t === "hidden" ? "p-hidden" : t === "needs finish" ? "p-finish" : t === "paint" ? "p-paint" : t.startsWith("from strip") ? "p-strip" :
    ["cut to fit", "grain free"].includes(t) || t.startsWith("band ") ? "" : "p-limited";

const qtyUnit = (qty: number, unit: string) => (unit === "each" ? `${qty}` : `${qty} ${unit}${qty === 1 ? "" : "s"}`);

export function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CutListPanel() {
  const r = useWb((s) => s.resolved);
  const selected = useWb((s) => s.selected);
  const phase = useWb((s) => s.phase);
  const f = useFmt();
  const root = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (useWb.getState().selectSource !== "cutlist") revealSelected(root.current, selected);
  }, [selected]);
  if (!r) return <div className="empty">Loading…</div>;
  const { cutlist: cl, shopping } = derive(r);
  const phaseNo = (id: string) => r.phases.findIndex((p) => p.id === id) + 1;

  const rowEl = (row: CutRow) => {
    const ids = row.ids.join(" ");
    const size = `${f.L(row.cut.l)} × ${f.L(row.cut.w)}`;
    return (
      <tr key={`${row.type}:${ids}`} data-part={ids} data-row={row.name}>
        <td>
          <div>
            {row.name}
            {row.where.length > 0 && row.where.length <= 3 && <span className="where"> · {row.where.join("; ")}</span>}
            {row.type === "strip" && <span className="where"> · {row.ids.length} pieces</span>}
          </div>
          {(row.tags.length > 0 || row.phase !== row.cutPhase) && (
            <div>
              {row.tags.map((t) => <span key={t} className={`pill ${tagClass(t)}`}>{t}</span>)}
              {row.phase !== row.cutPhase && <span className="pill p-strip">cut in phase {phaseNo(row.cutPhase)}</span>}
            </div>
          )}
          {row.notes.length > 0 && <div className="rownote">{row.notes.join(" ")}</div>}
        </td>
        <td className="q">{row.qty}</td>
        <td className="sz">{size}</td>
      </tr>
    );
  };

  return (
    <div className="pane-pad" ref={root} onClick={(e) => pickFromEvent(e, "cutlist")} data-testid="cutlist">
      <div className="toolbar">
        <button type="button" className="btn" onClick={async () => {
          try {
            await navigator.clipboard.writeText(cutListText(r, cl));
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          } catch {
            download(`${r.project.id}.cutlist.txt`, cutListText(r, cl), "text/plain");
          }
        }}>{copied ? "Copied" : "Copy as text"}</button>
        <button type="button" className="btn" onClick={() => download(`${r.project.id}.cutlist.${configKey(r.config)}.csv`, cutListCsv(r, cl), "text/csv")}>Download CSV</button>
        <span className="faint" style={{ fontSize: "0.75rem" }}>sizes are cut sizes, length along the grain × width</span>
      </div>
      {r.phases.map((ph, i) => {
        const rows = cl.rows.filter((row) => row.phase === ph.id);
        if (rows.length === 0) return null;
        const mats: string[] = [];
        for (const row of rows) if (!mats.includes(row.material)) mats.push(row.material);
        return (
          <section key={ph.id} style={{ opacity: phaseNo(ph.id) > phaseNo(phase) ? 0.6 : 1 }}>
            <h3 className="section-h">Phase {i + 1} · {ph.title}</h3>
            {mats.map((m) => {
              const mrows = rows.filter((row) => row.material === m);
              const mat = r.materials[m];
              return (
                <table className="t" key={m}>
                  <caption className="caption" style={{ textAlign: "left" }}>{mrows[0].materialName}{mat && !mrows[0].materialName.includes(f.T(mat)) ? ` · ${f.T(mat)}${f.display === "in" ? "″" : ""} thick` : ""}</caption>
                  <colgroup><col /><col style={{ width: "3.2em" }} /><col style={{ width: "9.5em" }} /></colgroup>
                  <thead><tr><th>Part</th><th>Qty</th><th>Size</th></tr></thead>
                  <tbody>{mrows.map(rowEl)}</tbody>
                </table>
              );
            })}
          </section>
        );
      })}

      {cl.hardware.length > 0 && <>
        <h3 className="section-h">Hardware</h3>
        <table className="t"><tbody>
          {cl.hardware.map((h) => (
            <tr key={h.item} data-part={h.ids.join(" ")}>
              <td style={{ width: "30%" }}>{h.name}</td><td className="q" style={{ width: "10%" }}>{qtyUnit(h.qty, h.unit)}</td>
              <td className="n">{[...h.notes, h.spec ?? ""].filter(Boolean).join("; ")}</td>
            </tr>
          ))}
        </tbody></table>
      </>}

      {(cl.boards.length > 0 || cl.banding.length > 0) && <>
        <h3 className="section-h">Totals</h3>
        <table className="t"><tbody>
          {cl.boards.map((b) => (
            <tr key={b.material}><td style={{ width: "30%" }}>{b.name}</td><td className="q">{b.pieces} pieces</td><td className="sz">{f.L(b.totalLength, true)} in all</td></tr>
          ))}
          {cl.banding.map((b) => (
            <tr key={b.banding} data-part={b.ids.join(" ")}><td>{b.name}</td><td className="q">{b.ids.length} parts</td><td className="sz">{f.L(b.length, true)}</td></tr>
          ))}
        </tbody></table>
      </>}

      <h3 className="section-h">Shopping list <small>what to buy, after what you own</small></h3>
      <table className="t" data-testid="shopping"><tbody>
        {shopping.sheets.map((s) => (
          <tr key={`${s.material}:${s.stock}`}><td style={{ width: "30%" }}>{s.materialName}</td><td className="q">{s.count} × {stockLabel(s.stock)}</td><td className="n">buy</td></tr>
        ))}
        {shopping.owned.map((s) => (
          <tr key={`own:${s.material}:${s.stock}`}><td>{s.materialName}</td><td className="q">{s.used} × {s.stock}</td><td className="n">use what you own</td></tr>
        ))}
        {shopping.boards.map((b) => (
          <tr key={`b:${b.material}`}><td>{b.name}</td><td className="q">{f.L(b.totalLength, true)}</td>
            <td className="n">{b.suggested.length ? b.suggested.map((s) => `${s.count} × ${f.L(s.length, true)}`).join(", ") : `${b.pieces} pieces`}</td></tr>
        ))}
        {shopping.banding.map((b) => (
          <tr key={`bd:${b.banding}`}><td>{b.name}</td><td className="q">{f.L(b.withWaste, true)}</td><td className="n">with 10% waste</td></tr>
        ))}
        {shopping.hardware.map((h) => (
          <tr key={`hw:${h.item}`}><td>{h.name}</td><td className="q">{qtyUnit(h.qty, h.unit)}</td><td className="n">{h.spec ?? ""}</td></tr>
        ))}
      </tbody></table>
    </div>
  );
}
