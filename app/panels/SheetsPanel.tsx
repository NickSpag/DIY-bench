// Sheets tab (section 9.6): the purchase summary first, then each layout as SVG. Clicking a
// placement selects its part; a strip member selects that member.
import { useEffect, useMemo, useRef } from "react";
import { useWb } from "../store.ts";
import { derive } from "../derive.ts";
import { pickFromEvent, revealSelected } from "../pick.ts";
import { boardSvg, sheetSvg, stockLabel } from "../../core/sheet-svg.ts";
import { defaultKerf } from "../../core/parts.ts";
import { useFmt } from "../fmt.ts";

export function SheetsPanel() {
  const r = useWb((s) => s.resolved);
  const selected = useWb((s) => s.selected);
  const f = useFmt();
  const root = useRef<HTMLDivElement>(null);
  const nestings = r ? derive(r).nestings : [];
  const svgs = useMemo(() => nestings.map((n) => sheetSvg(n)), [nestings]);
  const boards = r ? derive(r).shopping.boards.filter((b) => b.layout.length) : [];
  const boardSvgs = useMemo(() => (r ? boards.map((b) => {
    const m = r.materials[b.material];
    return boardSvg(b.name, r.project.units, b.layout, (m.type === "board" ? m.kerf : undefined) ?? defaultKerf(r.project.units));
  }) : []), [boards, r]);
  useEffect(() => {
    if (useWb.getState().selectSource !== "sheets") revealSelected(root.current, selected);
  }, [selected]);
  if (!r) return <div className="empty">Loading…</div>;
  const { shopping } = derive(r);
  const buy = shopping.sheets.map((s) => `${s.count} × ${stockLabel(s.stock)} ${s.materialName}`);
  const own = shopping.owned.map((s) => `your ${s.stock.replace(/^owned-/, "").replace("x", " × ")} ${s.materialName}`);
  const phaseNo = (id: string) => r.phases.findIndex((p) => p.id === id) + 1;
  return (
    <div className="pane-pad" ref={root} onClick={(e) => pickFromEvent(e, "sheets")} data-testid="sheets">
      <div className="sheets-sum">
        {buy.length > 0 && <div><b>Buy:</b> {buy.join("; ")}</div>}
        {own.length > 0 && <div><b>Use:</b> {own.join("; ")}</div>}
        {boards.map((b) => {
          const buyB = b.layout.filter((bd) => !bd.owned).map((bd) => bd.length);
          const ownB = b.layout.filter((bd) => bd.owned).map((bd) => bd.length);
          const m = r.materials[b.material];
          const spare = [...(m.type === "board" ? m.owned ?? [] : [])];
          for (const l of ownB) spare.splice(spare.indexOf(l), 1);
          const lens = (ls: number[]) => ls.map((l) => f.L(l, true)).join(", ");
          return <div key={`sum:${b.material}`}><b>{b.name}:</b> {[
            ownB.length ? `use your ${lens(ownB)}` : "", buyB.length ? `buy ${[...new Set(buyB)].map((l) => `${buyB.filter((x) => x === l).length} × ${f.L(l, true)}`).join(", ")}` : "",
            spare.length ? `spare: your ${lens(spare)}` : ""].filter(Boolean).join("; ")}</div>;
        })}
        {buy.length === 0 && own.length === 0 && boards.length === 0 && <div>No sheet goods or boards.</div>}
      </div>
      {nestings.map((n, i) => (
        <section className="nesting" key={`${n.phase}:${n.material}`}>
          <div className="nesting-h">
            <span className="t">Phase {phaseNo(n.phase)} · {n.materialName}</span>
            <span className="m">{n.sheets.length} sheet{n.sheets.length === 1 ? "" : "s"} · kerf {n.kerf}{n.finished ? "" : " · unfinished (hatched)"}</span>
          </div>
          {n.unplaced.length > 0 && (
            <div className="unplaced">Could not place: {n.unplaced.map((u) => `${u.id} (${u.reason})`).join(", ")}</div>
          )}
          <div dangerouslySetInnerHTML={{ __html: svgs[i] }} />
        </section>
      ))}
      {boards.map((b, i) => {
        const own = b.layout.filter((bd) => bd.owned).length, buyN = b.layout.length - own;
        return (
          <section className="nesting" key={`board:${b.material}`} data-testid="board-layout">
            <div className="nesting-h">
              <span className="t">{b.name}</span>
              <span className="m">{[own ? `${own} of your boards` : "", buyN ? `${buyN} to buy` : ""].filter(Boolean).join(" · ")}</span>
            </div>
            <div dangerouslySetInnerHTML={{ __html: boardSvgs[i] }} />
          </section>
        );
      })}
    </div>
  );
}
