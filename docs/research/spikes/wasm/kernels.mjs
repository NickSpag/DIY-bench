// Spike: browser-capable kernels in Node. Same closet partition: 84 x 23.25 x 0.75 panel,
// one dado, 112 shelf pin holes (both partitions). Measures init, booleans, STEP, mesh, and
// whether part identity survives the boolean (manifold originalID).
import { createRequire } from "node:module"; import fs from "node:fs";
const require = createRequire(import.meta.url);

// ---------- manifold-3d ----------
{
  const t0 = performance.now();
  const Module = (await import("manifold-3d")).default;
  const wasm = await Module(); wasm.setup();
  const { Manifold } = wasm;
  const tInit = performance.now() - t0;
  const t1 = performance.now();
  const ids = {};
  const partitions = [];
  for (const [side, x] of [["left", 28], ["right", 51.25]]) {
    let p = Manifold.cube([0.75, 84, 23.25]).translate([x, 0, 0]).asOriginal();
    ids[p.originalID()] = `partition-${side}`;
    const inner = side === "left" ? x + 0.5 : x;
    p = p.subtract(Manifold.cube([0.25, 0.75, 23.25]).translate([inner, 69.25, 0]));
    const holes = [];
    for (const z of [2, 21.25]) for (let i = 0; i < 28; i++) {
      const hx = side === "left" ? x + 0.375 : x - 0.0;
      holes.push(Manifold.cylinder(0.75, 0.0984, 0.0984, 16).rotate([0, 90, 0]).translate([hx, 27 + i * 1.5, z]));
    }
    p = p.subtract(Manifold.union(holes));
    partitions.push(p);
  }
  const all = Manifold.union(partitions);
  const mesh = all.getMesh();
  const tBuild = performance.now() - t1;
  const runIds = [...new Set(mesh.runOriginalID)];
  console.log(`manifold-3d: wasm ${(fs.statSync(require.resolve("manifold-3d/manifold.wasm")).size / 1024) | 0} KB, init ${tInit.toFixed(0)} ms, build+booleans ${tBuild.toFixed(0)} ms, tris ${mesh.numTri}`);
  console.log(`  triangle runs trace back to originalIDs: ${runIds.map(i => ids[i] ?? `cutter#${i}`).join(", ")}`);
}

// ---------- replicad (OpenCascade wasm) ----------
{
  const t0 = performance.now();
  const opencascade = (await import("replicad-opencascadejs")).default;
  const wasmPath = require.resolve("replicad-opencascadejs/wasm");
  const OC = await opencascade({ locateFile: () => wasmPath });
  const r = await import("replicad"); r.setOC(OC);
  const tInit = performance.now() - t0;
  const t1 = performance.now();
  const shapes = [];
  for (const [side, x] of [["left", 28], ["right", 51.25]]) {
    let p = r.makeBox([x, 0, 0], [x + 0.75, 23.25, 84]);
    const inner = side === "left" ? x + 0.5 : x;
    p = p.cut(r.makeBox([inner, 0, 69.25], [inner + 0.25, 23.25, 70]));
    for (const y of [2, 21.25]) for (let i = 0; i < 28; i++) {
      const hx = side === "left" ? x + 0.375 : x - 0.375;
      p = p.cut(r.makeCylinder(0.0984, 0.75, [hx, y, 27 + i * 1.5], [1, 0, 0]));
    }
    shapes.push({ shape: p, name: `partition-${side}`, color: "#ddb987" });
  }
  const tBuild = performance.now() - t1;
  const t2 = performance.now();
  const blob = r.exportSTEP(shapes, { unit: "inch" });
  const step = Buffer.from(await blob.arrayBuffer()).toString("utf8");
  const tStep = performance.now() - t2;
  const t3 = performance.now();
  const proj = r.drawProjection(shapes[0].shape, "front");
  const tProj = performance.now() - t3;
  console.log(`replicad: wasm ${(fs.statSync(wasmPath).size / 1048576).toFixed(1)} MB, init ${tInit.toFixed(0)} ms, build+booleans ${tBuild.toFixed(0)} ms, STEP ${tStep.toFixed(0)} ms (${(step.length / 1024) | 0} KB), projection ${tProj.toFixed(0)} ms`);
  console.log(`  STEP product names: ${[...step.matchAll(/PRODUCT\('([^']*)'/g)].map(m => m[1]).join(", ")}`);
}
