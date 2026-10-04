// Applies `wb show` to this viewer (section 11.2 of the spec). The dev server relays a Control
// as the custom HMR event `wb:control`; this module applies it to the store and answers
// `wb:ack` with the same id, so the CLI knows a viewer is open and acted on it.
import { useWb, type PaneTab, type SideTab } from "./store.ts";
import { viewportApi } from "./panels/Viewport3D.tsx";
import type { Control, ControlAck } from "../core/control.ts";

const SIDE: SideTab[] = ["cutlist", "sheets", "steps", "parts", "checks", "notes"];

/** Resolves once `ok()` holds for the store, or after `ms`. */
function until(ok: () => boolean, ms = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    if (ok()) return resolve(true);
    const t = setTimeout(() => {
      unsub();
      resolve(ok());
    }, ms);
    const unsub = useWb.subscribe(() => {
      if (ok()) {
        clearTimeout(t);
        unsub();
        resolve(true);
      }
    });
  });
}

const sameConfig = (want: Record<string, string>, have: Record<string, string> | undefined) =>
  !!have && Object.entries(want).every(([k, v]) => have[k] === v);

export async function applyControl(c: Control): Promise<ControlAck> {
  const notes: string[] = [];
  let s = useWb.getState();
  // The project and options first: they re-evaluate, and the rest refers to the new model.
  if ((c.project && c.project !== s.projectId) || (c.config && !sameConfig(c.config, s.config))) {
    const projectId = c.project ?? s.projectId;
    const config = { ...(projectId === s.projectId ? s.config : {}), ...(c.config ?? {}) };
    useWb.setState({ projectId, config, ...(projectId !== s.projectId ? { selected: [], step: null } : {}) });
    const ok = await until(() => {
      const r = useWb.getState().resolved;
      return !!r && r.project.id === projectId && sameConfig(c.config ?? {}, r.config);
    });
    if (!ok) notes.push("the model did not finish loading");
  }
  s = useWb.getState();
  const r = s.resolved;
  if (c.phase !== undefined || c.step !== undefined) {
    const phase = c.phase ?? s.phase;
    if (r && !r.phases.some((p) => p.id === phase)) notes.push(`no phase ${phase}`);
    else if (c.step !== undefined) s.setPhase(phase, c.step);
    else s.setPhase(phase, null);
  }
  if (c.view !== undefined) {
    if (r && !r.views.some((v) => v.id === c.view)) notes.push(`no view ${c.view}`);
    else useWb.setState({ drawingView: c.view });
  }
  if (c.tab !== undefined) {
    if ((SIDE as string[]).includes(c.tab)) useWb.setState({ sideTab: c.tab as SideTab, paneTab: c.tab as PaneTab });
    else useWb.setState({ paneTab: c.tab as PaneTab });
  }
  if (c.select !== undefined) {
    const known = r ? c.select.filter((id) => r.part(id)) : c.select;
    if (known.length < c.select.length) notes.push(`no part ${c.select.filter((id) => !known.includes(id)).join(", ")}`);
    useWb.getState().select(known, { source: "agent" });
  }
  if (c.hover !== undefined) useWb.setState({ hovered: [...new Set(c.hover)], hoverSource: "agent" });
  if (c.frame) requestAnimationFrame(() => requestAnimationFrame(() => viewportApi.frame?.()));
  return { id: c.id, ok: notes.length === 0, ...(notes.length ? { message: notes.join("; ") } : {}) };
}

if (import.meta.hot) {
  const hot = import.meta.hot;
  const onControl = (c: Control) => {
    void applyControl(c).then(
      (ack) => hot.send("wb:ack", ack),
      (e: unknown) => hot.send("wb:ack", { id: c.id, ok: false, message: (e as Error)?.message ?? String(e) } satisfies ControlAck),
    );
  };
  hot.on("wb:control", onControl);
  hot.accept();
  hot.dispose(() => hot.off("wb:control", onControl));
}
