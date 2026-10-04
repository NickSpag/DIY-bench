// Which projects an edited file affects, for the check hook (section 10.2 of the spec). This
// module imports nothing from core/, so the hook can answer "not a project file" in a few
// milliseconds without loading the model code.
//
// A file affects a project when it is that project's project.ts or a module it imports
// (directly or through other helpers), followed through relative imports only. Imports into
// the tool itself (core/, app/, tools/ …) are not followed, and an edit to the tool affects
// no project here: the tool has its own tests.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Top-level folders that belong to the tool, not to projects. */
export const TOOL_DIRS = new Set(["core", "app", "tools", "tests", "docs", "node_modules", "dist", ".claude", ".diy-bench", ".vscode", ".git", "test-results"]);
const CODE = /\.(?:[cm]?[jt]sx?|json)$/;
const IMPORT = /(?:^|[^\w$.])(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?["']([^"']+)["']|(?:^|[^\w$.])import\s*\(\s*["']([^"']+)["']\s*\)/g;

function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    // a file that no longer exists: resolve its folder instead
    try {
      return join(realpathSync(dirname(p)), basename(p));
    } catch {
      return resolve(p);
    }
  }
}

/** The repo-relative path with forward slashes, or null when outside the repo. */
export function repoRelative(file: string, root: string): string | null {
  const rel = relative(real(root), real(isAbsolute(file) ? file : resolve(root, file)));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

function projectIds(root: string): string[] {
  const dir = join(root, "projects");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "project.ts")))
    .map((e) => e.name)
    .sort();
}

/** Every file a project's project.ts reaches through relative imports, outside the tool's folders. */
export function projectModules(root: string, id: string): Set<string> {
  const realRoot = real(root);
  const seen = new Set<string>();
  const queue = [real(join(root, "projects", id, "project.ts"))];
  while (queue.length && seen.size < 500) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2];
      if (!spec || !spec.startsWith(".")) continue;
      let target = resolve(dirname(file), spec.split("?")[0]);
      if (!existsSync(target) && existsSync(`${target}.ts`)) target = `${target}.ts`;
      target = real(target);
      const rel = relative(realRoot, target);
      if (rel.startsWith("..") || isAbsolute(rel)) continue;
      if (TOOL_DIRS.has(rel.split(sep)[0])) continue;
      if (CODE.test(target)) queue.push(target);
    }
  }
  return seen;
}

/** The ids of the projects an edit to `file` can change; empty for anything else. */
export function affectedProjects(file: string, root: string): string[] {
  const rel = repoRelative(file, root);
  if (rel === null || TOOL_DIRS.has(rel.split("/")[0]) || !CODE.test(rel)) return [];
  const abs = real(join(root, rel));
  return projectIds(root).filter((id) => projectModules(root, id).has(abs));
}
