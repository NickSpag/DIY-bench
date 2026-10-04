// Every project in every configuration against its expected/ files (spec section 13.2).
// To accept a deliberate change: ./wb snapshot --update, and explain each changed line.
import { expect, test } from "vitest";
import { listProjectIds } from "../tools/projects.ts";
import { snapshot } from "../tools/golden.ts";

const ids = listProjectIds();

test("there is at least one project", () => {
  expect(ids.length).toBeGreaterThan(0);
});

test.each(ids)("%s matches its golden files", async (id) => {
  const res = await snapshot(id, false);
  const problems = [
    ...res.added.map((f) => `missing expected/${f} (run ./wb snapshot --update)`),
    ...res.removed.map((f) => `expected/${f} is no longer produced`),
    ...res.changed.map((f) => res.diffs.get(f) ?? f),
  ];
  if (problems.length) throw new Error(`${id}: golden files differ\n\n${problems.join("\n\n")}`);
});
