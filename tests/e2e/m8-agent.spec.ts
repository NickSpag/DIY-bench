// M8 acceptance: `wb show` drives the open viewer through /__wb/control and its acknowledgement,
// `wb render` writes a PNG of one panel, and render pages leave the viewer state alone.
//
// These tests start their own dev server with WB_DIR pointing at a temporary folder, so its
// server.json, state.json and the controls it relays never reach the user's dev server or viewer.
import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ViteDevServer } from "vite";
import { ROOT } from "./helpers.ts";

let server: ViteDevServer | null = null;
let wbDir = "";
let url = "";

// Asynchronous on purpose: the dev server runs in this process and must keep serving while wb runs.
function wb(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(join(ROOT, "wb"), args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, WB_DIR: wbDir } }, (err, stdout, stderr) => {
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout, stderr });
    });
  });
}

async function openViewer(page: Page): Promise<void> {
  await page.goto(`${url}/`);
  await page.waitForFunction(() => !!(window as any).__wb?.store?.getState().resolved && (window as any).__wb.meshes?.size > 0);
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  wbDir = mkdtempSync(join(tmpdir(), "wb-e2e-"));
  process.env.WB_DIR = wbDir; // read by the plugin when the server starts
  const { createServer } = await import("vite");
  server = await createServer({
    configFile: join(ROOT, "vite.config.ts"),
    cacheDir: join(ROOT, "node_modules", ".vite-wb"), // never re-optimizes under the user's server
    server: { port: 5187, strictPort: false, host: "127.0.0.1" },
    logLevel: "error",
    clearScreen: false,
  });
  await server.listen();
  delete process.env.WB_DIR;
  await expect.poll(() => existsSync(join(wbDir, "server.json")), { timeout: 10_000 }).toBe(true);
  url = (JSON.parse(readFileSync(join(wbDir, "server.json"), "utf8")) as { url: string }).url;
  expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
});

test.afterAll(async () => {
  await server?.close();
  rmSync(wbDir, { recursive: true, force: true });
});

test("a render page reports ready, posts no viewer state and does not answer wb show", async ({ page }) => {
  await page.goto(`${url}/?render=front&select=partition-left`);
  await page.waitForFunction(() => (window as any).__wbRender?.ready === true, undefined, { timeout: 20_000 });
  await expect(page.locator(".render-root .drawing-wrap svg")).toBeVisible();
  await page.waitForTimeout(400); // longer than the state debounce
  expect(existsSync(join(wbDir, "state.json"))).toBe(false);
  const r = await wb(["show", "--select", "partition-left", "--project", "closet-built-in", "--json"]);
  expect(r.code).toBe(3);
  expect(JSON.parse(r.stdout)).toEqual({ delivered: false });
});

test("wb show --select partition-left --phase p1 is delivered and the viewer's store matches", async ({ page }) => {
  await openViewer(page);
  await expect.poll(() => existsSync(join(wbDir, "state.json"))).toBe(true);
  const r = await wb(["show", "--select", "partition-left", "--phase", "p1", "--json"]);
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  expect(JSON.parse(r.stdout)).toEqual({ delivered: true });
  const st = await page.evaluate(() => {
    const s = (window as any).__wb.store.getState();
    return { selected: s.selected, phase: s.phase, step: s.step, source: s.selectSource };
  });
  expect(st).toEqual({ selected: ["partition-left"], phase: "p1", step: null, source: "agent" });
  // …and the state the hooks read follows.
  await expect.poll(() => {
    const s = JSON.parse(readFileSync(join(wbDir, "state.json"), "utf8"));
    return `${s.phase} ${s.selected.map((p: { id: string }) => p.id).join(",")}`;
  }).toBe("p1 partition-left");
  expect((await wb(["state"])).stdout).toContain("[diy-bench] selected: partition-left \"Partition\" (left)");

  // A step, a drawing view, a tab and an option in one go.
  const r2 = await wb(["show", "--step", "p2-faces", "--view", "plan", "--tab", "sheets", "--opt", "top=0.75", "--json"]);
  expect(r2.code).toBe(0);
  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).__wb.store.getState();
    return [s.phase, s.step, s.drawingView, s.sideTab, s.resolved.config.top].join(" ");
  })).toBe("p2 p2-faces plan sheets 0.75");
});

test("wb show checks its arguments before sending anything", async () => {
  expect((await wb(["show", "--select", "no-such-part"])).code).toBe(2);
  expect((await wb(["show", "--phase", "p9"])).code).toBe(2);
  expect((await wb(["show"])).code).toBe(2);
});

test("/__wb/control needs the token and a well-formed control", async ({ request }) => {
  const token = (JSON.parse(readFileSync(join(wbDir, "server.json"), "utf8")) as { token: string }).token;
  expect((await request.post(`${url}/__wb/control`, { data: { select: ["partition-left"] } })).status()).toBe(403);
  expect((await request.post(`${url}/__wb/control`, { data: { select: ["partition-left"] }, headers: { "x-wb-token": "0".repeat(32) } })).status()).toBe(403);
  expect((await request.post(`${url}/__wb/control`, { data: { select: "partition-left" }, headers: { "x-wb-token": token } })).status()).toBe(400);
  const ok = await request.post(`${url}/__wb/control`, { data: { tab: "parts" }, headers: { "x-wb-token": token } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ delivered: false }); // no viewer is open in this test
});

test("wb render --view front writes a PNG at least 1200 px wide whose centre is not blank", async ({ page }) => {
  test.setTimeout(60_000);
  const out = join(wbDir, "front.png");
  const r = await wb(["render", "--view", "front", "--out", out, "--json"]);
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  const res = JSON.parse(r.stdout) as { file: string; width: number; height: number };
  expect(res.file).toBe(out);
  expect(res.width).toBeGreaterThanOrEqual(1200);
  // Count the distinct colours in the central 200 × 200 px.
  const png = readFileSync(out).toString("base64");
  const colours = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(img.width / 2 - 100, img.height / 2 - 100, 200, 200).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  }, png);
  expect(colours).toBeGreaterThan(8);
});

test("with the dev server stopped, wb show exits 3", async () => {
  await server?.close();
  server = null;
  const r = await wb(["show", "--select", "partition-left", "--phase", "p1"]);
  expect(r.code).toBe(3);
  expect(r.stderr).toContain("not running");
});
