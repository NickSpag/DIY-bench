// Entry point. The store is imported first and the loader second (section 9.9): the store
// lives for the whole page, the loader re-runs on every project edit. errors.ts comes before
// both; index.html also loads it on its own, so it runs even when this file's imports fail.
import { reactRootOptions } from "./errors.ts";
import "./theme.css";
import { useWb, type SideTab } from "./store.ts";
import { readUrl } from "./url-read.ts";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { installTheme } from "./theme.ts";
import { RenderView, renderSelection, renderTarget } from "./render.tsx";
import { CrashBoundary } from "./components/CrashBoundary.tsx";

// Counts full page loads in this tab. HMR never re-runs this module, so it stays 1 across edits.
let count = 1;
try {
  count = Number(sessionStorage.getItem("wb-load-count") ?? "0") + 1;
  sessionStorage.setItem("wb-load-count", String(count));
} catch {
  // storage blocked: count this page only
}
window.__wbLoadCount = count;

const u = readUrl();
const SIDE: SideTab[] = ["cutlist", "sheets", "steps", "parts", "checks", "notes"];
useWb.setState({
  ...(u.project ? { projectId: u.project } : {}),
  config: u.config,
  ...(u.phase ? { phase: u.phase } : {}),
  ...(u.step ? { step: u.step } : {}),
  ...(u.view ? { drawingView: u.view } : {}),
  ...(u.tab && (SIDE as string[]).includes(u.tab) ? { sideTab: u.tab as SideTab } : {}),
  ...(renderTarget ? { selected: renderSelection(), selectSource: "agent" as const } : {}),
});

// These install themselves when imported, after the store holds the URL's state, and accept
// their own hot updates. A render page (?render=…, for `wb render`) posts no state, keeps its
// URL and ignores `wb show`, so it never disturbs the user's own viewer.
await import("./loader.ts");
await import("./highlight.ts");
if (!renderTarget) {
  await import("./sync.ts");
  await import("./url.ts");
  await import("./control.ts");
}
installTheme();

// A render page that crashes tells `wb render` at once, rather than leaving it to time out.
const onRenderCrash = (text: string) => {
  if (renderTarget) window.__wbRender = { target: renderTarget, ready: false, error: text };
};
createRoot(document.getElementById("root") as HTMLElement, reactRootOptions).render(
  <CrashBoundary onCrash={onRenderCrash}>{renderTarget ? <RenderView target={renderTarget} /> : <App />}</CrashBoundary>,
);
