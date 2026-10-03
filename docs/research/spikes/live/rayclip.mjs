import { createServer } from "vite"; import { chromium } from "playwright-core";
const server = await createServer({ root: ".", server: { port: 5198, host: "127.0.0.1" }, logLevel: "error" }); await server.listen();
const b = await chromium.launch({ channel: "chrome", headless: true }); const page = await b.newPage();
await page.goto("http://127.0.0.1:5198/"); await page.waitForFunction(() => window.__spike?.meshes?.size > 0);
const r = await page.evaluate(async () => {
  const THREE = await import("/node_modules/.vite/deps/three.js");
  const s = window.__spike; s.section.constant = -1; // clips every part
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(0, 0), s.ortho);
  const m = s.meshes.get("partition-left"); const v = m.position.clone().project(s.ortho);
  rc.setFromCamera(new THREE.Vector2(v.x, v.y), s.ortho);
  return rc.intersectObjects([...s.meshes.values()], false).map(h => h.object.userData.partId);
});
console.log("raw Raycaster hits with every part clipped:", r);
await b.close(); await server.close();
