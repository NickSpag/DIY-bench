// The viewer state as a few lines of text for the agent (section 10.2 of the spec): what the
// selection hook prints before every prompt, and what `wb state` prints. It reads a parsed
// .diy-bench/state.json defensively, since the file may be from an older app or half-written
// by hand, and never evaluates anything.
import type { Box } from "./model/types.ts";
import { fmtLength } from "./units.ts";

export const STALE_MS = 2 * 3600_000; // older than this: ask the user which part they mean
export const EXPIRED_MS = 24 * 3600_000; // older than this: say nothing at all
export const MAX_LISTED = 5; // more selected parts than this are summarised on one line

type Summary = { id?: unknown; name?: unknown; where?: unknown; material?: unknown; size?: unknown; box?: unknown; src?: unknown };

const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const oneLine = (s: string, max = 160) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** "40 s", "12 min", "3 h". */
export function fmtAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} h`;
}

function isRange(r: unknown): r is [number, number] {
  return Array.isArray(r) && r.length === 2 && typeof r[0] === "number" && typeof r[1] === "number";
}

function boxText(b: unknown, units: "in" | "mm"): string | undefined {
  const box = b as Partial<Box> | null;
  if (!box || typeof box !== "object" || !isRange(box.x) || !isRange(box.y) || !isRange(box.z)) return undefined;
  const L = (n: number) => fmtLength(n, { units });
  return (["x", "y", "z"] as const).map((a) => `${a} ${L((box[a] as [number, number])[0])}–${L((box[a] as [number, number])[1])}`).join(" ");
}

/** One part: `drawer-face-2 "Drawer face" (drawer 2) · 6⅞ × 23⁵⁄₁₆ × 23/32 ply-raw · x … y … z … · projects/…/project.ts:193`. */
export function partLine(p: Summary, units: "in" | "mm"): string {
  const id = str(p.id) ?? "?";
  const head = `${id}${str(p.name) ? ` "${str(p.name)}"` : ""}${str(p.where) ? ` (${str(p.where)})` : ""}`;
  const sizeMat = [str(p.size), str(p.material)].filter(Boolean).join(" ");
  return [head, sizeMat, boxText(p.box, units), str(p.src)].filter(Boolean).join(" · ");
}

function partsLine(label: string, list: Summary[], units: "in" | "mm"): string[] {
  if (list.length === 0) return [];
  if (list.length > MAX_LISTED) {
    let ids = list.map((p) => str(p.id) ?? "?").join(", ");
    if (ids.length > 240) ids = `${ids.slice(0, 239).replace(/,[^,]*$/, "")}, …`;
    return [`[diy-bench] ${label}: ${list.length} parts (${ids})`];
  }
  return list.map((p) => `[diy-bench] ${label}: ${partLine(p, units)}`);
}

/**
 * The lines for a viewer state, at most 8. Fresh: a header line, then one line per selected
 * part (or "selected: nothing"), then a hovered line if hover highlighting is on. Older than
 * 2 h: one line asking to confirm. Older than 24 h, or not a state at all: nothing.
 * `ignoreAge` prints the full lines whatever the age (for `wb state`).
 */
export function viewerContextLines(state: unknown, now: number = Date.now(), opts: { ignoreAge?: boolean } = {}): string[] {
  if (!state || typeof state !== "object") return [];
  const s = state as Record<string, unknown>;
  if (s.version !== 1 || !str(s.project)) return [];
  const at = typeof s.updatedAt === "string" ? Date.parse(s.updatedAt) : NaN;
  if (!Number.isFinite(at)) return [];
  const age = Math.max(0, now - at);
  if (age > EXPIRED_MS && !opts.ignoreAge) return [];
  if (age > STALE_MS && !opts.ignoreAge) return [`[diy-bench] viewer state is ${fmtAge(age)} old; confirm which part the user means`];

  const units = s.units === "mm" ? "mm" : "in";
  const config = s.config && typeof s.config === "object" ? Object.entries(s.config as Record<string, unknown>).map(([k, v]) => `${k}=${String(v)}`) : [];
  const phase = str(s.phase);
  const step = str(s.step);
  const view = str(s.viewTitle) ?? str(s.drawingView);
  const issues = (s.issues ?? {}) as { errors?: unknown };
  const errors = typeof issues.errors === "number" ? issues.errors : 0;
  const head = [
    str(s.project) as string,
    ...(config.length ? [config.join(", ")] : []),
    ...(phase ? [`phase ${phase}${step ? `, step ${step}` : ""}`] : []),
    ...(view ? [`view: ${view.charAt(0).toLowerCase()}${view.slice(1)}`] : []),
    ...(errors > 0 ? [`${errors} error${errors === 1 ? "" : "s"} in the model`] : []),
  ].join(" · ");
  const lines = [`[diy-bench] ${head} (state ${fmtAge(age)} old)`];
  const modelError = str(s.modelError);
  if (modelError) lines.push(`[diy-bench] the file fails to evaluate, so the viewer shows the last good model: ${oneLine(modelError)}`);

  const asList = (v: unknown): Summary[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Summary[] : []);
  const selected = asList(s.selected);
  const hovered = asList(s.hovered);
  if (selected.length === 0) lines.push("[diy-bench] selected: nothing");
  else lines.push(...partsLine("selected", selected, units));
  // Hover is optional (D20): one line at most, after the selection.
  if (hovered.length) lines.push(...partsLine("hovered", hovered, units).slice(0, 1).map((l) => (hovered.length > 1 && hovered.length <= MAX_LISTED ? `${l} (+${hovered.length - 1} more)` : l)));
  return lines.slice(0, 8);
}
