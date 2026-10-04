// `wb render`: one panel of the app as a PNG (section 11.1 of the spec). Loads the app with
// ?render=<target> in headless Chrome (playwright-core, channel "chrome", so no browser
// download) and takes a screenshot once the page reports itself ready. Uses the running dev
// server when there is one, else starts a temporary one that leaves .diy-bench/server.json alone.
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Config } from "../core/model/types.ts";
import { ROOT } from "./projects.ts";
import { findServer } from "./server.ts";

export const RENDER_TARGETS_FIXED = ["3d-front", "3d-iso", "3d-top", "sheets", "cutlist"] as const;

export type RenderRequest = {
  project: string; target: string; config: Config;
  phase?: string; step?: string; select?: string[];
  width: number; height: number; out: string;
};
export type RenderResult = { file: string; width: number; height: number };

/** The width and height in a PNG's IHDR chunk. */
export function pngSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  if (b.length < 24 || b.toString("latin1", 1, 4) !== "PNG") throw new Error(`${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

export function renderUrl(base: string, q: RenderRequest): string {
  const p = new URLSearchParams();
  p.set("render", q.target);
  p.set("project", q.project);
  for (const [k, v] of Object.entries(q.config)) p.set(`opt.${k}`, v);
  if (q.phase) p.set("phase", q.phase);
  if (q.step) p.set("step", q.step);
  if (q.select?.length) p.set("select", q.select.join(","));
  return `${base}/?${p.toString().replace(/%2C/g, ",")}`;
}

async function startTemporaryServer(): Promise<{ url: string; close: () => Promise<void> }> {
  process.env.WB_EPHEMERAL = "1";
  const { createServer } = await import("vite");
  const server = await createServer({
    configFile: join(ROOT, "vite.config.ts"),
    // Its own dependency cache, so it never re-optimizes under a dev server the user is running.
    cacheDir: join(ROOT, "node_modules", ".vite-wb"),
    server: { port: 5199, strictPort: false, host: "127.0.0.1" },
    logLevel: "error",
    clearScreen: false,
  });
  await server.listen();
  const addr = server.httpServer?.address();
  const url = addr && typeof addr === "object" ? `http://127.0.0.1:${addr.port}` : (server.resolvedUrls?.local[0] ?? "").replace(/\/$/, "");
  return { url, close: () => server.close() };
}

export async function render(q: RenderRequest): Promise<RenderResult> {
  const running = await findServer();
  const temp = running ? null : await startTemporaryServer();
  const base = running?.url ?? (temp as { url: string }).url;
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: q.width, height: q.height }, deviceScaleFactor: 1 });
    await page.goto(renderUrl(base, q), { waitUntil: "domcontentloaded", timeout: 30_000 });
    const handle = await page.waitForFunction(() => {
      const r = (window as { __wbRender?: { ready: boolean; error?: string } }).__wbRender;
      return r && (r.ready || r.error) ? r : null;
    }, undefined, { timeout: 30_000, polling: 100 });
    const state = (await handle.jsonValue()) as { ready: boolean; error?: string };
    if (state.error) throw new Error(state.error);
    mkdirSync(dirname(q.out), { recursive: true });
    await page.screenshot({ path: q.out, fullPage: q.target === "sheets" || q.target === "cutlist" });
    return { file: q.out, ...pngSize(q.out) };
  } finally {
    await browser.close();
    await temp?.close();
  }
}
