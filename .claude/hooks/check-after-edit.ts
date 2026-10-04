// PostToolUse hook for Edit and Write (section 10.2 of the spec): after the agent edits a
// project, check it and tell the agent what changed.
//
// Only edits to a project's project.ts, or to a module it imports outside the tool's own
// folders, are checked. Everything else (core/, app/, tools/, docs, notes.md …) exits 0 at
// once, before any model code is loaded. Exit 2 with stderr when the project has errors, so
// the agent sees them; exit 0 with a JSON summary otherwise. A failure of the hook itself
// exits 1, which Claude Code shows to the user but does not block on.
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const load = <T>(rel: string): Promise<T> => import(pathToFileURL(join(ROOT, rel)).href) as Promise<T>;

function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve) => {
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d: string) => (text += d));
    process.stdin.on("end", () => resolve(text));
    process.stdin.on("error", () => resolve(text));
  });
}

async function main(): Promise<number> {
  let input: { tool_input?: { file_path?: unknown }; cwd?: unknown };
  try {
    input = JSON.parse(await readStdin());
  } catch {
    return 0; // not a hook call we understand
  }
  const file = input.tool_input?.file_path;
  if (typeof file !== "string" || file === "") return 0;
  const cwd = typeof input.cwd === "string" && input.cwd ? input.cwd : ROOT;
  const abs = resolve(cwd, file);
  // The quick answer for most edits, with nothing loaded: a non-code file, or one in the tool's
  // own folders. (hook-scope.ts makes the full decision, following symlinks and imports.)
  const top = relative(ROOT, abs).split(sep)[0];
  if (!/\.(?:[cm]?[jt]sx?|json)$/.test(abs) || ["core", "app", "tools", "tests", "docs", "node_modules", ".claude", ".diy-bench", ".vscode"].includes(top)) return 0;
  const { affectedProjects } = await load<typeof import("../../tools/hook-scope.ts")>("tools/hook-scope.ts");
  const ids = affectedProjects(abs, ROOT);
  if (ids.length === 0) return 0;
  const { checkForHook } = await load<typeof import("../../tools/check-hook.ts")>("tools/check-hook.ts");
  const r = await checkForHook(ids);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  return r.code;
}

main().then(
  (code) => (process.exitCode = code),
  (e: unknown) => {
    process.stderr.write(`diy-bench check hook failed: ${(e as Error)?.message ?? String(e)}\n`);
    process.exitCode = 1;
  },
);
