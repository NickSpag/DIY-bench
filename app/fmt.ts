// Length formatting in the display unit the user picked (in or mm).
import { useWb } from "./store.ts";
import { fmtLength, fmtThickness } from "../core/units.ts";
import type { Material, Resolved } from "../core/model/types.ts";

export type Fmt = { L: (n: number, marks?: boolean) => string; T: (m: Material) => string; display: "in" | "mm" };

export function makeFmt(r: Resolved | null, display: "in" | "mm"): Fmt {
  const units = r?.project.units ?? "in";
  return {
    display,
    L: (n, marks = false) => fmtLength(n, { units, display, marks }),
    T: (m) => fmtThickness(m, { units, display }),
  };
}

export function useFmt(): Fmt {
  const r = useWb((s) => s.resolved);
  const display = useWb((s) => s.display);
  return makeFmt(r, display);
}
