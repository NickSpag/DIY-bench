import { createRequire } from "node:module"; const require = createRequire(import.meta.url);
const OC = await (await import("replicad-opencascadejs")).default({ locateFile: () => require.resolve("replicad-opencascadejs/wasm") });
const r = await import("replicad"); r.setOC(OC);
const t1 = performance.now();
for (const [side, x] of [["left", 28], ["right", 51.25]]) {
  let p = r.makeBox([x, 0, 0], [x + 0.75, 23.25, 84]);
  const inner = side === "left" ? x + 0.5 : x;
  const cutters = [r.makeBox([inner, 0, 69.25], [inner + 0.25, 23.25, 70])];
  for (const y of [2, 21.25]) for (let i = 0; i < 28; i++) cutters.push(r.makeCylinder(0.0984, 0.75, [side === "left" ? x + 0.375 : x - 0.375, y, 27 + i * 1.5], [1, 0, 0]));
  p = p.cut(r.makeCompound(cutters));
}
console.log(`replicad single compound cut per partition: ${(performance.now() - t1).toFixed(0)} ms`);
