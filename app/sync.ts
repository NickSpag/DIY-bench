// Posts the agent-relevant part of the store to the dev server (section 9.8), which writes
// .diy-bench/state.json for the hooks. Debounced 150 ms, and only when something the agent
// cares about changed; also every 5 minutes and whenever the page comes back into view, so
// `updatedAt` says the viewer is still open and this page's state wins over a closed one's.
import { useWb, type WbState } from "./store.ts";
import { viewerState } from "../core/viewer.ts";

const DEBOUNCE_MS = 150;
const HEARTBEAT_MS = 5 * 60_000;

function payload(s: WbState) {
  const r = s.resolved;
  if (!r) return null;
  return viewerState(r, {
    phase: s.phase, step: s.step, drawingView: s.drawingView, selected: s.selected, hovered: s.hovered,
    display: s.display, modelError: s.error ? s.error.message : null,
  });
}

function installSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = "";
  const flush = async () => {
    timer = null;
    const st = payload(useWb.getState());
    if (!st) return;
    const { updatedAt: _u, ...rest } = st;
    const key = JSON.stringify(rest);
    if (key === last) return;
    last = key;
    try {
      await fetch("/__wb/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(st) });
    } catch {
      last = ""; // the server is gone; try again on the next change
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, DEBOUNCE_MS);
  };
  schedule();
  const repost = () => {
    last = "";
    schedule();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") repost();
  };
  const beat = setInterval(repost, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", repost);
  const unsub = useWb.subscribe((s, p) => {
    if (s.resolved !== p.resolved || s.phase !== p.phase || s.step !== p.step || s.drawingView !== p.drawingView ||
      s.selected !== p.selected || s.hovered !== p.hovered || s.error !== p.error || s.display !== p.display) schedule();
  });
  return () => {
    unsub();
    clearInterval(beat);
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", repost);
  };
}

const uninstall = installSync();
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => uninstall());
}
