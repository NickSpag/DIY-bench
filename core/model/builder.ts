// The builder API that project files call (section 5.3 of the spec).
// Every builder method records its call site as `src`, so an issue or a selected part
// can be traced to the exact line of project code that made it.
import type {
  Box, BoardPart, Check, ContextPart, ContextSpec, HardwarePart, HardwareSpec, ModelBuilder, OptionDef,
  PanelPart, PanelSpec, Part, Project, Range, Severity, Src, Step, StepSpec, View,
} from "./types.ts";

export function defineProject<O extends Record<string, OptionDef>>(p: Project<O>): Project<O> {
  return p;
}

/** [start, start + length] */
export const span = (start: number, length: number): Range => [start, start + length];
export const box = (x: Range, y: Range, z: Range): Box => ({ x, y, z });

export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------- call sites ----------

// Paths are made relative to the repo root, which is two levels above this file.
// In Node that is a file:// URL; in the browser it is the dev server's origin, so a
// module served as /projects/x/project.ts becomes projects/x/project.ts.
// Vite rewrites `new URL("../", import.meta.url)` at transform time and drops the trailing
// slash, so both are normalised to end in "/".
const dirOf = (p: string): string => (p.endsWith("/") ? p : `${p}/`);
const CORE_DIR = dirOf(pathOf(new URL("../", import.meta.url).href));
const REPO_ROOT = dirOf(pathOf(new URL("../../", import.meta.url).href));

function pathOf(file: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(file)) {
    try {
      // Vite serves files outside its root at /@fs/<absolute path>; drop that prefix.
      return decodeURIComponent(new URL(file).pathname).replace(/^\/@fs(?=\/)/, "");
    } catch {
      return file;
    }
  }
  return file.replace(/[?#].*$/, "");
}

/** A stack frame's location, as file (repo-relative when inside the repo), line and column. */
export type Frame = { file: string; path: string; line: number; col: number };

// Matches the location at the end of a V8 frame ("at f (file:1:2)", "at file:1:2")
// and of a SpiderMonkey/JavaScriptCore frame ("f@file:1:2"). A URL may contain "@"
// (Vite serves files outside its root at /@fs/...), a bare path may not.
const FRAME = /(?:\(|@|\s)([a-z][a-z0-9+.-]*:\/\/[^\s()]+?|[^\s()@]+?):(\d+):(\d+)\)?\s*$/i;

export function parseStack(stack: string | undefined): Frame[] {
  const frames: Frame[] = [];
  for (const raw of (stack ?? "").split("\n")) {
    const m = FRAME.exec(raw);
    if (!m) continue;
    const path = pathOf(m[1]);
    if (path.startsWith("node:") || path.startsWith("internal/")) continue;
    const file = path.startsWith(REPO_ROOT) ? path.slice(REPO_ROOT.length) : path;
    frames.push({ file, path, line: Number(m[2]), col: Number(m[3]) });
  }
  return frames;
}

const isCore = (f: Frame) => f.path.startsWith(CORE_DIR);

/** The first frame outside core/: the line of project code that called into the builder. */
export function srcFromStack(stack: string | undefined): Src {
  const f = parseStack(stack).find((fr) => !isCore(fr));
  return f ? { file: f.file, line: f.line, col: f.col } : null;
}

export function callerSite(): Src {
  return srcFromStack(new Error().stack);
}

export function fmtSrc(src: Src): string {
  return src ? `${src.file}:${src.line}:${src.col}` : "";
}

// ---------- validation ----------

function checkRange(owner: string, what: string, r: Range | undefined): void {
  if (r === undefined) return;
  if (!Array.isArray(r) || r.length !== 2 || !Number.isFinite(r[0]) || !Number.isFinite(r[1])) {
    throw new Error(`${owner}: ${what} must be a [from, to] pair of finite numbers, got ${JSON.stringify(r)}`);
  }
  if (!(r[0] < r[1])) throw new Error(`${owner}: ${what} [${r[0]}, ${r[1]}] is reversed or empty (from must be less than to)`);
}

function checkBox(owner: string, what: string, b: Box | undefined): void {
  if (b === undefined) return;
  for (const a of ["x", "y", "z"] as const) checkRange(owner, `${what}.${a}`, b[a]);
}

// ---------- builder ----------

export class Builder implements ModelBuilder {
  readonly parts: Part[] = [];
  readonly steps: Step[] = [];
  readonly checks: Check[] = [];
  readonly views: View[] = [];
  private readonly byId = new Map<string, Part>();
  private readonly stepIds = new Set<string>();
  private readonly checkIds = new Set<string>();
  private readonly viewIds = new Set<string>();

  private add<P extends Part>(p: P): P {
    if (typeof p.id !== "string" || !KEBAB.test(p.id)) throw new Error(`part id "${p.id}" is not kebab-case`);
    if (this.byId.has(p.id)) throw new Error(`duplicate part id "${p.id}"`);
    const owner = `part "${p.id}"`;
    if ("box" in p) checkBox(owner, "box", p.box);
    for (const [phase, mb] of Object.entries(p.moves ?? {})) checkBox(owner, `moves.${phase}`, mb);
    if (p.kind === "hardware" && p.cylinder) {
      const c = p.cylinder;
      checkRange(owner, "cylinder", [c.from, c.to]);
      if (!(c.diameter > 0)) throw new Error(`${owner}: cylinder diameter must be positive, got ${c.diameter}`);
    }
    this.byId.set(p.id, p);
    this.parts.push(p);
    return p;
  }

  panel(spec: PanelSpec): PanelPart {
    return this.add({ ...spec, kind: "panel", src: callerSite() });
  }
  board(spec: PanelSpec): BoardPart {
    return this.add({ ...spec, kind: "board", src: callerSite() });
  }
  hardware(spec: HardwareSpec): HardwarePart {
    return this.add({ ...spec, kind: "hardware", src: callerSite() });
  }
  context(spec: ContextSpec): ContextPart {
    return this.add({ ...spec, kind: "context", src: callerSite() });
  }
  step(spec: StepSpec): void {
    if (this.stepIds.has(spec.id)) throw new Error(`duplicate step id "${spec.id}"`);
    this.stepIds.add(spec.id);
    this.steps.push({ ...spec, src: callerSite() });
  }
  check(id: string, label: string, pass: boolean, detail?: string, severity: Severity = "warning"): void {
    if (this.checkIds.has(id)) throw new Error(`duplicate check id "${id}"`);
    this.checkIds.add(id);
    const c: Check = { id, label, pass, severity, src: callerSite() };
    if (detail !== undefined) c.detail = detail;
    this.checks.push(c);
  }
  view(v: View): void {
    if (this.viewIds.has(v.id)) throw new Error(`duplicate view id "${v.id}"`);
    this.viewIds.add(v.id);
    this.views.push(v);
  }
  part(id: string): Part {
    const p = this.byId.get(id);
    if (!p) throw new Error(`no part "${id}"`);
    return p;
  }
  boxOf(id: string): Box {
    const p = this.part(id);
    if (!("box" in p) || !p.box) throw new Error(`part "${id}" has no box`);
    return p.box;
  }
}
