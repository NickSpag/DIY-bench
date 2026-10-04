// Stairwell vine wall: lattice trellis on the tall wall above the second landing, with a planter at its foot.
// The stairwell turns 180° in two quarter turns: flight 1 comes down from the upper floor to landing 1, flight 2
// runs along the back wall to landing 2, and flight 3 continues down to the lower floor beside flight 1.
// Axes: x along the vine wall, left to right as you face it (the stairs drop away on the left, the back wall is on
// the right); y up from landing 2; z out from the vine wall across the stairwell. Inches. Inside build, positions
// along the wall are written as u, the distance from the back-wall corner, and bx() mirrors them into x.
// Values marked "inferred" are placeholders until measured; see notes.md.
import { defineProject, span, box, type Range } from "../../core/model/index.ts";

const T = 23 / 32;   // plywood sold as ¾″
const S1 = 0.75;     // 1×1 pine, ¾ × ¾ actual

export const P = {
  wall: { width: 45.25, height: 165 },   // the vine wall, landing 2 to ceiling
  landing: { alongVineWall: 35.5, alongBackWall: 37.5 }, // landing 2; orientation inferred from the photos
  backWall: 102,                         // landing 2 + flight 2 + landing 1, along the back wall
  wallT: 4.5,                            // inferred: wall thickness, for drawing only
  stair: { rise: 7.5, tread: 10, treadT: 1.5 },          // inferred: typical rise and run, solid wood treads
  risers: { flight1: 6, flight2: 4, flight3: 5 },        // inferred from the photos: 6 + 4 down to landing 2, 5 more to the lower floor
  lattice: { slat: 0.25, slatWidth: 1.4375, sheet: [96, 48] as const },
  edgeGap: 0.125,                        // inferred: clearance to the back wall and the ceiling
  latticeOffFloor: 0.5,                  // inferred: the lattice runs from just above landing 2 to the ceiling
  frame: { maxSpan: 24 },                // inferred: 1×1 frame members behind the lattice at most this far apart
  board2x10: { t: 1.5, w: 9.25, length: 144 }, // your 2×10; length inferred until measured
  planter: { depth: 11, offFloor: 12 },  // inferred: outside depth, and the bottom's height above the landing
  leg: 1.5,                              // inferred: square legs ripped from the 2×10
  linerInset: 0.25,
};

export default defineProject({
  id: "stairwell-vine-wall",
  title: "Stairwell Vine Wall",
  units: "in",
  options: {
    stairLeg: {
      label: "Stair-side leg",
      choices: { landing: "On the edge of the landing", step: "At the end of the planter, down to the first step" },
      default: "landing",
    },
  },
  phases: [
    { id: "p1", title: "Planter and trellis" },
  ],
  materials: {
    lattice: { type: "sheet", name: "Wood lattice, ¼″ slats (two layers, ½″ thick)", thickness: 2 * P.lattice.slat, grained: false, finish: "none", kerf: 0.125,
      stock: [{ id: "4x8", length: P.lattice.sheet[0], width: P.lattice.sheet[1], owned: 2, note: "The two sheets you already have" }] },
    ply: { type: "sheet", name: "23/32″ plywood (sold as ¾″)", thickness: T, grained: true, finish: "clear", kerf: 0.125,
      stock: [{ id: "4x4", length: 48, width: 48, buy: true }, { id: "4x8", length: 96, width: 48, buy: true }] },
    "pine-1x1": { type: "board", name: "1×1", nominal: "1×1", thickness: S1, width: S1, finish: "paint", stockLengths: [96] },
    "wood-2x10": { type: "board", name: "2×10 (the board you have)", nominal: "2×10", thickness: P.board2x10.t, width: P.board2x10.w, finish: "clear" },
    "wood-legs": { type: "board", name: "2×10 ripped to 1½ × 1½, for legs", thickness: P.leg, width: P.leg, finish: "clear" },
  },
  banding: {},
  hardware: {
    liner: { name: "Planter liner or tray", unit: "each", spec: "Waterproof; sized to the planter's inside" },
    screws: { name: "Screws into studs, #8 × 2½″", unit: "each" },
    "trellis-screws": { name: "Screws for the lattice, #6 × 1¼″, with finish washers", unit: "each" },
    pads: { name: "Felt or rubber feet", unit: "set" },
  },

  build(b, opt) {
    const W = P.wall.width, H = P.wall.height, LW = P.landing.alongVineWall, wt = P.wallT;
    const bx = (u: Range, y: Range, z: Range) => box([W - u[1], W - u[0]], y, z);   // u from the back-wall corner → x
    const x: Range = [P.edgeGap, W];                                    // from the back-wall corner to the vine wall's open end
    const latT = 2 * P.lattice.slat;
    const zLat: Range = span(S1, latT);                                 // lattice sits on its 1×1 frame, ¾″ off the wall

    // ---------- the stairwell (context) ----------
    const S = P.stair, R = P.risers, LD = P.landing.alongBackWall;
    const f2Tread = Math.round((P.backWall - 2 * LD) / (R.flight2 - 1) * 16) / 16;   // flight 2 fills the back wall between the landings
    const l1z: Range = [LD + (R.flight2 - 1) * f2Tread, P.backWall];                   // landing 1, same size as landing 2 (inferred)
    const l1y = R.flight2 * S.rise;
    const upperY = l1y + R.flight1 * S.rise, lowerY = -R.flight3 * S.rise;
    const f1End = LW + (R.flight1 - 1) * S.tread, f3End = LW + (R.flight3 - 1) * S.tread;
    const far = Math.max(f1End, f3End) + 36;                                           // how much of each floor to draw
    const tread = (id: string, xr: Range, top: number, zr: Range, where: string) =>
      b.context({ id, name: "Stair tread", where, role: "floor", box: bx(xr, [top - S.treadT, top], zr) });

    b.context({ id: "landing", name: "Landing 2", role: "floor", box: bx([0, LW], [-S.treadT, 0], [0, LD]) });
    b.context({ id: "landing-1", name: "Landing 1", role: "floor", box: bx([0, LW], [l1y - S.treadT, l1y], l1z) });
    b.context({ id: "lower-floor", name: "Lower floor", role: "floor", box: bx([f3End, far], [lowerY - 1, lowerY], [0, LD]) });
    b.context({ id: "upper-floor", name: "Upper floor", role: "floor", box: bx([f1End, far], [upperY - 1, upperY], [0, P.backWall]) });
    for (let i = 1; i < R.flight3; i++)                                                // flight 3: down from landing 2 along the vine wall
      tread(`flight-3-tread-${i}`, span(LW + (i - 1) * S.tread, S.tread), -i * S.rise, [0, LD], `flight 3, step ${i}`);
    for (let i = 1; i < R.flight2; i++)                                                // flight 2: up from landing 2 along the back wall
      tread(`flight-2-tread-${i}`, [0, LW], i * S.rise, span(LD + (i - 1) * f2Tread, f2Tread), `flight 2, step ${i}`);
    for (let i = 1; i < R.flight1; i++)                                                // flight 1: up from landing 1 to the upper floor
      tread(`flight-1-tread-${i}`, span(LW + (i - 1) * S.tread, S.tread), l1y + i * S.rise, l1z, `flight 1, step ${i}`);

    b.context({ id: "vine-wall", name: "Vine wall", role: "wall", box: bx([-wt, W], [lowerY, H], [-wt, 0]) });
    b.context({ id: "back-wall", name: "Back wall", role: "wall", box: bx([-wt, 0], [lowerY, H], [0, P.backWall]) });
    b.context({ id: "window-wall", name: "Window wall", role: "wall", box: bx([-wt, far], [lowerY, H], [P.backWall, P.backWall + wt]) });
    b.context({ id: "ceiling", name: "Ceiling", role: "wall", box: bx([-wt, far], [H, H + 1.5], [-wt, P.backWall + wt]) });

    // ---------- lattice: the two owned sheets, ripped to width, the upper one cut to length ----------
    const bottom = P.latticeOffFloor, top = H - P.edgeGap;
    const seam = bottom + Math.min(P.lattice.sheet[0], top - bottom);  // the lower sheet runs full length
    const panels: [string, Range][] = [["lower", [bottom, seam]], ...(top > seam ? [["upper", [seam, top]] as [string, Range]] : [])];
    b.panel({ id: "trellis-lower", name: "Trellis panel", where: "lower", material: "lattice", phase: "p1", step: "trellis",
      box: bx(x, panels[0][1], zLat), finish: "clear", joins: [{ to: "frame-lower-bottom", by: "screws" }],
      notes: "Rip to width; keep the factory end at the bottom." });
    if (panels[1]) b.panel({ id: "trellis-upper", name: "Trellis panel", where: "upper", material: "lattice", phase: "p1", step: "trellis",
      box: bx(x, panels[1][1], zLat), finish: "clear", fitToSite: true, joins: [{ to: "frame-upper-bottom", by: "screws" }],
      notes: "Rip to width and cut to length; line up its diamonds with the lower sheet at the seam." });

    // ---------- 1×1 frame behind each sheet, inside its edges: rails screw to the studs ----------
    const zF: Range = [0, S1];
    let frameRails = 0;
    const railsAt: Record<string, number[]> = {};
    for (const [where, [y0, y1]] of panels) {
      const id = (k: string) => `frame-${where}-${k}`;
      const rail = (k: string, xr: Range, y: number, name: string) => {
        b.board({ id: id(k), name, where: `${where} sheet`, material: "pine-1x1", phase: "p1", step: "frame",
          box: bx(xr, span(y, S1), zF), grain: "x", exposure: "limited", exposureNote: "Shows through the lattice; paint it the wall colour", fitToSite: true });
        frameRails++;
      };
      rail("bottom", x, y0, "Frame rail, full width");
      rail("top", x, y1 - S1, "Frame rail, full width");
      for (const [side, xr] of [["wall", span(x[0], S1)], ["stair", [x[1] - S1, x[1]] as Range]] as const)
        b.board({ id: id(`stile-${side}`), name: "Frame stile", where: `${where} sheet, ${side === "wall" ? "back-wall end" : "stair end"}`, material: "pine-1x1",
          phase: "p1", step: "frame", box: bx(xr, [y0 + S1, y1 - S1], zF), grain: "y", exposure: "limited", exposureNote: "Behind the lattice edge", fitToSite: true });
      const n = Math.ceil((y1 - y0) / P.frame.maxSpan);
      railsAt[where] = [];
      for (let i = 1; i < n; i++) {
        const y = Math.round((y0 + (y1 - y0) * i / n - S1 / 2) * 16) / 16;
        railsAt[where].push(y);
        rail(`rail-${i}`, [x[0] + S1, x[1] - S1], y, "Frame rail, between stiles");
      }
    }
    b.hardware({ id: "frame-screws", name: "Screws into studs", item: "screws", qty: frameRails * 3, phase: "p1", step: "frame" });
    b.hardware({ id: "trellis-screws", name: "Lattice screws", item: "trellis-screws", qty: frameRails * 5, phase: "p1", step: "trellis" });

    // ---------- planter: the 2×10, raised on two back legs that stand on the landing and screw to the frame ----------
    const bt = P.board2x10.t, bh = P.board2x10.w, lg = P.leg;
    const px: Range = x;                                                // the full width of the vine wall
    const pz: Range = [zLat[1], zLat[1] + P.planter.depth];            // its back against the lattice
    const py: Range = span(P.planter.offFloor, bh);
    b.board({ id: "planter-front", name: "Planter front or back", where: "front", material: "wood-2x10", phase: "p1", step: "planter",
      box: bx(px, py, [pz[1] - bt, pz[1]]), grain: "x" });
    b.board({ id: "planter-back", name: "Planter front or back", where: "back", material: "wood-2x10", phase: "p1", step: "planter",
      box: bx(px, py, span(pz[0], bt)), grain: "x", exposure: "limited", exposureNote: "Faces the lattice" });
    for (const [side, xr] of [["wall", span(px[0], bt)], ["stair", [px[1] - bt, px[1]] as Range]] as const)
      b.board({ id: `planter-end-${side}`, name: "Planter end", where: side === "wall" ? "back-wall end" : "stair end", material: "wood-2x10", phase: "p1", step: "planter",
        box: bx(xr, py, [pz[0] + bt, pz[1] - bt]), grain: "z", joins: [{ to: "planter-front", by: "screws" }, { to: "planter-back", by: "screws" }] });
    b.panel({ id: "planter-bottom", name: "Planter bottom", material: "ply", phase: "p1", step: "planter",
      box: bx([px[0] + bt, px[1] - bt], span(py[0], T), [pz[0] + bt, pz[1] - bt]), grain: "x", exposure: "hidden",
      joins: ["front", "back", "end-wall", "end-stair"].map(k => ({ to: `planter-${k}`, by: "screws" as const })),
      notes: "Sits inside the four sides, screwed through them. Drill a few weep holes in case the liner overflows." });

    // Two legs under the back of the planter, screwed through the lattice into the frame. The wall-end leg stands
    // on the landing; the stair-end one either stands on the landing's edge or runs down to the first step.
    const onStep = opt.stairLeg === "step";
    const stepTop = -S.rise;                                            // flight 3's first tread
    const legs: [string, Range, number][] = [
      ["wall", span(px[0], lg), 0],
      ["stair", onStep ? [px[1] - lg, px[1]] : [LW - lg, LW], onStep ? stepTop : 0],
    ];
    for (const [side, xr, foot] of legs)
      b.board({ id: `planter-leg-${side}`, name: "Planter leg", where: side === "wall" ? "back-wall end" : onStep ? "stair end, on the first step" : "edge of the landing",
        material: "wood-legs", phase: "p1", step: "set-planter",
        box: bx(xr, [foot, py[0]], span(pz[0], lg)), grain: "y",
        joins: [{ to: "planter-back", by: "screws" }, { to: "trellis-lower", by: "screws", note: "Through the lattice into the frame" }] });
    // The wall-end leg and an end-of-planter leg land on the frame's stiles; a leg on the landing's edge needs a 1×1 post behind it.
    if (!onStep) {
      const rx = (LW - lg / 2) - S1 / 2;
      b.board({ id: "frame-lower-leg-post", name: "Frame post behind the stair-side leg", material: "pine-1x1", phase: "p1", step: "frame",
        box: bx(span(rx, S1), [bottom + S1, railsAt.lower[0] ?? seam - S1], zF), grain: "y", exposure: "limited", exposureNote: "Behind the lattice and the leg" });
    }
    const legLen = Math.max(...legs.map(([, , foot]) => py[0] - foot));
    const li = P.linerInset;
    b.hardware({ id: "planter-liner", name: "Liner", item: "liner", qty: 1, phase: "p1", step: "set-planter",
      box: bx([px[0] + bt + li, px[1] - bt - li], [py[0] + T, py[1] - 0.5], [pz[0] + bt + li, pz[1] - bt - li]) });
    b.hardware({ id: "planter-feet", name: "Feet", item: "pads", qty: 1, phase: "p1", step: "set-planter" });

    // ---------- steps ----------
    b.step({ id: "frame", phase: "p1", title: "Mount the 1×1 frame",
      text: "Paint the 1×1s the wall colour. Find the studs and screw the full-width rails into every stud they cross, starting just above the landing; then fit the stiles and the post that will sit behind the planter's right leg." });
    b.step({ id: "trellis", phase: "p1", title: "Cut and hang the lattice",
      text: "Rip both sheets to width. Screw the lower sheet to its frame through the slat crossings, then cut the upper sheet to fit to the ceiling and match its diamonds at the seam." });
    b.step({ id: "planter", phase: "p1", title: "Build the planter",
      text: "Cut the front, back and ends from the 2×10, screw the ends between the front and back, and fit the plywood bottom inside. Finish it before it gets wet." });
    b.step({ id: "set-planter", phase: "p1", title: "Legs and planter",
      text: "Rip two legs from the 2×10 offcut and screw them to the planter's back. Stand it on the landing with the legs against the lattice, level it, and screw the legs through the lattice into the frame. Liner in, pads under the legs." });

    // ---------- design rules ----------
    const need = 2 * (px[1] - px[0]) + 2 * (pz[1] - pz[0] - 2 * bt) + legLen + 5 * 0.125;   // front, back, ends, and one length to rip the legs from
    b.check("board-enough", "The 2×10 is long enough for the planter and its legs", need <= P.board2x10.length,
      `needs about ${Math.round(need)}″ of 2×10; the board is ${P.board2x10.length}″`, "error");
    b.check("two-sheets-cover", "The two lattice sheets reach from the landing to the ceiling",
      top - bottom <= 2 * P.lattice.sheet[0], `${top - bottom}″ to cover, ${2 * P.lattice.sheet[0]}″ of lattice`, "error");
    b.check("sheet-width", "One sheet is wide enough for the wall", x[1] - x[0] <= P.lattice.sheet[1],
      `wall needs ${x[1] - x[0]}″, sheets are ${P.lattice.sheet[1]}″`, "error");
    b.check("soil-depth", "At least 12″ of soil depth for a climbing vine", py[1] - py[0] - T - 0.5 >= 12, `${py[1] - py[0] - T - 0.5}″ inside the liner`);

    // ---------- drawing views ----------
    b.view({ id: "front", title: "Elevation", kind: "elevation", look: "-z", depth: [-wt, LD],
      caption: "Looking at the vine wall from the stairwell, from the front edge of landing 2.",
      dims: [
        { from: "vine-wall.x0", to: "back-wall.x0", offset: -6 },
        { from: "landing.y1", to: "ceiling.y0", offset: -8 },
        { from: "landing.y1", to: "trellis-lower.y0", offset: W + 4 },
        { from: "trellis-lower.y0", to: "trellis-lower.y1", offset: W + 4 },
        { from: "trellis-upper.y0", to: "trellis-upper.y1", offset: W + 4 },
      ] });
    b.view({ id: "section", title: "Section", kind: "section", look: "+x", cut: W / 2,
      caption: "Cut through the middle, vine wall on the left, stairwell on the right.",
      dims: [{ from: "vine-wall.z1", to: "planter-front.z1", offset: -4 }] });
    b.view({ id: "plan", title: "Plan", kind: "plan", look: "-y", cut: py[0] + 4,
      dims: [{ from: "vine-wall.x0", to: "back-wall.x0", offset: 6 }, { from: "vine-wall.z1", to: "planter-front.z1", offset: 6 }] });
    b.view({ id: "stair-plan", title: "Stairwell plan", kind: "plan", look: "-y", cut: H - 10, showContents: true,
      caption: "From above: landing 2 and the vine wall at the top left, flight 2 down the back wall, landing 1, flight 1 up to the upper floor.",
      dims: [{ from: "vine-wall.z1", to: "window-wall.z0", offset: -8, text: "{} back wall" }, { from: "landing.z0", to: "landing.z1", offset: -4 }, { from: "landing.x0", to: "landing.x1", offset: -4 }] });
    b.view({ id: "stair-section", title: "Section through flights 3 and 1", kind: "section", look: "+z", cut: LD / 2,
      caption: "Cut through flight 3, looking toward flight 1 and the window wall." });
  },
});
