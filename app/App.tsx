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

// Columns can be collapsed to a thin strip: all three in the three-column layout, the 3D view in the two-column one.
type PaneId = "3d" | "draw" | "side";
type Collapsed = Record<PaneId, boolean>;
const STRIP = "30px";
const PANE_LABEL: Record<PaneId, string> = { "3d": "3D view", draw: "Drawings", side: "Side panel" };

function readCollapsed(): Collapsed {
  try {
    return { "3d": false, draw: false, side: false, ...(JSON.parse(localStorage.getItem("wb-collapsed") ?? "{}") as Partial<Collapsed>) };
  } catch {
    return { "3d": false, draw: false, side: false };
  }
}

/** Grid columns for the current mode and collapsed panes; undefined keeps the stylesheet's. */
function columnsFor(mode: Mode, c: Collapsed): string | undefined {
  if (mode === 3) {
    if (!c["3d"] && !c.draw && !c.side) return undefined;
    const flex: PaneId = !c.draw ? "draw" : !c["3d"] ? "3d" : "side";      // the open pane that takes up the slack
    const col = (id: PaneId, w: string) => (c[id] ? STRIP : id === flex ? "minmax(0, 1fr)" : w);
    const s1 = c["3d"] || c.draw ? "0px" : "6px", s2 = c.draw || c.side ? "0px" : "6px";
    return `${col("3d", "var(--w3d, 38%)")} ${s1} ${col("draw", "minmax(0, 1fr)")} ${s2} ${col("side", "var(--wside, 30%)")}`;
  }
  if (mode === 2 && c["3d"]) return `${STRIP} 0px minmax(0, 1fr)`;
  return undefined;
}

/** The collapse button in an open pane, and the strip that stands in for it when collapsed. */
function PaneToggle({ id, collapsed, can, toggle }: { id: PaneId; collapsed: boolean; can: boolean; toggle: (id: PaneId) => void }) {
  if (!can) return null;
  return collapsed ? (
    <button type="button" className="pane-strip" onClick={() => toggle(id)} title={`Show the ${PANE_LABEL[id].toLowerCase()}`} aria-label={`Show the ${PANE_LABEL[id].toLowerCase()}`}>
      <span aria-hidden="true">{id === "side" ? "‹" : "›"}</span>{PANE_LABEL[id]}
    </button>
  ) : (
    <button type="button" className="pane-collapse" onClick={() => toggle(id)} title={`Collapse the ${PANE_LABEL[id].toLowerCase()}`} aria-label={`Collapse the ${PANE_LABEL[id].toLowerCase()}`}>
      {id === "side" ? "›" : "‹"}
    </button>
  );
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
  const [collapsedAll, setCollapsed] = useState<Collapsed>(readCollapsed);
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

  // Which panes can collapse in this mode, and which are collapsed (at least one stays open).
  const can = (id: PaneId) => mode === 3 || (mode === 2 && id === "3d");
  const collapsed: Collapsed = { "3d": can("3d") && collapsedAll["3d"], draw: can("draw") && collapsedAll.draw, side: can("side") && collapsedAll.side };
  const toggle = (id: PaneId) => setCollapsed((c) => {
    const next = { ...c, [id]: !c[id] };
    if (mode === 3 && next["3d"] && next.draw && next.side) return c;
    try {
      localStorage.setItem("wb-collapsed", JSON.stringify(next));
    } catch {
      // storage blocked: the layout lasts for this page only
    }
    return next;
  });
  const columns = columnsFor(mode, collapsed);

  const style = {
    ...(columns ? { gridTemplateColumns: columns } : {}),
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
      <section className="pane pane-3d" data-off={!show3d} data-collapsed={collapsed["3d"]} aria-label="3D view">
        <PaneToggle id="3d" collapsed={collapsed["3d"]} can={can("3d")} toggle={toggle} />
        <Viewport3D />
      </section>
      <Splitter className="split-1"
        onMove={(x) => setSizes((s) => (mode === 3 ? { ...s, w3d: Math.min(fraction(x), 0.98 - (s.wside ?? 0.3) - 0.15) } : { ...s, w3d2: fraction(x) }))}
        onDone={save} />
      <section className="pane pane-draw" data-off={!showDraw} data-collapsed={collapsed.draw} aria-label="Drawings">
        <PaneToggle id="draw" collapsed={collapsed.draw} can={can("draw")} toggle={toggle} />
        <DrawingPanel />
      </section>
      <Splitter className="split-2"
        onMove={(x) => setSizes((s) => ({ ...s, wside: Math.min(Math.max(0.15, 1 - fraction(x)), 0.98 - (s.w3d ?? 0.36) - 0.15) }))}
        onDone={save} />
      <section className="pane pane-side" data-off={!showSidePane} data-collapsed={collapsed.side} aria-label="Side panel">
        <PaneToggle id="side" collapsed={collapsed.side} can={can("side")} toggle={toggle} />
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
    // Shift-click adds to the selection; stop it from also selecting text in tables and drawings.
    const onDown = (e: MouseEvent) => {
      if (e.shiftKey && (e.target as Element | null)?.closest?.("[data-part]")) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
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
