// Closet built-in: the first fixture. Encodes projects/closet-built-in/concept-sheet.html as committed in c10ee19.
// Axes: x from the left wall (looking at the back wall), y up from the floor, z out from the back wall. Inches.
// Values marked "inferred" are not on the concept sheet; everything else is.
import { defineProject, span, box, type Box, type Range } from "../../core/model/index.ts";

const T = 23 / 32;   // plywood sold as ¾″
const B = 0.75;      // 1× pine boards and the ¾″ hardwood
const BH = 15 / 32;   // plywood sold as ½″

export const P = {
  room: { width: 80, depth: 24, height: 95.5, wall: 4.5 },
  opening: { x: [15.75, 64.25] as Range, height: 80.5 },
  baseboard: { height: 5.5, t: 0.75 },  // thickness approximate: the user measured "maybe ¾″"
  column: [28, 52] as Range,            // outside faces of the two partitions
  partitionHeight: 84,
  partitionDepth: 23.25,                // leaves ¾″ at the back to scribe
  topShelfDepth: 11.25,                 // plus the ¾″ nosing = 12″
  nosing: { t: 0.75, h: 1.5 },
  rightShelfAt: 70,
  centerFixedAt: 70,
  adjustableP1: [28, 42, 55.75],        // bottom faces of the three adjustable shelves in phase 1
  adjustableDepth: 22.5,
  rods: { leftUpper: 81.5, leftLower: 41, right: 67.5, fromBack: 12, dia: 1.3125, socket: 0.125 },
  cleat: { side: 3.5, back: 1.5, sideLength: 10.5 },
  faces: { overlay: 0.375, gap: 0.125 },
  hamper: { bay: 28, faceOffFloor: 0.25, w: 19.5, d: 15, h: 23, backFromFace: 15.5 },
  frame: { height: 26.5, offFloor: 0.5, rail: 3 },
  drawerZones: [8, 7, 6],
  drawerBoxHeights: [6.5, 5.5, 4.5],
  boxLength: 21, slide: 0.5, groove: { depth: 0.25, up: 0.25 },
};

export default defineProject({
  id: "closet-built-in",
  title: "Closet Built-In",
  units: "in",
  options: {
    top: {
      label: "Hardwood top thickness",
      choices: { "1": "1″ hardwood top", "0.75": "¾″ hardwood top" },
      default: "1",
    },
  },
  phases: [
    { id: "p1", title: "Shell, rods and shelves", summary: "The closet is fully usable after this phase." },
    { id: "p2", title: "Hamper frame and drawers" },
  ],
  materials: {
    "ply-pre": { type: "sheet", name: "23/32″ prefinished maple plywood (sold as ¾″)", thickness: T, grained: true, finish: "prefinished", kerf: 0.125,
      stock: [{ id: "4x8", length: 96, width: 48, buy: true }, { id: "4x4", length: 48, width: 48, buy: true }] },
    "ply-raw": { type: "sheet", name: "23/32″ plywood, unfinished (owned piece)", thickness: T, grained: true, finish: "none", kerf: 0.125,
      stock: [{ id: "owned-56x48", length: 56, width: 48, owned: 1, note: "Grain runs along the 56″ side" }] },
    "ply-half": { type: "sheet", name: "15/32″ plywood (sold as ½″)", thickness: BH, grained: true, finish: "none", kerf: 0.125,
      stock: [{ id: "4x8", length: 96, width: 48, buy: true }, { id: "4x4", length: 48, width: 48, buy: true }] },
    "ply-quarter": { type: "sheet", name: "¼″ plywood", thickness: 0.25, grained: true, finish: "none", kerf: 0.125,
      stock: [{ id: "4x4", length: 48, width: 48, buy: true }] },
    "pine-1x4": { type: "board", name: "1×4", nominal: "1×4", thickness: B, width: 3.5, finish: "none" },
    "pine-1x2": { type: "board", name: "1×2", nominal: "1×2", thickness: B, width: 1.5, finish: "none" },
    "hw-nosing": { type: "board", name: "Hardwood nosing ¾ × 1½", thickness: 0.75, width: 1.5, finish: "clear" },
    "hw-1in": { type: "board", name: "Hardwood, 1″ thick", thickness: 1, finish: "clear" },
    "hw-34": { type: "board", name: "Hardwood, ¾″ thick", thickness: 0.75, finish: "clear" },
  },
  banding: {
    maple: { name: "Iron-on maple edge banding, ¾″", thickness: 0.02, width: 0.8125, reducesCutSize: false },
  },
  hardware: {
    "rod": { name: "Closet rod, 1⁵⁄₁₆″", unit: "each" },
    "rod-socket": { name: "Rod sockets", unit: "pair" },
    "shelf-pin": { name: "Shelf pins, 5 mm", unit: "each" },
    "hamper": { name: "Rolling hamper", unit: "each", spec: "19½ W × 15 D × 23 H max, or a ½″ ply box on four 2″ casters" },
    "slide-21": { name: "21″ full-extension side-mount slides", unit: "pair", spec: "Soft-close for the drawers" },
    "pull": { name: "Pulls", unit: "each" },
  },

  build(b, opt) {
    const R = P.room, BBd = P.baseboard;
    const [pl, colR] = P.column;
    const pr = colR - T;                        // left face of the right partition
    const C0 = pl + T, C1 = pr;                 // inside faces of the center column: 22⁹⁄₁₆″ apart
    const zFront = P.partitionDepth;            // 23.25
    const fx: Range = [C0 - P.faces.overlay, C1 + P.faces.overlay]; // faces overlay ⅜″ of each partition edge
    const topY = P.partitionHeight;             // top shelves sit on the partitions
    const topT = Number(opt.top);

    // ---------- room (context) ----------
    b.context({ id: "floor", name: "Floor", role: "floor", box: box([-R.wall, R.width + R.wall], [-1, 0], [-R.wall, R.depth + R.wall]) });
    b.context({ id: "ceiling", name: "Ceiling", role: "wall", box: box([-R.wall, R.width + R.wall], [R.height, R.height + 1.5], [-R.wall, R.depth + R.wall]) });
    b.context({ id: "wall-back", name: "Back wall", role: "wall", box: box([-R.wall, R.width + R.wall], [0, R.height], [-R.wall, 0]) });
    b.context({ id: "wall-left", name: "Left wall", role: "wall", box: box([-R.wall, 0], [0, R.height], [0, R.depth + R.wall]) });
    b.context({ id: "wall-right", name: "Right wall", role: "wall", box: box([R.width, R.width + R.wall], [0, R.height], [0, R.depth + R.wall]) });
    b.context({ id: "return-left", name: "Left return", role: "wall", box: box([0, P.opening.x[0]], [0, R.height], [R.depth, R.depth + R.wall]) });
    b.context({ id: "return-right", name: "Right return", role: "wall", box: box([P.opening.x[1], R.width], [0, R.height], [R.depth, R.depth + R.wall]) });
    b.context({ id: "header", name: "Header", role: "wall", box: box(P.opening.x, [P.opening.height, R.height], [R.depth, R.depth + R.wall]) });
    b.context({ id: "baseboard-back", name: "Baseboard", where: "back wall", role: "wall", box: box([0, R.width], [0, BBd.height], [0, BBd.t]) });
    b.context({ id: "baseboard-left", name: "Baseboard", where: "left wall", role: "wall", box: box([0, BBd.t], [0, BBd.height], [BBd.t, R.depth]) });
    b.context({ id: "baseboard-right", name: "Baseboard", where: "right wall", role: "wall", box: box([R.width - BBd.t, R.width], [0, BBd.height], [BBd.t, R.depth]) });

    // ---------- phase 1: partitions ----------
    for (const [side, x] of [["left", pl], ["right", pr]] as const) {
      b.panel({
        id: `partition-${side}`, name: "Partition", where: side, material: "ply-pre", phase: "p1", step: "p1-stand",
        box: box(span(x, T), [0, P.partitionHeight], [0, P.partitionDepth]),
        grain: "y", band: { front: "maple" },
        joins: [{ to: "baseboard-back", by: "notch", note: `Notch the back bottom corner ${BBd.height} × ${BBd.t} for the baseboard` }],
        notes: "Shelf pin holes on the inner face only, 27″ to 68″. Notch for the baseboard.",
      });
    }

    // ---------- top shelves, nosings, cleats (shelves sit at the partition tops) ----------
    // The nosing is glued to the shelf's front edge. Its x range defaults to the shelf's; the center one fits between the partitions.
    const shelfOnCleats = (id: string, name: string, where: string, x: Range, y: number, material: string, extra: object, nosingX: Range = x) => {
      b.panel({ id, name, where, material, phase: "p1", step: "p1-tie", box: box(x, span(y, T), [0, P.topShelfDepth]), grain: "x", fitToSite: true, ...extra });
      b.board({ id: `${id}-nosing`, name: "Shelf nosing", where, material: "hw-nosing", phase: "p1", step: "p1-finish",
        box: box(nosingX, [y + T - P.nosing.h, y + T], span(P.topShelfDepth, P.nosing.t)), grain: "x",
        joins: [{ to: id, by: "glue" }] });
    };
    shelfOnCleats("top-shelf-left", "Top shelf", "left", [0, pl], topY, "ply-raw",
      { exposure: "limited", exposureNote: "Behind the header; only the underside shows" });
    shelfOnCleats("top-shelf-center", "Center top shelf", "center", [pl, colR], topY, "ply-raw",
      { exposure: "limited", exposureNote: "Behind the header", joins: [{ to: "partition-left", by: "screws" }, { to: "partition-right", by: "screws" }] },
      [C0, C1]);
    shelfOnCleats("top-shelf-right", "Top shelf", "right", [colR, R.width], topY, "ply-raw",
      { exposure: "limited", exposureNote: "Behind the header; only the underside shows" });
    shelfOnCleats("shelf-right-70", "Right 70″ shelf", "right, at 70″", [colR, R.width], P.rightShelfAt, "ply-pre",
      { grain: "z", grainLock: false, notes: "Cut from the 4×8 offcut, so the grain runs front to back; the nosing covers the front edge." });

    const cleats = (prefix: string, x0: number, x1: number, shelfY: number) => {
      const yS: Range = [shelfY - P.cleat.side, shelfY], yB: Range = [shelfY - P.cleat.back, shelfY];
      const zS = span(B, P.cleat.sideLength);
      b.board({ id: `${prefix}-cleat-a`, name: "Side cleat", where: `${prefix}, wall end`, material: "pine-1x4", phase: "p1", step: "p1-cleats", box: box(span(x0, B), yS, zS), grain: "z", exposure: "hidden" });
      b.board({ id: `${prefix}-cleat-b`, name: "Side cleat", where: `${prefix}, partition end`, material: "pine-1x4", phase: "p1", step: "p1-cleats", box: box([x1 - B, x1], yS, zS), grain: "z", exposure: "hidden" });
      b.board({ id: `${prefix}-cleat-back`, name: "Back cleat", where: prefix, material: "pine-1x2", phase: "p1", step: "p1-cleats", box: box([x0 + B, x1 - B], yB, [0, B]), grain: "x", exposure: "hidden", fitToSite: true });
    };
    cleats("top-left", 0, pl, topY);
    cleats("top-right", colR, R.width, topY);
    cleats("right-70", colR, R.width, P.rightShelfAt);

    // ---------- center column, phase 1 ----------
    b.panel({ id: "center-shelf-fixed", name: "Center fixed shelf", material: "ply-pre", phase: "p1", step: "p1-tie",
      box: box([C0, C1], span(P.centerFixedAt, T), [0, zFront]), grain: "x", band: { front: "maple" },
      joins: [{ to: "partition-left", by: "screws" }, { to: "partition-right", by: "screws" }],
      notes: "Add ½″ to the length if you dado it in." });
    for (const [i, id] of (["nailer-top", "nailer-70"] as const).entries()) {
      const y = i === 0 ? topY : P.centerFixedAt;
      b.panel({ id, name: "Nailer", where: i === 0 ? "behind the center top shelf" : "under the back of the 70″ shelf", material: "ply-raw", phase: "p1", step: "p1-cleats",
        box: box([C0, C1], [y - 3.5, y], [0, T]), grain: "x", grainLock: false, exposure: "hidden" });
    }
    b.board({ id: "floor-rail", name: "Floor rail", material: "pine-1x4", phase: "p1", step: "p1-tie",
      box: box([C0, C1], [0, 3.5], span(BBd.t, B)), grain: "x", exposure: "hidden",   // in front of the baseboard: inferred
      notes: "On edge at the back of the center column, in front of the baseboard. Ties the partition bottoms and screws to studs." });

    // Adjustable shelves: three on pins in phase 1; phase 2 keeps the ones the drawers leave room for.
    const adjBox = (y: number): Box => box([C0 + 0.0625, C1 - 0.0625], span(y, T), [zFront - P.adjustableDepth, zFront]); // front flush: inferred
    const zones = P.drawerZones;
    const topAt = P.hamper.bay + zones.reduce((a, h) => a + h, 0);          // 49
    const keep = evenShelves(topAt + topT, P.centerFixedAt, 2).slice(0, -1);  // the last one is the fixed 70″ shelf
    P.adjustableP1.forEach((y, i) => {
      const n = i + 1, moved = keep[keep.length - (3 - i)];                    // the top-most shelves stay; undefined = removed
      b.panel({ id: `center-shelf-adj-${n}`, name: "Center adjustable shelf", where: `#${n}`, material: "ply-pre", phase: "p1", step: "p1-finish",
        box: adjBox(y), grain: "x", band: { front: "maple" },
        ...(moved === undefined ? { removedIn: "p2" } : { moves: { p2: adjBox(moved) } }),
        joins: [{ to: "partition-left", by: "pins" }, { to: "partition-right", by: "pins" }] });
    });

    // ---------- rods (hardware with geometry) ----------
    const rod = (id: string, name: string, x0: number, x1: number, y: number, step: string) =>
      b.hardware({ id, name, item: "rod", qty: 1, phase: "p1", step, fitToSite: true, length: x1 - x0,
        cylinder: { axis: "x", from: x0, to: x1, center: [y, P.rods.fromBack], diameter: P.rods.dia } });
    const s = P.rods.socket;
    rod("rod-left-upper", "Rod, left upper", B + s, pl - B - s, P.rods.leftUpper, "p1-finish");
    rod("rod-left-lower", "Rod, left lower", B + s, pl - s, P.rods.leftLower, "p1-finish");
    rod("rod-right", "Rod, right", colR + B + s, R.width - B - s, P.rods.right, "p1-finish");
    b.board({ id: "rod-backer", name: "Rod backer", material: "pine-1x4", phase: "p1", step: "p1-cleats",
      box: box([0, B], [P.rods.leftLower - 1.75, P.rods.leftLower + 1.75], [P.rods.fromBack - 3, P.rods.fromBack + 3]), grain: "z", exposure: "hidden",
      notes: "Left side wall at 41″, for the lower rod's socket." });
    b.hardware({ id: "rod-sockets", name: "Rod sockets", item: "rod-socket", qty: 3, phase: "p1", step: "p1-finish" });
    b.hardware({ id: "shelf-pins", name: "Shelf pins", item: "shelf-pin", qty: 12, phase: "p1", step: "p1-finish" });

    // ---------- the rolling hamper: on the floor in phase 1, inside the frame in phase 2 ----------
    const hx = span((C0 + C1) / 2 - P.hamper.w / 2, P.hamper.w);
    const backZ = zFront - P.hamper.backFromFace;                               // 7.75: front face of the frame back
    b.hardware({ id: "rolling-hamper", name: "Rolling hamper", item: "hamper", qty: 1, phase: "p1", step: "p1-finish",
      box: box(hx, [0, P.hamper.h], [6, 6 + P.hamper.d]),
      moves: { p2: box(hx, [0, P.hamper.h], span(backZ + 0.125, P.hamper.d)) } });

    // ---------- phase 2: faces, cut in phase 1 from one strip of the owned piece ----------
    const faceTops = [P.hamper.bay, ...zones.map((_, i) => P.hamper.bay + zones.slice(0, i + 1).reduce((a, h) => a + h, 0))];
    b.panel({ id: "hamper-face", name: "Hamper face", material: "ply-raw", phase: "p2", step: "p2-faces", cutIn: "p1",
      box: box(fx, [P.hamper.faceOffFloor, P.hamper.bay - P.faces.gap], [zFront, zFront + T]), grain: "y",
      finish: "clear", strip: { id: "faces", name: "Strip for the phase 2 faces", order: 0 },
      joins: [{ to: "hamper-frame-side", by: "screws" }, { to: "hamper-frame-rail", by: "screws" }] });
    zones.forEach((h, i) => {
      b.panel({ id: `drawer-face-${i + 1}`, name: "Drawer face", where: `drawer ${i + 1}`, material: "ply-raw", phase: "p2", step: "p2-faces", cutIn: "p1",
        box: box(fx, [faceTops[i], faceTops[i] + h - P.faces.gap], [zFront, zFront + T]), grain: "y",
        finish: "clear", strip: { id: "faces", name: "Strip for the phase 2 faces", order: i + 1 },
        joins: [{ to: `drawer-${i + 1}-front`, by: "screws" }] });
    });

    // ---------- phase 2: hamper frame (½″ plywood + hardwood rail) ----------
    const F = P.frame, frameY = span(F.offFloor, F.height);                     // ½″ to 27″
    const bx0 = C0 + P.slide, bx1 = C1 - P.slide;                               // box and frame outside width 21⁹⁄₁₆″
    const boxZ = [zFront - P.boxLength, zFront] as Range;                       // 2.25 .. 23.25
    b.panel({ id: "hamper-frame-side", name: "Hamper frame side", material: "ply-half", phase: "p2", step: "p2-frame",
      box: box([bx1 - BH, bx1], frameY, boxZ), grain: "z", exposure: "hidden" });
    b.board({ id: "hamper-frame-rail", name: "Hamper frame top rail", material: "hw-34", phase: "p2", step: "p2-frame",
      box: box(span(bx0, B), [frameY[1] - F.rail, frameY[1]], boxZ), grain: "z", exposure: "hidden",
      notes: "The left slide mounts to it and the hamper rolls out under it." });
    b.panel({ id: "hamper-frame-back", name: "Hamper frame back", material: "ply-half", phase: "p2", step: "p2-frame",
      box: box([bx0 + B, bx1 - BH], frameY, [backZ - BH, backZ]), grain: "x", exposure: "hidden",
      joins: [{ to: "hamper-frame-side", by: "screws" }, { to: "hamper-frame-rail", by: "screws" }] });

    // ---------- phase 2: drawer boxes ----------
    zones.forEach((_, i) => {
      const n = i + 1, h = P.drawerBoxHeights[i], y0 = faceTops[i] + 0.5;     // box ½″ above the zone bottom: inferred
      const yr = span(y0, h), g = P.groove;
      const side = (id: string, x: Range) => b.panel({ id, name: "Drawer box side", where: `drawer ${n}`, material: "ply-half", phase: "p2", step: "p2-drawers",
        box: box(x, yr, boxZ), grain: "z", exposure: "hidden" });
      side(`drawer-${n}-side-l`, span(bx0, BH)); side(`drawer-${n}-side-r`, [bx1 - BH, bx1]);
      for (const [end, z] of [["front", [boxZ[1] - BH, boxZ[1]]], ["back", [boxZ[0], boxZ[0] + BH]]] as const) {
        b.panel({ id: `drawer-${n}-${end}`, name: "Drawer box front or back", where: `drawer ${n} ${end}`, material: "ply-half", phase: "p2", step: "p2-drawers",
          box: box([bx0 + BH, bx1 - BH], yr, z as Range), grain: "x", exposure: "hidden",
          joins: [{ to: `drawer-${n}-side-l`, by: "glue" }, { to: `drawer-${n}-side-r`, by: "glue" }] });
      }
      const inset = g.depth - 0.0625;                                           // bottom sits in ¼″ grooves with 1/16″ play
      b.panel({ id: `drawer-${n}-bottom`, name: "Drawer bottom", where: `drawer ${n}`, material: "ply-quarter", phase: "p2", step: "p2-drawers",
        box: box([bx0 + BH - inset, bx1 - BH + inset], span(y0 + g.up, 0.25), [boxZ[0] + BH - inset, boxZ[1] - BH + inset]),
        grain: "x", grainLock: false, exposure: "hidden",
        joins: ["side-l", "side-r", "front", "back"].map(k => ({ to: `drawer-${n}-${k}`, by: "groove" as const })) });
    });
    b.board({ id: "center-top", name: "Hardwood top", material: topT === 1 ? "hw-1in" : "hw-34", phase: "p2", step: "p2-top",
      box: box([C0, C1], span(topAt, topT), [0, R.depth]), grain: "x", finish: "clear",
      joins: [{ to: "partition-left", by: "pocket-screws" }, { to: "partition-right", by: "pocket-screws" }] });
    b.hardware({ id: "slides", name: "Slides, 21″", item: "slide-21", qty: zones.length + 1, phase: "p2", step: "p2-drawers" });
    b.hardware({ id: "pulls", name: "Pulls", item: "pull", qty: zones.length + 1, phase: "p2", step: "p2-faces" });

    // ---------- contents shown in the drawings (not built) ----------
    for (const [a, z] of [[2, 26], [30, 50], [54, 78]]) b.context({ id: `bins-${a}`, name: "Bins", role: "contents", box: box([a, z], [topY + T, topY + 8.5], [0.8, 10.8]) });
    b.context({ id: "hang-left-upper", name: "Shirts, jackets", role: "contents", box: box([0.9, pl - 1.2], [P.rods.leftUpper - 1.6 - 36, P.rods.leftUpper], [2, 22]) });
    b.context({ id: "hang-left-lower", name: "Shirts, folded pants", role: "contents", box: box([0.9, pl - 1.2], [P.rods.leftLower - 1.6 - 37, P.rods.leftLower], [2, 22]) });
    b.context({ id: "hang-right", name: "Suits, coats, dresses", role: "contents", box: box([colR + 0.9, R.width - 1.2], [P.rods.right - 1.6 - 55, P.rods.right], [2, 22]) });

    // ---------- build steps ----------
    b.step({ id: "p1-bench", phase: "p1", title: "On the bench",
      text: "Edge band the partition fronts, drill the shelf pin holes on their inner faces from 27″ to 68″, and notch the bottoms for the baseboard. The holes are far easier to drill flat than in place. Cut the strip for the phase 2 faces and set it aside.",
      parts: ["partition-left", "partition-right"] });
    b.step({ id: "p1-cleats", phase: "p1", title: "Cleats and nailers",
      text: "Screw the cleats and nailers into the studs. Level them off marks at 84″ and 70″ rather than measuring up from the floor." });
    b.step({ id: "p1-stand", phase: "p1", title: "Stand the partitions",
      text: "They are 84″ tall and the opening is 80½″, so bring each one in tilted and stand it up inside. The diagonal clears the ceiling." });
    b.step({ id: "p1-tie", phase: "p1", title: "Tie them together",
      text: "The floor rail at the back and the fixed 70″ shelf, then the three top shelf pieces and the right 70″ shelf." });
    b.step({ id: "p1-finish", phase: "p1", title: "Finish",
      text: "Glue on the nosings, hang the rods, and drop in the adjustable shelves at 28″, 42″ and 55¾″. The rolling hamper goes on the floor below them." });
    b.step({ id: "p2-frame", phase: "p2", title: "Build the hamper frame",
      text: "The right side, the back 15½″ behind where the face goes, and the top rail on the left. The left side stays open. Pull the two lower adjustable shelves first." });
    b.step({ id: "p2-drawers", phase: "p2", title: "Drawer boxes and slides",
      text: "Build the drawer boxes and mount the slides on the partitions, using a spacer board cut to each slide's height so both sides match. The frame's slides go at the top of the frame." });
    b.step({ id: "p2-top", phase: "p2", title: "Fix the hardwood top", text: "At 49″, with pocket screws into the partitions from below." });
    b.step({ id: "p2-faces", phase: "p2", title: "Hang the faces",
      text: "With ⅛″ gaps, starting with the hamper face ¼″ off the floor, then set the remaining shelf." });

    // ---------- design rules from the concept sheet ----------
    const railBottom = b.boxOf("hamper-frame-rail").y[0];
    b.check("hamper-under-rail", "The rolling hamper rolls out under the frame's top rail",
      P.hamper.h <= railBottom, `hamper ${P.hamper.h}″ tall, rail underside ${railBottom}″ off the floor`);
    b.check("hamper-depth", "The hamper fits between the frame back and the face", P.hamper.d <= P.hamper.backFromFace - 0.25,
      `hamper ${P.hamper.d}″ deep, ${P.hamper.backFromFace}″ from frame back to face`);
    b.check("column-in-opening", "The center column sits inside the opening, so drawers clear the jambs",
      pl >= P.opening.x[0] && colR <= P.opening.x[1], undefined, "error");
    b.check("partition-tilts-in", "A partition can be tilted up inside the closet",
      Math.hypot(P.partitionHeight, P.partitionDepth) < R.height, `diagonal ${Math.hypot(P.partitionHeight, P.partitionDepth).toFixed(2)}″`, "error");
    b.check("bins-come-down", "Bins on the top shelf come down through the gap under the header",
      R.depth - (P.topShelfDepth + P.nosing.t) >= 11, `gap ${R.depth - (P.topShelfDepth + P.nosing.t)}″`);
    b.check("coat-clears-floor", "A 55″ coat on the right rod clears the floor by at least 8″", P.rods.right - 1.6 - 55 >= 8);

    // ---------- drawing views ----------
    b.view({ id: "front", title: "Front elevation", kind: "elevation", look: "-z",
      veil: ["return-left", "return-right", "header"], caption: "Looking at the back wall. Hatched areas sit behind the front wall.",
      dims: [
        { from: "wall-left.x1", to: "wall-right.x0", offset: -7 },
        { from: "wall-left.x1", to: "partition-left.x0", offset: -2.6 },
        { from: "partition-left.x0", to: "partition-right.x1", offset: -2.6 },
        { from: "partition-right.x1", to: "wall-right.x0", offset: -2.6 },
        { from: "wall-left.x1", to: "return-left.x1", offset: R.height + 5 },
        { from: "return-left.x1", to: "return-right.x0", offset: R.height + 5, text: "{} opening" },
        { from: "return-right.x0", to: "wall-right.x0", offset: R.height + 5 },
        { from: "floor.y1", to: "ceiling.y0", offset: -10 },
        { from: "floor.y1", to: "header.y0", offset: -4.6, text: "{} opening" },
      ],
      labels: [
        { part: "rod-left-upper", text: "rod {y}" }, { part: "rod-left-lower", text: "rod {y}" }, { part: "rod-right", text: "rod {y}" },
        { part: "shelf-right-70", text: "shelf {y0} · 12″ deep" }, { part: "top-shelf-right", text: "top shelf {y0} · 12″ deep" },
      ] });
    b.view({ id: "section-a", title: "Section A · left hanging section", kind: "section", look: "+x", cut: 14,
      caption: "Cut front to back, back wall on the left, room on the right.",
      dims: [{ from: "wall-back.z1", to: "top-shelf-left-nosing.z1", offset: R.height + 4 }, { from: "top-shelf-left-nosing.z1", to: "return-left.z0", offset: R.height + 4, text: "{} gap" }] });
    b.view({ id: "section-b", title: "Section B · center column", kind: "section", look: "+x", cut: (C0 + C1) / 2, hiddenLines: true });
    b.view({ id: "plan", title: "Plan", kind: "plan", look: "-y", cut: 45,
      dims: [{ from: "wall-left.x1", to: "wall-right.x0", offset: 7.7 }, { from: "wall-back.z1", to: "return-left.z0", offset: -7.7 }] });
  },
});

// n shelves between `from` and `to`, evenly spaced, the last one with its bottom face at `to`; rounded to 1/16″.
export function evenShelves(from: number, to: number, n: number): number[] {
  const clear = (to - from - (n - 1) * T) / n;
  const out: number[] = [];
  let y = from;
  for (let i = 0; i < n; i++) { const at = Math.round((y + clear) * 16) / 16; out.push(at); y = at + T; }
  out[n - 1] = to;
  return out;
}
