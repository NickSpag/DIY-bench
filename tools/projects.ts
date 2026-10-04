// Finding and loading projects from Node (the CLI, golden files, tests).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AnyProject } from "../core/model/types.ts";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PROJECTS_DIR = join(ROOT, "projects");

export function listProjectIds(): string[] {
  if (!existsSync(PROJECTS_DIR)) return [];
  return readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(PROJECTS_DIR, e.name, "project.ts")))
    .map((e) => e.name)
    .sort();
}

export const projectDir = (id: string): string => join(PROJECTS_DIR, id);
export const projectFile = (id: string): string => join(PROJECTS_DIR, id, "project.ts");

/** Imports a project module and returns its default export. */
export async function loadProjectFile(file: string): Promise<AnyProject> {
  const mod = (await import(pathToFileURL(file).href)) as { default?: AnyProject };
  const p = mod.default;
  if (!p || typeof p !== "object" || typeof p.build !== "function") {
    throw new Error(`${relative(ROOT, file)} does not default-export a project (export default defineProject({...}))`);
  }
  return p;
}

export async function loadProject(id: string): Promise<AnyProject> {
  const file = projectFile(id);
  if (!existsSync(file)) throw new UsageError(`no project "${id}"; projects are: ${listProjectIds().join(", ") || "none"}`);
  return loadProjectFile(file);
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

/** The project to act on: the one named, else the only project, else the viewer's current project. */
export function pickProjectId(named: string | undefined): string {
  const ids = listProjectIds();
  if (named !== undefined) {
    if (!ids.includes(named)) throw new UsageError(`no project "${named}"; projects are: ${ids.join(", ") || "none"}`);
    return named;
  }
  if (ids.length === 1) return ids[0];
  const stateFile = join(ROOT, ".diy-bench", "state.json");
  if (existsSync(stateFile)) {
    try {
      const st = JSON.parse(readFileSync(stateFile, "utf8")) as { project?: string };
      if (st.project && ids.includes(st.project)) return st.project;
    } catch {
      // an unreadable state file is the same as none
    }
  }
  throw new UsageError(ids.length === 0 ? "no projects" : `several projects; pick one with --project: ${ids.join(", ")}`);
}
