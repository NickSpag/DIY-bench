import { describe, expect, test } from "vitest";
import { fmtLength, fmtThickness, parseLength } from "../../core/units.ts";

describe("fmtLength", () => {
  const cases: [number, Parameters<typeof fmtLength>[1], string][] = [
    [23.25, {}, "23¼"],
    [0.75, {}, "¾"],
    [1.3125, {}, "1⁵⁄₁₆"],
    [50.8333, {}, "≈50¹³⁄₁₆"],
    [0, {}, "0"],
    [84, {}, "84"],
    [0.5, {}, "½"],
    [0.125, {}, "⅛"],
    [0.375, {}, "⅜"],
    [0.625, {}, "⅝"],
    [0.875, {}, "⅞"],
    [22.5625, {}, "22⁹⁄₁₆"],
    [20.34375, {}, "20¹¹⁄₃₂"], // an exact 32nd is shown in 32nds, not rounded with ≈
    [20.34375, { denom: 16 }, "≈20⅜"],
    [0.71875, { denom: 16 }, "≈¾"],
    [1.0001, {}, "≈1"],
    [27.5, { marks: true }, "27½″"],
    [27.5, { feet: true }, "2′ 3½"],
    [-3.25, {}, "−3¼"],
    [0.03125, { denom: 32 }, "¹⁄₃₂"],
    [25.4, { units: "mm", display: "in" }, "1"],
    [23.25, { display: "mm" }, "590.5"],
    [590, { units: "mm" }, "590"],
    [12.3, { units: "mm" }, "12.5"],
    [12, { units: "mm", marks: true }, "12 mm"],
  ];
  test.each(cases)("%s %j → %s", (n, opts, want) => {
    expect(fmtLength(n, opts)).toBe(want);
  });
});

describe("fmtThickness", () => {
  test.each([
    [{ thickness: 0.71875 }, "23/32"],
    [{ thickness: 0.46875 }, "15/32"],
    [{ thickness: 0.75 }, "¾"],
    [{ thickness: 1 }, "1"],
    [{ thickness: 0.25 }, "¼"],
    [{ thickness: 0.46875, thicknessLabel: "12 mm" }, "12 mm"],
    [{ thickness: 1.03125 }, "1 1/32"],
  ])("%j → %s", (m, want) => {
    expect(fmtThickness(m)).toBe(want);
  });
});

describe("parseLength", () => {
  const cases: [string, "in" | "mm", number][] = [
    ["23 1/4", "in", 23.25],
    ["23-1/4", "in", 23.25],
    ["23.25", "in", 23.25],
    ["23¼", "in", 23.25],
    ["23¼″", "in", 23.25],
    ["2' 3-1/2\"", "in", 27.5],
    ["2ft 3.5in", "in", 27.5],
    ["2′ 3½″", "in", 27.5],
    ["1⁵⁄₁₆", "in", 1.3125],
    ["3/4", "in", 0.75],
    [".5", "in", 0.5],
    ["84", "in", 84],
    ["7 ft", "in", 84],
    ["59cm", "in", 590 / 25.4],
    ["590", "mm", 590],
    ["1in", "mm", 25.4],
    ["-1 1/2", "in", -1.5],
    ["  12  ", "in", 12],
    ["1m", "mm", 1000],
  ];
  test.each(cases)("%s (%s) → %s", (s, units, want) => {
    expect(parseLength(s, units)).toBeCloseTo(want, 9);
  });

  test("590mm in an inch project is 23.228…", () => {
    const v = parseLength("590mm", "in");
    expect(v).toBeCloseTo(23.2283, 4);
    expect(String(v).startsWith("23.228")).toBe(true);
  });

  test.each(["abc", "", "12 13", "3/0", "23-", "1 ft 2 3"])("rejects %j, naming the input", (s) => {
    expect(() => parseLength(s, "in")).toThrow(`"${s}"`);
  });
});
