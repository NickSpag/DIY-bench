// Ceiling storage: a 2×4 frame in a basement alcove, to carry a motorized or crank-down overhead storage rack.
// The building has metal ceiling joists, so the rack hangs from the frame, not the ceiling.
// Four 2×4 posts stand in the corners; two doubled 2×4 beams span wall to wall across the top, one under each
// of the rack's mounting rails, which run left to right; a 2×4 tie joins the beams at each side.
// Axes: x across the alcove, left to right as you face its back wall; y up from the floor; z out from the back
// wall toward the open side of the alcove. Inches.
// Values marked "inferred" are placeholders, not measurements: replace them and list them in notes.md.
import { defineProject, box, type Range } from "../../core/model/index.ts";

export const P = {
  alcove: {
    width: 72,     // across
    depth: 52,     // back wall to the open side
    height: 98.5,  // floor to ceiling
  },
  // The exit doorway in the back wall: wall left of it, right of it and above it. The opening runs 3″ into the
  // wall, then a 1″ door frame all around holds the door.
  doorway: { left: 27.5, right: 6.5, header: 15.5, recess: 3, frame: 1 },
  // The door in the left wall, measured to the outside of its casing as you face that wall: the casing is
  // 3¾″ wide all around and stands ¾″ proud of the wall.
  leftDoor: { left: 8.25, right: 2.5, top: 8, casing: 3.75, casingProud: 0.75 }, // inferred: measured to the casing's outer edge
  // Both doors swing into the alcove, hinged on the left as you face them from inside it. They are closed
  // whenever the rack is lowered, so only the frame and the raised rack have to stay out of their swing.
  doorT: 1.75,     // inferred: door thickness, for drawing only
  rightWall: 80,   // the right wall runs on past the alcove; it goes farther, but this is the part that matters
  leftReturn: 30,  // approximate: where the left wall ends, a wall turns away from the alcove, for the drawing
  wallT: 5,        // inferred: wall thickness, for drawing only; at least the back doorway's 3″ recess and a door
  room: 36,        // inferred: floor drawn in front of the alcove, for drawing only

  // The rack: KOKORACKER 4×4 ft ceiling storage lift, 250 lb capacity, 47 lb.
  rack: {
    platform: 48,
    rail: { length: 48, spacing: 48, width: 2, thickness: 1 }, // spacing is centre to centre; inferred: spacing to be checked, width "2ish", thickness a guess
    raisedDrop: 6 as number | null, // inferred: rail top to the platform's underside when fully raised; the rack ships in a box 5½″ thick
    capacity: 250, weight: 47,
  },
  angle: { leg: 2, t: 0.125 }, // steel angle, 2″ × 2″ × ⅛″, for the "on steel angles" option
  ceilingGap: 0.5, // inferred: the frame stops short of the ceiling so it stands up without jamming
  lumber: { t: 1.5, w: 3.5 }, // 2×4
  // Values for the beam rule: spruce-pine-fir No. 2 (2×4 size factor included) and mild steel (A36, 0.6 × yield).
  spf: { fb: 875 * 1.5, e: 1_400_000, fc: 1150 * 1.15, eMin: 510_000 },
  postBrace: 32,   // inferred: posts screwed to the wall at the top, middle and bottom, so no more than this between
  steel: { fb: 21_600, e: 29_000_000 },
  beamWood: { w: 1.5, d: 2 }, // the wood in the steel-angle beam: a 2×4 ripped to 2″, on edge
  owned2x4: [52, 52, 68, 88, 120], // the user's straight, premium 2×4s, cut from before anything is bought
};

export default defineProject({
  id: "ceiling-storage",
  title: "Ceiling storage",
  units: "in",
  options: {
    railMount: {
      label: "Beams",
      choices: {
        steel: "2×4 ripped to 2″ with a steel angle along the bottom (2⅛″ deep), rail underneath",
        under: "Doubled 2×4s (3½″ deep), rail underneath",
        angle: "Doubled 2×4s, rail hung from a steel angle beside the beam",
      },
      default: "steel",
    },
  },
  phases: [{ id: "p1", title: "Build" }],
  materials: {
    "2x4": { type: "board", name: "2×4 (spruce-pine-fir, No. 2 or better)", nominal: "2×4", thickness: P.lumber.t, width: P.lumber.w, finish: "none",
      stockLengths: [96], owned: P.owned2x4 },
    "2x4-ripped": { type: "board", name: "2×4 ripped narrower", nominal: "2×4", thickness: P.lumber.t, finish: "none",
      stockLengths: [96], owned: P.owned2x4 },
  },
  banding: {},
  hardware: {
    rack: { name: "KOKORACKER 4×4 ft ceiling storage lift", unit: "each", spec: "Already bought" },
    "rack-rail": { name: "Rack mounting rail", unit: "each", spec: "Comes with the rack" },
    "rail-screws": { name: "Lag screws for the rails, 5/16″ × 2½″, with washers", unit: "each", spec: "Or the bolts that come with the rack, if they are long enough to bite 2″ into the beams" },
    "frame-screws": { name: "Structural wood screws, 3″ (e.g. GRK or Spax)", unit: "set" },
    angle: { name: "Steel angle, 2″ × 2″ × ⅛″, 48″ long", unit: "each", spec: "Plain or galvanized; holes drilled to suit the rail" },
    "angle-72": { name: "Steel angle, 2″ × 2″ × ⅛″, 72″ long, solid (not punched)", unit: "each", spec: "Cut to fit wall to wall; drill holes where needed" },
    "angle-screws": { name: "Wood screws, #10 × 1¼″, pan head", unit: "each", spec: "Steel angle to the wood, every 8″ on both legs, staggered" },
    "angle-lags": { name: "Lag screws, 5/16″ × 2½″, with washers", unit: "each", spec: "Through the angle's upright leg into the beam" },
    "angle-bolts": { name: "Machine bolts, ¼″ × 1″, with nuts and washers", unit: "each", spec: "Rail to the angle's flat leg, heads on top" },
    "wall-screws": { name: "Self-drilling screws for steel studs, #10 × 2½″", unit: "set", spec: "Post to wall stud, to keep the frame from racking" },
  },

  build(b, opt) {
    const { width: W, depth: D, height: H } = P.alcove;
    const wt = P.wallT;
    const door = { x: [P.doorway.left, W - P.doorway.right] as const, top: H - P.doorway.header };
    const LD = P.leftDoor, fr = P.doorway.frame;
    // Facing the left wall, your left is the alcove's open side (z = D) and your right is the back wall.
    const casing = { z: [LD.right, D - LD.left] as const, top: H - LD.top };
    const leftOpening = { z: [casing.z[0] + LD.casing, casing.z[1] - LD.casing] as const, top: casing.top - LD.casing };

    // The alcove: three walls, floor and ceiling, open toward the room at z = D. // inferred: open on the front side
    // The exit doorway is in the back wall. The right wall runs on past the alcove; the left wall ends at the
    // alcove's open side, where a wall turns away to the left.
    const zFar = Math.max(P.rightWall, D + P.room);
    b.context({ id: "floor", name: "Floor", role: "floor", box: box([-P.leftReturn, W + wt], [-1, 0], [-wt, zFar]) });
    b.context({ id: "ceiling", name: "Ceiling", role: "wall", box: box([-wt, W + wt], [H, H + 1.5], [-wt, D]) });
    b.context({ id: "wall-back-left", name: "Back wall", where: "left of the doorway", role: "wall", group: "walls", box: box([-wt, door.x[0]], [0, H], [-wt, 0]) });
    b.context({ id: "wall-back-right", name: "Back wall", where: "right of the doorway", role: "wall", group: "walls", box: box([door.x[1], W + wt], [0, H], [-wt, 0]) });
    b.context({ id: "door-header", name: "Wall above the doorway", role: "wall", group: "walls", box: box(door.x, [door.top, H], [-wt, 0]) });
    b.context({ id: "wall-left-back", name: "Left wall", where: "between the back wall and the door", role: "wall", group: "walls", box: box([-wt, 0], [0, H], [0, leftOpening.z[0]]) });
    b.context({ id: "wall-left", name: "Left wall", where: "between the door and the open side", role: "wall", group: "walls", box: box([-wt, 0], [0, H], [leftOpening.z[1], D]) });
    b.context({ id: "wall-left-header", name: "Wall above the left door", role: "wall", group: "walls", box: box([-wt, 0], [leftOpening.top, H], leftOpening.z) });

    // The back door: the doorway runs P.doorway.recess into the wall, then the door frame.
    const zDoor: Range = [-(P.doorway.recess + P.doorT), -P.doorway.recess];
    b.context({ id: "back-door-frame-l", name: "Back door frame", where: "left", role: "wall", color: "#e9e6df", box: box([door.x[0], door.x[0] + fr], [0, door.top], zDoor) });
    b.context({ id: "back-door-frame-r", name: "Back door frame", where: "right", role: "wall", color: "#e9e6df", box: box([door.x[1] - fr, door.x[1]], [0, door.top], zDoor) });
    b.context({ id: "back-door-frame-head", name: "Back door frame", where: "head", role: "wall", color: "#e9e6df", box: box([door.x[0] + fr, door.x[1] - fr], [door.top - fr, door.top], zDoor) });
    b.context({ id: "back-door", name: "Back door", role: "fixture", color: "#cfc8bb", box: box([door.x[0] + fr, door.x[1] - fr], [0, door.top - fr], zDoor) });

    // The left door: its casing stands proud of the wall into the alcove; the door sits in the wall.
    const xCasing: Range = [0, LD.casingProud];
    b.context({ id: "left-door-casing-back", name: "Left door casing", where: "back-wall side", role: "wall", color: "#e9e6df", box: box(xCasing, [0, casing.top], [casing.z[0], leftOpening.z[0]]) });
    b.context({ id: "left-door-casing-front", name: "Left door casing", where: "open side", role: "wall", color: "#e9e6df", box: box(xCasing, [0, casing.top], [leftOpening.z[1], casing.z[1]]) });
    b.context({ id: "left-door-casing-head", name: "Left door casing", where: "head", role: "wall", color: "#e9e6df", box: box(xCasing, [leftOpening.top, casing.top], leftOpening.z) });
    b.context({ id: "left-door", name: "Left door", role: "fixture", color: "#cfc8bb", box: box([-P.doorT, 0], [0, leftOpening.top], leftOpening.z) });
    b.context({ id: "wall-left-return", name: "Wall left of the alcove", role: "wall", group: "walls", box: box([-P.leftReturn, -wt], [0, H], [D - wt, D]) });
    b.context({ id: "wall-right", name: "Right wall", role: "wall", group: "walls", box: box([W, W + wt], [0, H], [0, P.rightWall]) });

    // Door swings, in plan: a quarter circle about the hinge, from the floor to the top of the door.
    const swings = [
      { id: "back-door-swing", name: "Back door swing", hinge: [door.x[0] + fr, -P.doorway.recess] as const,
        r: door.x[1] - door.x[0] - 2 * fr, x: [door.x[0] + fr, door.x[1] - fr] as Range, top: door.top - fr },
      { id: "left-door-swing", name: "Left door swing", hinge: [0, leftOpening.z[1]] as const,
        r: leftOpening.z[1] - leftOpening.z[0], x: [0, leftOpening.z[1] - leftOpening.z[0]] as Range, top: leftOpening.top },
    ].map((sw) => ({ ...sw, z: sw.id === "back-door-swing" ? [sw.hinge[1], sw.hinge[1] + sw.r] as Range : leftOpening.z as Range }));
    for (const sw of swings)
      b.context({ id: sw.id, name: sw.name, role: "space", box: box(sw.x, [0, sw.top], sw.z) });

    // Nothing built may stand in a door's swing below the top of the door. The swing is a quarter circle, so
    // a part's plan footprint is clipped to the swing's square and tested against the radius from the hinge.
    const inSwing = (bx: { x: Range; y: Range; z: Range }, sw: (typeof swings)[number]) => {
      if (bx.y[0] >= sw.top) return false;
      const x0 = Math.max(bx.x[0], sw.x[0]), x1 = Math.min(bx.x[1], sw.x[1]);
      const z0 = Math.max(bx.z[0], sw.z[0]), z1 = Math.min(bx.z[1], sw.z[1]);
      if (x0 >= x1 || z0 >= z1) return false;
      const dx = Math.max(x0 - sw.hinge[0], 0, sw.hinge[0] - x1), dz = Math.max(z0 - sw.hinge[1], 0, sw.hinge[1] - z1);
      return Math.hypot(dx, dz) < sw.r;
    };
    // Every frame and rack part's id goes in here as it is built, for the door-swing rule at the end.
    const built: string[] = [];

    // ---------- the frame ----------
    const R = P.rack, L = P.lumber, T = L.t, A = P.angle;
    const mount = opt.railMount;               // "steel", "under" or "angle"
    const steel = mount === "steel", onAngle = mount === "angle";
    const top = H - P.ceilingGap;              // the frame stops short of the ceiling
    // The rack sits centred front to back; side +1 is the back beam (its outer face toward the back wall).
    const railZ = [D / 2 - R.rail.spacing / 2, D / 2 + R.rail.spacing / 2];
    const BW = P.beamWood;
    const woodD = steel ? BW.d : L.w;          // depth of the wood beam
    const beamY: Range = [top - woodD, top];
    const beams = [
      { id: "beam-back", where: "back", c: railZ[0], side: 1 },
      { id: "beam-front", where: "front", c: railZ[1], side: -1 },
    ].map((bm) => {
      if (steel) return { ...bm, z: [bm.c - BW.w / 2, bm.c + BW.w / 2] as Range, face: 0 };
      if (!onAngle) return { ...bm, z: [bm.c - T, bm.c + T] as Range, face: 0 };
      // Rail hung beside the beam: the beam sits just inside the rail, the angle bolted to its outer face.
      const face = bm.c + bm.side * (R.rail.width / 2 + A.t);
      return { ...bm, z: (bm.side > 0 ? [face, face + 2 * T] : [face - 2 * T, face]) as Range, face };
    });
    // Everything at the beam, steel included, front to back.
    const extent = beams.map((bm) => (!steel ? bm.z
      : bm.side > 0 ? [bm.z[0] - A.t, Math.max(bm.z[1], bm.z[0] - A.t + A.leg)] : [Math.min(bm.z[0], bm.z[1] + A.t - A.leg), bm.z[1] + A.t]) as Range);
    const beamCheck = Math.min(extent[0][0], D - extent[1][1]);
    b.check("beams-inside-alcove", "Both beams fit inside the alcove front to back", beamCheck >= 0,
      `rails ${R.rail.spacing}″ apart; beams ${extent[0][0]}″ from the back wall and ${D - extent[1][1]}″ from the open side`, "error");

    // Posts: one in each corner, under the ends of the beams, 3½″ front to back. The back-left one stands
    // in front of the left door's casing, which reaches to 2½″ from the back wall. With the steel angle under
    // the beam, the posts stop under the angle.
    const postTop = steel ? beamY[0] - A.t : beamY[0];
    // With the steel-angle beams the posts are ripped to the beam's depth front to back, 2″; otherwise full 2×4s.
    const postD = steel ? extent[0][1] - extent[0][0] : L.w;
    const bz0 = Math.max(0, extent[0][1] - postD), fz1 = Math.min(D, extent[1][0] + postD);
    const postZ = { back: [bz0, bz0 + postD] as Range, front: [fz1 - postD, fz1] as Range };
    const clearOfCasing = (z: Range) => (z[0] < casing.z[1] && z[1] > casing.z[0] ? LD.casingProud : 0);
    const posts = [
      { id: "post-back-left", where: "back left", x: clearOfCasing(postZ.back), z: postZ.back, beam: "beam-back" },
      { id: "post-back-right", where: "back right", x: W - T, z: postZ.back, beam: "beam-back" },
      { id: "post-front-left", where: "front left", x: clearOfCasing(postZ.front), z: postZ.front, beam: "beam-front" },
      { id: "post-front-right", where: "front right", x: W - T, z: postZ.front, beam: "beam-front" },
    ];
    for (const po of posts) {
      b.board({ id: po.id, name: "Post", where: po.where, material: steel ? "2x4-ripped" : "2x4", phase: "p1", step: "p1-posts",
        box: box([po.x, po.x + T], [0, postTop], po.z), grain: "y", exposure: "limited", exposureNote: "basement storage frame",
        notes: `Screw to the wall at the top, middle and bottom (no more than ${P.postBrace}″ apart) so the post cannot bow and the frame cannot rack.` });
      built.push(po.id);
    }

    // Beams, spanning wall to wall and resting on the posts: a ripped 2×4 wrapped in a steel angle, or two 2×4s on edge.
    const restsOn = (bmId: string) => posts.filter((po) => po.beam === bmId)
      .map((po) => ({ to: po.id, by: "rests-on" as const, note: steel ? "screwed down through the angle into the post" : "screwed down into the post" }));
    const beamIds: Record<string, { inner: string }> = {};
    for (const bm of beams) {
      if (steel) {
        b.board({ id: bm.id, name: "Beam", where: bm.where, material: "2x4-ripped", phase: "p1", step: "p1-beams",
          box: box([0, W], beamY, bm.z), grain: "x", fitToSite: true, exposure: "limited", exposureNote: "basement storage frame",
          joins: [...restsOn(bm.id), { to: `angle-${bm.where}`, by: "screws", note: "#10 screws every 8″ through both legs of the angle" }] });
        built.push(bm.id);
        beamIds[bm.id] = { inner: bm.id };
        // The angle wraps the beam's bottom outer corner: flat leg under it, upright leg up its outer face.
        const s0 = bm.side;
        const flat: Range = s0 > 0 ? [bm.z[0] - A.t, bm.z[0] - A.t + A.leg] : [bm.z[1] + A.t - A.leg, bm.z[1] + A.t];
        const upright: Range = s0 > 0 ? [bm.z[0] - A.t, bm.z[0]] : [bm.z[1], bm.z[1] + A.t];
        b.hardware({ id: `angle-${bm.where}`, name: "Steel angle", where: `${bm.where} beam, flat leg`, item: "angle-72", qty: 1, phase: "p1", step: "p1-rails",
          box: box([0, W], [beamY[0] - A.t, beamY[0]], flat) });
        b.hardware({ id: `angle-${bm.where}-upright`, name: "Steel angle", where: `${bm.where} beam, upright leg (same piece)`, item: "angle-72", qty: 0, phase: "p1", step: "p1-rails",
          box: box([0, W], [beamY[0], beamY[0] - A.t + A.leg], upright) });
        built.push(`angle-${bm.where}`, `angle-${bm.where}-upright`);
        continue;
      }
      for (const [i, half] of (["a", "b"] as const).entries()) {
        const id = `${bm.id}-${half}`;
        b.board({ id, name: "Beam", where: `${bm.where}, ${i === 0 ? "back" : "front"} half`, material: "2x4", phase: "p1", step: "p1-beams",
          box: box([0, W], beamY, [bm.z[0] + i * T, bm.z[0] + (i + 1) * T]), grain: "x", fitToSite: true,
          exposure: "limited", exposureNote: "basement storage frame",
          joins: [...restsOn(bm.id), ...(i === 1 ? [{ to: `${bm.id}-a`, by: "screws" as const, note: "3″ screws every 12″, staggered" }] : [])] });
        built.push(id);
      }
      beamIds[bm.id] = { inner: bm.side > 0 ? `${bm.id}-b` : `${bm.id}-a` };
    }

    // Ties: between the beams at each side, closing the top into a rectangle.
    const tieT = T;
    for (const [id, where, x] of [["tie-left", "left", 0], ["tie-right", "right", W - tieT]] as const) {
      b.board({ id, name: "Tie", where, material: steel ? "2x4-ripped" : "2x4", phase: "p1", step: "p1-beams",
        box: box([x, x + tieT], beamY, [beams[0].z[1], beams[1].z[0]]), grain: "z", exposure: "limited", exposureNote: "basement storage frame",
        joins: [{ to: beamIds["beam-back"].inner, by: "screws", note: "two 3″ screws through the beam into the end" },
          { to: beamIds["beam-front"].inner, by: "screws", note: "two 3″ screws through the beam into the end" }] });
      built.push(id);
    }

    // The rack's rails, centred left to right: under the beam (through the angle's flat leg, with the steel
    // option), or hung beside it from a 48″ angle.
    const railX: Range = [W / 2 - R.rail.length / 2, W / 2 + R.rail.length / 2];
    const railTop = onAngle ? top - A.t : steel ? beamY[0] - A.t : beamY[0];
    const railY: Range = [railTop - R.rail.thickness, railTop];
    for (const bm of beams) {
      const id = `rail-${bm.where}`;
      b.hardware({ id, name: "Rack mounting rail", item: "rack-rail", qty: 1, phase: "p1", step: "p1-rails",
        box: box(railX, railY, [bm.c - R.rail.width / 2, bm.c + R.rail.width / 2]) });
      built.push(id);
      if (!onAngle) continue;
      const s0 = bm.side, f = bm.face;
      const upright: Range = s0 > 0 ? [f - A.t, f] : [f, f + A.t];
      const flat: Range = s0 > 0 ? [f - A.leg, f - A.t] : [f + A.t, f + A.leg];
      b.hardware({ id: `angle-${bm.where}`, name: "Steel angle", where: `${bm.where}, flat leg`, item: "angle", qty: 1, phase: "p1", step: "p1-rails",
        box: box(railX, [top - A.t, top], flat) });
      b.hardware({ id: `angle-${bm.where}-upright`, name: "Steel angle", where: `${bm.where}, upright leg (same piece)`, item: "angle", qty: 0, phase: "p1", step: "p1-rails",
        box: box(railX, [top - A.leg, top], upright) });
      built.push(`angle-${bm.where}`, `angle-${bm.where}-upright`);
    }

    // The raised rack has to clear the doors, which swing under it.
    const doorTop = Math.max(...swings.map((sw) => sw.top));
    const budget = railY[1] - doorTop;   // rail top down to the taller door's top
    const rackBottom = R.raisedDrop === null ? null : railY[1] - R.raisedDrop;
    b.check("rack-raised-clears-doors", "The raised rack clears the tops of both doors", rackBottom !== null && rackBottom >= doorTop,
      rackBottom === null
        ? `rack's raised height not measured yet: it may hang at most ${budget}″ below the top of its rails (rails at ${railY[1]}″, left door ${doorTop}″ tall)`
        : `estimated platform underside ${rackBottom}″ off the floor, left door ${doorTop}″ tall: ${Math.round((rackBottom - doorTop) * 1000) / 1000}″ to spare; the rack may hang up to ${budget}″ below the top of its rails`);
    b.context({ id: "rack-raised", name: "Rack, raised (height estimated)", role: "space",
      box: box(railX, [rackBottom ?? doorTop, railY[0]], [D / 2 - R.platform / 2, D / 2 + R.platform / 2]) });

    // Beam strength: each beam carries half the rack and its full load, spread along the 48″ rail, over the
    // span between post centres. Wood and steel share the bending moment in proportion to their stiffness
    // (fastened together, they bend as one; counting them separately understates the pair).
    const span = W - T;
    const load = (R.capacity + R.weight) / 2;
    const a = R.rail.length;
    const M = (load / 2) * (span / 2) - (load / 2) * (a / 4);               // partial uniform load, centred
    const rect = (w: number, d: number) => ({ I: (w * d ** 3) / 12, S: (w * d ** 2) / 6 });
    const angleProps = (leg: number, t: number) => {
      const A1 = leg * t, A2 = (leg - t) * t, y1 = t / 2, y2 = t + (leg - t) / 2, yc = (A1 * y1 + A2 * y2) / (A1 + A2);
      const I = (leg * t ** 3) / 12 + A1 * (yc - y1) ** 2 + (t * (leg - t) ** 3) / 12 + A2 * (y2 - yc) ** 2;
      return { I, S: I / Math.max(yc, leg - yc) };
    };
    const wood = steel ? rect(BW.w, BW.d) : rect(2 * T, L.w);
    const members = [{ name: steel ? "ripped 2×4" : "doubled 2×4", E: P.spf.e, fb: P.spf.fb, ...wood },
      ...(steel ? [{ name: "steel angle", E: P.steel.e, fb: P.steel.fb, ...angleProps(A.leg, A.t) }] : [])];
    const EI = members.reduce((sum, m) => sum + m.E * m.I, 0);
    const stresses = members.map((m) => ({ ...m, stress: Math.round((M * (m.E * m.I / EI)) / m.S) }));
    const defl = Math.round(((load * span ** 3) / (48 * EI)) * 1000) / 1000;   // point-load deflection, an upper bound
    b.check("beam-strength", "Each beam carries half the loaded rack", stresses.every((m) => m.stress <= m.fb) && defl <= span / 360,
      `${load} lb per beam over a ${span}″ span: ${stresses.map((m) => `${m.name} ${m.stress} psi (allowed ${m.fb})`).join(", ")}; sag ${defl}″ (allowed ${Math.round((span / 360) * 1000) / 1000}″)`, "error");

    // Post strength: a column, braced by the wall screws on its thin side and free over its full height on its
    // wide side. Worst case, one post carries half a beam's load plus the frame (contents piled to one end).
    const postH = postTop, postLoad = load + 20;
    const colCp = (le: number, d: number) => {
      const fcE = (0.822 * P.spf.eMin) / (le / d) ** 2, al = fcE / P.spf.fc, c = 0.8;
      return (1 + al) / (2 * c) - Math.sqrt(((1 + al) / (2 * c)) ** 2 - al / c);
    };
    const slender = Math.max(P.postBrace / T, postH / postD);
    const postCap = Math.round(P.spf.fc * Math.min(colCp(P.postBrace, T), colCp(postH, postD)) * T * postD);
    b.check("post-strength", "Each post carries its share of the loaded rack", slender <= 50 && postCap >= postLoad,
      `${T}″ × ${postD}″ post, ${postH}″ tall, screwed to the wall every ${P.postBrace}″: slenderness ${Math.round(slender)} (limit 50), holds ${postCap} lb against ${postLoad} lb at worst`, "error");

    b.hardware({ id: "rack", name: "Ceiling storage lift", item: "rack", qty: 1, phase: "p1", step: "p1-beams" });
    b.hardware({ id: "frame-screws", name: "Frame screws", item: "frame-screws", qty: 1, phase: "p1", step: "p1-rails" });
    b.hardware({ id: "wall-screws", name: "Post-to-stud screws", item: "wall-screws", qty: 1, phase: "p1", step: "p1-posts" });
    if (onAngle) {
      b.hardware({ id: "angle-lags", name: "Angle-to-beam lag screws", item: "angle-lags", qty: 14, phase: "p1", step: "p1-rails" }); // inferred: every 8″ along each 48″ angle
      b.hardware({ id: "angle-bolts", name: "Rail-to-angle bolts", item: "angle-bolts", qty: 8, phase: "p1", step: "p1-rails" }); // inferred: 4 per rail until the holes are counted
    } else {
      b.hardware({ id: "rail-screws", name: "Rail screws", item: "rail-screws", qty: 8, phase: "p1", step: "p1-rails" }); // inferred: 4 per rail until the holes are counted
    }
    if (steel) b.hardware({ id: "angle-screws", name: "Angle-to-beam screws", item: "angle-screws", qty: 36, phase: "p1", step: "p1-rails" }); // inferred: every 8″ on both legs of both 72″ angles

    b.step({ id: "p1-rails", phase: "p1", title: "Rails onto the beams",
      text: steel
        ? "On the floor, rip the beam 2×4s to 2″, fit each steel angle around the bottom outer corner of one and screw it on through both legs every 8″, staggered. Drill the angle's flat leg to match the rail's holes, then lag-screw the rail up through the angle into the wood, centred along it. Mounting the rails now saves working overhead."
        : onAngle
        ? "On the floor, screw each pair of 2×4s into a beam. Drill each steel angle's flat leg to match the rail's holes, bolt the rail under it (bolt heads on top, since the ceiling leaves only ½″), then lag-screw the angle's upright leg to the beam's outer face with the flat leg flush with the beam top, centred along it. Mounting the rails now saves working overhead."
        : "On the floor, screw each pair of 2×4s into a beam, then screw one rack rail to the underside of each beam, centred along it and down its middle. Mounting the rails now saves working overhead." });
    b.step({ id: "p1-posts", phase: "p1", title: "Stand the posts",
      text: "Cut the four posts to fit under the beams (check the ceiling height at each corner first). Stand one in each corner, plumb it, and screw it to the wall at the top, middle and bottom, into studs where you can find them. The back-left post stands in front of the left door's casing." });
    b.step({ id: "p1-beams", phase: "p1", title: "Lift the beams and tie the top",
      text: "With a helper, lift each beam onto its two posts, rails facing down, and screw down into the posts. Fit the ties between the beams at each side. Then hang the rack from the rails as its instructions say." });

    b.view({ id: "front", title: "Elevation", kind: "elevation", look: "-z",
      dims: [{ from: "wall-left.x1", to: "wall-right.x0", offset: -4 }, { from: "floor.y1", to: "ceiling.y0", offset: -4 },
        { from: "wall-left.x1", to: "door-header.x0", offset: 6 }, { from: "door-header.x0", to: "door-header.x1", offset: 6 },
        { from: "door-header.x1", to: "wall-right.x0", offset: 6 }, { from: "door-header.y0", to: "ceiling.y0", offset: 6 },
        { from: "floor.y1", to: "door-header.y0", offset: 6 }, { from: "post-back-right.y0", to: "post-back-right.y1", offset: W + 8 },
        { from: `${steel ? "beam-back" : "beam-back-a"}.y0`, to: `${steel ? "beam-back" : "beam-back-a"}.y1`, offset: W + 8 }, { from: "rail-back.x0", to: "rail-back.x1", offset: H + 4 }] });
    b.view({ id: "left-wall", title: "Left wall, from inside the alcove", kind: "elevation", look: "-x", depth: [-wt, W / 2],
      dims: [{ from: "wall-back-left.z1", to: "left-door-casing-back.z0", offset: 6 }, { from: "left-door-casing-back.z0", to: "left-door-casing-front.z1", offset: 6 },
        { from: "left-door-casing-front.z1", to: "wall-left.z1", offset: 6 }, { from: "left-door.z0", to: "left-door.z1", offset: 40 },
        { from: "left-door-casing-head.y1", to: "ceiling.y0", offset: D / 2 }, { from: "floor.y1", to: "left-door-casing-head.y1", offset: D / 2 }] });
    b.view({ id: "section", title: "Section through the middle", kind: "section", look: "+x", cut: W / 2,
      dims: [{ from: "wall-back-left.z1", to: "wall-left.z1", offset: -4 }, { from: "floor.y1", to: "ceiling.y0", offset: -4 },
        { from: "rail-back.z0", to: "rail-front.z0", offset: H + 4 }] });
    b.view({ id: "plan", title: "Plan", kind: "plan", look: "-y", cut: H / 2,
      dims: [{ from: "wall-left.x1", to: "wall-right.x0", offset: 4 }, { from: "wall-back-left.z1", to: "wall-left.z1", offset: -4 },
        { from: "wall-right.z0", to: "wall-right.z1", offset: W - 4 }] });

    for (const sw of swings) {
      const hits = built.filter((id) => {
        const p = b.part(id);
        const boxes = "box" in p && p.box ? [p.box, ...Object.values(p.moves ?? {})] : [];
        return boxes.some((bx) => inSwing(bx, sw));
      });
      b.check(sw.id.replace("-swing", "-swing-clear"), `Nothing stands in the ${sw.name.toLowerCase()}`, hits.length === 0,
        hits.length ? `in the swing: ${hits.join(", ")}` : `${sw.r}″ door, swing clear up to ${sw.top}″ off the floor`, "error");
    }
  },
});
