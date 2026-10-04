// Browser stacks point into Vite's transformed modules, not the files on disk (project.ts:193
// becomes :599 once types are stripped). The builder records those positions as `src`; this
// module maps them back through each module's inline source map, so the tooltip, the Parts
// table, the error bar and state.json all name the line in the file the agent edits.
import type { Resolved, Src } from "../core/model/types.ts";

declare const __WB_ROOT__: string;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

type Seg = [genCol: number, srcLine: number, srcCol: number];
export type LineMap = Seg[][]; // per generated line (0-based), segments sorted by genCol

/** Decodes a source map's `mappings` (first source only; Vite's per-module maps have one). */
export function decodeMappings(mappings: string): LineMap {
  const lines: LineMap = [];
  let srcLine = 0, srcCol = 0, srcIdx = 0;
  for (const line of mappings.split(";")) {
    const segs: Seg[] = [];
    let genCol = 0;
    for (const seg of line.split(",")) {
      if (!seg) continue;
      const vals: number[] = [];
      let shift = 0, value = 0;
      for (const ch of seg) {
        const d = B64_INDEX.get(ch);
        if (d === undefined) break;
        value += (d & 31) << shift;
        if (d & 32) shift += 5;
        else {
          vals.push(value & 1 ? -(value >>> 1) : value >>> 1);
          shift = 0;
          value = 0;
        }
      }
      genCol += vals[0] ?? 0;
      if (vals.length >= 4) {
        srcIdx += vals[1];
        srcLine += vals[2];
        srcCol += vals[3];
        if (srcIdx === 0) segs.push([genCol, srcLine, srcCol]);
      }
    }
    segs.sort((a, b) => a[0] - b[0]);
    lines.push(segs);
  }
  return lines;
}

/** Maps a 1-based generated line and column to the 1-based original position. */
export function lookup(map: LineMap, line: number, col: number): { line: number; col: number } | null {
  const segs = map[line - 1];
  if (!segs || segs.length === 0) return null;
  let best = segs[0];
  for (const s of segs) {
    if (s[0] <= col - 1) best = s;
    else break;
  }
  return { line: best[1] + 1, col: best[2] + 1 };
}

const root = typeof __WB_ROOT__ === "string" ? __WB_ROOT__ : "";

/** The dev-server URL of a repo-relative file (served from outside app/ through /@fs). */
export const fsUrl = (file: string): string => (file.startsWith("/") ? `/@fs${file}` : `/@fs${root}/${file}`);

/** Absolute path of a repo-relative file, for vscode:// links. */
export const absPath = (file: string): string => (file.startsWith("/") ? file : `${root}/${file}`);

export const vscodeLink = (src: Src): string | null => (src ? `vscode://file${absPath(src.file)}:${src.line}:${src.col}` : null);

async function fetchMap(file: string): Promise<LineMap | null> {
  try {
    const res = await fetch(fsUrl(file), { cache: "no-store" });
    if (!res.ok) return null;
    const code = await res.text();
    const m = /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)\s*$/.exec(code);
    if (!m) return null;
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)))) as { mappings?: string };
    return json.mappings ? decodeMappings(json.mappings) : null;
  } catch {
    return null;
  }
}

/** A per-load cache, so each module's map is fetched once per evaluation. */
export function createRemapper(): (src: Src) => Promise<Src> {
  const maps = new Map<string, Promise<LineMap | null>>();
  return async (src) => {
    if (!src || !src.file.endsWith(".ts")) return src;
    let p = maps.get(src.file);
    if (!p) {
      p = fetchMap(src.file);
      maps.set(src.file, p);
    }
    const map = await p;
    if (!map) return src;
    const hit = lookup(map, src.line, src.col);
    return hit ? { file: src.file, line: hit.line, col: hit.col } : src;
  };
}

/** Rewrites every `src` in a resolved model in place (parts, steps, checks, issues). */
export async function remapResolved(r: Resolved, remap: (src: Src) => Promise<Src>): Promise<void> {
  const seen = new Set<object>();
  const all: NonNullable<Src>[] = [];
  const add = (s: Src | undefined) => {
    if (s && !seen.has(s)) {
      seen.add(s);
      all.push(s);
    }
  };
  for (const p of r.parts) add(p.src);
  for (const s of r.steps) add(s.src);
  for (const c of r.checks) add(c.src);
  for (const i of r.issues) add(i.src);
  await Promise.all(all.map(async (s) => {
    const m = await remap(s);
    if (m && m !== s) {
      s.line = m.line;
      s.col = m.col;
    }
  }));
}
