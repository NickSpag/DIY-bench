// The top bar (section 9.2): project, option controls, phase and step, display unit, compare,
// theme and the issue counter. It wraps onto two lines in a narrow pane.
import { useWb, type SideTab, type ThemePref } from "../store.ts";
import { derive } from "../derive.ts";
import { neighbourStep } from "../../core/steps.ts";
import type { OptionDef } from "../../core/model/types.ts";

export function showSide(tab: SideTab): void {
  useWb.setState({ sideTab: tab, paneTab: tab });
}

export function stepBy(dir: -1 | 1): void {
  const s = useWb.getState();
  if (!s.resolved) return;
  const next = neighbourStep(derive(s.resolved).steps, s.phase, s.step, dir);
  if (next) s.setPhase(next.phase, next.step);
}

function Seg<T extends string>({ value, options, onChange, label, testid }: {
  value: T; options: { value: T; text: string; title?: string }[]; onChange: (v: T) => void; label: string; testid?: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label} data-testid={testid}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>{o.text}</button>
      ))}
    </div>
  );
}

const THEME_NEXT: Record<ThemePref, ThemePref> = { auto: "light", light: "dark", dark: "auto" };
const THEME_ICON: Record<ThemePref, string> = { auto: "◐", light: "☀", dark: "☾" };

export function TopBar() {
  const r = useWb((s) => s.resolved);
  const project = useWb((s) => s.project);
  const projects = useWb((s) => s.projects);
  const projectId = useWb((s) => s.projectId);
  const config = useWb((s) => s.config);
  const phase = useWb((s) => s.phase);
  const step = useWb((s) => s.step);
  const display = useWb((s) => s.display);
  const theme = useWb((s) => s.theme);
  const compare = useWb((s) => s.compare);
  const set = useWb((s) => s.set);
  const setConfig = useWb((s) => s.setConfig);
  const setPhase = useWb((s) => s.setPhase);

  const options = project ? (Object.entries(project.options) as [string, OptionDef][]) : [];
  const errors = r ? r.issues.filter((i) => i.severity === "error").length : 0;
  const warnings = r ? r.issues.filter((i) => i.severity === "warning").length : 0;
  const phaseSteps = r ? derive(r).steps.find((g) => g.phase.id === phase)?.steps ?? [] : [];
  const stepIdx = step ? phaseSteps.findIndex((s) => s.id === step) : -1;
  const stepTitle = stepIdx >= 0 ? phaseSteps[stepIdx].title : "";

  return (
    <header className="topbar" data-testid="topbar">
      <div className="brand">
        <span className="mark">DIY<b>·</b>bench</span>
      </div>
      <div className="tb-group">
        {projects.length > 1 ? (
          <select className="ctl" aria-label="Project" value={projectId} onChange={(e) => set({ projectId: e.target.value, config: {}, selected: [], step: null, phase: "", drawingView: "" })}>
            {projects.map((p) => <option key={p} value={p}>{p === r?.project.id ? r.project.title : p}</option>)}
          </select>
        ) : (
          <span className="tb-label" style={{ color: "var(--ink)", letterSpacing: "0.06em" }} title={projectId}>{r?.project.title ?? projectId}</span>
        )}
      </div>
      {options.length > 0 && <span className="tb-sep" />}
      {options.map(([key, o]) => (
        <div className="tb-group" key={key}>
          <span className="tb-label" title={o.label}>{o.label}</span>
          <Seg
            label={o.label}
            testid={`opt-${key}`}
            value={config[key] ?? o.default}
            options={Object.entries(o.choices).map(([v, title]) => ({ value: v, text: v, title }))}
            onChange={(v) => setConfig(key, v)}
          />
          <button
            type="button" className="btn icon" aria-pressed={compare !== null} data-testid="compare-toggle"
            title={compare ? "Stop comparing" : "Compare with another choice of this option"}
            onClick={() => {
              if (compare) set({ compare: null });
              else {
                const other = Object.keys(o.choices).find((c) => c !== (config[key] ?? o.default));
                if (other !== undefined) set({ compare: { ...config, [key]: other } });
              }
            }}
          >⇄</button>
        </div>
      ))}
      <span className="tb-sep" />
      <div className="tb-group">
        <span className="tb-label">Phase</span>
        <Seg
          label="Phase"
          testid="phase"
          value={phase}
          options={(r?.phases ?? []).map((p, i) => ({ value: p.id, text: `${i + 1}`, title: `Phase ${i + 1} · ${p.title}${p.summary ? ` — ${p.summary}` : ""}` }))}
          onChange={(v) => setPhase(v, null)}
        />
        <div className="stepper" data-testid="stepper">
          <button type="button" aria-label="Previous step" title="Previous step  [" onClick={() => stepBy(-1)}>‹</button>
          <span
            className="lbl" role="button" tabIndex={0} data-testid="step-label"
            title={step ? `${stepTitle} — click to show the whole phase` : "The whole phase; ‹ › walk its steps"}
            onClick={() => useWb.getState().setStep(null)}
            onKeyDown={(e) => { if (e.key === "Enter") useWb.getState().setStep(null); }}
          >
            {stepIdx >= 0 ? `step ${stepIdx + 1}/${phaseSteps.length}` : "all steps"}
          </span>
          <button type="button" aria-label="Next step" title="Next step  ]" onClick={() => stepBy(1)}>›</button>
        </div>
        {stepIdx >= 0 && <span className="muted" style={{ fontSize: "0.8rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{stepTitle}</span>}
        {stepIdx >= 0 && (
          <button type="button" className="step-clear" data-testid="step-clear" aria-label="Show the whole phase" title="Show the whole phase  Esc"
            onClick={() => useWb.getState().setStep(null)}>✕</button>
        )}
      </div>
      <span className="tb-spacer" />
      <div className="tb-group">
        <Seg label="Display units" testid="units" value={display} options={[{ value: "in", text: "in" }, { value: "mm", text: "mm" }]} onChange={(v) => set({ display: v })} />
        <button type="button" className="btn icon" title={`Theme: ${theme} (click for ${THEME_NEXT[theme]})`} aria-label="Theme" onClick={() => set({ theme: THEME_NEXT[theme] })}>{THEME_ICON[theme]}</button>
        <button type="button" className="issues-btn" data-testid="issues" title="Checks and issues" onClick={() => showSide("checks")}>
          <span className={errors ? "e" : "zero"}>{errors} ✕</span>
          <span className={warnings ? "w" : "zero"}>{warnings} ⚠</span>
        </button>
        <button type="button" className="btn icon" title="Keyboard shortcuts  ?" aria-label="Keyboard shortcuts" onClick={() => set({ help: true })}>?</button>
      </div>
    </header>
  );
}
