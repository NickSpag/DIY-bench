// Catches what goes wrong in the page and posts it to the dev server (POST /__wb/errors →
// .diy-bench/errors.json), so an agent sees a broken viewer in `wb state` and the prompt hook
// without anyone opening DevTools. It catches uncaught errors, scripts that fail to load (Vite's
// 504 "Outdated Optimize Dep" among them), unhandled rejections, console.error, render crashes
// (main.tsx passes `reactRootOptions` to createRoot), lost WebGL contexts (Viewport3D) and
// Vite's compile errors. Repeats are counted, not resent (core/viewer-errors.ts).
//
// index.html loads this before main.tsx, as a script of its own: a failed import anywhere in
// main.tsx's graph stops main.tsx from running at all, but not this. It is careful never to
// throw and never to report itself: console.error inside here would recurse.
import { ErrorQueue, clip, type ErrorPage, type ViewerErrorKind } from "../core/viewer-errors.ts";
import { decodeMappings, lookup, type LineMap } from "./srcmap.ts";

declare global {
  interface Window {
    __wbErrors?: { report: typeof reportViewerError };
  }
}

const ROOT = typeof __WB_ROOT__ === "string" ? __WB_ROOT__ : "";
const params = new URLSearchParams(location.search);
const page: ErrorPage = {
  id: Math.random().toString(36).slice(2, 12),
  loadedAt: new Date().toISOString(),
  url: location.href,
  render: params.get("render"),
};
const queue = new ErrorQueue();
const originalConsoleError = console.error.bind(console);
let busy = false;
let timer: ReturnType<typeof setTimeout> | null = null;

// ---------- where an error came from ----------

/** A served URL as a repo path: "/panels/X.tsx?t=1" → "app/panels/X.tsx", "/@fs<root>/core/a.ts" → "core/a.ts". */
function repoPath(url: string): string {
  let path: string;
  try {
    const u = new URL(url, location.href);
    if (u.origin !== location.origin) return url;
    path = decodeURIComponent(u.pathname);
  } catch {
    return url;
  }
  if (ROOT && path.startsWith(`/@fs${ROOT}/`)) return path.slice(`/@fs${ROOT}/`.length);
  if (path.startsWith("/node_modules/") || path.startsWith("/@")) return path.slice(1);
  return `app${path}`;
}

/** Shortens the URLs in a stack to repo paths and keeps its first lines, leaving out this file's own. */
function trimStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const short = stack.replace(/(?:https?:\/\/[^\s)]+?)(?=:\d+:\d+)/g, (u) => repoPath(u));
  const lines = short.split("\n").filter((l) => !l.includes("app/errors.ts:"));
  if (lines[0] === "Error") lines.shift(); // the `new Error()` console.error makes for its stack
  return lines.length ? clip(lines.slice(0, 12).join("\n"), 2000) : undefined;
}

type Frame = { url: string; line: number; col: number };
const FRAME = /(https?:\/\/[^\s()]+?):(\d+):(\d+)/g;

/** The first stack frame in our own code (not a dependency, not this file), else the first. */
function topFrame(stack: string | undefined): Frame | null {
  if (!stack) return null;
  const frames = [...stack.matchAll(FRAME)].map((m) => ({ url: m[1], line: Number(m[2]), col: Number(m[3]) }));
  return frames.find((f) => !/\/node_modules\/|\/@vite\/|\/errors\.ts/.test(f.url)) ?? frames.find((f) => !/\/errors\.ts/.test(f.url)) ?? null;
}

/** A module file, not the page itself (code run from DevTools or a test reports the page's URL). */
const isFile = (url: string): boolean => /\.[a-z]+$/i.test(url.split(/[?#]/)[0]);

// Browser stacks count lines in the module Vite served, not the file on disk; each module
// carries an inline source map, read once per URL (as srcmap.ts does for project files).
const maps = new Map<string, Promise<LineMap | null>>();
async function mapFrame(f: Frame): Promise<string> {
  const path = repoPath(f.url);
  if (path === f.url || path.startsWith("node_modules/") || path.startsWith("@")) return `${path}:${f.line}`;
  const key = f.url.split("?")[0];
  let p = maps.get(key);
  if (!p) {
    p = fetch(f.url, { cache: "force-cache" }).then(async (res) => {
      if (!res.ok) return null;
      const m = /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)\s*$/.exec(await res.text());
      if (!m) return null;
      const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)))) as { mappings?: string };
      return json.mappings ? decodeMappings(json.mappings) : null;
    }).catch(() => null);
    maps.set(key, p);
  }
  const map = await p;
  const hit = map ? lookup(map, f.line, f.col) : null;
  return `${path}:${hit ? hit.line : f.line}`;
}

function projectId(): string | null {
  try {
    const s = (window.__wb?.store as { getState?: () => { projectId?: unknown } } | undefined)?.getState?.();
    if (s && typeof s.projectId === "string" && s.projectId) return s.projectId;
  } catch {
    // the store is not there yet
  }
  return new URLSearchParams(location.search).get("project");
}

// ---------- reporting ----------

/**
 * Records one error. `error` may be anything thrown; `at` is the position an ErrorEvent gives
 * when there is no stack. Never throws.
 */
export function reportViewerError(kind: ViewerErrorKind, error: unknown, extra: { at?: Frame; stack?: string; source?: string } = {}): void {
  if (busy) return;
  busy = true;
  try {
    const err = error instanceof Error ? error : null;
    let message = err ? `${err.name && err.name !== "Error" ? `${err.name}: ` : ""}${err.message}` : typeof error === "string" ? error : safeString(error);
    if (!message) message = "(no message)";
    const rawStack = extra.stack ?? err?.stack;
    const top = topFrame(rawStack) ?? extra.at ?? null;
    const frame = top && top.line > 0 && isFile(top.url) ? top : null;
    const project = projectId();
    const stack = trimStack(rawStack);
    const add = (source?: string) => {
      try {
        queue.add({ kind, message, ...(stack ? { stack } : {}), ...(source ? { source } : {}), project }, Date.now());
        schedule();
      } catch {
        // never let reporting fail the page
      }
    };
    if (extra.source) add(extra.source);
    else if (frame) mapFrame(frame).then(add, () => add());
    else add();
  } catch {
    // as above
  } finally {
    busy = false;
  }
}

function safeString(v: unknown): string {
  try {
    if (v && typeof v === "object") return clip(JSON.stringify(v) ?? String(v), 300);
    return String(v);
  } catch {
    return Object.prototype.toString.call(v);
  }
}

/** console.error's arguments as one message, with React's "%s" placeholders filled in. */
function consoleMessage(args: unknown[]): string {
  const text = (a: unknown) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : safeString(a));
  const rest = [...args];
  let head = "";
  if (typeof rest[0] === "string" && /%[sdioO]/.test(rest[0])) {
    head = (rest.shift() as string).replace(/%[sdioO]/g, () => (rest.length ? text(rest.shift()) : ""));
  }
  return [head, ...rest.map(text)].filter(Boolean).join(" ").trim();
}

function schedule(): void {
  if (timer) return;
  const wait = queue.due(Date.now());
  if (wait === null) return;
  timer = setTimeout(flush, wait);
}

async function flush(): Promise<void> {
  timer = null;
  const errors = queue.take(Date.now());
  if (errors.length && (await post({ page: { ...page, url: location.href }, errors }))) schedule();
  else if (errors.length) queue.retry(errors, Date.now()); // the server is gone: wait for the next error to try again
}

async function post(body: unknown): Promise<boolean> {
  try {
    const text = JSON.stringify(body);
    const res = await fetch("/__wb/errors", { method: "POST", headers: { "content-type": "application/json" }, body: text, keepalive: text.length < 60_000 });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * When nothing has rendered yet (the app's own scripts failed to load), a plain message in
 * place of the empty page. Once React has rendered, the error boundary does this instead.
 */
export function showFatal(text: string): void {
  try {
    const root = document.getElementById("root");
    if (!root || root.childElementCount > 0) return;
    const div = document.createElement("div");
    div.className = "crash";
    div.setAttribute("role", "alert");
    div.style.cssText = "padding:24px;font:15px/1.4 system-ui,sans-serif;";
    div.textContent = text;
    root.append(div);
  } catch {
    // nothing more to do
  }
}

const crashText = (message: string) => `The viewer crashed: ${message.replace(/[.\s]+$/, "")}. Reload to try again.`;
const LOAD_FAILED = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/** Same-origin responses that failed, from the resource timings (Chromium reports the status). */
function failedResponses(): string[] {
  try {
    return (performance.getEntriesByType("resource") as (PerformanceResourceTiming & { responseStatus?: number })[])
      .filter((e) => (e.responseStatus ?? 0) >= 400 && e.name.startsWith(location.origin) && !e.name.includes("/__wb/"))
      .slice(-3)
      .map((e) => `${repoPath(e.name)}${/\?v=\w+/.exec(e.name)?.[0] ?? ""} answered ${e.responseStatus}`);
  } catch {
    return [];
  }
}

// ---------- React (createRoot's options) ----------

const withComponents = (error: unknown, info: { componentStack?: string }) => {
  const stack = error instanceof Error ? error.stack ?? "" : "";
  const comp = (info.componentStack ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 6).join("\n    ");
  return comp ? `${stack}\ncomponents:\n    ${comp}` : stack;
};

/** Passed to createRoot: React's own logging is kept, and each crash is reported as well. */
export const reactRootOptions = {
  onCaughtError(error: unknown, info: { componentStack?: string }) {
    originalConsoleError(error);
    reportViewerError("react", error, { stack: withComponents(error, info) });
  },
  onUncaughtError(error: unknown, info: { componentStack?: string }) {
    originalConsoleError(error);
    reportViewerError("react", error, { stack: withComponents(error, info) });
    showFatal(crashText(error instanceof Error ? error.message : String(error)));
  },
};
export { crashText };

// ---------- installation ----------

function install(): void {
  window.addEventListener("error", (ev: Event) => {
    if (ev instanceof ErrorEvent) {
      reportViewerError("error", ev.error ?? ev.message, { at: { url: ev.filename, line: ev.lineno, col: ev.colno } });
      if (LOAD_FAILED.test(ev.message)) showFatal(crashText(ev.message));
      return;
    }
    // A failed <script>, <link> or <img> (capture phase only: these events do not bubble).
    const t = ev.target as (HTMLElement & { src?: string; href?: string }) | null;
    if (!t || !(t instanceof HTMLElement)) return;
    const url = t.tagName === "LINK" ? t.href ?? "" : t.src ?? "";
    if (!url.startsWith(location.origin)) return; // web fonts offline, say: not the viewer's problem
    const failed = failedResponses();
    const what = t.tagName === "SCRIPT" ? "script" : t.tagName === "LINK" ? "stylesheet" : t.tagName.toLowerCase();
    const message = `could not load ${what} ${repoPath(url)}${failed.length ? `; failed responses: ${failed.join(", ")}` : ""}`;
    reportViewerError("resource", message);
    if (t.tagName === "SCRIPT") showFatal(crashText(`could not load ${repoPath(url)}${failed.length ? ` (${failed.join(", ")})` : ""}`));
  }, true);

  window.addEventListener("unhandledrejection", (ev) => {
    reportViewerError("rejection", ev.reason);
    const msg = ev.reason instanceof Error ? ev.reason.message : String(ev.reason);
    if (LOAD_FAILED.test(msg)) showFatal(crashText(msg));
  });

  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    if (busy) return;
    const err = args.find((a): a is Error => a instanceof Error);
    reportViewerError("console", consoleMessage(args), { stack: err?.stack ?? new Error().stack });
  };

  // A compile error in the app's own code. Project files are left out: the loader shows those
  // as a model error, and the edit hook and state.json already report them.
  import.meta.hot?.on("vite:error", (payload) => {
    const e = payload.err;
    const file = e.loc?.file ?? e.id ?? "";
    if (/\/projects\//.test(file)) return;
    const where = file.startsWith("/") ? `${repoPath(`/@fs${file.split("?")[0]}`)}${e.loc ? `:${e.loc.line}` : ""}` : undefined;
    // The message repeats the code frame, drawn with colours and box characters: keep the words.
    const words = e.message.replace(/\u001b\[[0-9;]*m/g, "").split(/\n\s*[\u2500-\u257f]/)[0];
    reportViewerError("vite", `${e.plugin ? `[${e.plugin}] ` : ""}${words}`, { ...(where ? { source: where } : {}), ...(e.frame ? { stack: e.frame } : {}) });
  });

  // A fresh load of the user's viewer: errors from earlier pages are marked stale (vite-plugin.ts).
  if (!page.render) void post({ page, fresh: true, errors: [] });
  window.__wbErrors = { report: reportViewerError };
}

if (!window.__wbErrors) install();
