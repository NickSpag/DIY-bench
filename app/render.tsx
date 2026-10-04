// Render mode (`?render=<target>`, section 11.1 `wb render`): one panel, full window, for a
// headless screenshot. The page reports readiness on window.__wbRender, posts no viewer state
// and ignores `wb show`, so a render never disturbs the user's own viewer.
//
// Targets: a drawing view id, 3d-front, 3d-iso, 3d-top, sheets or cutlist.
import { useEffect } from "react";
import { useWb } from "./store.ts";
import { DrawingPanel } from "./panels/DrawingPanel.tsx";
import { Viewport3D, viewportApi } from "./panels/Viewport3D.tsx";
import { SheetsPanel } from "./panels/SheetsPanel.tsx";
import { CutListPanel } from "./panels/CutListPanel.tsx";

declare global {
  interface Window {
    __wbRender?: { target: string; ready: boolean; error?: string };
  }
}

export const RENDER_3D: Record<string, 1 | 2 | 5> = { "3d-front": 1, "3d-top": 2, "3d-iso": 5 };
export const renderTarget: string | null = new URLSearchParams(location.search).get("render");

/** The ids in `?select=a,b`, for highlighting parts in a render. */
export const renderSelection = (): string[] => (new URLSearchParams(location.search).get("select") ?? "").split(",").filter(Boolean);

const frames = (n: number) => new Promise<void>((res) => {
  const step = (k: number) => (k <= 0 ? res() : requestAnimationFrame(() => step(k - 1)));
  step(n);
});

async function settle(target: string): Promise<void> {
  const fonts = Promise.race([document.fonts.ready, new Promise((res) => setTimeout(res, 3000))]);
  await fonts;
  if (target in RENDER_3D) {
    // Wait for the meshes and the camera controls, then put the camera on the standard view.
    for (let i = 0; i < 200 && !((window.__wb?.meshes as Map<string, unknown> | undefined)?.size && viewportApi.standardView); i++) await frames(1);
    viewportApi.standardView?.(RENDER_3D[target], false);
    await frames(6);
  } else {
    await frames(3);
  }
}

export function RenderView({ target }: { target: string }) {
  const r = useWb((s) => s.resolved);
  const error = useWb((s) => s.error);
  const is3d = target in RENDER_3D;
  const isDrawing = !!r && r.views.some((v) => v.id === target);
  const known = is3d || target === "sheets" || target === "cutlist" || isDrawing;

  useEffect(() => {
    window.__wbRender = { target, ready: false };
    if (target === "sheets" || target === "cutlist") document.documentElement.classList.add("render-flow");
    // Straight-on views read best without perspective.
    if (target === "3d-front" || target === "3d-top") useWb.setState({ camera: { mode: "orthographic" } });
  }, [target]);

  useEffect(() => {
    if (error && !r) window.__wbRender = { target, ready: false, error: error.message };
    if (!r) return;
    if (!known) {
      window.__wbRender = { target, ready: false, error: `unknown render target "${target}"; use a drawing view (${r.views.map((v) => v.id).join(", ")}), 3d-front, 3d-iso, 3d-top, sheets or cutlist` };
      return;
    }
    if (isDrawing && useWb.getState().drawingView !== target) useWb.setState({ drawingView: target });
    let live = true;
    void settle(target).then(() => {
      if (live) window.__wbRender = { target, ready: true };
    });
    return () => {
      live = false;
    };
  }, [r, error, target, known, isDrawing]);

  let body = <div className="empty pane-pad">Loading…</div>;
  if (r && is3d) body = <section className="pane pane-3d"><Viewport3D /></section>;
  else if (r && isDrawing) body = <section className="pane pane-draw"><DrawingPanel /></section>;
  else if (r && target === "sheets") body = <section className="pane"><SheetsPanel /></section>;
  else if (r && target === "cutlist") body = <section className="pane"><CutListPanel /></section>;
  return <div className={`render-root render-${is3d ? "3d" : isDrawing ? "drawing" : target}`} data-render={target}>{body}</div>;
}
