// M6 acceptance in the browser: clicking a drawing selects and tints the mesh, a dimension
// selects both parts it measures, and a section view cuts the 3D view where it is cut.
import { expect, test, type Page } from "@playwright/test";
import { openApp, storeState } from "./helpers.ts";

const emissive = (page: Page, id: string) => page.evaluate((pid) => {
  const w = (window as any).__wb;
  const hl = getComputedStyle(document.documentElement).getPropertyValue("--hl-select").trim().replace("#", "").toLowerCase();
  return { hl, em: w.meshes.get(pid).material.emissive.getHexString() };
}, id);

test("clicking a part in the front elevation selects it and tints its mesh", async ({ page }) => {
  await openApp(page);
  // the hardwood top's fill is not covered by anything in front of it
  await page.locator('[data-testid="drawing"] rect[data-part="center-top"].part').click({ force: true });
  expect(await storeState(page, "s.selected")).toEqual(["center-top"]);
  const t = await emissive(page, "center-top");
  expect(t.em).toBe(t.hl);
  // the drawing's own elements for that part are tinted too
  const fill = await page.locator('[data-testid="drawing"] rect[data-part="center-top"].part').evaluate((el) => getComputedStyle(el).fill);
  const other = await page.locator('[data-testid="drawing"] rect[data-part="partition-left"].part').evaluate((el) => getComputedStyle(el).fill);
  expect(fill).not.toBe(other);
});

test("clicking a dimension selects both parts it measures, in 3D too", async ({ page }) => {
  await openApp(page);
  await page.locator('[data-testid="drawing"] g.dim[data-dim="front:2"]').click();
  expect(await storeState(page, "s.selected")).toEqual(["partition-left", "partition-right"]);
  for (const id of ["partition-left", "partition-right"]) {
    const t = await emissive(page, id);
    expect(t.em).toBe(t.hl);
  }
});

test("a section view with sync on puts the 3D section plane at its cut", async ({ page }) => {
  await openApp(page);
  expect(await storeState(page, "s.section.enabled")).toBe(false);
  await page.locator('button[data-view="section-a"]').click();
  await expect.poll(() => storeState(page, "s.section")).toEqual({ axis: "x", at: 14, enabled: true, flip: true });
  // the shared three.js plane keeps x > 14 (section A looks +x, so the left of the cut is removed)
  const plane = await page.evaluate(() => {
    const p = (window as any).__wb.section.plane;
    return { n: p.normal.toArray(), c: p.constant, keep: p.distanceToPoint({ x: 20, y: 0, z: 0 }) > 0, drop: p.distanceToPoint({ x: 10, y: 0, z: 0 }) < 0 };
  });
  expect(plane).toEqual({ n: [1, 0, 0], c: -14, keep: true, drop: true });
  await page.locator('button[data-view="plan"]').click();
  await expect.poll(() => storeState(page, "s.section")).toEqual({ axis: "y", at: 45, enabled: true, flip: false });
  // an elevation turns the synced section off; turning sync off leaves the section alone
  await page.locator('button[data-view="front"]').click();
  await expect.poll(() => storeState(page, "s.section.enabled")).toBe(false);
  await page.locator('button[data-view="section-b"]').click();
  await page.getByTestId("section-sync").click();
  await page.locator('button[data-view="front"]').click();
  expect(await storeState(page, "s.section.enabled")).toBe(true);
});

test("the drawing follows the phase and pans and zooms without selecting", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("phase").getByRole("button", { name: "1", exact: true }).click();
  await expect(page.locator('[data-testid="drawing"] svg')).toHaveAttribute("data-phase", "p1");
  await expect(page.locator('[data-testid="drawing"] [data-part~="center-top"]')).toHaveCount(0);
  const box = await page.getByTestId("drawing").boundingBox();
  const vb0 = await page.locator('[data-testid="drawing"] svg').getAttribute("viewBox");
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, -400);
  const vb1 = await page.locator('[data-testid="drawing"] svg').getAttribute("viewBox");
  expect(vb1).not.toBe(vb0);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 60, box!.y + box!.height / 2 + 30, { steps: 4 });
  await page.mouse.up();
  expect(await storeState(page, "s.selected")).toEqual([]);
  await page.getByTestId("drawing").dblclick();
  expect(await page.locator('[data-testid="drawing"] svg').getAttribute("viewBox")).toBe(vb0);
});
