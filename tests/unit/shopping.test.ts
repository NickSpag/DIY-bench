import { describe, expect, test } from "vitest";
import closet from "../../projects/closet-built-in/project.ts";
import { evaluate } from "../../core/evaluate.ts";
import { shoppingList, suggestBoards } from "../../core/shopping.ts";
import { box } from "../../core/model/index.ts";
import { mini, SHEET } from "./helpers.ts";

describe.each(["1", "0.75"])("closet shopping list, top=%s", (top) => {
  const s = shoppingList(evaluate(closet, { top }));

  test("sheets to buy and owned pieces used", () => {
    expect(s.sheets.map((x) => [x.material, x.stock, x.count])).toEqual([
      ["ply-pre", "4x8", 1], ["ply-pre", "4x4", 1], ["ply-half", "4x8", 1], ["ply-quarter", "4x4", 1],
    ]);
    expect(s.owned.map((x) => [x.material, x.stock, x.used])).toEqual([["ply-raw", "owned-56x48", 1]]);
  });

  test("banding with 10% waste, hardware, no costs", () => {
    expect(s.banding[0].withWaste).toBeCloseTo(257.875 * 1.1, 9);
    expect(s.hardware.map((h) => [h.item, h.qty])).toEqual([["rod", 3], ["rod-socket", 3], ["shelf-pin", 12], ["hamper", 1], ["slide-21", 4], ["pull", 4]]);
    expect(s.total).toBeUndefined();
  });

  test("board totals; no suggestions without stock lengths", () => {
    const pine = s.boards.find((b) => b.material === "pine-1x4");
    expect(pine?.pieces).toBe(8);
    expect(pine?.totalLength).toBeCloseTo(6 * 10.5 + 22.5625 + 6, 9);
    expect(pine?.suggested).toEqual([]);
  });
});

test("suggestBoards: first-fit decreasing, then each board shortened to the shortest stock length that holds it", () => {
  expect(suggestBoards([50, 40, 30, 20], [96, 120], 0.125)).toEqual([{ length: 96, count: 1 }, { length: 120, count: 1 }]);
  expect(suggestBoards([10, 10, 10], [96], 0.125)).toEqual([{ length: 96, count: 1 }]);
  expect(suggestBoards([130], [96, 120], 0.125)).toEqual([{ length: 130, count: 1 }]);
  expect(suggestBoards([], [96], 0.125)).toEqual([]);
});

test("costs add up when stock and hardware have them", () => {
  const p = mini((b) => {
    b.panel({ id: "a", name: "A", material: "ply", phase: "p1", step: "s1", box: box([0, 90], [0, 40], [0, 0.75]), grain: "x" });
    b.hardware({ id: "pins", name: "Pins", item: "pin", qty: 4, phase: "p1", step: "s1" });
  }, {
    materials: { ply: { ...SHEET, stock: [{ id: "4x8", length: 96, width: 48, buy: true, cost: 80 }] } },
    hardware: { pin: { name: "Shelf pins", unit: "each", cost: 0.25 } },
  });
  const s = shoppingList(evaluate(p));
  expect(s.sheets).toEqual([{ material: "ply", materialName: "¾ ply", stock: "4x8", count: 1, cost: 80 }]);
  expect(s.total).toBe(81);
});
