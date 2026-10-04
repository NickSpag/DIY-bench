// Formatting and parsing lengths (section 5.6 of the spec).
import type { Units } from "./model/types.ts";

export const MM_PER_IN = 25.4;
const EPS = 1e-6;

const GLYPH: Record<string, string> = { "1/2": "½", "1/4": "¼", "3/4": "¾", "1/8": "⅛", "3/8": "⅜", "5/8": "⅝", "7/8": "⅞" };
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const sup = (n: number) => String(n).replace(/\d/g, (d) => SUP[Number(d)]);
const sub = (n: number) => String(n).replace(/\d/g, (d) => SUB[Number(d)]);

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** A proper fraction num/den (0 < num < den) as a glyph (½) or super/subscript digits (⁵⁄₁₆). */
function fracText(num: number, den: number): string {
  const g = gcd(num, den);
  const n = num / g, d = den / g;
  return GLYPH[`${n}/${d}`] ?? `${sup(n)}⁄${sub(d)}`;
}

const isMultiple = (v: number, step: number) => Math.abs(Math.round(v / step) * step - v) < EPS;

export type FmtOptions = {
  units?: Units; // units of the input number; default "in"
  display?: Units; // units to show; default the input's units
  denom?: 16 | 32; // imperial rounding; default 16, but exact 32nds are shown as 32nds
  marks?: boolean; // append ″ (or " mm")
  feet?: boolean; // write 27.5 as 2′ 3½
};

/**
 * Formats a length. Imperial: rounded to 1/16 (or 1/32) with fraction glyphs, prefixed
 * by ≈ when rounding changed the value. A value that is an exact 32nd but not an exact
 * 16th is shown in 32nds without ≈ (20¹¹⁄₃₂), unless `denom: 16` is given explicitly.
 * Metric: millimetres rounded to 0.5.
 */
export function fmtLength(n: number, opts: FmtOptions = {}): string {
  const units = opts.units ?? "in";
  const display = opts.display ?? units;
  if (display === "mm") {
    const mm = units === "mm" ? n : n * MM_PER_IN;
    const r = Math.round(mm * 2) / 2;
    const s = (Object.is(r, -0) ? 0 : r).toString().replace("-", "−");
    return opts.marks ? `${s} mm` : s;
  }
  const inches = units === "in" ? n : n / MM_PER_IN;
  const denom = opts.denom ?? (isMultiple(inches, 1 / 32) && !isMultiple(inches, 1 / 16) ? 32 : 16);
  const neg = inches < 0 && Math.round(Math.abs(inches) * denom) !== 0;
  const abs = Math.abs(inches);
  const scaled = Math.round(abs * denom);
  const approx = Math.abs(scaled / denom - abs) > EPS ? "≈" : "";
  let whole = Math.floor(scaled / denom);
  const rem = scaled % denom;
  let feetText = "";
  if (opts.feet && whole >= 12) {
    feetText = `${Math.floor(whole / 12)}′ `;
    whole %= 12;
  }
  const frac = rem === 0 ? "" : fracText(rem, denom);
  const body = (whole !== 0 || frac === "" ? String(whole) : "") + frac;
  return `${approx}${neg ? "−" : ""}${feetText}${body}${opts.marks ? "″" : ""}`;
}

/**
 * A material thickness for display. The material's `thicknessLabel` wins; otherwise a
 * thickness that is a 32nd but not a 16th is written with a plain slash (23/32, 15/32),
 * so plywood sold as ¾″ never prints as ≈¾; anything else uses fmtLength.
 */
export function fmtThickness(
  m: { thickness: number; thicknessLabel?: string },
  opts: { units?: Units; display?: Units; marks?: boolean } = {},
): string {
  if (m.thicknessLabel) return m.thicknessLabel;
  const units = opts.units ?? "in";
  const display = opts.display ?? units;
  if (display === "in") {
    const inches = units === "in" ? m.thickness : m.thickness / MM_PER_IN;
    if (isMultiple(inches, 1 / 32) && !isMultiple(inches, 1 / 16)) {
      const n32 = Math.round(inches * 32);
      const whole = Math.floor(n32 / 32), rem = n32 % 32;
      return `${whole ? `${whole} ` : ""}${rem}/32${opts.marks ? "″" : ""}`;
    }
  }
  return fmtLength(m.thickness, { units, display, marks: opts.marks });
}

// ---------- parsing ----------

const UNIT_ALIASES: Record<string, "ft" | "in" | "mm" | "cm" | "m"> = {
  ft: "ft", feet: "ft", foot: "ft", "'": "ft", "′": "ft",
  in: "in", inch: "in", inches: "in", '"': "in", "″": "in",
  mm: "mm", cm: "cm", m: "m",
};
const TO_IN: Record<"ft" | "in" | "mm" | "cm" | "m", number> = { ft: 12, in: 1, mm: 1 / MM_PER_IN, cm: 10 / MM_PER_IN, m: 1000 / MM_PER_IN };

const GLYPH_VALUE: Record<string, string> = { "½": "1/2", "¼": "1/4", "¾": "3/4", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };

// One component: a number with an optional fraction, or a bare fraction; then an optional unit.
const COMPONENT = new RegExp(
  String.raw`\s*(?:(\d+)\s*/\s*(\d+)(?![\d.])|(\d+(?:\.\d*)?|\.\d+)(?:(?:\s+|\s*-\s*)(\d+)\s*/\s*(\d+))?)` +
    String.raw`\s*(feet|foot|ft|inches|inch|in|mm|cm|m(?![a-z])|'|"|′|″)?`,
  "iy",
);

/**
 * Parses a length typed by a person. Accepts 23 1/4, 23-1/4, 23.25, 23¼, 1⁵⁄₁₆,
 * 2' 3-1/2", 2ft 3.5in, 23¼″, 590mm, 59cm. A bare number is in the project's units.
 * Returns the length in `units`. Throws with a message naming the input.
 */
export function parseLength(s: string, units: Units): number {
  const fail = (why: string): never => {
    throw new Error(`cannot parse length "${s}": ${why}`);
  };
  if (typeof s !== "string") fail("not a string");
  let t = s.trim();
  if (t === "") fail("it is empty");
  // Unicode fractions → " n/d"; superscript⁄subscript fractions → " n/d".
  t = t.replace(/[½¼¾⅛⅜⅝⅞]/g, (g) => ` ${GLYPH_VALUE[g]}`);
  t = t.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)⁄([₀₁₂₃₄₅₆₇₈₉]+)/g, (_, a: string, b: string) =>
    ` ${[...a].map((c) => SUP.indexOf(c)).join("")}/${[...b].map((c) => SUB.indexOf(c)).join("")}`);
  let sign = 1;
  const signMatch = /^[-−]\s*/.exec(t.trimStart());
  if (signMatch) {
    sign = -1;
    t = t.trimStart().slice(signMatch[0].length);
  }
  const parts: { value: number; unit?: keyof typeof TO_IN }[] = [];
  let pos = 0;
  while (pos < t.length) {
    if (/^\s*$/.test(t.slice(pos))) break;
    COMPONENT.lastIndex = pos;
    const m = COMPONENT.exec(t);
    if (!m || m[0].trim() === "") fail(`unexpected text at "${t.slice(pos).trim()}"`);
    const mm = m as RegExpExecArray;
    let value: number;
    if (mm[1] !== undefined) {
      if (Number(mm[2]) === 0) fail("division by zero");
      value = Number(mm[1]) / Number(mm[2]);
    } else {
      value = Number(mm[3]);
      if (mm[4] !== undefined) {
        if (Number(mm[5]) === 0) fail("division by zero");
        value += Number(mm[4]) / Number(mm[5]);
      }
    }
    const unit = mm[6] ? UNIT_ALIASES[mm[6].toLowerCase()] : undefined;
    parts.push(unit ? { value, unit } : { value });
    pos = COMPONENT.lastIndex;
  }
  if (parts.length === 0) fail("no number found");
  let inches = 0;
  let projectUnits = 0; // a single bare number, in the project's units
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.unit) {
      inches += p.value * TO_IN[p.unit];
    } else if (parts.length === 1) {
      projectUnits = p.value;
    } else if (i > 0 && parts[i - 1].unit === "ft") {
      inches += p.value; // 2' 3-1/2 → inches after feet
    } else {
      fail("a number without a unit is ambiguous here");
    }
  }
  const total = units === "in" ? inches + projectUnits : inches * MM_PER_IN + projectUnits;
  if (!Number.isFinite(total)) fail("not a finite number");
  return sign * total;
}

/** Rounds to 4 decimals, the precision of every serialised number. */
export const round4 = (n: number): number => {
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
};
