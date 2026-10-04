// M7 acceptance: the Steps panel and stepper, the option control and compare mode, and URL state.
import { expect, test } from "@playwright/test";
import { openApp, sideTab, storeState } from "./helpers.ts";

test("the Steps panel lists 2 phases and 9 steps; clicking p2-frame shows that step and selects the frame", async ({ page }) => {
  await openApp(page);
  await sideTab(page, "steps");
  const panel = page.getByTestId("steps");
  await expect(panel.locator(".phase-h")).toHaveCount(2);
  await expect(panel.locator(".step")).toHaveCount(9);
  await panel.locator('.step[data-step="p2-frame"] .ti').click();
  expect(await storeState(page, "[s.phase, s.step]")).toEqual(["p2", "p2-frame"]);
  expect(await storeState(page, "s.selected")).toEqual(["hamper-frame-side", "hamper-frame-rail", "hamper-frame-back"]);
  await expect(panel.locator('.step[data-step="p2-frame"]')).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("step-label")).toHaveText("step 1/4");
  // the 3D view shows the build at that step: frame in, drawers and top not yet
  const ids = await page.evaluate(() => [...(window as any).__wb.meshes.keys()]);
  expect(ids).toContain("hamper-frame-back");
  expect(ids).not.toContain("drawer-1-front");
  expect(ids).not.toContain("center-top");
  // and the drawing too
  await expect(page.locator('[data-testid="drawing"] svg')).toHaveAttribute("data-step", "p2-frame");
});

test("a step can be let go: a second click on it, the ✕ by its title, or Esc after the selection", async ({ page }) => {
  await openApp(page);
  await sideTab(page, "steps");
  const step = page.getByTestId("steps").locator('.step[data-step="p2-frame"] .ti');
  await step.click();
  await step.click();
  expect(await storeState(page, "[s.step, s.selected.length]")).toEqual([null, 0]);
  await step.click();
  await page.getByTestId("step-clear").click();
  expect(await storeState(page, "s.step")).toBe(null);
  await expect(page.getByTestId("step-clear")).toHaveCount(0);
  await step.click();
  await page.keyboard.press("Escape");
  expect(await storeState(page, "[s.step, s.selected.length]")).toEqual(["p2-frame", 0]);
  await page.keyboard.press("Escape");
  expect(await storeState(page, "s.step")).toBe(null);
});

test("at step p1-stand the 3D view shows the bench, cleat and stand parts and no top shelves", async ({ page }) => {
  await openApp(page);
  await sideTab(page, "steps");
  await page.locator('.step[data-step="p1-stand"] .ti').click();
  const ids: string[] = await page.evaluate(() => [...(window as any).__wb.meshes.keys()]);
  const r = await page.evaluate(() => {
    const st = (window as any).__wb.store.getState().resolved;
    const by = (step: string) => st.parts.filter((p: any) => p.step === step).map((p: any) => p.id);
    return { cleats: by("p1-cleats"), stand: by("p1-stand"), tie: by("p1-tie"), finish: by("p1-finish") };
  });
  for (const id of [...r.cleats, ...r.stand]) expect(ids).toContain(id);
  for (const id of [...r.tie, ...r.finish]) expect(ids).not.toContain(id);
  expect(ids.filter((id) => id.startsWith("top-shelf"))).toEqual([]);
});

test("the stepper and the [ ] keys walk the steps across phases", async ({ page }) => {
  await openApp(page, "?phase=p1");
  await page.keyboard.press("]");
  expect(await storeState(page, "[s.phase, s.step]")).toEqual(["p1", "p1-bench"]);
  await page.getByRole("button", { name: "Next step" }).click();
  expect(await storeState(page, "s.step")).toBe("p1-cleats");
  for (let i = 0; i < 3; i++) await page.keyboard.press("]");
  expect(await storeState(page, "[s.phase, s.step]")).toEqual(["p1", "p1-finish"]);
  await page.keyboard.press("]");
  expect(await storeState(page, "[s.phase, s.step]")).toEqual(["p2", "p2-frame"]);
  await page.keyboard.press("[");
  expect(await storeState(page, "[s.phase, s.step]")).toEqual(["p1", "p1-finish"]);
  await page.getByTestId("step-label").click();
  expect(await storeState(page, "s.step")).toBeNull();
});

test("past the last step the stepper shows all steps, and back from there is the last step again", async ({ page }) => {
  await openApp(page, "?phase=p2&step=p2-faces");
  await page.getByRole("button", { name: "Next step" }).click();
  expect(await storeState(page, "[s.phase, s.step]")).toEqual(["p2", null]);
  await expect(page.getByTestId("step-label")).toHaveText("all steps");
  await page.keyboard.press("[");
  expect(await storeState(page, "[s.phase, s.step]")).toEqual(["p2", "p2-faces"]);
});

test("compare mode: the ¾″ top changes 2 parts and 1 cut-list row and keeps the sheet purchases", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("compare-toggle").click();
  await expect(page.getByTestId("compare-summary")).toHaveText("2 parts change · 1 cut-list row · same sheet purchases");
  await page.getByRole("button", { name: "Select changed" }).click();
  expect((await storeState<string[]>(page, "s.selected")).sort()).toEqual(["center-shelf-adj-3", "center-top"]);
  await page.getByRole("button", { name: "Switch" }).click();
  await expect.poll(() => storeState(page, "s.resolved.config.top")).toBe("0.75");
  await expect(page.getByTestId("compare-summary")).toHaveText("2 parts change · 1 cut-list row · same sheet purchases");
  await page.getByRole("button", { name: "Stop comparing" }).click();
  await expect(page.getByTestId("compare-bar")).toHaveCount(0);
});

test("URL state: the option control updates the URL, and a reload restores the option, phase, step and view", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("opt-top").getByRole("button", { name: "0.75" }).click();
  await expect.poll(() => storeState(page, "s.resolved.config.top")).toBe("0.75");
  await expect(page).toHaveURL(/opt\.top=0\.75/);
  await expect(page.locator('[data-testid="cutlist"] tr[data-part="center-top"]')).toContainText("× 24");
  await page.getByTestId("phase").getByRole("button", { name: "1", exact: true }).click();
  await page.locator('button[data-view="plan"]').click();
  await page.keyboard.press("]");
  await expect(page).toHaveURL(/phase=p1/);
  await expect(page).toHaveURL(/view=plan/);
  await expect(page).toHaveURL(/step=p1-bench/);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__wb?.store?.getState().resolved);
  expect(await storeState(page, "[s.config.top, s.phase, s.step, s.drawingView]")).toEqual(["0.75", "p1", "p1-bench", "plan"]);
  await expect(page.getByTestId("opt-top").getByRole("button", { name: "0.75" })).toHaveAttribute("aria-pressed", "true");
  const top = await page.evaluate(() => (window as any).__wb.store.getState().resolved.part("center-top").box.y);
  expect(top).toEqual([49, 49.75]);
});
