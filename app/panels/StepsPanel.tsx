// Steps tab (section 9.7): phases with numbered steps, each with its text and part chips.
// Clicking a step shows the build at that step in every view and selects its parts.
import { useEffect, useRef } from "react";
import { useWb } from "../store.ts";
import { derive } from "../derive.ts";
import { useFmt } from "../fmt.ts";
import type { Box } from "../../core/model/types.ts";

export function StepsPanel() {
  const r = useWb((s) => s.resolved);
  const phase = useWb((s) => s.phase);
  const step = useWb((s) => s.step);
  const f = useFmt();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current?.querySelector('.step[aria-current="true"]');
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step]);
  if (!r) return <div className="empty">Loading…</div>;
  const groups = derive(r).steps;
  // Which way a part moves: the axes whose range changed, by the start of the range.
  const moveText = (m: { from?: Box; to: Box }) => {
    if (!m.from) return "";
    const from = m.from;
    const axes = (["x", "y", "z"] as const).filter((a) => from[a][0] !== m.to[a][0] || from[a][1] !== m.to[a][1]);
    return axes.map((a) => `${a} ${f.L(from[a][0], true)} → ${f.L(m.to[a][0], true)}`).join(", ");
  };
  const s = useWb.getState();
  const chip = (id: string) => {
    const p = r.part(id);
    return (
      <span key={id} className="chip" data-part={id} title={p ? `${p.name}${p.where ? ` · ${p.where}` : ""}` : id}
        onClick={(e) => {
          e.stopPropagation();
          s.select([id], { toggle: e.shiftKey, source: "steps" });
        }}>{id}</span>
    );
  };
  return (
    <div className="pane-pad" ref={root} data-testid="steps">
      {groups.map((g, gi) => (
        <section key={g.phase.id}>
          <div className="phase-h" aria-current={g.phase.id === phase && step === null} onClick={() => s.setPhase(g.phase.id, null)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") s.setPhase(g.phase.id, null); }}>
            <span className="t">Phase {gi + 1} · {g.phase.title}</span>
            {g.phase.summary && <span className="s">{g.phase.summary}</span>}
          </div>
          {g.steps.map((st) => (
            <div key={st.id} className="step" data-step={st.id} aria-current={st.id === step} role="button" tabIndex={0}
              onClick={(e) => {
                s.setPhase(g.phase.id, st.id);
                s.select(st.parts, { toggle: e.shiftKey, source: "steps" });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  s.setPhase(g.phase.id, st.id);
                  s.select(st.parts, { source: "steps" });
                }
              }}>
              <span className="n">{st.number}</span>
              <span className="ti">{st.title}</span>
              <div className="tx">{st.text}</div>
              {st.takeOut.length > 0 && <div className="ex"><b>Take out</b>{st.takeOut.map(chip)}</div>}
              {st.moves.length > 0 && (
                <div className="ex"><b>Move</b>{st.moves.map((m) => (
                  <span key={m.id}>{chip(m.id)}<span className="muted">{moveText(m)}</span>{" "}</span>
                ))}</div>
              )}
              {st.parts.length > 0 && <div className="ch">{st.parts.map(chip)}</div>}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
