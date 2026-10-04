// Stairwell vine wall: lattice trellis on the tall wall above the second landing, with a planter at its foot.
// The stairwell turns 180° in two quarter turns: flight 1 comes down from the upper floor to landing 1, flight 2
// runs along the back wall to landing 2, and flight 3 continues down to the lower floor beside flight 1.
// Axes: x along the vine wall, from its corner with the back wall; y up from landing 2; z out from the vine wall
// across the stairwell. Inches. Values marked "inferred" are placeholders until measured; see notes.md.
import { defineProject, span, box, type Range } from "../../core/model/index.ts";

const T = 23 / 32;   // plywood sold as ¾″
const B = 0.75;      // 1× pine boards

export const P = {
  wall: { width: 45.25, height: 165 },   // the vine wall, landing 2 to ceiling
  landing: { alongVineWall: 35.5, alongBackWall: 37.5 }, // landing 2; orientation inferred from the photos
  backWall: 102,                         // landing 2 + flight 2 + landing 1, along the back wall
  wallT: 4.5,                            // inferred: wall thickness, for drawing only
  stair: { rise: 7.5, tread: 10, treadT: 1.5 },          // inferred: typical rise and run, solid wood treads
  risers: { flight1: 6, flight2: 4, flight3: 5 },        // inferred from the photos: 6 + 4 down to landing 2, 5 more to the lower floor
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
    const W = P.wall.width, H = P.wall.height, LW = P.landing.alongVineWall, wt = P.wallT;
    const x: Range = [P.edgeGap, W];                                    // from the back-wall corner to the vine wall's open end
    const latT = 2 * P.lattice.slat;
    const zLat: Range = span(B, latT);                                  // lattice sits on the rails, ¾″ off the wall

    // ---------- the stairwell (context) ----------
    const S = P.stair, R = P.risers, LD = P.landing.alongBackWall;
    const f2Tread = Math.round((P.backWall - 2 * LD) / (R.flight2 - 1) * 16) / 16;   // flight 2 fills the back wall between the landings
    const l1z: Range = [LD + (R.flight2 - 1) * f2Tread, P.backWall];                   // landing 1, same size as landing 2 (inferred)
    const l1y = R.flight2 * S.rise;
    const upperY = l1y + R.flight1 * S.rise, lowerY = -R.flight3 * S.rise;
    const f1End = LW + (R.flight1 - 1) * S.tread, f3End = LW + (R.flight3 - 1) * S.tread;
    const far = Math.max(f1End, f3End) + 36;                                           // how much of each floor to draw
    const tread = (id: string, xr: Range, top: number, zr: Range, where: string) =>
      b.context({ id, name: "Stair tread", where, role: "floor", box: box(xr, [top - S.treadT, top], zr) });

    b.context({ id: "landing", name: "Landing 2", role: "floor", box: box([0, LW], [-S.treadT, 0], [0, LD]) });
    b.context({ id: "landing-1", name: "Landing 1", role: "floor", box: box([0, LW], [l1y - S.treadT, l1y], l1z) });
    b.context({ id: "lower-floor", name: "Lower floor", role: "floor", box: box([f3End, far], [lowerY - 1, lowerY], [0, LD]) });
    b.context({ id: "upper-floor", name: "Upper floor", role: "floor", box: box([f1End, far], [upperY - 1, upperY], [0, P.backWall]) });
    for (let i = 1; i < R.flight3; i++)                                                // flight 3: down from landing 2 along the vine wall
      tread(`flight-3-tread-${i}`, span(LW + (i - 1) * S.tread, S.tread), -i * S.rise, [0, LD], `flight 3, step ${i}`);
    for (let i = 1; i < R.flight2; i++)                                                // flight 2: up from landing 2 along the back wall
      tread(`flight-2-tread-${i}`, [0, LW], i * S.rise, span(LD + (i - 1) * f2Tread, f2Tread), `flight 2, step ${i}`);
    for (let i = 1; i < R.flight1; i++)                                                // flight 1: up from landing 1 to the upper floor
      tread(`flight-1-tread-${i}`, span(LW + (i - 1) * S.tread, S.tread), l1y + i * S.rise, l1z, `flight 1, step ${i}`);

    b.context({ id: "vine-wall", name: "Vine wall", role: "wall", box: box([-wt, W], [lowerY, H], [-wt, 0]) });
    b.context({ id: "back-wall", name: "Back wall", role: "wall", box: box([-wt, 0], [lowerY, H], [0, P.backWall]) });
    b.context({ id: "window-wall", name: "Window wall", role: "wall", box: box([-wt, far], [lowerY, H], [P.backWall, P.backWall + wt]) });
    b.context({ id: "ceiling", name: "Ceiling", role: "wall", box: box([-wt, far], [H, H + 1.5], [-wt, P.backWall + wt]) });

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
        { from: "back-wall.x1", to: "vine-wall.x1", offset: -6 },
        { from: "landing.y1", to: "ceiling.y0", offset: -8 },
        { from: "landing.y1", to: "trellis-lower.y0", offset: W + 4 },
        { from: "trellis-lower.y0", to: "trellis-lower.y1", offset: W + 4 },
        { from: "trellis-upper.y0", to: "trellis-upper.y1", offset: W + 4 },
      ] });
    b.view({ id: "section", title: "Section", kind: "section", look: "+x", cut: W / 2,
      caption: "Cut through the middle, vine wall on the left, stairwell on the right.",
      dims: [{ from: "vine-wall.z1", to: "planter-front.z1", offset: -4 }] });
    b.view({ id: "plan", title: "Plan", kind: "plan", look: "-y", cut: ph / 2,
      dims: [{ from: "back-wall.x1", to: "vine-wall.x1", offset: 6 }, { from: "vine-wall.z1", to: "planter-front.z1", offset: 6 }] });
    b.view({ id: "stair-plan", title: "Stairwell plan", kind: "plan", look: "-y", cut: H - 10, showContents: true,
      caption: "From above: landing 2 and the vine wall at the top left, flight 2 down the back wall, landing 1, flight 1 up to the upper floor.",
      dims: [{ from: "vine-wall.z1", to: "window-wall.z0", offset: -8, text: "{} back wall" }, { from: "landing.z0", to: "landing.z1", offset: -4 }, { from: "landing.x0", to: "landing.x1", offset: -4 }] });
    b.view({ id: "stair-section", title: "Section through flights 3 and 1", kind: "section", look: "+z", cut: LD / 2,
      caption: "Cut through flight 3, looking toward flight 1 and the window wall." });
  },
});
