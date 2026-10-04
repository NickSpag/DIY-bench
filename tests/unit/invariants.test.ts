import { describe, expect, test } from "vitest";
import { box, type ModelBuilder, type PanelSpec } from "../../core/model/index.ts";
import { evaluate } from "../../core/evaluate.ts";
import { mini } from "./helpers.ts";

const FLOOR = box([-10, 110], [-1, 0], [-10, 60]);
const side = (extra: Partial<PanelSpec> = {}): PanelSpec => ({
  id: "side", name: "Side", material: "ply", phase: "p1", step: "s1",
  box: box([0, 0.75], [0, 30], [0, 12]), grain: "y", band: { front: "edge" }, ...extra,
});
const base = (b: ModelBuilder) => {
  b.context({ id: "floor", name: "Floor", role: "floor", box: FLOOR });
  b.context({ id: "wall-back", name: "Back wall", role: "wall", box: box([-10, 110], [0, 100], [-10, 0]) });
};

const issuesOf = (build: (b: ModelBuilder) => void) => evaluate(mini((b) => { base(b); build(b); })).issues;
const codes = (build: (b: ModelBuilder) => void) => issuesOf(build).map((i) => i.code);

test("the baseline has no issues", () => {
  expect(issuesOf((b) => b.panel(side()))).toEqual([]);
});

// [code, a build that triggers it, a build that does not]
const cases: [string, (b: ModelBuilder) => void, (b: ModelBuilder) => void][] = [
  ["unknown-ref",
    (b) => b.panel(side({ joins: [{ to: "nope", by: "screws" }] })),
    (b) => b.panel(side({ joins: [{ to: "floor", by: "screws" }] }))],
  ["unknown-ref",
    (b) => { b.panel(side()); b.view({ id: "v", title: "V", kind: "elevation", look: "-z", dims: [{ from: "side.x0", to: "side.q1" as never, offset: 0 }] }); },
    (b) => { b.panel(side()); b.view({ id: "v", title: "V", kind: "elevation", look: "-z", dims: [{ from: "side.x0", to: "side.x1", offset: 0 }], veil: ["floor"], labels: [{ part: "side", text: "{x}" }] }); }],
  ["unknown-ref",
    (b) => { b.panel(side()); b.step({ id: "s9", phase: "p1", title: "", text: "", parts: ["ghost"] }); },
    (b) => { b.panel(side()); b.step({ id: "s9", phase: "p1", title: "", text: "", parts: ["side"] }); }],
  ["unknown-step", (b) => b.panel(side({ step: "zz" })), (b) => b.panel(side({ step: "s2" }))],
  ["unknown-phase", (b) => b.panel(side({ removedIn: "p9" })), (b) => b.panel(side({ removedIn: "p2" }))],
  ["unknown-phase", (b) => b.panel(side({ moves: { p7: box([0, 0.75], [0, 30], [0, 12]) } })), (b) => b.panel(side({ moves: { p2: box([1, 1.75], [0, 30], [0, 12]) } }))],
  ["unknown-material", (b) => b.panel(side({ material: "nope" })), (b) => b.panel(side({ material: "ply" }))],
  ["unknown-material", (b) => b.panel(side({ material: "oak" })), (b) => b.board({ ...side({ material: "oak", band: {} }), box: box([0, 1], [0, 30], [0, 12]) })],
  ["unknown-banding", (b) => b.panel(side({ band: { front: "nope" } })), (b) => b.panel(side({ band: { front: "edge" } }))],
  ["unknown-hardware",
    (b) => b.hardware({ id: "h", name: "H", item: "nope", qty: 1, phase: "p1", step: "s1" }),
    (b) => b.hardware({ id: "h", name: "H", item: "pin", qty: 1, phase: "p1", step: "s1" })],
  ["range-order",
    (b) => { b.panel(side()); b.view({ id: "v", title: "V", kind: "section", look: "+x", cut: 1, depth: [5, 1] }); },
    (b) => { b.panel(side()); b.view({ id: "v", title: "V", kind: "section", look: "+x", cut: 1, depth: [1, 5] }); }],
  ["thickness", (b) => b.panel(side({ box: box([0, 0.5], [0, 30], [0, 12]) })), (b) => b.panel(side())],
  ["board-width",
    (b) => b.board({ id: "rail", name: "Rail", material: "pine", phase: "p1", step: "s1", box: box([0, 30], [0, 3], [0, 0.75]), grain: "x", exposure: "hidden" }),
    (b) => b.board({ id: "rail", name: "Rail", material: "pine", phase: "p1", step: "s1", box: box([0, 30], [0, 3.5], [0, 0.75]), grain: "x", exposure: "hidden" })],
  ["grain-axis", (b) => b.panel(side({ grain: "x" })), (b) => b.panel(side({ grain: "z" }))],
  ["grain-axis", (b) => b.panel(side({ grain: undefined })), (b) => b.panel(side({ grain: "y" }))],
  ["band-face", (b) => b.panel(side({ band: { left: "edge" } })), (b) => b.panel(side({ band: { top: "edge", back: "edge" } }))],
  ["overlap",
    (b) => { b.panel(side()); b.panel(side({ id: "shelf", box: box([0.5, 20], [10, 10.75], [0, 12]), grain: "x", band: {} })); },
    (b) => { b.panel(side()); b.panel(side({ id: "shelf", box: box([0.75, 20], [10, 10.75], [0, 12]), grain: "x", band: {} })); }],
  ["overlap",
    (b) => { b.context({ id: "wall", name: "Wall", role: "wall", box: box([-5, 0.25], [0, 90], [0, 30]) }); b.panel(side()); },
    (b) => { b.context({ id: "wall", name: "Wall", role: "wall", box: box([-5, 0], [0, 90], [0, 30]) }); b.panel(side()); }],
  ["overlap",
    (b) => { b.context({ id: "bb", name: "Baseboard", role: "wall", box: box([0, 20], [0, 4], [0, 0.5]) }); b.panel(side()); },
    (b) => { b.context({ id: "bb", name: "Baseboard", role: "wall", box: box([0, 20], [0, 4], [0, 0.5]) }); b.panel(side({ joins: [{ to: "bb", by: "notch" }] })); }],
  ["overlap",
    (b) => { b.panel(side()); b.hardware({ id: "box", name: "Box", item: "pin", qty: 1, phase: "p1", step: "s1", box: box([0, 5], [0, 5], [0, 5]) }); },
    (b) => { b.panel(side()); b.context({ id: "box", name: "Box", role: "contents", box: box([0, 5], [0, 5], [0, 5]) }); }],
  ["outside-room", (b) => b.panel(side({ box: box([0, 0.75], [0, 30], [50, 62]) })), (b) => b.panel(side({ box: box([0, 0.75], [0, 30], [48, 60]) }))],
  ["unfinished-exposed", (b) => b.panel(side({ material: "ply-raw" })), (b) => b.panel(side({ material: "ply-raw", exposure: "hidden" }))],
  ["unfinished-exposed", (b) => b.panel(side({ material: "ply-raw" })), (b) => b.panel(side({ material: "ply-raw", finish: "paint" }))],
  ["no-step", (b) => b.panel(side({ step: undefined })), (b) => b.panel(side())],
  ["strip-mismatch",
    (b) => {
      b.panel(side({ id: "f1", box: box([0, 20], [0, 10], [12, 12.75]), grain: "y", band: {}, strip: { id: "s", name: "Strip", order: 0 } }));
      b.panel(side({ id: "f2", box: box([0, 21], [10, 20], [12, 12.75]), grain: "y", band: {}, strip: { id: "s", name: "Strip", order: 1 } }));
    },
    (b) => {
      b.panel(side({ id: "f1", box: box([0, 20], [0, 10], [12, 12.75]), grain: "y", band: {}, strip: { id: "s", name: "Strip", order: 0 } }));
      b.panel(side({ id: "f2", box: box([0, 20], [10, 20], [12, 12.75]), grain: "y", band: {}, strip: { id: "s", name: "Strip", order: 1 } }));
    }],
  ["strip-mismatch",
    (b) => {
      b.panel(side({ id: "f1", box: box([0, 20], [0, 10], [12, 12.75]), grain: "y", band: {}, strip: { id: "s", name: "Strip", order: 0 } }));
      b.panel(side({ id: "f2", box: box([0, 20], [10, 20], [12, 12.75]), grain: "y", band: {}, strip: { id: "s", name: "Strip", order: 0 } }));
    },
    (b) => {
      b.panel(side({ id: "f1", box: box([0, 20], [0, 10], [12, 12.75]), grain: "y", band: {}, strip: { id: "s", name: "Strip", order: 0 } }));
      b.panel(side({ id: "f2", box: box([0, 20], [10, 20], [12, 12.75]), grain: "y", band: {}, strip: { id: "s", name: "Strip", order: 1 } }));
    }],
  ["cut-precision", (b) => b.panel(side({ box: box([0, 0.75], [0, 30.01], [0, 12]) })), (b) => b.panel(side({ box: box([0, 0.75], [0, 30.03125], [0, 12]) }))],
  ["check:rule", (b) => { b.panel(side()); b.check("rule", "A rule", false, "1 > 2"); }, (b) => { b.panel(side()); b.check("rule", "A rule", true); }],
];

describe.each(cases)("%s", (code, bad, good) => {
  test("triggered", () => expect(codes(bad)).toContain(code));
  test("not triggered", () => expect(codes(good)).not.toContain(code));
});

describe("issue details", () => {
  test("overlap names both parts by id, gives the overlap in display units and lists every phase", () => {
    const issues = issuesOf((b) => {
      b.panel(side());
      b.panel(side({ id: "shelf", box: box([0, 20], [10, 10.75], [0, 12]), grain: "x", band: {} }));
    });
    expect(issues).toEqual([expect.objectContaining({
      severity: "error", code: "overlap", parts: ["side", "shelf"], phases: ["p1", "p2"],
      message: "p1, p2: side overlaps shelf by ¾ × ¾ × 12",
    })]);
  });
  test("check severity follows the check; error checks are errors", () => {
    const issues = issuesOf((b) => { b.panel(side()); b.check("hard", "Hard rule", false, undefined, "error"); });
    expect(issues).toEqual([expect.objectContaining({ severity: "error", code: "check:hard", message: "Hard rule" })]);
  });
  test("issues carry the src of the offending part", () => {
    const [i] = issuesOf((b) => b.panel(side({ step: undefined })));
    expect(i.src?.file).toBe("tests/unit/invariants.test.ts");
  });
});
