// Viewer errors (core/viewer-errors.ts): what a page posts, how errors.json keeps it, the page's
// queue that counts repeats and limits posts, and the lines `wb state` and the prompt hook print.
import { expect, test } from "vitest";
import {
  ErrorQueue, FLUSH_DELAY_MS, MAX_DISTINCT, MAX_KEPT, MIN_INTERVAL_MS, asErrorsFile, cleanPost, errorHookLines, errorListLines, mergeErrors,
  type ErrorPage, type ErrorsPost,
} from "../../core/viewer-errors.ts";

const T0 = Date.parse("2026-10-05T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const viewer = (id: string): ErrorPage => ({ id, loadedAt: iso(T0), url: "http://127.0.0.1:5180/?project=closet-built-in", render: null });
const renderPage = (id: string): ErrorPage => ({ ...viewer(id), url: "http://127.0.0.1:5180/?render=front", render: "front" });
const err = (message: string, at = T0, over: Partial<ErrorsPost["errors"][number]> = {}): ErrorsPost["errors"][number] => ({
  kind: "error", message, project: "closet-built-in", firstAt: iso(at), lastAt: iso(at), count: 1, ...over,
});

test("a post is checked field by field; unusable ones are refused", () => {
  expect(cleanPost(null)).toBeNull();
  expect(cleanPost({ errors: [] })).toBeNull(); // no page id
  const p = cleanPost({
    page: { id: "abc", url: "http://x/", render: null, loadedAt: "nonsense" },
    errors: [{ kind: "made-up", message: "x".repeat(900), count: -3 }, { kind: "react" }, "junk", { kind: "webgl", message: "lost", count: 7.6, source: "app/a.tsx:3" }],
  }, new Date(T0));
  expect(p?.page).toEqual({ id: "abc", loadedAt: iso(T0), url: "http://x/", render: null });
  expect(p?.errors.map((e) => [e.kind, e.message.length, e.count, e.source])).toEqual([["error", 500, 1, undefined], ["webgl", 4, 7, "app/a.tsx:3"]]);
});

test("errors.json: repeats from one page replace their count, other pages add records, newest first", () => {
  let f = mergeErrors(null, { page: viewer("a"), errors: [err("boom")] }, new Date(T0));
  f = mergeErrors(f, { page: viewer("a"), errors: [err("boom", T0, { lastAt: iso(T0 + 5000), count: 40 })] }, new Date(T0 + 5000));
  f = mergeErrors(f, { page: viewer("a"), errors: [err("boom", T0, { lastAt: iso(T0 + 4000), count: 38 })] }, new Date(T0 + 5000)); // a late repost
  f = mergeErrors(f, { page: viewer("b"), errors: [err("other", T0 + 6000)] }, new Date(T0 + 6000));
  expect(f.errors.map((e) => [e.page.id, e.message, e.count])).toEqual([["b", "other", 1], ["a", "boom", 40]]);
});

test("a fresh load of the viewer marks earlier viewer pages' errors stale; a render page marks nothing", () => {
  let f = mergeErrors(null, { page: viewer("a"), errors: [err("boom")] }, new Date(T0));
  f = mergeErrors(f, { page: renderPage("r"), errors: [err("render broke")] }, new Date(T0));
  f = mergeErrors(f, { page: renderPage("r2"), fresh: true, errors: [] }, new Date(T0 + 1000));
  expect(f.errors.some((e) => e.stale)).toBe(false);
  f = mergeErrors(f, { page: viewer("b"), fresh: true, errors: [] }, new Date(T0 + 2000));
  expect(f.errors.map((e) => [e.page.id, !!e.stale])).toEqual([["a", true], ["r", false]]);
  // The old page is still open and still failing: its record is live again.
  f = mergeErrors(f, { page: viewer("a"), errors: [err("boom", T0, { lastAt: iso(T0 + 3000), count: 2 })] }, new Date(T0 + 3000));
  expect(f.errors.find((e) => e.page.id === "a")?.stale).toBeUndefined();
});

test("errors.json keeps the latest 50 and nothing older than a day", () => {
  let f = mergeErrors(null, { page: viewer("old"), errors: [err("ancient", T0 - 25 * 3600_000)] }, new Date(T0 - 25 * 3600_000));
  const many = Array.from({ length: 60 }, (_, i) => err(`e${i}`, T0 + i));
  f = mergeErrors(f, { page: viewer("a"), errors: many }, new Date(T0 + 100));
  expect(f.errors.length).toBe(MAX_KEPT);
  expect(f.errors[0].message).toBe("e59");
  expect(f.errors.some((e) => e.message === "ancient")).toBe(false);
  expect(asErrorsFile(JSON.parse(JSON.stringify(f)))?.errors.length).toBe(MAX_KEPT);
  expect(asErrorsFile({ version: 2, errors: [] })).toBeNull();
  expect(asErrorsFile({ version: 1, errors: [{ message: 3 }, null] })?.errors).toEqual([]);
});

test("the page's queue: an error every frame is one record, posted at most every 2 s", () => {
  const q = new ErrorQueue();
  const e = { kind: "error" as const, message: "Cannot read properties of undefined", project: "closet-built-in" };
  expect(q.due(T0)).toBeNull();
  q.add(e, T0);
  expect(q.due(T0)).toBe(FLUSH_DELAY_MS); // a burst is gathered first
  let posts = 0;
  let last: ReturnType<ErrorQueue["take"]> = [];
  for (let t = T0; t < T0 + 10_000; t += 16) {
    q.add(e, t);
    if (q.due(t) === 0) {
      last = q.take(t);
      posts++;
    }
  }
  expect(posts).toBeLessThanOrEqual(Math.ceil(10_000 / MIN_INTERVAL_MS) + 1);
  expect(last).toHaveLength(1);
  expect(last[0].count).toBeGreaterThan(500);
  // A failed post puts its records back.
  q.retry(last, T0 + 20_000);
  expect(q.due(T0 + 20_000 + FLUSH_DELAY_MS)).toBe(0);
});

test("the page's queue keeps at most 30 distinct errors", () => {
  const q = new ErrorQueue();
  for (let i = 0; i < MAX_DISTINCT + 10; i++) q.add({ kind: "console", message: `m${i}`, project: null }, T0);
  expect(q.take(T0 + 5000).length + q.take(T0 + 10_000).length).toBe(MAX_DISTINCT);
});

test("as text: wb state lists live errors and counts stale ones; the hook prints two lines at most", () => {
  let f = mergeErrors(null, { page: viewer("a"), errors: [err("old one", T0 - 60_000)] }, new Date(T0));
  f = mergeErrors(f, { page: viewer("b"), fresh: true, errors: [] }, new Date(T0));
  f = mergeErrors(f, { page: viewer("b"), errors: [
    err("TypeError: Cannot read properties of undefined (reading 'x')", T0, { kind: "react", lastAt: iso(T0 + 3 * 60_000), count: 14, source: "app/panels/Viewport3D.tsx:120" }),
    err("could not load script app/main.tsx", T0 + 60_000, { kind: "resource" }),
  ] }, new Date(T0 + 3 * 60_000));
  f = mergeErrors(f, { page: renderPage("r"), errors: [err("render only", T0 + 3 * 60_000)] }, new Date(T0 + 3 * 60_000));
  const now = T0 + 5 * 60_000;
  expect(errorListLines(f, now)).toEqual([
    "[diy-bench] viewer error: 2 min ago, 14 times, render crash: TypeError: Cannot read properties of undefined (reading 'x') · app/panels/Viewport3D.tsx:120",
    "[diy-bench] viewer error: 2 min ago, render page front, uncaught error: render only",
    "[diy-bench] viewer error: 4 min ago, failed to load: could not load script app/main.tsx",
    "[diy-bench] viewer errors: 1 from before the viewer was last reloaded (wb state --json lists them)",
  ]);
  expect(errorHookLines(f, now)).toEqual([
    "[diy-bench] viewer error: 2 min ago, 14 times, render crash: TypeError: Cannot read properties of undefined (reading 'x') · app/panels/Viewport3D.tsx:120",
    "[diy-bench] viewer errors: 1 more; ./wb state lists them",
  ]);
  // Only what is newer than the previous prompt, and nothing over 10 minutes old.
  expect(errorHookLines(f, now, T0 + 2 * 60_000)).toHaveLength(1);
  expect(errorHookLines(f, now, T0 + 4 * 60_000)).toEqual([]);
  expect(errorHookLines(f, T0 + 20 * 60_000)).toEqual([]);
  expect(errorListLines(null)).toEqual([]);
});
