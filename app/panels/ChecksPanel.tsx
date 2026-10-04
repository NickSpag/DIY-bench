// Checks tab (section 9.7): every issue, then every design rule with its pass or fail state.
// Clicking an issue selects the parts it names.
import { useWb } from "../store.ts";
import { pickFromEvent } from "../pick.ts";
import { vscodeLink } from "../srcmap.ts";
import type { Src } from "../../core/model/types.ts";

function SrcLink({ src }: { src: Src | undefined }) {
  if (!src) return null;
  const link = vscodeLink(src);
  return link ? <a className="src" href={link} onClick={(e) => e.stopPropagation()}>{src.file.split("/").pop()}:{src.line}</a> : null;
}

export function ChecksPanel() {
  const r = useWb((s) => s.resolved);
  const error = useWb((s) => s.error);
  if (!r) return <div className="empty">{error ? "The model has not evaluated yet." : "Loading…"}</div>;
  const issues = r.issues;
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="pane-pad" data-testid="checks" onClick={(e) => pickFromEvent(e, "checks")}>
      {error && (
        <div className="issue">
          <span className="sev error">model</span>
          <div><div className="msg">{error.message}</div><SrcLink src={error.src} /><div className="det">The views show the last good model.</div></div>
        </div>
      )}
      <h3 className="section-h">Issues <small>{issues.length === 0 ? "none" : `${issues.length}`}</small></h3>
      {issues.length === 0 && <div className="all-good">✓ No errors or warnings in {Object.entries(r.config).map(([k, v]) => `${k}=${v}`).join(", ") || "this configuration"}.</div>}
      {sorted.map((i, k) => (
        <div className="issue" key={k} {...(i.parts && i.parts.length ? { "data-part": i.parts.join(" ") } : {})}>
          <span className={`sev ${i.severity}`}>{i.severity}</span>
          <div>
            <div className="msg">{i.message}</div>
            <div className="det">{i.code}{i.phases && i.phases.length ? ` · ${i.phases.join(", ")}` : ""}</div>
            <SrcLink src={i.src ?? undefined} />
          </div>
        </div>
      ))}
      <h3 className="section-h">Design rules <small>{r.checks.filter((c) => c.pass).length} of {r.checks.length} pass</small></h3>
      {r.checks.map((c) => (
        <div className="issue" key={c.id}>
          <span className={`sev ${c.pass ? "pass" : c.severity}`}>{c.pass ? "pass" : c.severity}</span>
          <div>
            <div className="msg">{c.label}</div>
            {c.detail && <div className="det">{c.detail}</div>}
            <SrcLink src={c.src} />
          </div>
        </div>
      ))}
    </div>
  );
}
