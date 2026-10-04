// Sheets tab (section 9.6): the purchase summary first, then each layout as SVG. Clicking a
// placement selects its part; a strip member selects that member.
import { useEffect, useMemo, useRef } from "react";
import { useWb } from "../store.ts";
import { derive } from "../derive.ts";
import { pickFromEvent, revealSelected } from "../pick.ts";
import { sheetSvg, stockLabel } from "../../core/sheet-svg.ts";

export function SheetsPanel() {
  const r = useWb((s) => s.resolved);
  const selected = useWb((s) => s.selected);
  const root = useRef<HTMLDivElement>(null);
  const nestings = r ? derive(r).nestings : [];
  const svgs = useMemo(() => nestings.map((n) => sheetSvg(n)), [nestings]);
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
        {buy.length === 0 && own.length === 0 && <div>No sheet goods.</div>}
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
    </div>
  );
}
