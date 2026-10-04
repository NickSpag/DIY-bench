// Shared helpers for the browser tests: waiting for the model, editing the closet on disk
// (always restored), reading the store, and the CLI.
import { expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PROJECT_FILE = join(ROOT, "projects", "closet-built-in", "project.ts");
export const STATE_FILE = join(ROOT, ".diy-bench", "state.json");
export const ORIGINAL = readFileSync(PROJECT_FILE, "utf8");

/** Opens the app and waits until a model is on screen. */
export async function openApp(page: Page, query = ""): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => {
    const w = (window as any).__wb;
    return !!w?.store?.getState().resolved && w.meshes?.size > 0;
  });
}

export async function storeState<T = any>(page: Page, pick: string): Promise<T> {
  return page.evaluate((expr) => {
    const s = (window as any).__wb.store.getState();
    return new Function("s", `return (${expr});`)(s);
  }, pick);
}

export async function setStore(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate((p) => (window as any).__wb.store.setState(p), patch);
}

export async function loads(page: Page): Promise<number> {
  return page.evaluate(() => (window as any).__wb.store.getState().loads as number);
}

/** Writes the project file and returns once the app has evaluated it (or failed). */
export function writeProject(text: string): void {
  writeFileSync(PROJECT_FILE, text);
}

export function restoreProject(): void {
  if (readFileSync(PROJECT_FILE, "utf8") !== ORIGINAL) writeFileSync(PROJECT_FILE, ORIGINAL);
}

/** Replaces exactly one occurrence of `from` in the original project text. */
export function patched(from: string, to: string): string {
  const i = ORIGINAL.indexOf(from);
  if (i < 0 || ORIGINAL.indexOf(from, i + 1) >= 0) throw new Error(`patch target not unique: ${from}`);
  return ORIGINAL.slice(0, i) + to + ORIGINAL.slice(i + from.length);
}

/** Waits for the restored project to be evaluated again, so the next test starts clean. */
export async function restoreAndSettle(page: Page): Promise<void> {
  const before = await loads(page).catch(() => 0);
  const changed = readFileSync(PROJECT_FILE, "utf8") !== ORIGINAL;
  restoreProject();
  if (changed) {
    await expect.poll(async () => {
      const st = await page.evaluate(() => {
        const s = (window as any).__wb.store.getState();
        return { loads: s.loads, error: s.error };
      }).catch(() => null);
      return st !== null && st.loads > before && st.error === null;
    }, { timeout: 8000 }).toBe(true);
  }
}

export function wb(args: string[]): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(join(ROOT, "wb"), args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, stdout: err.stdout, stderr: err.stderr };
  }
}

/** The 1-based line of the first line in the original project text that contains `needle`. */
export function lineOf(needle: string): number {
  const i = ORIGINAL.split("\n").findIndex((l) => l.includes(needle));
  if (i < 0) throw new Error(`no line contains ${needle}`);
  return i + 1;
}

/** Opens a side tab whichever layout is showing. */
export async function sideTab(page: Page, id: string): Promise<void> {
  await page.locator(`[data-tab="${id}"]:visible`).first().click();
}
