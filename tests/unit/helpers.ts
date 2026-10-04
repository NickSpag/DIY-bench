// Small projects for unit tests.
import { defineProject } from "../../core/model/index.ts";
import type { AnyProject, ModelBuilder, Project, SheetMaterial } from "../../core/model/index.ts";

export const SHEET: SheetMaterial = {
  type: "sheet", name: "¾ ply", thickness: 0.75, grained: true, finish: "prefinished", kerf: 0.125,
  stock: [{ id: "4x8", length: 96, width: 48, buy: true }],
};

/** A one-option-free project with two phases, a ¾″ sheet, a 1×4 board, a banding and a hardware item. */
export function mini(build: (b: ModelBuilder) => void, extra: Partial<Project> = {}): AnyProject {
  return defineProject({
    id: "mini", title: "Mini", units: "in", options: {},
    phases: [{ id: "p1", title: "One" }, { id: "p2", title: "Two" }],
    materials: {
      ply: SHEET,
      "ply-raw": { ...SHEET, name: "raw ply", finish: "none" },
      pine: { type: "board", name: "1×4", thickness: 0.75, width: 3.5, finish: "none" },
      oak: { type: "board", name: "oak", thickness: 1, finish: "clear" },
    },
    banding: { edge: { name: "Edge banding", thickness: 0.02, width: 0.8125, reducesCutSize: false } },
    hardware: { pin: { name: "Shelf pins", unit: "each" } },
    build: (b) => {
      b.step({ id: "s1", phase: "p1", title: "Step one", text: "" });
      b.step({ id: "s2", phase: "p1", title: "Step two", text: "" });
      b.step({ id: "s3", phase: "p2", title: "Step three", text: "" });
      build(b);
    },
    ...extra,
  });
}
