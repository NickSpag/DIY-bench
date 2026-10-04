// What `wb show` sends to the open viewer (section 11.2 of the spec), and a check of its shape.
// No imports: the dev-server plugin uses it, and Vite restarts the server whenever a module the
// config imports changes, so this file stays apart from the rest of core/.
/**
 * What `wb show` asks the open viewer to do (section 11.2). The dev server relays it to every
 * open page as the custom HMR event `wb:control`; the first page to apply it answers `wb:ack`.
 */
export type Control = {
  id: string;
  project?: string; config?: Record<string, string>;
  phase?: string; step?: string | null;
  view?: string; tab?: string;
  select?: string[]; hover?: string[];
  frame?: boolean;
};
export type ControlAck = { id: string; ok: boolean; message?: string };

/** The side tabs and pane tabs `wb show --tab` accepts. */
export const CONTROL_TABS = ["3d", "drawing", "cutlist", "sheets", "steps", "parts", "checks", "notes"] as const;

/** Checks a Control's shape (not its ids); returns the problem, or null when it is well formed. */
export function controlProblem(c: unknown): string | null {
  if (!c || typeof c !== "object" || Array.isArray(c)) return "expected a JSON object";
  const o = c as Record<string, unknown>;
  const isStr = (v: unknown) => typeof v === "string" && v.length > 0 && v.length < 200;
  const isIds = (v: unknown) => Array.isArray(v) && v.length <= 500 && v.every(isStr);
  if (!isStr(o.id)) return "id must be a non-empty string";
  for (const k of ["project", "phase", "view", "tab"] as const) if (o[k] !== undefined && !isStr(o[k])) return `${k} must be a string`;
  if (o.step !== undefined && o.step !== null && !isStr(o.step)) return "step must be a string or null";
  for (const k of ["select", "hover"] as const) if (o[k] !== undefined && !isIds(o[k])) return `${k} must be an array of part ids`;
  if (o.frame !== undefined && typeof o.frame !== "boolean") return "frame must be true or false";
  if (o.config !== undefined && (!o.config || typeof o.config !== "object" || Array.isArray(o.config) || !Object.values(o.config).every(isStr))) return "config must map option keys to choices";
  if (o.tab !== undefined && !(CONTROL_TABS as readonly string[]).includes(o.tab as string)) return `tab must be one of ${CONTROL_TABS.join(", ")}`;
  const known = new Set(["id", "project", "config", "phase", "step", "view", "tab", "select", "hover", "frame"]);
  const extra = Object.keys(o).filter((k) => !known.has(k));
  if (extra.length) return `unknown field ${extra.join(", ")}`;
  return null;
}
