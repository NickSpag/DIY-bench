// Errors in the viewer, for the agent: the browser side catches them (app/errors.ts), the dev
// server keeps the latest in .diy-bench/errors.json (tools/vite-plugin.ts), and `wb state`,
// `wb status` and the prompt hook print them. Everything here is plain data, so the app, the
// server and the hook share one definition and the tests need no browser.
import { fmtAge } from "./viewer-text.ts";

export type ViewerErrorKind =
  | "error" // an uncaught exception (window `error`)
  | "resource" // a script, stylesheet or image that failed to load
  | "rejection" // an unhandled promise rejection
  | "console" // console.error
  | "react" // a render crash, caught by the error boundary or not
  | "webgl" // the 3D view lost its WebGL context
  | "vite"; // a compile error the dev server sent over HMR

export const KINDS: ViewerErrorKind[] = ["error", "resource", "rejection", "console", "react", "webgl", "vite"];

/** The page an error came from: one full load of the viewer or of a `?render=` page. */
export type ErrorPage = {
  id: string; // random, one per full load
  loadedAt: string;
  url: string;
  render: string | null; // the render target on a `wb render` page, else null
};

export type ViewerError = {
  kind: ViewerErrorKind;
  message: string;
  stack?: string; // trimmed
  source?: string; // "app/panels/Viewport3D.tsx:120", or the served URL when it maps to no file
  project: string | null;
  page: ErrorPage;
  firstAt: string;
  lastAt: string;
  count: number; // times seen on this page
  stale?: boolean; // the viewer has been reloaded since; kept for `wb state --json`
};

export type ErrorsFile = { version: 1; updatedAt: string; errors: ViewerError[] };

/**
 * What a page posts to /__wb/errors: its records so far (counts are running totals, so a repost
 * replaces rather than adds), or none with `fresh` once at load, which marks older errors stale.
 */
export type ErrorsPost = { page: ErrorPage; fresh?: boolean; errors: Omit<ViewerError, "page">[] };

export const MAX_KEPT = 50; // records in errors.json
export const MAX_MESSAGE = 500;
export const MAX_STACK = 2000;
export const RECENT_MS = 10 * 60_000; // the prompt hook mentions errors at most this old
const DAY_MS = 24 * 3600_000;

const str = (v: unknown, max: number): string | undefined => (typeof v === "string" && v !== "" ? clip(v, max) : undefined);
export const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
const isoOr = (v: unknown, fallback: string): string => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : fallback);

/** One record per page, kind, message and source; repeats raise the count. */
export const errorKey = (e: { kind: string; message: string; source?: string }): string => `${e.kind}\u0000${e.message.slice(0, 200)}\u0000${e.source ?? ""}`;

/** A posted body checked field by field (it comes from a browser), or null when unusable. */
export function cleanPost(body: unknown, now: Date = new Date()): ErrorsPost | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const p = (b.page ?? {}) as Record<string, unknown>;
  const id = str(p.id, 64);
  if (!id) return null;
  const at = now.toISOString();
  const page: ErrorPage = { id, loadedAt: isoOr(p.loadedAt, at), url: str(p.url, 500) ?? "", render: str(p.render, 100) ?? null };
  const errors: ErrorsPost["errors"] = [];
  for (const raw of Array.isArray(b.errors) ? b.errors.slice(0, MAX_KEPT) : []) {
    if (!raw || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    const kind = KINDS.includes(e.kind as ViewerErrorKind) ? (e.kind as ViewerErrorKind) : "error";
    const message = str(e.message, MAX_MESSAGE);
    if (!message) continue;
    const firstAt = isoOr(e.firstAt, at);
    errors.push({
      kind, message,
      ...(str(e.stack, MAX_STACK) ? { stack: str(e.stack, MAX_STACK) } : {}),
      ...(str(e.source, 300) ? { source: str(e.source, 300) } : {}),
      project: str(e.project, 100) ?? null,
      firstAt, lastAt: isoOr(e.lastAt, firstAt),
      count: typeof e.count === "number" && Number.isFinite(e.count) && e.count >= 1 ? Math.floor(e.count) : 1,
    });
  }
  return { page, fresh: b.fresh === true, errors };
}

/**
 * errors.json after a post. A fresh load of the user's viewer marks every earlier viewer
 * page's errors stale: the reload is usually what fixes a broken page (a half-updated chunk, a
 * lost WebGL context), and a problem that survives it is reported again by the new page. Render
 * pages never mark anything: `wb render` loads one for every PNG, and its errors say nothing
 * about the viewer. Records are newest first, at most MAX_KEPT, none older than 24 h.
 */
export function mergeErrors(file: ErrorsFile | null, post: ErrorsPost, now: Date = new Date()): ErrorsFile {
  const list = (file?.errors ?? []).map((e) => ({ ...e }));
  if (post.fresh && !post.page.render) {
    for (const e of list) if (e.page.id !== post.page.id && !e.page.render) e.stale = true;
  }
  const byKey = new Map(list.map((e, i) => [`${e.page.id}\u0000${errorKey(e)}`, i]));
  for (const e of post.errors) {
    const rec: ViewerError = { ...e, page: post.page };
    const i = byKey.get(`${post.page.id}\u0000${errorKey(e)}`);
    if (i === undefined) {
      byKey.set(`${post.page.id}\u0000${errorKey(e)}`, list.length);
      list.push(rec);
    } else {
      list[i] = { ...rec, firstAt: list[i].firstAt < rec.firstAt ? list[i].firstAt : rec.firstAt, count: Math.max(list[i].count, rec.count) };
    }
  }
  const cutoff = now.getTime() - DAY_MS;
  const kept = list
    .filter((e) => Date.parse(e.lastAt) >= cutoff)
    .sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt))
    .slice(0, MAX_KEPT);
  return { version: 1, updatedAt: now.toISOString(), errors: kept };
}

/** errors.json as read from disk, or null when it is missing, corrupt or another version. */
export function asErrorsFile(v: unknown): ErrorsFile | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Partial<ErrorsFile>;
  if (f.version !== 1 || !Array.isArray(f.errors)) return null;
  const errors = f.errors.filter((e): e is ViewerError =>
    !!e && typeof e === "object" && typeof e.message === "string" && typeof e.lastAt === "string" && !!e.page && typeof e.page === "object");
  return { version: 1, updatedAt: typeof f.updatedAt === "string" ? f.updatedAt : "", errors };
}

// ---------- the page's queue: deduplication and rate limiting ----------

export const FLUSH_DELAY_MS = 300; // gather a burst before posting
export const MIN_INTERVAL_MS = 2000; // at most one post this often, however fast errors come
export const MAX_DISTINCT = 30; // distinct records per page; later ones are counted, not kept
export const MAX_PER_POST = 20;

type Pending = Omit<ViewerError, "page">;

/**
 * Collects a page's errors. `add` counts a repeat instead of keeping it, so an error thrown
 * every frame is one record with a large count; `due` says when the next post may go, and
 * `take` hands over what changed since the last one.
 */
export class ErrorQueue {
  private records = new Map<string, Pending>();
  private dirty = new Set<string>();
  private lastPost = -Infinity;
  private dirtySince = 0;
  dropped = 0;

  add(e: { kind: ViewerErrorKind; message: string; stack?: string; source?: string; project: string | null }, now: number): void {
    const key = errorKey(e);
    const at = new Date(now).toISOString();
    const have = this.records.get(key);
    if (have) {
      have.count += 1;
      have.lastAt = at;
      if (e.project) have.project = e.project;
    } else if (this.records.size < MAX_DISTINCT) {
      this.records.set(key, {
        kind: e.kind, message: clip(e.message, MAX_MESSAGE), ...(e.stack ? { stack: clip(e.stack, MAX_STACK) } : {}),
        ...(e.source ? { source: e.source } : {}), project: e.project, firstAt: at, lastAt: at, count: 1,
      });
    } else {
      this.dropped += 1;
      return;
    }
    if (this.dirty.size === 0) this.dirtySince = now;
    this.dirty.add(key);
  }

  /** Milliseconds until a post may go (0: now), or null when there is nothing to send. */
  due(now: number): number | null {
    if (this.dirty.size === 0) return null;
    return Math.max(0, this.dirtySince + FLUSH_DELAY_MS - now, this.lastPost + MIN_INTERVAL_MS - now);
  }

  take(now: number): Pending[] {
    const keys = [...this.dirty].slice(0, MAX_PER_POST);
    for (const k of keys) this.dirty.delete(k);
    this.lastPost = now;
    this.dirtySince = now;
    return keys.map((k) => ({ ...(this.records.get(k) as Pending) }));
  }

  /** Puts records back after a failed post, so the next one carries them. */
  retry(records: Pending[], now: number): void {
    if (this.dirty.size === 0) this.dirtySince = now;
    for (const e of records) this.dirty.add(errorKey(e));
  }
}

// ---------- as text ----------

const oneLine = (s: string, max: number) => clip(s.replace(/\s+/g, " ").trim(), max);

const KIND_TEXT: Record<ViewerErrorKind, string> = {
  error: "uncaught error", resource: "failed to load", rejection: "unhandled rejection", console: "console.error",
  react: "render crash", webgl: "WebGL", vite: "Vite",
};

/** `3 min ago, 14 times, render crash: TypeError: … · app/panels/Viewport3D.tsx:120`. */
export function errorLine(e: ViewerError, now: number, max = 220): string {
  const head = [
    `${fmtAge(now - Date.parse(e.lastAt))} ago`,
    ...(e.count > 1 ? [`${e.count} times`] : []),
    ...(e.page.render ? [`render page ${e.page.render}`] : []),
    KIND_TEXT[e.kind] ?? e.kind,
  ].join(", ");
  return `${head}: ${oneLine(e.message, max)}${e.source ? ` · ${e.source}` : ""}`;
}

/**
 * For `wb state` and `wb status`: the errors of the last 24 h that no reload has cleared, newest
 * first, at most `limit`, then a count of the rest and of those from before the last reload.
 */
export function errorListLines(file: ErrorsFile | null, now: number = Date.now(), limit = 5): string[] {
  if (!file) return [];
  const live = file.errors.filter((e) => !e.stale && now - Date.parse(e.lastAt) <= DAY_MS);
  const stale = file.errors.filter((e) => e.stale && now - Date.parse(e.lastAt) <= DAY_MS).length;
  const lines = live.slice(0, limit).map((e) => `[diy-bench] viewer error: ${errorLine(e, now)}`);
  const more = live.length - Math.min(live.length, limit);
  const rest = [
    ...(more ? [`${more} more`] : []),
    ...(stale ? [`${stale} from before the viewer was last reloaded`] : []),
  ];
  if (rest.length) lines.push(`[diy-bench] viewer errors: ${rest.join("; ")} (wb state --json lists them)`);
  return lines;
}

/**
 * For the prompt hook: at most two lines about the user's viewer (render pages are left out),
 * only for errors newer than `since` (the session's previous prompt) and at most RECENT_MS old,
 * and none a reload has cleared.
 */
export function errorHookLines(file: ErrorsFile | null, now: number = Date.now(), since = 0): string[] {
  if (!file) return [];
  const from = Math.max(since, now - RECENT_MS);
  const fresh = file.errors.filter((e) => !e.stale && !e.page.render && Date.parse(e.lastAt) > from);
  if (fresh.length === 0) return [];
  const lines = [`[diy-bench] viewer error: ${errorLine(fresh[0], now, 200)}`];
  if (fresh.length > 1) lines.push(`[diy-bench] viewer errors: ${fresh.length - 1} more; ./wb state lists them`);
  return lines;
}
