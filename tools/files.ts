// Small file helpers shared by the CLI, the hooks and the dev-server plugin.
import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The folder for runtime state: server.json, state.json, last-good/, renders/. It is
 * .diy-bench/ in the repo; WB_DIR moves it, so a test can run its own dev server and viewer
 * without touching the user's.
 */
export function stateDir(): string {
  return process.env.WB_DIR ? resolve(process.env.WB_DIR) : join(ROOT, ".diy-bench");
}

/** Writes a file atomically: a temporary file in the same folder, then a rename. */
export function writeAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}
