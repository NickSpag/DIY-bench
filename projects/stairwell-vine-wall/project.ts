// Stairwell vine wall: lattice trellis on the tall wall above the second landing, with a planter at its foot.
// The stairwell turns 180° in two quarter turns: flight 1 comes down from the upper floor to landing 1, flight 2
// runs along the back wall to landing 2, and flight 3 continues down to the lower floor beside flight 1.
// Axes: x along the vine wall, left to right as you face it, from its corner with the back wall (the stairs drop
// away on the right); y up from landing 2; z out from the vine wall across the stairwell. Inches.
// Values marked "inferred" are placeholders until measured; see notes.md.
import { defineProject, span, box, type Range } from "../../core/model/index.ts";
import { fmtLength } from "../../core/units.ts";

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
  frame: { maxSpan: 24 },                // inferred: 1×1 frame members behind the lattice at most this far apart
  board2x10: { t: 1.5, w: 9, length: 144 },  // your board, measured 1½ × 9; length inferred until measured
  boardColor: "#4f7299",                 // the board is blue; for the 3D view and drawings
  resawKerf: 0.125,                      // inferred: the board is resawn in half through its thickness
  planter: { depth: 11, top: 38 },       // top 38″ above the landing; depth inferred
  leg: 1.5,                              // inferred: square legs, 2×2 from other wood
  linerInset: 0.25,                      // inferred: gap between the box and the liner
  reservoir: { depth: 2.5, linerWall: 0.125, grate: 0.5, cup: 4, tube: 1.66 }, // inferred: water depth, liner wall, egg-crate grate, wicking cup and 1¼″ PVC fill tube diameters
};

export default defineProject({
  id: "stairwell-vine-wall",
  title: "Stairwell Vine Wall",
  units: "in",
  options: {
    planterHeight: {
      label: "Planter sides",
      choices: { "2": "Two boards high (about 18″, deeper soil)", "1": "One board high (9″)" },
      default: "2",
    },
    stairLeg: {
      label: "Stair-side leg",
      choices: { landing: "On the edge of the landing", step: "At the end of the planter, down to the first step" },
      default: "landing",
    },
  },
  phases: [
    { id: "p1", title: "Planter and the first trellis sheet", summary: "The vine can be planted and climbing after this phase." },
    { id: "p2", title: "Second trellis sheet", summary: "When the vine outgrows the first sheet: the rest of the way to the ceiling." },
  ],
  materials: {
    lattice: { type: "sheet", name: "Wood lattice, ¼″ slats (two layers, ½″ thick)", thickness: 2 * P.lattice.slat, grained: false, finish: "none", kerf: 0.125,
      stock: [{ id: "4x8", length: P.lattice.sheet[0], width: P.lattice.sheet[1], owned: 2, note: "The two sheets you already have" }] },
    ply: { type: "sheet", name: "23/32″ plywood (sold as ¾″)", thickness: T, grained: true, finish: "clear", kerf: 0.125,
      stock: [{ id: "4x4", length: 48, width: 48, buy: true }, { id: "4x8", length: 96, width: 48, buy: true }] },
    "pine-1x1": { type: "board", name: "1×1", nominal: "1×1", thickness: S1, width: S1, finish: "paint", stockLengths: [96] },
    "wood-resawn": { type: "board", name: "Your blue 1½ × 9 board, resawn in half", thickness: (P.board2x10.t - P.resawKerf) / 2, width: P.board2x10.w, finish: "clear", color: P.boardColor },
    "wood-legs": { type: "board", name: "2×2 for the legs (other wood), painted white", nominal: "2×2", thickness: P.leg, width: P.leg, finish: "paint", color: "#f3f1ec", stockLengths: [96] },
  },
  banding: {},
  hardware: {
    liner: { name: "Rigid planter liner (trough insert)", unit: "each", spec: "Seamless and watertight; see the part's notes for the size" },
    grate: { name: "Egg-crate grate (plastic light-diffuser panel)", unit: "each", spec: "Cut to fit inside the liner" },
    "grate-supports": { name: "Grate supports: short pieces of PVC pipe", unit: "set" },
    cup: { name: "Wicking cups (4″ net pots)", unit: "each" },
    "fill-tube": { name: "Fill tube, 1¼″ PVC pipe", unit: "each", spec: "Cut the bottom end at an angle so water flows out" },
    gauge: { name: "Water-level float gauge", unit: "each", spec: "Sits in the fill tube" },
    sealer: { name: "Sealer for the inside of the box (epoxy or liquid rubber)", unit: "set" },
    "landscape-fabric": { name: "Landscape fabric, to keep soil out of the reservoir", unit: "set" },
    screws: { name: "Screws into studs, #8 × 2½″", unit: "each" },
    "trellis-screws": { name: "Screws for the lattice, #6 × 1¼″, with finish washers", unit: "each" },
    pads: { name: "Felt or rubber feet", unit: "set" },
  },

  build(b, opt) {
    const W = P.wall.width, H = P.wall.height, LW = P.landing.alongVineWall, wt = P.wallT;
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

    // ---------- planter: the blue board on the front and ends, a plywood back against the wall, raised on two legs ----------
    const bt = (P.board2x10.t - P.resawKerf) / 2, bh = P.board2x10.w, lg = P.leg;
    const layers = Number(opt.planterHeight);
    const px: Range = x;                                                // the full width of the vine wall
    const pz: Range = [0, P.planter.depth];                             // its back against the wall
    const py: Range = [P.planter.top - layers * bh, P.planter.top];
    const lid = (base: string, i: number) => (i === 0 ? base : `${base}-${i + 1}`);   // the lower row keeps the plain ids
    b.panel({ id: "planter-back", name: "Planter back", material: "ply", phase: "p1", step: "planter",
      box: box([px[0] + bt, px[1] - bt], py, span(pz[0], T)), grain: "x", exposure: "hidden",
      notes: "Plywood, fitted between the ends: it is against the wall and never seen, which saves the blue board for the front and ends." });
    for (let i = 0; i < layers; i++) {
      const yr = span(py[0] + i * bh, bh), row = layers > 1 ? (i === 0 ? ", lower" : ", upper") : "";
      b.board({ id: lid("planter-front", i), name: "Planter front", where: `front${row}`, material: "wood-resawn", phase: "p1", step: "planter",
        box: box(px, yr, [pz[1] - bt, pz[1]]), grain: "x" });
      for (const [side, xr] of [["wall", span(px[0], bt)], ["stair", [px[1] - bt, px[1]] as Range]] as const)
        b.board({ id: lid(`planter-end-${side}`, i), name: "Planter end", where: `${side === "wall" ? "back-wall end" : "stair end"}${row}`, material: "wood-resawn", phase: "p1", step: "planter",
          box: box(xr, yr, [pz[0], pz[1] - bt]), grain: "z",   // flush to the wall; the back fits between the ends
          joins: [{ to: lid("planter-front", i), by: "screws" }, { to: "planter-back", by: "screws" }] });
    }
    const topBack = "planter-back";
    b.panel({ id: "planter-bottom", name: "Planter bottom", material: "ply", phase: "p1", step: "planter",
      box: box([px[0] + bt, px[1] - bt], span(py[0], T), [pz[0] + T, pz[1] - bt]), grain: "x", exposure: "hidden",
      joins: ["front", "back", "end-wall", "end-stair"].map(k => ({ to: `planter-${k}`, by: "screws" as const })),
      notes: "Sits inside the four sides, screwed through them. Two small weep holes let a leak show as a drip rather than rot the box quietly." });

    // Two legs under the back of the planter carry it, and the trellis standing on it, to the floor. The wall-end leg
    // stands on the landing; the stair-end one either stands on the landing's edge or runs down to the first step.
    const onStep = opt.stairLeg === "step";
    const legs: [string, Range, number][] = [
      ["wall", span(px[0], lg), 0],
      ["stair", onStep ? [px[1] - lg, px[1]] : [LW - lg, LW], onStep ? -S.rise : 0],
    ];
    for (const [side, xr, foot] of legs)
      b.board({ id: `planter-leg-${side}`, name: "Planter leg", where: side === "wall" ? "back-wall end" : onStep ? "stair end, on the first step" : "edge of the landing",
        material: "wood-legs", phase: "p1", step: "set-planter",
        box: box(xr, [foot, py[0]], span(pz[0], lg)), grain: "y",
        joins: [{ to: "planter-back", by: "screws" }] });
    // ---------- the reservoir: a sealed liner with water under a grate, so nothing drips on the landing ----------
    const li = P.linerInset, Rv = P.reservoir, lw = Rv.linerWall;
    const lx: Range = [px[0] + bt + li, px[1] - bt - li], lz: Range = [pz[0] + T + li, pz[1] - bt - li], ly: Range = [py[0] + T, py[1] - 0.5];
    const ix: Range = [lx[0] + lw, lx[1] - lw], iz: Range = [lz[0] + lw, lz[1] - lw], floorY = ly[0] + lw;   // inside the liner
    const grateY: Range = span(floorY + Rv.depth, Rv.grate);
    const soilTop = py[1] - 1;                                          // an inch below the rim
    const ext = (r: Range) => r[1] - r[0];
    b.hardware({ id: "planter-liner", name: "Liner", item: "liner", qty: 1, phase: "p1", step: "reservoir",
      notes: `About ${fmtLength(ext(lx), { marks: true })} long × ${fmtLength(ext(lz), { marks: true })} front to back × ${fmtLength(ext(ly), { marks: true })} deep, outside. Drill one ½″ overflow hole in a back corner, just under the grate.` });
    b.context({ id: "reservoir-water", name: "Water", where: "reservoir", role: "contents", color: "#5fa8d3", box: box(ix, [floorY, grateY[0]], iz) });
    b.context({ id: "planter-soil", name: "Soil", role: "contents", color: "#6b4f3a", box: box(ix, [grateY[1], soilTop], iz) });
    b.hardware({ id: "reservoir-grate", name: "Grate", item: "grate", qty: 1, phase: "p1", step: "reservoir",
      box: box(ix, grateY, iz), notes: "Cut holes for the two wicking cups and the fill tube." });
    b.hardware({ id: "reservoir-supports", name: "Grate supports", item: "grate-supports", qty: 1, phase: "p1", step: "reservoir" });
    const cupZ = (iz[0] + iz[1]) / 2;
    [1, 3].forEach((q, i) => {
      const cx = Math.round((ix[0] + (ix[1] - ix[0]) * q / 4) * 16) / 16;
      b.hardware({ id: `wicking-cup-${i + 1}`, name: "Wicking cup", where: i === 0 ? "wall end" : "stair end", item: "cup", qty: 1, phase: "p1", step: "reservoir",
        cylinder: { axis: "y", from: floorY, to: grateY[0], center: [cx, cupZ], diameter: Rv.cup }, notes: "Hangs from its hole in the grate, packed with soil, its foot in the water." });
    });
    const tubeX = ix[0] + Rv.tube / 2 + 0.125, tubeZ = iz[0] + Rv.tube / 2 + 0.125;   // the back corner at the wall end, hidden by the vine
    b.hardware({ id: "fill-tube", name: "Fill tube", item: "fill-tube", qty: 1, phase: "p1", step: "reservoir", length: py[1] - 0.25 - floorY,
      cylinder: { axis: "y", from: floorY, to: py[1] - 0.25, center: [tubeX, tubeZ], diameter: Rv.tube },
      joins: [{ to: "reservoir-grate", by: "notch", note: "Passes through a hole in the grate" }] });
    b.hardware({ id: "water-gauge", name: "Water-level gauge", item: "gauge", qty: 1, phase: "p1", step: "reservoir" });
    b.hardware({ id: "box-sealer", name: "Sealer", item: "sealer", qty: 1, phase: "p1", step: "planter" });
    b.hardware({ id: "reservoir-fabric", name: "Landscape fabric", item: "landscape-fabric", qty: 1, phase: "p1", step: "reservoir" });
    b.hardware({ id: "planter-feet", name: "Feet", item: "pads", qty: 1, phase: "p1", step: "set-planter" });

    // ---------- lattice on its 1×1 frame, standing on the planter's back: one sheet now, the second in phase 2 ----------
    const bottom = py[1], top = H - P.edgeGap;
    const seam = bottom + Math.min(P.lattice.sheet[0], top - bottom);  // the first sheet runs its full length
    const sheets: [string, string, Range][] = [["lower", "p1", [bottom, seam]], ...(top > seam ? [["upper", "p2", [seam, top]] as [string, string, Range]] : [])];
    const zF: Range = [0, S1];
    for (const [where, phase, [y0, y1]] of sheets) {
      const step = (k: string) => `${k}-${where}`;
      b.panel({ id: `trellis-${where}`, name: "Trellis panel", where, material: "lattice", phase, step: step("trellis"),
        box: box(x, [y0, y1], zLat), finish: "clear", fitToSite: where === "upper", joins: [{ to: `frame-${where}-bottom`, by: "screws" }],
        notes: where === "lower" ? "Rip to width; keep the factory end at the bottom." : "Rip to width and cut to length; line up its diamonds with the lower sheet at the seam." });
      const id = (k: string) => `frame-${where}-${k}`;
      let rails = 0;
      const rail = (k: string, xr: Range, y: number, name: string) => {
        b.board({ id: id(k), name, where: `${where} sheet`, material: "pine-1x1", phase, step: step("frame"),
          box: box(xr, span(y, S1), zF), grain: "x", exposure: "limited", exposureNote: "Shows through the lattice; paint it the wall colour", fitToSite: true,
          ...(k === "bottom" && where === "lower" ? { joins: [{ to: topBack, by: "rests-on" as const }] } : {}) });
        rails++;
      };
      rail("bottom", x, y0, "Frame rail, full width");
      rail("top", x, y1 - S1, "Frame rail, full width");
      for (const [side, xr] of [["wall", span(x[0], S1)], ["stair", [x[1] - S1, x[1]] as Range]] as const)
        b.board({ id: id(`stile-${side}`), name: "Frame stile", where: `${where} sheet, ${side === "wall" ? "back-wall end" : "stair end"}`, material: "pine-1x1",
          phase, step: step("frame"), box: box(xr, [y0 + S1, y1 - S1], zF), grain: "y", exposure: "limited", exposureNote: "Behind the lattice edge", fitToSite: true });
      const n = Math.ceil((y1 - y0) / P.frame.maxSpan);
      for (let i = 1; i < n; i++)
        rail(`rail-${i}`, [x[0] + S1, x[1] - S1], Math.round((y0 + (y1 - y0) * i / n - S1 / 2) * 16) / 16, "Frame rail, between stiles");
      b.hardware({ id: `frame-screws-${where}`, name: "Screws into studs", item: "screws", qty: rails * 3, phase, step: step("frame") });
      b.hardware({ id: `trellis-screws-${where}`, name: "Lattice screws", item: "trellis-screws", qty: rails * 5, phase, step: step("trellis") });
    }

    // ---------- steps ----------
    b.step({ id: "planter", phase: "p1", title: "Build the planter",
      text: "Resaw the blue board in half through its thickness, then cut the fronts and ends. Screw the plywood back between the ends, flush with their back edges, and the front across the ends; for a planter two boards high, join the lower and upper rows with a cleat inside each corner. Fit the plywood bottom inside, drill two small weep holes in it, and seal the whole inside in case the liner ever fails. Finish the outside." });
    b.step({ id: "set-planter", phase: "p1", title: "Legs and planter",
      text: "Cut the two 2×2 legs, paint them white, and screw them under the back of the planter. Stand it against the wall and level it, pads under the legs." });
    b.step({ id: "reservoir", phase: "p1", title: "Liner and reservoir",
      text: "Drop in the liner and drill its overflow hole in a back corner, just under where the grate will sit. Stand the grate on its supports, hang the two wicking cups through it, and set the fill tube in the back corner at the wall end. Lay landscape fabric over the grate, pack the cups with soil, then fill with soil to an inch below the rim. Water through the tube until water shows at the overflow; the gauge shows when to refill." });
    b.step({ id: "frame-lower", phase: "p1", title: "Frame for the first sheet",
      text: "Paint the 1×1s the wall colour. Stand the bottom rail on the planter's back and screw every full-width rail into each stud it crosses, then fit the stiles and the rails between them." });
    b.step({ id: "trellis-lower", phase: "p1", title: "Hang the first sheet",
      text: "Rip it to width and screw it to its frame through the slat crossings. Plant the vine." });
    b.step({ id: "frame-upper", phase: "p2", title: "Frame for the second sheet",
      text: "When the vine reaches the top of the first sheet: the same frame again, its bottom rail on the first frame's top rail, up to the ceiling." });
    b.step({ id: "trellis-upper", phase: "p2", title: "Hang the second sheet",
      text: "Rip it to width, cut it to fit to the ceiling, match its diamonds to the first sheet at the seam, and screw it on." });

    // ---------- design rules ----------
    // The board is resawn into two strips as long as the board itself. The shortest board is the shortest strip
    // length that fits every front and end on two strips, laid end to end with a saw kerf between pieces.
    const kerf = 0.125;
    const pieces = Array.from({ length: layers }, () => [px[1] - px[0], pz[1] - pz[0] - bt, pz[1] - pz[0] - bt]).flat().sort((a, c) => c - a);
    const fits = (len: number) => {
      const used = [0, 0];
      return pieces.every((p) => {
        const i = used.findIndex((u) => u + (u > 0 ? kerf : 0) + p <= len);
        if (i < 0) return false;
        used[i] += (used[i] > 0 ? kerf : 0) + p;
        return true;
      });
    };
    let need = pieces[0];
    while (!fits(need)) need += 1 / 16;
    b.check("board-enough", "The blue board is long enough for the planter's front and ends", need <= P.board2x10.length,
      `needs at least ${fmtLength(need, { marks: true })} of the 1½ × 9 board; it is ${P.board2x10.length}″`, "error");
    b.check("two-sheets-cover", "The two lattice sheets reach from the planter to the ceiling",
      top - bottom <= 2 * P.lattice.sheet[0], `${top - bottom}″ to cover, ${2 * P.lattice.sheet[0]}″ of lattice`, "error");
    b.check("sheet-width", "One sheet is wide enough for the wall", x[1] - x[0] <= P.lattice.sheet[1],
      `wall needs ${x[1] - x[0]}″, sheets are ${P.lattice.sheet[1]}″`, "error");
    const soil = soilTop - grateY[1], gallons = (ext(ix) * ext(iz) * Rv.depth) / 231;
    b.check("soil-depth", "At least 12″ of soil above the reservoir for a climbing vine", soil >= 12,
      `${fmtLength(soil, { marks: true })} of soil over a ${fmtLength(Rv.depth, { marks: true })} reservoir of about ${gallons.toFixed(1)} gallons`);

    // ---------- drawing views ----------
    b.view({ id: "front", title: "Elevation", kind: "elevation", look: "-z", depth: [-wt, LD],
      caption: "Looking at the vine wall from the stairwell, from the front edge of landing 2.",
      dims: [
        { from: "back-wall.x1", to: "vine-wall.x1", offset: -6 },
        { from: "landing.y1", to: "ceiling.y0", offset: -8 },
        { from: "landing.y1", to: "trellis-lower.y0", offset: W + 7 },
        { from: "trellis-lower.y0", to: "trellis-lower.y1", offset: W + 7 },
        { from: "trellis-upper.y0", to: "trellis-upper.y1", offset: W + 7 },
      ] });
    b.view({ id: "section", title: "Section", kind: "section", look: "+x", cut: W / 2,
      caption: "Cut through the middle, vine wall on the left, stairwell on the right.",
      dims: [{ from: "vine-wall.z1", to: "planter-front.z1", offset: -4 }] });
    b.view({ id: "plan", title: "Plan", kind: "plan", look: "-y", cut: py[0] + 4,
      dims: [{ from: "back-wall.x1", to: "vine-wall.x1", offset: 6 }, { from: "vine-wall.z1", to: "planter-front.z1", offset: 6 }] });
    b.view({ id: "stair-plan", title: "Stairwell plan", kind: "plan", look: "-y", cut: H - 10, showContents: true,
      caption: "From above: landing 2 and the vine wall at the top left, flight 2 down the back wall, landing 1, flight 1 up to the upper floor.",
      dims: [{ from: "vine-wall.z1", to: "window-wall.z0", offset: -8, text: "{} back wall" }, { from: "landing.z0", to: "landing.z1", offset: -4 }, { from: "landing.x0", to: "landing.x1", offset: -4 }] });
    b.view({ id: "stair-section", title: "Section through flights 3 and 1", kind: "section", look: "+z", cut: LD / 2,
      caption: "Cut through flight 3, looking toward flight 1 and the window wall." });
  },
});
