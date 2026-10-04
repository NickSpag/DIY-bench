// Pure helpers behind the store, kept apart so tests can import them without a store.

/** Shift-click: each id flips membership, unless all are already in, then all leave. */
export function toggleIds(cur: string[], ids: string[]): string[] {
  const set = new Set(cur);
  const allIn = ids.every((id) => set.has(id));
  for (const id of ids) {
    if (allIn) set.delete(id);
    else set.add(id);
  }
  return [...set];
}
