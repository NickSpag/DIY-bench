// Stairwell vine wall: lattice trellis on the tall end wall above the second landing, with a planter at its foot.
// Axes: x across the vine wall (left to right, facing it), y up from the second landing, z out from the vine wall
// toward the stairwell. Inches. Values marked "inferred" are placeholders until measured; see notes.md.
import { defineProject, span, box, type Range } from "../../core/model/index.ts";

const T = 23 / 32;   // plywood sold as ¾″
const B = 0.75;      // 1× pine boards

export const P = {
  wall: { width: 45.25, height: 165 },   // the vine wall, landing to ceiling
  landing: { width: 37.5, depth: 35.5 }, // second landing; width runs along the vine wall (inferred), from its left end (inferred)
  backWall: 102,                         // the stairwell's long wall, for the notes; not modelled yet
  sideWall: 4.5,                         // inferred: thickness, for drawing only
  lattice: { slat: 0.25, slatWidth: 1.4375, sheet: [96, 48] as const },
  edgeGap: 0.125,                        // inferred: clearance to each side wall and the ceiling
  rail: { spacing: 48 },                 // inferred: horizontal 1×2 standoff rails, at most this far apart
  planter: { depth: 9, height: 16 },     // inferred: outside sizes; keeps the landing clear
  linerInset: 0.25,
};

export default defineProject({
  id: "stairwell-vine-wall",
  title: "Stairwell Vine Wall",
  units: "in",
  options: {},
  phases: [
    { id: "p1", title: "Planter and trellis" },
  ],
  materials: {
    lattice: { type: "sheet", name: "Wood lattice, ¼″ slats (two layers, ½″ thick)", thickness: 2 * P.lattice.slat, grained: false, finish: "none", kerf: 0.125,
      stock: [{ id: "4x8", length: P.lattice.sheet[0], width: P.lattice.sheet[1], owned: 2, note: "The two sheets you already have" }] },
    ply: { type: "sheet", name: "23/32″ plywood (sold as ¾″)", thickness: T, grained: true, finish: "clear", kerf: 0.125,
      stock: [{ id: "4x4", length: 48, width: 48, buy: true }, { id: "4x8", length: 96, width: 48, buy: true }] },
    "pine-1x2": { type: "board", name: "1×2", nominal: "1×2", thickness: B, width: 1.5, finish: "paint", stockLengths: [96] },
  },
  banding: {},
  hardware: {
    liner: { name: "Planter liner or tray", unit: "each", spec: "Waterproof; sized to the planter's inside" },
    screws: { name: "Screws into studs, #8 × 2½″", unit: "each" },
    "trellis-screws": { name: "Screws for the lattice, #6 × 1¼″, with finish washers", unit: "each" },
    pads: { name: "Felt or rubber feet", unit: "set" },
  },

  build(b) {
    const W = P.wall.width, H = P.wall.height, D = P.landing.depth, LW = P.landing.width, wt = P.sideWall;
    const x: Range = [P.edgeGap, W - P.edgeGap];                       // trellis and rails stop short of the side walls
    const latT = 2 * P.lattice.slat;
    const zLat: Range = span(B, latT);                                  // lattice sits on the rails, ¾″ off the wall

    // ---------- the stairwell (context) ----------
    b.context({ id: "landing", name: "Second landing", role: "floor", box: box([-wt, LW], [-1, 0], [-wt, D]) });
    // Past the landing's end the floor drops to the next flight; the vine wall carries on above it.
    b.context({ id: "ceiling", name: "Ceiling", role: "wall", box: box([-wt, W + wt], [H, H + 1.5], [-wt, D]) });
    b.context({ id: "vine-wall", name: "Vine wall", role: "wall", box: box([-wt, W + wt], [0, H], [-wt, 0]) });
    b.context({ id: "wall-left", name: "Left wall", role: "wall", box: box([-wt, 0], [0, H], [0, D]) });
    b.context({ id: "wall-right", name: "Right wall", role: "wall", box: box([W, W + wt], [0, H], [0, D]) });

    // ---------- planter at the foot of the wall ----------
    const pd = P.planter.depth, ph = P.planter.height;
    const px: Range = [P.edgeGap, LW - P.edgeGap];                    // the planter sits on the landing only
    b.panel({ id: "planter-front", name: "Planter front or back", where: "front", material: "ply", phase: "p1", step: "planter",
      box: box(px, [0, ph], [pd - T, pd]), grain: "x" });
    b.panel({ id: "planter-back", name: "Planter front or back", where: "back", material: "ply", phase: "p1", step: "planter",
      box: box(px, [0, ph], [0, T]), grain: "x", exposure: "hidden" });
    for (const [side, ex] of [["left", span(px[0], T)], ["right", [px[1] - T, px[1]] as Range]] as const) {
      b.panel({ id: `planter-end-${side}`, name: "Planter end", where: side, material: "ply", phase: "p1", step: "planter",
        box: box(ex, [0, ph], [T, pd - T]), grain: "y", joins: [{ to: "planter-front", by: "screws" }, { to: "planter-back", by: "screws" }] });
    }
    b.panel({ id: "planter-bottom", name: "Planter bottom", material: "ply", phase: "p1", step: "planter",
      box: box([px[0] + T, px[1] - T], span(0, T), [T, pd - T]), grain: "x", exposure: "hidden",
      joins: ["front", "back", "end-left", "end-right"].map(k => ({ to: `planter-${k}`, by: "screws" as const })),
      notes: "Sits inside the four sides. Drill a few weep holes in case the liner overflows." });
    const li = P.linerInset;
    b.hardware({ id: "planter-liner", name: "Liner", item: "liner", qty: 1, phase: "p1", step: "set-planter",
      box: box([px[0] + T + li, px[1] - T - li], [T, ph - 1], [T + li, pd - T - li]) });
    b.hardware({ id: "planter-feet", name: "Feet", item: "pads", qty: 1, phase: "p1", step: "set-planter" });

    // ---------- standoff rails: horizontal, so every one crosses every stud ----------
    const top = H - P.edgeGap;                                          // top of the trellis
    const lowerLen = Math.min(P.lattice.sheet[0], top - ph);           // the lower sheet runs full length
    const seam = ph + lowerLen;
    const upperLen = top - seam;
    const railYs: number[] = [];                                        // centre lines
    const addRails = (y0: number, y1: number, edgeLo: boolean) => {
      const n = Math.max(1, Math.ceil((y1 - y0) / P.rail.spacing));
      for (let i = edgeLo ? 0 : 1; i <= n; i++) railYs.push(Math.round((y0 + (y1 - y0) * i / n) * 16) / 16);
    };
    addRails(ph, seam, true);
    if (upperLen > 0) addRails(seam, top, false);
    railYs.forEach((c, i) => {
      const y0 = Math.min(Math.max(c - 0.75, ph), top - 1.5);
      b.board({ id: `rail-${i + 1}`, name: "Standoff rail", where: `${Math.round(c)}″ up`, material: "pine-1x2", phase: "p1", step: "rails",
        box: box(x, span(y0, 1.5), [0, B]), grain: "x", exposure: "limited", exposureNote: "Shows through the lattice; paint it the wall colour",
        fitToSite: true });
    });
    b.hardware({ id: "rail-screws", name: "Screws into studs", item: "screws", qty: railYs.length * 4, phase: "p1", step: "rails" });

    // ---------- lattice: the two owned sheets, ripped to width, the upper one cut to length ----------
    b.panel({ id: "trellis-lower", name: "Trellis panel", where: "lower", material: "lattice", phase: "p1", step: "trellis",
      box: box(x, [ph, seam], zLat), finish: "clear", joins: [{ to: "rail-1", by: "screws" }],
      notes: "Rip to width; keep the factory end at the bottom." });
    if (upperLen > 0) b.panel({ id: "trellis-upper", name: "Trellis panel", where: "upper", material: "lattice", phase: "p1", step: "trellis",
      box: box(x, [seam, top], zLat), finish: "clear", fitToSite: true,
      notes: "Rip to width and cut to length; line up its diamonds with the lower sheet at the seam." });
    b.hardware({ id: "trellis-screws", name: "Lattice screws", item: "trellis-screws", qty: railYs.length * 5, phase: "p1", step: "trellis" });

    // ---------- steps ----------
    b.step({ id: "planter", phase: "p1", title: "Build the planter",
      text: "Screw the ends between the front and back, then drop the bottom in and screw through the sides. Finish it before it gets wet." });
    b.step({ id: "rails", phase: "p1", title: "Mount the standoff rails",
      text: "Find the studs, level the bottom rail at the planter's height, and screw every rail into each stud it crosses. Paint them the wall colour first." });
    b.step({ id: "trellis", phase: "p1", title: "Cut and hang the lattice",
      text: "Rip both sheets to width. Hang the lower sheet on the bottom rail, then cut the upper sheet to fit to the ceiling and match its diamonds at the seam. Screw through the slat crossings into the rails." });
    b.step({ id: "set-planter", phase: "p1", title: "Set the planter",
      text: "Feet under it, liner in it, and push it back against the wall under the lattice." });

    // ---------- design rules ----------
    b.check("two-sheets-cover", "The two lattice sheets reach from the planter to the ceiling",
      top - ph <= 2 * P.lattice.sheet[0], `${top - ph}″ to cover, ${2 * P.lattice.sheet[0]}″ of lattice`, "error");
    b.check("sheet-width", "One sheet is wide enough for the wall", x[1] - x[0] <= P.lattice.sheet[1],
      `wall needs ${x[1] - x[0]}″, sheets are ${P.lattice.sheet[1]}″`, "error");
    b.check("soil-depth", "At least 12″ of soil depth for a climbing vine", ph - T - 1 >= 12, `${ph - T - 1}″ inside the liner`);

    // ---------- drawing views ----------
    b.view({ id: "front", title: "Elevation", kind: "elevation", look: "-z",
      caption: "Looking at the vine wall from the stairwell.",
      dims: [
        { from: "wall-left.x1", to: "wall-right.x0", offset: -6 },
        { from: "landing.y1", to: "ceiling.y0", offset: -8 },
        { from: "landing.y1", to: "trellis-lower.y0", offset: W + 4 },
        { from: "trellis-lower.y0", to: "trellis-lower.y1", offset: W + 4 },
        { from: "trellis-upper.y0", to: "trellis-upper.y1", offset: W + 4 },
      ] });
    b.view({ id: "section", title: "Section", kind: "section", look: "+x", cut: W / 2,
      caption: "Cut through the middle, vine wall on the left, stairwell on the right.",
      dims: [{ from: "vine-wall.z1", to: "planter-front.z1", offset: -4 }] });
    b.view({ id: "plan", title: "Plan", kind: "plan", look: "-y", cut: ph / 2,
      dims: [{ from: "wall-left.x1", to: "wall-right.x0", offset: 6 }, { from: "vine-wall.z1", to: "planter-front.z1", offset: 6 }] });
  },
});
