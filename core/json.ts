// Deterministic JSON for CLI output and golden files: numbers rounded to 4 decimals,
// short arrays and objects kept on one line so diffs stay readable.
import { round4 } from "./units.ts";

const INLINE_WIDTH = 100;

/** Rounds every number to 4 decimals and drops functions and undefined values. */
export function normalize(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? round4(value) : null;
  if (Array.isArray(value)) return value.map((v) => (v === undefined || typeof v === "function" ? null : normalize(v)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined || typeof v === "function") continue;
      out[k] = normalize(v);
    }
    return out;
  }
  return value;
}

/** One-line form with a space after each comma and colon. */
function inline(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(inline).join(", ")}]`;
  return `{${Object.entries(v as Record<string, unknown>).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")}}`;
}

function write(v: unknown, indent: string): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  const flat = inline(v);
  if (flat.length + indent.length <= INLINE_WIDTH) return flat;
  const inner = indent + "  ";
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return `[\n${v.map((x) => inner + write(x, inner)).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, x]) => `${inner}${JSON.stringify(k)}: ${write(x, inner)}`).join(",\n")}\n${indent}}`;
}

/** Stable, readable JSON text with a trailing newline. */
export function toJson(value: unknown): string {
  return write(normalize(value), "") + "\n";
}
