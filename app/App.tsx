// The layout (section 9.1): top bar, error bar, then three panes (3D, drawing, side tabs) that
// drop to two panes under 1100 px and one tabbed pane under 700 px, for a VS Code editor half.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useWb, type PaneTab, type SideTab } from "./store.ts";
import { TopBar, showSide, stepBy } from "./components/TopBar.tsx";
import { ErrorBar } from "./components/ErrorBar.tsx";
import { CompareBar } from "./components/CompareBar.tsx";
import { Splitter } from "./components/Splitter.tsx";
import { HelpCard } from "./components/HelpCard.tsx";
import { CutListPanel } from "./panels/CutListPanel.tsx";
import { SheetsPanel } from "./panels/SheetsPanel.tsx";
import { StepsPanel } from "./panels/StepsPanel.tsx";
import { PartsPanel } from "./panels/PartsPanel.tsx";
import { ChecksPanel } from "./panels/ChecksPanel.tsx";
import { NotesPanel } from "./panels/NotesPanel.tsx";
import { DrawingPanel } from "./panels/DrawingPanel.tsx";
import { Viewport3D, viewportApi } from "./panels/Viewport3D.tsx";

const SIDE_TABS: { id: SideTab; label: string }[] = [
  { id: "cutlist", label: "Cut list" }, { id: "sheets", label: "Sheets" }, { id: "steps", label: "Steps" },
  { id: "parts", label: "Parts" }, { id: "checks", label: "Checks" }, { id: "notes", label: "Notes" },
];

type Mode = 1 | 2 | 3;
const modeFor = (w: number): Mode => (w >= 1100 ? 3 : w >= 700 ? 2 : 1);

function readSizes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem("wb-panes") ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function SidePanel({ tab }: { tab: SideTab }): ReactNode {
  switch (tab) {
    case "cutlist": return <CutListPanel />;
    case "sheets": return <SheetsPanel />;
    case "steps": return <StepsPanel />;
    case "parts": return <PartsPanel />;
    case "checks": return <ChecksPanel />;
    case "notes": return <NotesPanel />;
  }
}

function TabButton({ id, label, active, onClick, count, bad }: { id: string; label: string; active: boolean; onClick: () => void; count?: number; bad?: boolean }) {
  return (
    <button type="button" role="tab" className="tab" aria-selected={active} data-tab={id} onClick={onClick}>
      {label}{count !== undefined && count > 0 && <span className={`count${bad ? " bad" : ""}`}>{count}</span>}
    </button>
  );
}

function useIssueCount(): { n: number; bad: boolean } {
  const r = useWb((s) => s.resolved);
  const err = useWb((s) => s.error);
  if (!r) return { n: err ? 1 : 0, bad: !!err };
  const e = r.issues.filter((i) => i.severity === "error").length + (err ? 1 : 0);
  const w = r.issues.filter((i) => i.severity === "warning").length;
  return { n: e + w, bad: e > 0 };
}

function Workspace() {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>(() => modeFor(window.innerWidth));
  const [sizes, setSizes] = useState<Record<string, number>>(readSizes);
  const sideTab = useWb((s) => s.sideTab);
  const paneTab = useWb((s) => s.paneTab);
  const issues = useIssueCount();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMode(modeFor(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const save = useCallback(() => {
    try {
      localStorage.setItem("wb-panes", JSON.stringify(sizes));
    } catch {
      // storage blocked: sizes last for this page only
    }
  }, [sizes]);
  const fraction = (clientX: number) => {
    const b = (ref.current as HTMLDivElement).getBoundingClientRect();
    return Math.min(0.8, Math.max(0.12, (clientX - b.left) / b.width));
  };

  // What the tab strip shows in the narrower layouts, and which pane is visible.
  const stripTabs: { id: PaneTab; label: string }[] =
    mode === 3 ? [] : [...(mode === 1 ? [{ id: "3d" as PaneTab, label: "3D" }] : []), { id: "drawing", label: "Drawing" }, ...SIDE_TABS];
  let active: PaneTab = paneTab;
  if (mode === 2 && active === "3d") active = "drawing";
  const show3d = mode !== 1 || active === "3d";
  const showDraw = mode === 3 || active === "drawing";
  const showSidePane = mode === 3 || (active !== "3d" && active !== "drawing");
  const sideShown: SideTab = mode === 3 ? sideTab : (active !== "3d" && active !== "drawing" ? active : sideTab);

  const style = {
    "--w3d": `${(sizes.w3d ?? 0.36) * 100}%`,
    "--wside": `${(sizes.wside ?? 0.3) * 100}%`,
    "--w3d2": `${(sizes.w3d2 ?? 0.46) * 100}%`,
  } as React.CSSProperties;

  return (
    <div ref={ref} className={`workspace mode-${mode}`} style={style} data-mode={mode} data-testid="workspace">
      <div className="tabstrip tabs" role="tablist">
        {stripTabs.map((t) => (
          <TabButton key={t.id} id={t.id} label={t.label} active={t.id === active}
            count={t.id === "checks" ? issues.n : undefined} bad={issues.bad}
            onClick={() => useWb.setState(t.id === "3d" || t.id === "drawing" ? { paneTab: t.id } : { paneTab: t.id, sideTab: t.id })} />
        ))}
      </div>
      <section className="pane pane-3d" data-off={!show3d} aria-label="3D view">
        <Viewport3D />
      </section>
      <Splitter className="split-1"
        onMove={(x) => setSizes((s) => (mode === 3 ? { ...s, w3d: Math.min(fraction(x), 0.98 - (s.wside ?? 0.3) - 0.15) } : { ...s, w3d2: fraction(x) }))}
        onDone={save} />
      <section className="pane pane-draw" data-off={!showDraw} aria-label="Drawings">
        <DrawingPanel />
      </section>
      <Splitter className="split-2"
        onMove={(x) => setSizes((s) => ({ ...s, wside: Math.min(Math.max(0.15, 1 - fraction(x)), 0.98 - (s.w3d ?? 0.36) - 0.15) }))}
        onDone={save} />
      <section className="pane pane-side" data-off={!showSidePane} aria-label="Side panel">
        {mode === 3 && (
          <div className="pane-head">
            <div className="tabs" role="tablist">
              {SIDE_TABS.map((t) => (
                <TabButton key={t.id} id={t.id} label={t.label} active={t.id === sideTab}
                  count={t.id === "checks" ? issues.n : undefined} bad={issues.bad}
                  onClick={() => showSide(t.id)} />
              ))}
            </div>
          </div>
        )}
        <div className="pane-body" data-side={sideShown}>
          <SidePanel tab={sideShown} />
        </div>
      </section>
    </div>
  );
}

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

function useKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useWb.getState();
      const k = e.key;
      if (k >= "1" && k <= "5") viewportApi.standardView?.(Number(k) as 1 | 2 | 3 | 4 | 5);
      else if (k === "o" || k === "O") s.set({ camera: { mode: s.camera.mode === "perspective" ? "orthographic" : "perspective" } });
      else if (k === "f" || k === "F") viewportApi.frame?.();
      else if (k === "e" || k === "E") s.set({ explode: s.explode > 0 ? 0 : 1 });
      else if (k === "s" || k === "S") s.set({ section: { ...s.section, enabled: !s.section.enabled } });
      else if (k === "[") stepBy(-1);
      else if (k === "]") stepBy(1);
      else if (k === "Escape") {
        if (s.help) s.set({ help: false });
        else s.clearSelection();
      } else if (k === "?") s.set({ help: !s.help });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function App() {
  useKeys();
  const help = useWb((s) => s.help);
  return (
    <div className="app">
      <TopBar />
      <ErrorBar />
      <CompareBar />
      <Workspace />
      {help && <HelpCard />}
    </div>
  );
}
