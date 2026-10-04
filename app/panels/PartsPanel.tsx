// Parts tab (section 9.7): every part with a filter box and a link that opens its line in VS Code.
import { useEffect, useRef, useState } from "react";
import { useWb } from "../store.ts";
import { pickFromEvent, revealSelected } from "../pick.ts";
import { fmtPartSize } from "../../core/query.ts";
import { vscodeLink } from "../srcmap.ts";

export function PartsPanel() {
  const r = useWb((s) => s.resolved);
  const display = useWb((s) => s.display);
  const selected = useWb((s) => s.selected);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (useWb.getState().selectSource !== "parts") revealSelected(root.current, selected);
  }, [selected]);
  if (!r) return <div className="empty">Loading…</div>;
  const needle = q.trim().toLowerCase();
  const parts = r.parts.filter((p) => {
    if (!needle) return true;
    const mat = p.kind === "panel" || p.kind === "board" ? p.material : p.kind === "hardware" ? p.item : p.role;
    return [p.id, p.name, p.where ?? "", p.kind, mat, p.phase ?? "", p.kind === "context" ? "" : p.step ?? ""].some((s) => s.toLowerCase().includes(needle));
  });
  return (
    <div className="pane-pad" ref={root} data-testid="parts">
      <div className="toolbar">
        <input type="search" placeholder="Filter parts" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ flex: "1 1 200px", padding: "5px 8px", border: "1px solid var(--rule)", background: "var(--sheet)", fontSize: "0.85rem" }} />
        <span className="faint num" style={{ fontSize: "0.75rem" }}>{parts.length} / {r.parts.length}</span>
      </div>
      <table className="t" onClick={(e) => {
        if ((e.target as Element).closest("a")) return;
        pickFromEvent(e, "parts");
      }}>
        <thead><tr><th>Id</th><th>Name</th><th>Kind</th><th>Material</th><th>Size</th><th>Phase</th><th>Step</th><th>Source</th></tr></thead>
        <tbody>
          {parts.map((p) => {
            const link = vscodeLink(p.src);
            return (
              <tr key={p.id} data-part={p.id}>
                <td className="idc">{p.id}</td>
                <td>{p.name}{p.where && <span className="where"> · {p.where}</span>}</td>
                <td className="n">{p.kind === "context" ? p.role : p.kind}</td>
                <td className="m">{p.kind === "panel" || p.kind === "board" ? p.material : p.kind === "hardware" ? p.item : ""}</td>
                <td className="sz">{fmtPartSize(r, p, display)}</td>
                <td className="m">{p.phase ?? "all"}{p.removedIn ? ` → ${p.removedIn}` : ""}</td>
                <td className="m">{p.kind === "context" ? "" : p.step ?? ""}</td>
                <td className="m">{link ? <a href={link} title={`Open ${p.src?.file}:${p.src?.line}:${p.src?.col} in VS Code`}>:{p.src?.line}</a> : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
