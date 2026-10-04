// The last model of each project that checked without errors (.diy-bench/last-good/<id>.json),
// written by `wb check` and the check hook, read by `wb diff --against last-good` and the hook.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiffDoc } from "../core/diff.ts";
import { stateDir, writeAtomic } from "./files.ts";

export const lastGoodFile = (id: string): string => join(stateDir(), "last-good", `${id}.json`);

export function readLastGood(id: string): DiffDoc | null {
  const file = lastGoodFile(id);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as DiffDoc;
  } catch {
    return null; // a corrupt baseline is the same as none
  }
}

/** Full precision, unlike toJson; atomic, so two checks in a row never leave a torn file. */
export function writeLastGood(id: string, doc: DiffDoc): void {
  writeAtomic(lastGoodFile(id), JSON.stringify(doc) + "\n");
}
