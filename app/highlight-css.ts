// The highlight stylesheet as a pure function of the selection (see highlight.ts).
const esc = (id: string) => id.replace(/["\\]/g, "\\$&");

export function highlightCss(selected: string[], hovered: string[]): string {
  const rules: string[] = [];
  for (const id of hovered) {
    if (selected.includes(id)) continue;
    rules.push(`[data-part~="${esc(id)}"] { --hl: var(--hl-hover); --hl-mix: 70%; --hl-w: 1.6; }`);
  }
  for (const id of selected) {
    rules.push(`[data-part~="${esc(id)}"] { --hl: var(--hl-select); --hl-mix: 50%; --hl-w: 2.4; }`);
    // Unfinished placements on the sheet layouts are hatched by a pattern, which cannot be tinted.
    rules.push(`.wb-sheets .wb-placement[data-part~="${esc(id)}"] > .wb-part.k-raw, .wb-sheets .wb-strip-member[data-part~="${esc(id)}"] > .wb-strip-cut { fill: color-mix(in oklab, var(--hl-select) 38%, var(--sheet-board)); }`);
  }
  return rules.join("\n");
}
