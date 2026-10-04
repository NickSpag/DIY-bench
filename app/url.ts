// The URL mirrors project, options, phase, step and drawing view (section 9.2), so a reload or
// a bookmark comes back to the same state. Selection and hover stay out of it (D11).
import { useWb, type WbState } from "./store.ts";
export { readUrl, type UrlState } from "./url-read.ts";

export function writeUrl(s: Pick<WbState, "projectId" | "config" | "phase" | "step" | "drawingView">): string {
  const q = new URLSearchParams(location.search);
  for (const k of [...q.keys()]) if (k.startsWith("opt.") || ["project", "phase", "step", "view"].includes(k)) q.delete(k);
  if (s.projectId) q.set("project", s.projectId);
  for (const [k, v] of Object.entries(s.config)) q.set(`opt.${k}`, v);
  if (s.phase) q.set("phase", s.phase);
  if (s.step) q.set("step", s.step);
  if (s.drawingView) q.set("view", s.drawingView);
  const qs = q.toString().replace(/%2C/g, ",");
  return `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`;
}

function installUrlSync(): () => void {
  return useWb.subscribe((s, p) => {
    if (!s.resolved) return; // wait for the first model, so the URL never loses a choice it asked for
    if (s.projectId !== p.projectId || s.config !== p.config || s.phase !== p.phase || s.step !== p.step || s.drawingView !== p.drawingView || s.resolved !== p.resolved) {
      const next = writeUrl(s);
      if (next !== `${location.pathname}${location.search}${location.hash}`) history.replaceState(null, "", next);
    }
  });
}

const uninstall = installUrlSync();
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => uninstall());
}
