// Clicking anything that carries data-part selects those parts (D4). Shift-click toggles.
import { useWb, type Source } from "./store.ts";
import type { MouseEvent as ReactMouseEvent } from "react";

export function idsOf(el: Element | null): string[] {
  const host = el?.closest("[data-part]");
  const v = host?.getAttribute("data-part") ?? "";
  return v.split(/\s+/).filter(Boolean);
}

export function pickFromEvent(e: ReactMouseEvent | MouseEvent, source: Source): boolean {
  const ids = idsOf(e.target as Element);
  if (ids.length === 0) return false;
  useWb.getState().select(ids, { toggle: e.shiftKey, source });
  return true;
}

/** Scrolls the first element tagged with a selected id into view inside `root`, when it is not visible already. */
export function revealSelected(root: HTMLElement | null, selected: string[]): void {
  if (!root || selected.length === 0) return;
  for (const id of selected) {
    const el = root.querySelector(`[data-part~="${CSS.escape(id)}"]`);
    if (el) {
      const r = el.getBoundingClientRect(), b = root.getBoundingClientRect();
      if (r.top < b.top + 30 || r.bottom > b.bottom - 10) el.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
  }
}
