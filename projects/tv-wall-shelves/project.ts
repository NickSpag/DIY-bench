// TV wall shelves: bought shelves around a wall-mounted TV, two rows either side and one long run above it.
// The shelves are DIY Cartel linear floating shelves: 14-gauge steel bent into an L, an 8″ plate with a 2½″ flange
// turned up at the back that screws to the wall. They come in fixed lengths, so this model places them; nothing is cut.
// Axes: x from the left end of the TV wall, y up from the floor, z out from the wall into the room. Inches.
// Values marked "inferred" are placeholders, not measurements: replace them and list them in notes.md.
import { defineProject, span, box, type Range } from "../../core/model/index.ts";
import { fmtLength } from "../../core/units.ts";

export const P = {
  wall: { width: 128, height: 96 },
  wallT: 4.5,                                    // inferred: for drawing only
  tv: { width: 48, height: 29, standoff: 1.5, depth: 2.5 },   // standoff and depth inferred: a flat wall mount
  ac: { fromLeft: 45, fromRight: 48, drop: 15, depth: 9 },    // depth inferred: a wall-mounted mini-split head
  shelf: { t: 0.075, depth: 8, flange: 2.5 },    // 14-gauge steel; 8″ deep, 2½″ back flange (maker's listing)
  price: { 30: 79, 36: 110, 48: 114, 60: 189 } as Record<number, number>,   // raw steel, 8″ deep, from the maker's site 2026-10-04
  sizes: [30, 36, 48, 60],                       // the lengths sold 8″ deep
  side: 30,                                      // each side shelf
  spanPieces: { "36-48-36": [36, 48, 36], "60-60": [60, 60] } as Record<string, number[]>,
  rows: 2,                                       // rows of side shelves on each side of the TV
  acHeadroom: 14,                                // from the long shelf's top to the air conditioner, at least
  minTvGap: 4,                                   // inferred: the least gap between a side shelf and the TV that still looks deliberate
  maxTvCentre: 44,                               // inferred: much higher and a seated viewer looks up at the TV
  consoleDepth: 18,                              // inferred: a usual depth, for the space kept for the console
  // How the middle column's gaps are set (option `gaps`). Each gives the console space's height and a rule:
  //   under: a fixed gap under the TV, and acHeadroom over the long shelf;
  //   even-tv: the same gap under and over the TV, and acHeadroom over the long shelf;
  //   even-all: the same gap under the TV, over the TV and over the long shelf.
  // Gaps over the TV run to the long shelf's top line; the steel plate is under 1/10″ thick.
  gapPlans: {
    "4-under": { console: 24, rule: "under", under: 4 },
    "even-tv": { console: 18, rule: "even-tv" },
    "even-all": { console: 16, rule: "even-all" },
    "even-tv-24": { console: 24, rule: "even-tv" },
  } as Record<string, { console: number; rule: "under" | "even-tv" | "even-all"; under?: number }>,
  consoles: {                                    // common sizes to try in the space: width, height, depth
    "60x16": [60, 16, 16], "60x18": [60, 18, 16], "48x20": [48, 20, 16], "60x22": [60, 22, 16], "60x24": [60, 24, 16], "70x22": [70, 22, 16], "72x26": [72, 26, 18],
  } as Record<string, [number, number, number]>,
};

const r16 = (x: number) => Math.round(x * 16) / 16;
const L = (x: number) => fmtLength(x, { marks: true });

export default defineProject({
  id: "tv-wall-shelves",
  title: "TV Wall Shelves",
  units: "in",
  options: {
    span: {
      label: "Long shelf above the TV",
      choices: { "36-48-36": "36 + 48 + 36: seams on the TV's edges", "60-60": "60 + 60: one seam, in the middle" },
      default: "36-48-36",
    },
    gaps: {
      label: "Gaps around the TV",
      choices: {
        "4-under": "4″ under the TV, 24″ console space",
        "even-tv": "Even under and over the TV, 18″ console space",
        "even-all": "Even under the TV, over it and over the long shelf, 16″ console space",
        "even-tv-24": "Even under and over the TV, 24″ console space (TV higher)",
      },
      default: "4-under",
    },
    console: {
      label: "Media console",
      choices: {
        none: "None: just the space for one",
        "60x16": "60″ wide × 16″ tall",
        "60x18": "60″ wide × 18″ tall",
        "48x20": "48″ wide × 20″ tall",
        "60x22": "60″ wide × 22″ tall",
        "60x24": "60″ wide × 24″ tall",
        "70x22": "70″ wide × 22″ tall, runs under the side shelves",
        "72x26": "72″ wide × 26″ tall, too big",
      },
      default: "none",
    },
  },
  phases: [{ id: "p1", title: "Hang the shelves" }],
  materials: {},
  banding: {},
  hardware: Object.fromEntries(P.sizes.map((len) => [`shelf-${len}`, {
    name: `DIY Cartel linear floating shelf, ${len}″ × ${P.shelf.depth}″`, unit: "each" as const, cost: P.price[len],
    spec: "14-gauge steel; screws and drywall anchors included",
  }])),

  build(b, opt) {
    const W = P.wall.width, H = P.wall.height, wt = P.wallT, room = 36;
    const t = P.shelf.t, d = P.shelf.depth;

    // ---------- the room ----------
    b.context({ id: "wall", name: "TV wall", role: "wall", box: box([0, W], [0, H], [-wt, 0]) });
    b.context({ id: "floor", name: "Floor", role: "floor", box: box([0, W], [-1, 0], [0, room]) });
    b.context({ id: "ceiling", name: "Ceiling", role: "wall", box: box([0, W], [H, H + 1], [-wt, room]) });
    b.context({ id: "wall-left", name: "Side wall", where: "left", role: "wall", box: box([-wt, 0], [-1, H + 1], [-wt, room]) });    // inferred: walls at both ends
    b.context({ id: "wall-right", name: "Side wall", where: "right", role: "wall", box: box([W, W + wt], [-1, H + 1], [-wt, room]) });

    const tvX: Range = span(r16((W - P.tv.width) / 2), P.tv.width);
    // ---------- the middle column, floor up: console space, gap, TV, gap, long shelf, gap, AC ----------
    const acY: Range = [H - P.ac.drop, H];
    const plan = P.gapPlans[opt.gaps];
    const spaceH = plan.console;
    const evenAll = r16((acY[0] - spaceH - P.tv.height) / 3);
    const spanTop = plan.rule === "even-all" ? acY[0] - evenAll : acY[0] - P.acHeadroom;
    const gapUnder = plan.rule === "under" ? (plan.under as number)
      : plan.rule === "even-all" ? evenAll
      : r16((spanTop - spaceH - P.tv.height) / 2);
    const bottomRowTop = spaceH + gapUnder;                       // the TV's bottom edge and the lowest shelf tops
    const tvY: Range = span(bottomRowTop, P.tv.height);
    b.context({ id: "tv", name: "TV", role: "fixture", color: "#1d1f23", box: box(tvX, tvY, span(P.tv.standoff, P.tv.depth)) });
    const acX: Range = [P.ac.fromLeft, W - P.ac.fromRight];
    b.context({ id: "ac", name: "Air conditioner", role: "fixture", color: "#e4e7ea", box: box(acX, acY, [0, P.ac.depth]) });

    // ---------- the long shelf above the TV, its ends setting where the side rows go ----------
    const pieces = P.spanPieces[opt.span];
    const spanLen = pieces.reduce((a, c) => a + c, 0);
    const margin = r16((W - spanLen) / 2);
    const pitch = r16((spanTop - bottomRowTop) / P.rows);        // the side rows split the height below the long shelf evenly
    const spanIds = pieces.length === 3 ? ["span-left", "span-middle", "span-right"] : ["span-left", "span-right"];
    // One shelf: the plate, and its back flange drawn as a second box. The flange is part of the same bought
    // shelf, so it counts 0 in the shopping list.
    const shelf = (id: string, where: string, step: string, xr: Range, top: number, extra: { joins?: { to: string; by: "rests-on"; note: string }[] } = {}) => {
      const len = xr[1] - xr[0], item = `shelf-${len}`;
      b.hardware({ id, name: `Shelf, ${len}″`, where, item, qty: 1, phase: "p1", step, box: box(xr, [top - t, top], [0, d]), ...extra });
      b.hardware({ id: `${id}-flange`, name: "Shelf back flange", where, item, qty: 0, phase: "p1", step, box: box(xr, [top, top + P.shelf.flange], [0, t]) });
    };
    let sx = margin;
    const seams: number[] = [];
    pieces.forEach((len, i) => {
      if (i > 0) seams.push(sx);
      shelf(spanIds[i], `above the TV, ${spanIds[i].slice(5)}`, "hang-span", span(sx, len), spanTop,
        i > 0 ? { joins: [{ to: spanIds[i - 1], by: "rests-on", note: "Butts end to end; no joint, just tight" }] } : {});
      sx += len;
    });

    // ---------- side rows: flush with the long shelf's ends ----------
    const sides: [string, Range][] = [["left", span(margin, P.side)], ["right", [W - margin - P.side, W - margin]]];
    const rowTops = Array.from({ length: P.rows }, (_, i) => bottomRowTop + i * pitch);
    for (const [side, xr] of sides)
      rowTops.forEach((top, i) =>
        shelf(`side-${side}-${i + 1}`, `${side} of the TV, row ${i + 1} from the bottom`, "hang-sides", xr, top));

    // ---------- the media console: not bought yet, so the space for one, and a size to try in it ----------
    const spaceX: Range = [sides[0][1][1], sides[1][1][0]];          // between the lowest side shelves
    b.context({ id: "console-space", name: "Space for a media console", role: "space", box: box(spaceX, [0, spaceH], [0, P.consoleDepth]) });
    const con = opt.console === "none" ? null : P.consoles[opt.console];
    if (con) {
      const [cw, ch, cd] = con;
      const conX: Range = span(r16((W - cw) / 2), cw);
      b.context({ id: "console", name: `Media console, ${cw}″ × ${ch}″`, role: "fixture", color: "#7a5c43", box: box(conX, [0, ch], [0, cd]) });
      // Two rules that say whether the size being tried fits the space.
      b.check("console-under-tv", "The media console's top clears the TV's bottom edge", ch <= spaceH,
        `console ${L(ch)} tall; ${L(gapUnder)} under the TV means no taller than ${L(spaceH)}`);
      b.check("console-between-rows", "The media console fits between the lowest side shelves, so nothing on it sits under a shelf",
        conX[0] >= spaceX[0] && conX[1] <= spaceX[1],
        `console ${L(cw)} wide; ${L(spaceX[1] - spaceX[0])} between the side rows`);
    }

    // ---------- steps ----------
    b.step({ id: "layout", phase: "p1", title: "Mark out the wall",
      text: `Find and mark every stud. Draw level lines for the shelf tops at ${rowTops.map(L).join(" and ")} and ${L(spanTop)} off the floor, and mark the shelf ends at ${L(margin)} from each end of the wall. Check the TV mount lines up: its bottom edge at ${L(tvY[0])}.` });
    b.step({ id: "hang-sides", phase: "p1", title: "Hang the side rows",
      text: `Bottom row first: hold each shelf on its line, level it, mark its three flange holes, and screw into a stud wherever a hole lands on one, the supplied drywall anchors elsewhere. Each row runs ${L(margin)} to ${L(margin + P.side)} on the left and ${L(W - margin - P.side)} to ${L(W - margin)} on the right.` });
    b.step({ id: "hang-span", phase: "p1", title: "Hang the long shelf",
      text: `Hang the ${pieces.join(" + ")} run left to right the same way, each shelf butted tight against the last and levelled to it. The seams fall at ${seams.map(L).join(" and ")}.` });

    // ---------- design rules ----------
    const all = [...pieces, P.side];
    b.check("stock-lengths", "Every shelf is a length that is sold", all.every((x) => P.sizes.includes(x)),
      `uses ${[...new Set(all)].join(", ")}″; sold in ${P.sizes.join(", ")}″`, "error");
    const spanEnds: Range = [margin, margin + spanLen];
    b.check("ends-aligned", "The long shelf's ends line up with the outer ends of the side rows",
      spanEnds[0] === sides[0][1][0] && spanEnds[1] === sides[1][1][1],
      `long shelf ${L(spanEnds[0])} to ${L(spanEnds[1])}; side rows from ${L(sides[0][1][0])} and to ${L(sides[1][1][1])}`, "error");
    const gapL = tvX[0] - sides[0][1][1], gapR = sides[1][1][0] - tvX[1];
    b.check("tv-gap", "The side shelves stand clear of the TV, by the same amount each side",
      Math.min(gapL, gapR) >= P.minTvGap && gapL === gapR, `${L(gapL)} left, ${L(gapR)} right; at least ${L(P.minTvGap)}`);
    const spanUnder = spanTop - t;
    b.check("tv-under-span", "The TV fits under the long shelf", tvY[1] < spanUnder,
      `TV top at ${L(tvY[1])}, long shelf underside at ${L(spanUnder)}: ${L(spanUnder - tvY[1])} between them`, "error");
    const headroom = acY[0] - spanTop;
    b.check("ac-headroom", "Room under the air conditioner for things on the long shelf", headroom >= P.acHeadroom,
      `${L(headroom)} from the long shelf to the AC; ${L(P.acHeadroom)} wanted`);
    const tvCentre = (tvY[0] + tvY[1]) / 2;
    b.check("tv-height", "The TV's centre is at a comfortable height from a sofa", tvCentre <= P.maxTvCentre,
      `centre at ${L(tvCentre)}; ${L(P.maxTvCentre)} at most. Gaps: ${L(gapUnder)} under the TV, ${L(spanTop - tvY[1])} over it, ${L(headroom)} over the long shelf`);
    // The space over the long shelf is set by the AC, so only the shelf-to-shelf spaces need to match.
    const bays = [...rowTops.slice(1).map((y, i) => y - t - rowTops[i]), spanUnder - rowTops[rowTops.length - 1]];
    b.check("even-bays", "The open heights between shelves are within 1″ of each other", Math.max(...bays) - Math.min(...bays) <= 1,
      `${bays.map(L).join(" / ")}, bottom to top; ${L(headroom)} over the long shelf, up to the AC`);
    b.check("seams-on-tv-edges", "The long shelf's seams fall on the TV's edge lines", seams.every((s) => s === tvX[0] || s === tvX[1]),
      `seams at ${seams.map(L).join(", ")}; TV edges at ${L(tvX[0])} and ${L(tvX[1])}`);
    b.check("ac-over-middle", "The air conditioner sits entirely over the TV, so tall things at the ends of the long shelf are clear of it",
      acX[0] >= tvX[0] && acX[1] <= tvX[1], `AC ${L(acX[0])} to ${L(acX[1])}; TV ${L(tvX[0])} to ${L(tvX[1])}`);

    // ---------- drawing views ----------
    b.view({ id: "front", title: "Elevation", kind: "elevation", look: "-z",
      caption: "The TV wall, from the room.",
      dims: [
        { from: "wall.x0", to: "wall.x1", offset: -6 },
        { from: "wall.y0", to: "wall.y1", offset: -10 },
        { from: "wall.x0", to: "side-left-1.x0", offset: -2 },
        { from: "side-left-1.x0", to: "side-left-1.x1", offset: -2 },
        // The TV's width and its gap to the side rows (the same each side), just over the TV.
        { from: "side-left-1.x1", to: "tv.x0", offset: tvY[1] + 1.5 },
        { from: "tv.x0", to: "tv.x1", offset: tvY[1] + 1.5, text: "TV {}" },
        // The gaps under and over the TV, in the strip between it and the right-hand shelves.
        { from: "console-space.y1", to: "tv.y0", offset: tvX[1] + 2.5 },
        { from: "tv.y1", to: `${spanIds[spanIds.length - 1]}.y1` as const, offset: tvX[1] + 2.5 },
        ...spanIds.map((id) => ({ from: `${id}.x0` as const, to: `${id}.x1` as const, offset: spanTop + 4 })),
        { from: "floor.y1", to: "side-right-1.y1", offset: W + 4 },
        { from: "side-right-1.y1", to: "side-right-2.y1", offset: W + 4 },
        { from: "side-right-2.y1", to: `${spanIds[spanIds.length - 1]}.y1` as const, offset: W + 4 },
        { from: `${spanIds[spanIds.length - 1]}.y1` as const, to: "ac.y0", offset: W + 4 },
        { from: "ac.y0", to: "ceiling.y0", offset: W + 4 },
        { from: "tv.y0", to: "tv.y1", offset: -4 },
        { from: "floor.y1", to: "console-space.y1", offset: -4 },
        { from: "console-space.x0", to: "console-space.x1", offset: spaceH - 3 },
      ],
      labels: [{ part: "tv", text: "TV" }, { part: "ac", text: "AC" },
        con ? { part: "console", text: `console ${con[0]} × ${con[1]}`, dy: -con[1] / 4 } : { part: "console-space", text: "space for a media console", dy: -spaceH / 4 }] });
    b.view({ id: "section", title: "Section through the middle", kind: "section", look: "+x", cut: W / 2,
      caption: "Cut through the TV, the long shelf and the air conditioner; wall on the left.",
      dims: [{ from: "wall.z1", to: "span-left.z1", offset: H + 3 }, { from: "span-left.y1", to: "ac.y0", offset: -3 }] });
    b.view({ id: "plan", title: "Plan", kind: "plan", look: "-y", cut: spanTop + 2,
      dims: [{ from: "wall.x0", to: "wall.x1", offset: 14 }] });
  },
});
