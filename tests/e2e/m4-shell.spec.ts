// M4 acceptance: the live loop (edit, syntax error, thrown error), cross-selection between the
// cut list and the sheets, selection sync to .diy-bench/state.json, and the same-origin rule.
import { expect, test } from "@playwright/test";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
  STATE_FILE, lineOf, openApp, patched, restoreAndSettle, sideTab, storeState, wb, writeProject,
} from "./helpers.ts";

test.afterEach(async ({ page }) => {
  await restoreAndSettle(page);
});

test("the app shows the closet with the cut list and no issues", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("topbar")).toContainText("Closet Built-In");
  await expect(page.locator('[data-testid="cutlist"] tr[data-row="Partition"]')).toContainText("84 × 23¼");
  await expect(page.getByTestId("issues")).toContainText("0 ✕");
  expect(await page.evaluate(() => window.__wbLoadCount)).toBe(1);
});

test("the browser tab names the project", async ({ page }) => {
  await openApp(page);
  await expect(page).toHaveTitle("DIY-bench: Closet Built-In");
});

test("live edit: a changed partition height reaches the cut list without a page reload", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => ((window as any).__marker = "still here"));
  writeProject(patched("partitionHeight: 84,", "partitionHeight: 82,"));
  await expect(page.locator('[data-testid="cutlist"] tr[data-row="Partition"]')).toContainText("82 × 23¼", { timeout: 2000 });
  expect(await page.evaluate(() => window.__wbLoadCount)).toBe(1);
  expect(await page.evaluate(() => (window as any).__marker)).toBe("still here");
});

test("syntax error: Vite's overlay shows, and restoring the file recovers without a reload", async ({ page }) => {
  await openApp(page);
  const before = await storeState<number>(page, "s.loads");
  writeProject(patched("partitionHeight: 84,", "partitionHeight: 84,,, ]]"));
  await expect(page.locator("vite-error-overlay")).toBeAttached({ timeout: 5000 });
  await restoreAndSettle(page);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  expect(await storeState<number>(page, "s.loads")).toBeGreaterThan(before);
  expect(await page.evaluate(() => window.__wbLoadCount)).toBe(1);
});

test("thrown error: the error bar names the message and project.ts:line, and the cut list keeps the last good model", async ({ page }) => {
  await openApp(page);
  const anchor = "const topT = Number(opt.top);";
  const line = lineOf(anchor) + 1; // the throw goes on the line after the anchor
  writeProject(patched(anchor, `${anchor}\n    if (opt.top) throw new Error("boom from the e2e test");`));
  const bar = page.getByTestId("error-bar");
  await expect(bar).toBeVisible({ timeout: 4000 });
  await expect(bar).toContainText("boom from the e2e test");
  await expect(bar).toContainText(`project.ts:${line}`);
  await expect(bar).toContainText("showing last good model");
  await expect(page.locator('[data-testid="cutlist"] tr[data-row="Partition"]')).toContainText("84 × 23¼");
  expect(await page.evaluate(() => window.__wbLoadCount)).toBe(1);
});

test("cross-selection: the Partition row highlights both partitions on the sheets, and a sheet rect highlights its row", async ({ page }) => {
  await openApp(page);
  // computed style of each partition placement before selection
  await sideTab(page, "sheets");
  const rect = (id: string) => page.locator(`[data-testid="sheets"] .wb-placement[data-part~="${id}"] > rect.wb-part`).first();
  const fillOf = (id: string) => rect(id).evaluate((el) => getComputedStyle(el).fill + "|" + getComputedStyle(el).stroke);
  const beforeL = await fillOf("partition-left");
  const beforeR = await fillOf("partition-right");

  await sideTab(page, "cutlist");
  await page.locator('[data-testid="cutlist"] tr[data-row="Partition"]').click();
  expect(await storeState<string[]>(page, "s.selected")).toEqual(["partition-left", "partition-right"]);
  await sideTab(page, "sheets");
  expect(await fillOf("partition-left")).not.toBe(beforeL);
  expect(await fillOf("partition-right")).not.toBe(beforeR);

  // and back: clicking a sheet rect selects that part and highlights its cut-list row
  await page.keyboard.press("Escape");
  await page.locator(`[data-testid="sheets"] g.wb-placement[data-part="center-shelf-fixed"]`).click();
  expect(await storeState<string[]>(page, "s.selected")).toEqual(["center-shelf-fixed"]);
  await sideTab(page, "cutlist");
  const row = page.locator('[data-testid="cutlist"] tr[data-part="center-shelf-fixed"]');
  const other = page.locator('[data-testid="cutlist"] tr[data-row="Partition"]');
  const bg = (l: typeof row) => l.locator("td").first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await bg(row)).not.toBe(await bg(other));
});

test("selection sync: clicking a Parts row writes .diy-bench/state.json within a second, with src", async ({ page }) => {
  await openApp(page);
  await sideTab(page, "parts");
  const t0 = Date.now();
  await page.locator('[data-testid="parts"] tr[data-part="partition-left"] td').first().click();
  await expect.poll(() => {
    if (!existsSync(STATE_FILE)) return null;
    try {
      const st = JSON.parse(readFileSync(STATE_FILE, "utf8"));
      return st.selected?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }, { timeout: 1000 }).toBe("partition-left");
  expect(Date.now() - t0).toBeLessThan(1500);
  expect(statSync(STATE_FILE).mtimeMs).toBeGreaterThan(t0 - 50);
  const st = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  expect(st.version).toBe(1);
  expect(st.project).toBe("closet-built-in");
  expect(st.selected[0].size).toBe("84 × 23¼ × 23/32");
  // src matches the line the CLI reports (the browser maps through Vite's source map)
  const cli = JSON.parse(wb(["part", "partition-left", "--json"]).stdout);
  const [file, line] = (cli.src as string).split(":");
  expect(st.selected[0].src).toBe(`${file}:${line}`);
});

test("the Parts table's source link opens the file at the line in VS Code", async ({ page }) => {
  await openApp(page);
  await sideTab(page, "parts");
  const href = await page.locator('[data-testid="parts"] tr[data-part="drawer-face-2"] a').getAttribute("href");
  expect(href).toMatch(/^vscode:\/\/file\/.+\/projects\/closet-built-in\/project\.ts:193:9$/);
});

test("same-origin rule: POST /__wb/state from a foreign origin is refused", async ({ request, baseURL }) => {
  const body = { version: 1, updatedAt: new Date().toISOString(), project: "x", title: "x", config: {}, phase: "p1", step: null, drawingView: "", viewTitle: "", selected: [], issues: { errors: 0, warnings: 0 }, modelError: null };
  const foreign = await request.post("/__wb/state", { headers: { origin: "http://evil.example" }, data: body });
  expect(foreign.status()).toBe(403);
  const none = await request.post("/__wb/state", { data: body });
  expect(none.status()).toBe(403);
  const health = await request.get("/__wb/health");
  const status = await health.json();
  expect(status.ok).toBe(true);
  expect(status.projects).toContain("closet-built-in");
  expect(baseURL).toBeTruthy();
});

test("the server writes .diy-bench/server.json with a token", async () => {
  const file = STATE_FILE.replace("state.json", "server.json");
  const s = JSON.parse(readFileSync(file, "utf8"));
  expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(s.token).toMatch(/^[0-9a-f]{32}$/);
  expect(typeof s.pid).toBe("number");
});

test("layout: three panes when wide, two under 1100 px, one tabbed pane under 700 px", async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-mode", "3");
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-mode", "2");
  await sideTab(page, "notes");
  await expect(page.getByTestId("notes")).toBeVisible();
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-mode", "1");
  await sideTab(page, "checks");
  await expect(page.getByTestId("checks")).toContainText("No errors or warnings");
  // nothing overflows the narrow window
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("layout: drawings collapsed in the wide layout stay hidden in the two-pane one until asked for", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Collapse the drawings" }).click();
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-mode", "2");
  await expect(page.locator(".pane-draw")).toHaveAttribute("data-off", "true");
  await expect(page.locator(".pane-side")).toHaveAttribute("data-off", "false");
  await page.locator('.tabstrip [data-tab="drawing"]').click();
  await expect(page.locator(".pane-draw")).toHaveAttribute("data-off", "false");
  await page.setViewportSize({ width: 1400, height: 800 });
  await expect(page.locator(".pane-draw")).toHaveAttribute("data-collapsed", "false");
});
