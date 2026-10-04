// The closet's cut list against spec section 13.1 "Cut list", and the CSV and text exports.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import closet from "../../projects/closet-built-in/project.ts";
import { evaluate } from "../../core/evaluate.ts";
import { cutList, rowOf } from "../../core/cutlist.ts";
import { cutListCsv, parseCsv, CSV_COLUMNS } from "../../core/export/csv.ts";
import { cutListText, fmtRowSize } from "../../core/export/text.ts";
import { box } from "../../core/model/index.ts";
import { mini } from "./helpers.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const wb = (...args: string[]) => execFileSync(`${ROOT}/wb`, args, { cwd: ROOT, encoding: "utf8" });

type Want = [phase: string, material: string, qty: number, name: string, size: string, tags: string[]];
const STRIP = "from strip Strip for the phase 2 faces";

const expected = (top: "1" | "0.75"): Want[] => [
  ["p1", "ply-pre", 2, "Partition", "84 × 23¼ × 23/32", ["band front"]],
  ["p1", "ply-pre", 1, "Center fixed shelf", "22⁹⁄₁₆ × 23¼ × 23/32", ["band front"]],
  ["p1", "ply-pre", 3, "Center adjustable shelf", "22⁷⁄₁₆ × 22½ × 23/32", ["band front"]],
  ["p1", "ply-pre", 1, "Right 70″ shelf", "11¼ × 28 × 23/32", ["cut to fit", "grain free"]],
  ["p1", "ply-raw", 2, "Top shelf", "28 × 11¼ × 23/32", ["Behind the header; only the underside shows", "cut to fit"]],
  ["p1", "ply-raw", 1, "Center top shelf", "24 × 11¼ × 23/32", ["Behind the header", "cut to fit"]],
  ["p1", "ply-raw", 2, "Nailer", "22⁹⁄₁₆ × 3½ × 23/32", ["hidden", "grain free"]],
  ["p1", "ply-raw", 1, "Strip for the phase 2 faces", "48⅝ × 23⁵⁄₁₆ × 23/32", []],
  ["p1", "hw-nosing", 3, "Shelf nosing", "28 × 1½ × ¾", []],
  ["p1", "hw-nosing", 1, "Shelf nosing", "22⁹⁄₁₆ × 1½ × ¾", []],
  ["p1", "pine-1x4", 6, "Side cleat", "10½ × 3½ × ¾", ["hidden"]],
  ["p1", "pine-1x4", 1, "Floor rail", "22⁹⁄₁₆ × 3½ × ¾", ["hidden"]],
  ["p1", "pine-1x4", 1, "Rod backer", "6 × 3½ × ¾", ["hidden"]],
  ["p1", "pine-1x2", 3, "Back cleat", "26½ × 1½ × ¾", ["hidden", "cut to fit"]],
  ["p2", "ply-raw", 1, "Hamper face", "27⅝ × 23⁵⁄₁₆ × 23/32", ["needs finish", STRIP]],
  ["p2", "ply-raw", 1, "Drawer face", "7⅞ × 23⁵⁄₁₆ × 23/32", ["needs finish", STRIP]],
  ["p2", "ply-raw", 1, "Drawer face", "6⅞ × 23⁵⁄₁₆ × 23/32", ["needs finish", STRIP]],
  ["p2", "ply-raw", 1, "Drawer face", "5⅞ × 23⁵⁄₁₆ × 23/32", ["needs finish", STRIP]],
  ["p2", "ply-half", 1, "Hamper frame side", "21 × 26½ × 15/32", ["hidden"]],
  ["p2", "ply-half", 1, "Hamper frame back", "20¹¹⁄₃₂ × 26½ × 15/32", ["hidden"]],
  ...(["6½", "5½", "4½"].flatMap((h): Want[] => [
    ["p2", "ply-half", 2, "Drawer box side", `21 × ${h} × 15/32`, ["hidden"]],
    ["p2", "ply-half", 2, "Drawer box front or back", `20⅝ × ${h} × 15/32`, ["hidden"]],
  ])),
  ["p2", "ply-quarter", 3, "Drawer bottom", "21 × 20⁷⁄₁₆ × ¼", ["hidden", "grain free"]],
  top === "1" ? ["p2", "hw-1in", 1, "Hardwood top", "22⁹⁄₁₆ × 24 × 1", []] : ["p2", "hw-34", 1, "Hardwood top", "22⁹⁄₁₆ × 24 × ¾", []],
  ["p2", "hw-34", 1, "Hamper frame top rail", "21 × 3 × ¾", ["hidden"]],
];

describe.each(["1", "0.75"] as const)("closet cut list, top=%s", (top) => {
  const r = evaluate(closet, { top });
  const cl = cutList(r);
  const got = cl.rows.map((row): Want => [row.phase, row.material, row.qty, row.name, fmtRowSize(r, row), row.tags]);

  test("has exactly the rows of section 13.1", () => {
    const key = (w: Want) => JSON.stringify(w);
    expect(got.map(key).sort()).toEqual(expected(top).map(key).sort());
  });

  test("strip members are listed in phase 2 and cut in phase 1", () => {
    const faces = cl.rows.filter((row) => row.tags.includes(STRIP));
    expect(faces).toHaveLength(4);
    for (const f of faces) expect([f.phase, f.cutPhase, f.strip]).toEqual(["p2", "p1", "faces"]);
  });

  test("the strip is 48⅝ × 23⁵⁄₁₆ in phase 1 with its four members in order", () => {
    expect(cl.strips).toEqual([{ id: "faces", name: "Strip for the phase 2 faces", phase: "p1", material: "ply-raw", l: 48.625, w: 23.3125, members: ["hamper-face", "drawer-face-1", "drawer-face-2", "drawer-face-3"] }]);
    const row = cl.rows.find((x) => x.type === "strip");
    expect(row).toMatchObject({ phase: "p1", qty: 1, ids: ["hamper-face", "drawer-face-1", "drawer-face-2", "drawer-face-3"], cut: { l: 48.625, w: 23.3125 } });
  });

  test("banded front edges total 257⅞", () => {
    expect(cl.banding).toHaveLength(1);
    expect(cl.banding[0].length).toBeCloseTo(257.875, 9);
    expect(cl.banding[0].ids).toEqual(["partition-left", "partition-right", "center-shelf-fixed", "center-shelf-adj-1", "center-shelf-adj-2", "center-shelf-adj-3"]);
  });

  test("hardware", () => {
    expect(cl.hardware.map((h) => [h.item, h.qty, h.unit, h.notes])).toEqual([
      ["rod", 3, "each", ["2 @ 26¼, 1 @ 27"]],
      ["rod-socket", 3, "pair", []],
      ["shelf-pin", 12, "each", []],
      ["hamper", 1, "each", []],
      ["slide-21", 4, "pair", []],
      ["pull", 4, "each", []],
    ]);
    expect(cl.hardware.find((h) => h.item === "hamper")?.spec).toBe("19½ W × 15 D × 23 H max, or a ½″ ply box on four 2″ casters");
  });

  test("rows are sorted by phase, sheets before boards, material, then area", () => {
    const phases = cl.rows.map((row) => row.phase);
    expect(phases.indexOf("p2")).toBe(phases.lastIndexOf("p1") + 1);
    expect(cl.rows[0].name).toBe("Partition");
  });

  test("the CSV parses back into the same rows", () => {
    const parsed = parseCsv(cutListCsv(r, cl));
    expect(parsed[0]).toEqual([...CSV_COLUMNS]);
    expect(parsed).toHaveLength(cl.rows.length + 1);
    expect(parsed.slice(1).map((c) => c[2])).toEqual(cl.rows.map((row) => row.name));
    const partition = parsed.find((c) => c[2] === "Partition");
    expect(partition?.slice(3, 7)).toEqual(["2", "84", "23¼", "23/32"]);
  });

  test("rowOf finds a part's own row", () => {
    expect(rowOf(cl, "drawer-face-2")?.name).toBe("Drawer face");
    expect(rowOf(cl, "partition-left")?.qty).toBe(2);
  });
});

describe("cut list rules", () => {
  test("banding that reduces the cut size comes off the opposite dimension, and oversize is added", () => {
    const r = evaluate(mini((b) => {
      b.panel({ id: "shelf", name: "Shelf", material: "ply", phase: "p1", step: "s1", box: box([0, 30], [0, 0.75], [0, 12]), grain: "x", band: { front: "thick", left: "thick" } });
    }, {
      banding: { thick: { name: "Thick banding", thickness: 0.25, width: 0.75, reducesCutSize: true } },
    }));
    const [row] = cutList(r).rows;
    expect(row.band).toEqual({ l2: "thick", w1: "thick" });
    expect(row.finished).toEqual({ l: 30, w: 12, t: 0.75 });
    expect(row.cut).toEqual({ l: 29.75, w: 11.75, t: 0.75 });
  });

  test("tags: paint and needs finish on an unfinished material", () => {
    const r = evaluate(mini((b) => {
      b.panel({ id: "p", name: "P", material: "ply-raw", phase: "p1", step: "s1", box: box([0, 30], [0, 0.75], [0, 12]), grain: "x", finish: "paint" });
    }));
    expect(cutList(r).rows[0].tags).toEqual(["needs finish", "paint"]);
  });

  test("a phase filter keeps only that phase's rows and hardware", () => {
    const r = evaluate(closet);
    const p2 = cutList(r, { phase: "p2" });
    expect(new Set(p2.rows.map((row) => row.phase))).toEqual(new Set(["p2"]));
    expect(p2.hardware.map((h) => h.item)).toEqual(["slide-21", "pull"]);
    expect(p2.banding).toEqual([]);
  });
});

describe("CLI", () => {
  test("./wb cutlist --json is the core cut list", () => {
    const json = JSON.parse(wb("cutlist", "--project", "closet-built-in", "--json"));
    expect(json.rows).toHaveLength(cutList(evaluate(closet)).rows.length);
    expect(json.rows[0]).toMatchObject({ name: "Partition", qty: 2, tags: ["band front"] });
  });

  test("./wb cutlist --format text matches expected/cutlist.top=1.txt", () => {
    const golden = readFileSync(`${ROOT}/projects/closet-built-in/expected/cutlist.top=1.txt`, "utf8");
    expect(wb("cutlist", "--project", "closet-built-in", "--format", "text")).toBe(golden);
    expect(cutListText(evaluate(closet), cutList(evaluate(closet)))).toBe(golden);
  });
});
