// UserPromptSubmit hook (section 10.2 of the spec): prints what the user has selected in the
// DIY-bench viewer, so "make this one 2″ shorter" arrives with the part id and its source line.
// Claude Code adds the hook's stdout to the prompt's context.
//
// It also prints at most two lines about errors in the viewer (.diy-bench/errors.json): only
// those newer than this session's previous prompt and at most 10 minutes old, so each one is
// mentioned once. .diy-bench/prompts.json keeps each session's last prompt time for that.
//
// It must never fail or slow a prompt. Every failure (no state file, a corrupt one, a broken
// formatter) prints nothing and exits 0, and a timer exits after 1 s whatever happens.
// The repo root is $CLAUDE_PROJECT_DIR, else the `cwd` in the hook input, else this file's repo.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
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

const DAY_MS = 24 * 3600_000;

/** This session's previous prompt time, and the file updated to now (entries over a day old dropped). */
function lastPrompt(dir: string, session: string | undefined, now: number): number {
  if (!session) return 0;
  const file = join(dir, "prompts.json");
  let seen: Record<string, number> = {};
  try {
    const v = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (v && typeof v === "object") seen = v as Record<string, number>;
  } catch {
    // none yet
  }
  const before = typeof seen[session] === "number" ? seen[session] : 0;
  const next: Record<string, number> = {};
  for (const [k, t] of Object.entries(seen)) if (typeof t === "number" && now - t < DAY_MS) next[k] = t;
  next[session] = now;
  try {
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next) + "\n");
    renameSync(tmp, file);
  } catch {
    // no .diy-bench/ (no viewer has run here) or read-only: every recent error is mentioned
  }
  return before;
}

async function main(): Promise<void> {
  let cwd: string | undefined;
  let session: string | undefined;
  try {
    const input = JSON.parse(await readStdin()) as { cwd?: unknown; session_id?: unknown };
    if (typeof input.cwd === "string" && input.cwd) cwd = input.cwd;
    if (typeof input.session_id === "string" && input.session_id) session = input.session_id;
  } catch {
    // no input, or not JSON: use the other roots
  }
  const root = process.env.CLAUDE_PROJECT_DIR || cwd || HERE_ROOT;
  const dir = join(root, ".diy-bench");
  const lines: string[] = [];
  try {
    const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) as unknown;
    const { viewerContextLines } = (await import(pathToFileURL(join(HERE_ROOT, "core", "viewer-text.ts")).href)) as typeof import("../../core/viewer-text.ts");
    lines.push(...viewerContextLines(state));
  } catch {
    // no viewer has written state here
  }
  let errors: unknown = null;
  try {
    errors = JSON.parse(readFileSync(join(dir, "errors.json"), "utf8"));
  } catch {
    // no errors on record
  }
  if (errors) {
    const now = Date.now();
    const since = lastPrompt(dir, session, now);
    try {
      const { asErrorsFile, errorHookLines } = (await import(pathToFileURL(join(HERE_ROOT, "core", "viewer-errors.ts")).href)) as typeof import("../../core/viewer-errors.ts");
      lines.push(...errorHookLines(asErrorsFile(errors), now, since));
    } catch {
      // a broken formatter must not stop the selection lines
    }
  }
  if (lines.length) process.stdout.write(lines.join("\n") + "\n");
}

// Never a non-zero exit; and stop listening to stdin so the process ends as soon as stdout drains.
main().catch(() => {}).finally(() => {
  process.exitCode = 0;
  process.stdin.destroy();
});
