// Overlap-check regression test (spec section 8.4): copy the closet into a temporary
// directory, break it in three known ways and assert exactly the overlap errors each one causes.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, expect, test } from "vitest";
import { evaluate } from "../../core/evaluate.ts";
import type { AnyProject } from "../../core/model/index.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE = readFileSync(join(ROOT, "projects/closet-built-in/project.ts"), "utf8")
  .replace(`"../../core/model/index.ts"`, JSON.stringify(pathToFileURL(join(ROOT, "core/model/index.ts")).href));
const dir = mkdtempSync(join(tmpdir(), "diy-bench-overlap-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
async function broken(find: string, replace: string): Promise<AnyProject> {
  expect(SOURCE.split(find).length - 1, `"${find}" should appear once in the fixture`).toBe(1);
  const file = join(dir, `project-${n++}.ts`);
  writeFileSync(file, SOURCE.replace(find, replace));
  return ((await import(pathToFileURL(file).href)) as { default: AnyProject }).default;
}

function overlaps(project: AnyProject) {
  const out: string[] = [];
  for (const config of [{ top: "1" }, { top: "0.75" }]) {
    const issues = evaluate(project, config).issues;
    expect(issues.filter((i) => i.code !== "overlap")).toEqual([]);
    for (const i of issues) out.push(`${config.top}: ${[...(i.parts ?? [])].sort().join(" + ")} in ${i.phases?.join(", ")}`);
  }
  return out.sort();
}

const both = (lines: string[]) => [...lines.map((l) => `0.75: ${l}`), ...lines.map((l) => `1: ${l}`)].sort();

test("the unbroken copy has no issues", async () => {
  expect(overlaps(await broken("const T = 23 / 32;", "const T = 23 / 32;"))).toEqual([]);
});

test("(a) the center nosing widened over the partitions", async () => {
  const p = await broken("      [C0, C1]);", "      [pl, colR]);");
  expect(overlaps(p)).toEqual(both([
    "partition-left + top-shelf-center-nosing in p1, p2",
    "partition-right + top-shelf-center-nosing in p1, p2",
  ]));
});

test("(b) the frame back widened under the top rail", async () => {
  const p = await broken("box: box([bx0 + B, bx1 - BH], frameY, [backZ - BH, backZ])", "box: box([bx0, bx1 - BH], frameY, [backZ - BH, backZ])");
  expect(overlaps(p)).toEqual(both(["hamper-frame-back + hamper-frame-rail in p2"]));
});

test("(c) the partitions' notch joint removed", async () => {
  const p = await broken(
    "        joins: [{ to: \"baseboard-back\", by: \"notch\", note: `Notch the back bottom corner ${BBd.height} × ${BBd.t} for the baseboard` }],\n",
    "",
  );
  expect(overlaps(p)).toEqual(both([
    "baseboard-back + partition-left in p1, p2",
    "baseboard-back + partition-right in p1, p2",
  ]));
});
