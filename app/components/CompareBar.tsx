// Compare mode (D10, M7): the model as it is on screen against another choice of options.
// It summarises what would change — parts, cut-list rows and sheet purchases — and lists the
// changes; clicking one selects the part everywhere.
import { useMemo, useState } from "react";
import { useWb } from "../store.ts";
import { derive } from "../derive.ts";
import { pickFromEvent } from "../pick.ts";
import { evaluate, configKey } from "../../core/evaluate.ts";
import { changeText, diff, diffDoc, type Diff } from "../../core/diff.ts";
import type { OptionDef } from "../../core/model/types.ts";
import { fmtLength } from "../../core/units.ts";

export function CompareBar() {
  const compare = useWb((s) => s.compare);
  const project = useWb((s) => s.project);
  const r = useWb((s) => s.resolved);
  const config = useWb((s) => s.config);
  const set = useWb((s) => s.set);
  const [open, setOpen] = useState(false);

  const result = useMemo((): { d: Diff } | { error: string } | null => {
    if (!compare || !project || !r) return null;
    try {
      return { d: diff(diffDoc(r, derive(r).nestings), diffDoc(evaluate(project, compare))) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [compare, project, r]);

  if (!compare || !project || !r || !result) return null;
  const options = Object.entries(project.options) as [string, OptionDef][];
  const label = (k: string, v: string) => (project.options as Record<string, OptionDef>)[k]?.choices[v] ?? `${k}=${v}`;
  const differing = options.filter(([k]) => compare[k] !== config[k]);
  const units = r.project.units;
  const L = (n: number) => fmtLength(n, { units });

  let summary = "";
  let changedIds: string[] = [];
  if ("d" in result) {
    const d = result.d;
    changedIds = [...new Set([...d.parts.added, ...d.parts.changed.map((c) => c.id)])].filter((id) => r.part(id));
    const nParts = new Set([...d.parts.added, ...d.parts.removed, ...d.parts.changed.map((c) => c.id)]).size;
    const nRows = new Set([...d.cutlist.added.map((x) => x.key), ...d.cutlist.removed.map((x) => x.key), ...d.cutlist.changed.map((c) => c.key)]).size;
    summary = `${nParts} part${nParts === 1 ? "" : "s"} change · ${nRows} cut-list row${nRows === 1 ? "" : "s"} · ${d.sheets.same ? "same sheet purchases" : "different sheet purchases"}`;
  }

  return (
    <div data-testid="compare-bar">
      <div className="compare-bar">
        <span className="tag">Compare</span>
        <span>
          {differing.length === 0 ? "the same options" : differing.map(([k]) => `${label(k, config[k])} → ${label(k, compare[k])}`).join("; ")}
        </span>
        {options.map(([k, o]) => Object.keys(o.choices).length > 2 && (
          <select key={k} className="ctl" aria-label={`Compare ${o.label} with`} value={compare[k]} onChange={(e) => set({ compare: { ...compare, [k]: e.target.value } })}>
            {Object.entries(o.choices).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        ))}
        <span className="muted" data-testid="compare-summary">{"error" in result ? `the other choice fails: ${result.error}` : summary}</span>
        <span className="tb-spacer" />
        <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide changes" : "Show changes"}</button>
        <button type="button" className="btn" disabled={changedIds.length === 0} onClick={() => useWb.getState().select(changedIds, { source: "compare" })}>Select changed</button>
        <button type="button" className="btn" title={`Switch to ${configKey(compare)}`} onClick={() => set({ config: { ...compare }, compare: { ...config } })}>Switch</button>
        <button type="button" className="btn icon" aria-label="Stop comparing" onClick={() => set({ compare: null })}>✕</button>
      </div>
      {open && "d" in result && (
        <div className="pane-pad" style={{ background: "var(--sheet)", borderBottom: "1px solid var(--rule)", maxHeight: "34vh", overflow: "auto", padding: "8px 14px" }}
          onClick={(e) => pickFromEvent(e, "compare")}>
          <div className="diff-list">
            {result.d.parts.added.map((id) => <div key={`a${id}`} className="diff-row" data-part={id}><span className="f">{id}</span><span className="to">added</span></div>)}
            {result.d.parts.removed.map((id) => <div key={`r${id}`} className="diff-row"><span className="f">{id}</span><span className="from">removed</span></div>)}
            {result.d.parts.changed.map((c, i) => (
              <div key={`c${i}`} className="diff-row" data-part={c.id}><span className="f">{c.id}</span><span>{changeText(c, units)}</span></div>
            ))}
            {result.d.cutlist.changed.filter((c) => c.field !== "materialName").map((c, i) => (
              <div key={`l${i}`} className="diff-row" data-part={c.key.replace(/^strip:/, "")}>
                <span className="f">cut list</span>
                <span>{c.key} · {c.field} <span className="from">{typeof c.from === "object" ? `${L((c.from as { l: number }).l)} × ${L((c.from as { w: number }).w)} × ${L((c.from as { t: number }).t)}` : String(c.from)}</span> → <span className="to">{typeof c.to === "object" ? `${L((c.to as { l: number }).l)} × ${L((c.to as { w: number }).w)} × ${L((c.to as { t: number }).t)}` : String(c.to)}</span></span>
              </div>
            ))}
            <div className="diff-row"><span className="f">sheets</span><span>{result.d.sheets.same ? "the same purchases" : "purchases change — see the Sheets tab after switching"}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
