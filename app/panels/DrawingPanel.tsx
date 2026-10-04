// The drawing panel (section 9.4): one tab per declared view, drawn by core/drawings at the
// phase or step on screen. Wheel zooms about the pointer, drag pans, double-click fits; a click
// selects whatever carries data-part (a dimension selects both parts it measures).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWb } from "../store.ts";
import { pickFromEvent } from "../pick.ts";
import { drawView, lookAxis } from "../../core/drawings/index.ts";
import type { View } from "../../core/model/types.ts";
import { download } from "./CutListPanel.tsx";

type Zoom = { k: number; cx: number; cy: number };

/** The 3D section that matches a section or plan view: same axis and plane, keeping the side behind it. */
export function sectionOfView(v: View): { axis: "x" | "y" | "z"; at: number; flip: boolean } | null {
  if (v.kind === "elevation" || v.cut === undefined) return null;
  return { axis: lookAxis(v.look), at: v.cut, flip: v.look[0] === "+" };
}

function applySync(v: View | undefined): void {
  const s = useWb.getState();
  if (!v || !s.sectionSync) return;
  const sec = sectionOfView(v);
  if (sec) {
    const cur = s.section;
    if (!cur.enabled || cur.axis !== sec.axis || cur.at !== sec.at || cur.flip !== sec.flip) s.set({ section: { ...sec, enabled: true } });
  } else if (s.section.enabled) {
    s.set({ section: { ...s.section, enabled: false } });
  }
}

export function DrawingPanel() {
  const r = useWb((s) => s.resolved);
  const phase = useWb((s) => s.phase);
  const step = useWb((s) => s.step);
  const display = useWb((s) => s.display);
  const viewId = useWb((s) => s.drawingView);
  const hiddenOverride = useWb((s) => s.hiddenLines);
  const sectionSync = useWb((s) => s.sectionSync);
  const set = useWb((s) => s.set);
  const wrap = useRef<HTMLDivElement>(null);
  const zooms = useRef(new Map<string, Zoom>());
  const drag = useRef<{ x: number; y: number; c: Zoom; moved: boolean; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const justDragged = useRef(false);
  const [copied, setCopied] = useState(false);

  const view = r?.views.find((v) => v.id === viewId) ?? r?.views[0];
  const svg = useMemo(() => {
    if (!r || !view) return "";
    try {
      return drawView(r, view.id, { phase, step, display, ...(hiddenOverride !== null ? { hiddenLines: hiddenOverride } : {}) });
    } catch (e) {
      return `<div class="empty pane-pad">Could not draw ${view.id}: ${(e as Error).message}</div>`;
    }
  }, [r, view, phase, step, display, hiddenOverride]);
  const base = useMemo(() => {
    const m = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(svg);
    return m ? [+m[1], +m[2], +m[3], +m[4]] : [0, 0, 100, 100];
  }, [svg]);

  const svgEl = () => wrap.current?.querySelector("svg") ?? null;
  const applyZoom = () => {
    const el = svgEl();
    if (!el || !view) return;
    const z = zooms.current.get(view.id);
    const [x, y, w, h] = base;
    if (!z) el.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    else el.setAttribute("viewBox", `${z.cx - w / (2 * z.k)} ${z.cy - h / (2 * z.k)} ${w / z.k} ${h / z.k}`);
  };
  useLayoutEffect(applyZoom);

  useEffect(() => applySync(view), [view, sectionSync]);

  const current = (): Zoom => {
    const [x, y, w, h] = base;
    return zooms.current.get(view?.id ?? "") ?? { k: 1, cx: x + w / 2, cy: y + h / 2 };
  };
  const toUser = (clientX: number, clientY: number) => {
    const el = svgEl();
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y, perPx: 1 / m.a };
  };

  // Wheel zoom about the pointer (a non-passive listener, so the page does not scroll).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!view) return;
      e.preventDefault();
      const p = toUser(e.clientX, e.clientY);
      if (!p) return;
      const c = current();
      const k = Math.min(40, Math.max(0.5, c.k * Math.exp(-e.deltaY * 0.005)));
      const f = c.k / k;
      zooms.current.set(view.id, { k, cx: p.x - (p.x - c.cx) * f, cy: p.y - (p.y - c.cy) * f });
      applyZoom();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  if (!r || !view) return <div className="empty pane-pad">{r ? "This project declares no drawing views." : "Loading…"}</div>;
  const hidden = hiddenOverride ?? view.hiddenLines ?? false;
  const canSync = sectionOfView(view) !== null;
  const phaseNo = r.phases.findIndex((p) => p.id === phase) + 1;
  const stepTitle = step ? r.steps.find((s) => s.id === step)?.title : null;

  return (
    <>
      <div className="pane-head">
        <div className="tabs" role="tablist" aria-label="Drawing views">
          {r.views.map((v) => (
            <button key={v.id} type="button" role="tab" className="tab" data-view={v.id} aria-selected={v.id === view.id} title={v.title}
              onClick={() => set({ drawingView: v.id })}>{v.title.split(" · ")[0]}</button>
          ))}
        </div>
      </div>
      <div className="pane-body" style={{ overflow: "hidden" }}>
        <div
          ref={wrap}
          className={`drawing-wrap${dragging ? " dragging" : ""}`}
          data-testid="drawing"
          dangerouslySetInnerHTML={{ __html: svg }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            drag.current = { x: e.clientX, y: e.clientY, c: current(), moved: false, id: e.pointerId };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) < 4) return;
            if (!d.moved) {
              d.moved = true;
              setDragging(true);
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }
            const p = toUser(e.clientX, e.clientY);
            if (!p) return;
            zooms.current.set(view.id, { k: d.c.k, cx: d.c.cx - dx * p.perPx, cy: d.c.cy - dy * p.perPx });
            applyZoom();
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = null;
            if (d?.moved) {
              justDragged.current = true;
              setDragging(false);
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
          }}
          onClick={(e) => {
            if (justDragged.current) {
              justDragged.current = false;
              return;
            }
            if (!pickFromEvent(e, "drawing") && !e.shiftKey) useWb.getState().clearSelection();
          }}
          onDoubleClick={() => {
            zooms.current.delete(view.id);
            applyZoom();
          }}
        />
      </div>
      <div className="drawing-foot">
        <span className="cap" data-testid="drawing-caption">
          {view.caption ?? view.title}
          <span className="faint"> · phase {phaseNo}{stepTitle ? ` · ${stepTitle}` : ""}</span>
        </span>
        <div className="drawing-tools">
          <button type="button" className="btn" aria-pressed={hidden} title="Show hidden edges dashed (for this session)"
            onClick={() => set({ hiddenLines: !hidden })}>Hidden lines</button>
          {canSync && (
            <button type="button" className="btn" aria-pressed={sectionSync} data-testid="section-sync"
              title="Cut the 3D view where this drawing is cut"
              onClick={() => set({ sectionSync: !sectionSync })}>⛓ 3D cut</button>
          )}
          <button type="button" className="btn" title="Fit the drawing (double-click)" onClick={() => {
            zooms.current.delete(view.id);
            applyZoom();
          }}>Fit</button>
          <button type="button" className="btn" onClick={async () => {
            try {
              await navigator.clipboard.writeText(svg);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            } catch {
              download(`${r.project.id}.${view.id}.${phase}.svg`, svg, "image/svg+xml");
            }
          }}>{copied ? "Copied" : "Copy SVG"}</button>
          <button type="button" className="btn" onClick={() => download(`${r.project.id}.${view.id}.${phase}.svg`, svg, "image/svg+xml")}>Download SVG</button>
        </div>
      </div>
    </>
  );
}
