// Everything the panels show is a pure function of the resolved model (D5). This caches each
// output per Resolved object, so the panels share one cut list, one nesting and so on.
import type { Resolved } from "../core/model/types.ts";
import { cutList, type CutList } from "../core/cutlist.ts";
import { nest, type Nesting } from "../core/nesting.ts";
import { shoppingList, type ShoppingList } from "../core/shopping.ts";
import { buildSteps, type PhaseSteps } from "../core/steps.ts";

export type Derived = { cutlist: CutList; nestings: Nesting[]; shopping: ShoppingList; steps: PhaseSteps[] };

const cache = new WeakMap<Resolved, Derived>();

export function derive(r: Resolved): Derived {
  let d = cache.get(r);
  if (!d) {
    const nestings = nest(r);
    d = { cutlist: cutList(r), nestings, shopping: shoppingList(r, { nestings }), steps: buildSteps(r) };
    cache.set(r, d);
  }
  return d;
}
