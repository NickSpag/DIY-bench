import { createServer } from "vite";
import { chromium } from "playwright-core";
import fs from "node:fs";
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const server = await createServer({ root: ".", server: { port: 5199, host: "127.0.0.1" }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
const errs = []; page.on("pageerror", e => errs.push(String(e)));
await page.goto("http://127.0.0.1:5199/");
await page.waitForFunction(() => window.__spike?.meshes?.size > 0);
ok(await page.evaluate(() => window.__spike.meshes.size) === 6, "6 meshes built from model.ts");

// 1. hover a part in 3D -> its SVG rect and cut-list row highlight
const pt = await page.evaluate(async () => {
  const THREE = await import("/node_modules/.vite/deps/three.js");
  const m = window.__spike.meshes.get("partition-left"); const v = m.position.clone().project(window.__spike.ortho);
  const r = document.querySelector("canvas").getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
});
await page.mouse.move(pt.x, pt.y);
ok(await page.evaluate(() => window.__spike.hovered) === "partition-left", "3D hover picks partition-left");
ok(await page.evaluate(() => document.querySelector('rect[data-part="partition-left"]').classList.contains("hl")), "SVG elevation rect highlighted");
ok(await page.evaluate(() => document.querySelector('tr[data-part="partition-left"]').classList.contains("hl")), "cut-list row highlighted");

// 2. hover a cut-list row -> mesh tinted
await page.hover('tr[data-part="top-shelf-right"]');
ok(await page.evaluate(() => window.__spike.meshes.get("top-shelf-right").material.color.getHex() === 0xffdd00), "cut-list hover tints the 3D mesh");

// 3. section plane: clip everything in front of z = -1 -> picking must ignore clipped geometry
await page.evaluate(() => { window.__spike.section.constant = -1; window.__spike.render(); });
await page.mouse.move(pt.x + 1, pt.y);
ok(await page.evaluate(() => window.__spike.hovered) === null, "pick ignores geometry removed by the section plane");
await page.evaluate(() => { window.__spike.section.constant = 30; window.__spike.render(); });
await page.mouse.move(pt.x, pt.y);
const camBefore = await page.evaluate(() => window.__spike.ortho.position.toArray().join(","));

// 4. the agent edits model.ts -> HMR re-evaluates it; no page reload, camera and hover kept
const src = fs.readFileSync("src/model.ts", "utf8");
const t0 = Date.now();
fs.writeFileSync("src/model.ts", src.replace("partitionHeight: 84", "partitionHeight: 80"));
await page.waitForFunction(() => window.__spike.modelReloads === 1, null, { timeout: 10000 });
const hmrMs = Date.now() - t0;
ok(await page.evaluate(() => window.__spike.loadCount) === 1, "no full page reload (main module evaluated once)");
ok(await page.evaluate(() => window.__spike.meshes.get("partition-left").geometry.parameters.height) === 80, "partition height updated to 80");
ok(await page.evaluate(() => window.__spike.ortho.position.toArray().join(",")) === camBefore, "camera unchanged across reload");
ok(await page.evaluate(() => window.__spike.hovered) === "partition-left", "hover state kept across reload");
console.log("HMR latency write->rebuilt:", hmrMs, "ms");
await page.screenshot({ path: "shot.png" });
fs.writeFileSync("src/model.ts", src);
// 5. syntax error from the agent -> overlay, then recovery
fs.writeFileSync("src/model.ts", src.replace("export const parts", "export const parts = ;//"));
await new Promise(r => setTimeout(r, 1500));
const overlay = await page.evaluate(() => !!document.querySelector("vite-error-overlay"));
console.log("error overlay shown after bad edit:", overlay, "loadCount:", await page.evaluate(() => window.__spike?.loadCount));
fs.writeFileSync("src/model.ts", src);
await new Promise(r => setTimeout(r, 1500));
console.log("after fix: loadCount", await page.evaluate(() => window.__spike?.loadCount), "meshes", await page.evaluate(() => window.__spike?.meshes?.size));
console.log("page errors:", errs);
await browser.close(); await server.close();
