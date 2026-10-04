// UserPromptSubmit hook (section 10.2 of the spec): prints what the user has selected in the
// DIY-bench viewer, so "make this one 2″ shorter" arrives with the part id and its source line.
// Claude Code adds the hook's stdout to the prompt's context.
//
// It must never fail or slow a prompt. Every failure (no state file, a corrupt one, a broken
// formatter) prints nothing and exits 0, and a timer exits after 1 s whatever happens.
// The repo root is $CLAUDE_PROJECT_DIR, else the `cwd` in the hook input, else this file's repo.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
setTimeout(() => process.exit(0), 1000).unref();

function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return Promise.resolve("");
  return new Promise((resolve) => {
    let text = "";
    const done = () => resolve(text);
    setTimeout(done, 200).unref(); // a caller that never closes stdin
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d: string) => (text += d));
    process.stdin.on("end", done);
    process.stdin.on("error", done);
  });
}

async function main(): Promise<void> {
  let cwd: string | undefined;
  try {
    const input = JSON.parse(await readStdin()) as { cwd?: unknown };
    if (typeof input.cwd === "string" && input.cwd) cwd = input.cwd;
  } catch {
    // no input, or not JSON: use the other roots
  }
  const root = process.env.CLAUDE_PROJECT_DIR || cwd || HERE_ROOT;
  let state: unknown;
  try {
    state = JSON.parse(readFileSync(join(root, ".diy-bench", "state.json"), "utf8"));
  } catch {
    return; // no viewer has written state here
  }
  const { viewerContextLines } = (await import(pathToFileURL(join(HERE_ROOT, "core", "viewer-text.ts")).href)) as typeof import("../../core/viewer-text.ts");
  const lines = viewerContextLines(state);
  if (lines.length) process.stdout.write(lines.join("\n") + "\n");
}

// Never a non-zero exit; and stop listening to stdin so the process ends as soon as stdout drains.
main().catch(() => {}).finally(() => {
  process.exitCode = 0;
  process.stdin.destroy();
});
