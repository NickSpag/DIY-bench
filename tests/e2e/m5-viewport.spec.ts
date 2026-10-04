// M5 acceptance: picking in 3D, cross-highlight into the meshes, picking through a section,
// the camera across a model edit, phase visibility, explode, standard views and orthographic.
import { expect, test, type Page } from "@playwright/test";
import { openApp, patched, restoreAndSettle, setStore, sideTab, storeState, writeProject } from "./helpers.ts";

test.afterEach(async ({ page }) => {
  await restoreAndSettle(page);
});

/** Waits until the camera has stopped moving (two reads 100 ms apart agree). */
async function cameraAtRest(page: Page): Promise<void> {
  let last = "";
  await expect.poll(async () => {
    const now = await page.evaluate(() => {
      const w = (window as any).__wb;
      w.invalidate();
      return w.camera.position.toArray().map((v: number) => v.toFixed(6)).join(",");
    });
    const same = now === last;
    last = now;
    return same;
  }, { intervals: [100], timeout: 5000 }).toBe(true);
}

async function frontView(page: Page): Promise<void> {
  await page.locator('[data-testid="viewport"] canvas').hover({ position: { x: 5, y: 300 } });
  await page.keyboard.press("1");
  await cameraAtRest(page);
}

async function clickPart(page: Page, id: string): Promise<void> {
  const pt = await page.evaluate((pid) => (window as any).__wb.project(pid), id);
  expect(pt).not.toBeNull();
  await page.mouse.click(pt.x, pt.y);
}

test("clicking a part in 3D selects it (orthographic front view, so the ray to its centre has no parallax)", async ({ page }) => {
  await openApp(page, "?phase=p1");
  await page.keyboard.press("o");
  await frontView(page);
  await clickPart(page, "partition-left");
  expect(await storeState(page, "s.selected")).toEqual(["partition-left"]);
  await expect(page.getByTestId("tooltip")).toContainText("Partition");
  await expect(page.getByTestId("tooltip")).toContainText("project.ts:100");
});

test("clicking the Partition row tints both partition meshes with --hl-select", async ({ page }) => {
  await openApp(page);
  await sideTab(page, "cutlist");
  await page.locator('[data-testid="cutlist"] tr[data-row="Partition"]').click();
  const tint = await page.evaluate(() => {
    const w = (window as any).__wb;
    const hl = getComputedStyle(document.documentElement).getPropertyValue("--hl-select").trim().replace("#", "").toLowerCase();
    const em = (id: string) => w.meshes.get(id).material.emissive.getHexString();
    return { hl, left: em("partition-left"), right: em("partition-right"), shelf: em("center-shelf-fixed") };
  });
  expect(tint.left).toBe(tint.hl);
  expect(tint.right).toBe(tint.hl);
  expect(tint.shelf).not.toBe(tint.hl);
});

test("with a section that keeps z < 10, clicking where the hamper face is never selects it", async ({ page }) => {
  await openApp(page, "?phase=p2");
  await setStore(page, { section: { axis: "z", at: 10, enabled: true, flip: false } });
  await frontView(page);
  // The face spans z 23¼ to 23³¹⁄₃₂, entirely on the removed side; an unfiltered raycast still hits it first.
  const pt = await page.evaluate(() => (window as any).__wb.project("hamper-face"));
  const hits = await page.evaluate(({ x, y }) => (window as any).__wb.rayHits(x, y), pt);
  expect(hits[0]).toMatchObject({ id: "hamper-face", kept: false });
  await clickPart(page, "hamper-face");
  const sel = await storeState<string[]>(page, "s.selected");
  expect(sel).not.toContain("hamper-face");
  expect(sel.length).toBe(1); // the click reached the first part on the kept side
  const z1 = await page.evaluate((id) => {
    const r = (window as any).__wb.store.getState().resolved;
    return r.stateAt("p2").parts.find((e: any) => e.part.id === id).box.z[0];
  }, sel[0]);
  expect(z1).toBeLessThan(10);
});

test("a model edit keeps the camera and the selection", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-testid="viewport"] canvas').hover({ position: { x: 5, y: 300 } });
  await page.keyboard.press("5");
  await cameraAtRest(page);
  await setStore(page, { selected: ["drawer-face-2"] });
  const before = await page.evaluate(() => {
    const w = (window as any).__wb;
    return { pos: w.camera.position.toArray(), target: w.controls.getTarget(w.camera.position.clone()).toArray() };
  });
  const loads = await storeState<number>(page, "s.loads");
  writeProject(patched("partitionHeight: 84,", "partitionHeight: 83,"));
  await expect.poll(() => storeState<number>(page, "s.loads")).toBeGreaterThan(loads);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const w = (window as any).__wb;
    return { pos: w.camera.position.toArray(), target: w.controls.getTarget(w.camera.position.clone()).toArray() };
  });
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(after.pos[i] - before.pos[i])).toBeLessThan(1e-9);
    expect(Math.abs(after.target[i] - before.target[i])).toBeLessThan(1e-9);
  }
  expect(await storeState(page, "s.selected")).toEqual(["drawer-face-2"]);
  expect(await page.evaluate(() => (window as any).__wb.meshes.get("partition-left").geometry.parameters.height)).toBe(83);
});

test("phase visibility: p1 has no p2 parts and the third shelf at 55¾; p2 moves it to 59⅝ and drops the other two", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("phase").getByRole("button", { name: "1", exact: true }).click();
  const at = (phase: string) => page.evaluate((ph) => {
    const w = (window as any).__wb;
    const r = w.store.getState().resolved;
    const p2 = r.parts.filter((p: any) => p.phase === "p2").map((p: any) => p.id);
    const visibleP2 = p2.filter((id: string) => w.meshes.get(id)?.visible);
    const bottom = (id: string) => {
      const m = w.meshes.get(id);
      return m ? m.position.y - m.geometry.parameters.height / 2 : null;
    };
    return { phase: w.store.getState().phase, ph, visibleP2, adj1: bottom("center-shelf-adj-1"), adj2: bottom("center-shelf-adj-2"), adj3: bottom("center-shelf-adj-3") };
  }, phase);
  await expect.poll(async () => (await at("p1")).phase).toBe("p1");
  const p1 = await at("p1");
  expect(p1.visibleP2).toEqual([]);
  expect(p1.adj3).toBeCloseTo(55.75, 9);
  await page.getByTestId("phase").getByRole("button", { name: "2", exact: true }).click();
  await expect.poll(async () => (await at("p2")).adj3).toBeCloseTo(59.625, 9);
  const p2 = await at("p2");
  expect(p2.adj1).toBeNull();
  expect(p2.adj2).toBeNull();
});

test("explode at k = 1 moves partition-left by (its centre − the assembly centre)", async ({ page }) => {
  await openApp(page, "?phase=p2");
  await setStore(page, { explode: 1 });
  const check = () => page.evaluate(() => {
    const w = (window as any).__wb;
    const r = w.store.getState().resolved;
    const built = r.stateAt("p2").parts.filter((e: any) => e.part.kind !== "context" && e.box).map((e: any) => e.box);
    const ax = ["x", "y", "z"];
    const lo = ax.map((a) => Math.min(...built.map((b: any) => b[a][0]))), hi = ax.map((a) => Math.max(...built.map((b: any) => b[a][1])));
    const asm = ax.map((_, i) => (lo[i] + hi[i]) / 2);
    const b = r.stateAt("p2").parts.find((e: any) => e.part.id === "partition-left").box;
    const c = ax.map((a) => (b[a][0] + b[a][1]) / 2);
    const want = c.map((v, i) => v + (v - asm[i]));
    const got = w.meshes.get("partition-left").position.toArray();
    return Math.max(...want.map((v, i) => Math.abs(v - got[i])));
  });
  await expect.poll(check, { timeout: 3000 }).toBeLessThan(1e-6);
});

test("key 1 looks straight at the back wall, and O switches to orthographic", async ({ page }) => {
  await openApp(page);
  await frontView(page);
  const dir = await page.evaluate(() => {
    const w = (window as any).__wb;
    const e = w.camera.matrixWorld.elements; // the camera looks down its −z axis
    return [-e[8], -e[9], -e[10]];
  });
  expect(Math.abs(dir[0])).toBeLessThan(1e-3);
  expect(Math.abs(dir[1])).toBeLessThan(1e-3);
  expect(Math.abs(dir[2] + 1)).toBeLessThan(1e-3);
  await page.keyboard.press("o");
  await expect.poll(() => page.evaluate(() => (window as any).__wb.camera.type)).toBe("OrthographicCamera");
  expect(await storeState(page, "s.camera.mode")).toBe("orthographic");
  await page.keyboard.press("o");
  await expect.poll(() => page.evaluate(() => (window as any).__wb.camera.type)).toBe("PerspectiveCamera");
});

test("a step shows the parts installed so far: p1-stand has cleats and partitions but no top shelves", async ({ page }) => {
  await openApp(page, "?phase=p1&step=p1-stand");
  const ids = await page.evaluate(() => [...(window as any).__wb.meshes.keys()]);
  expect(ids).toContain("partition-left");
  expect(ids).toContain("top-left-cleat-a");
  expect(ids).not.toContain("top-shelf-left");
  expect(ids).not.toContain("center-shelf-fixed");
});

test("Labels names the room objects in 3D, and Dims places the current drawing's dimensions there", async ({ page }) => {
  await openApp(page, "?project=tv-wall-shelves&opt.console=60x22");
  const labels = page.locator(".viewport .vp-label");
  await expect(labels).toHaveText(["TV", "Air conditioner", "Media console, 60″ × 22″"]);   // the console's space defers to the console
  await page.getByRole("button", { name: "Labels" }).click();
  await expect(labels).toHaveCount(0);
  await expect(page.locator(".viewport .vp-dim")).toHaveCount(0);
  await page.getByTestId("dims-3d").click();
  await expect(page.locator(".viewport .vp-dim").filter({ hasText: /^14$/ })).toHaveCount(1);   // the long shelf to the AC
});
