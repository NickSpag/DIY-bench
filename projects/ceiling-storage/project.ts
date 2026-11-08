// Ceiling storage: a 2×4 frame in a basement alcove, to carry a motorized or crank-down overhead storage rack.
// The building has metal ceiling joists, so the rack hangs from the frame, not the ceiling.
// For now this is only the alcove itself; the frame and the rack come next.
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
  doorT: 1.75,     // inferred: door thickness, for drawing only
  rightWall: 80,   // the right wall runs on past the alcove; it goes farther, but this is the part that matters
  leftReturn: 30,  // approximate: where the left wall ends, a wall turns away from the alcove, for the drawing
  wallT: 5,        // inferred: wall thickness, for drawing only; at least the back doorway's 3″ recess and a door
  room: 36,        // inferred: floor drawn in front of the alcove, for drawing only
};

export default defineProject({
  id: "ceiling-storage",
  title: "Ceiling storage",
  units: "in",
  options: {},
  phases: [{ id: "p1", title: "Build" }],
  materials: {},
  banding: {},
  hardware: {},

  build(b) {
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
    b.context({ id: "wall-back-left", name: "Back wall", where: "left of the doorway", role: "wall", box: box([-wt, door.x[0]], [0, H], [-wt, 0]) });
    b.context({ id: "wall-back-right", name: "Back wall", where: "right of the doorway", role: "wall", box: box([door.x[1], W + wt], [0, H], [-wt, 0]) });
    b.context({ id: "door-header", name: "Wall above the doorway", role: "wall", box: box(door.x, [door.top, H], [-wt, 0]) });
    b.context({ id: "wall-left-back", name: "Left wall", where: "between the back wall and the door", role: "wall", box: box([-wt, 0], [0, H], [0, leftOpening.z[0]]) });
    b.context({ id: "wall-left", name: "Left wall", where: "between the door and the open side", role: "wall", box: box([-wt, 0], [0, H], [leftOpening.z[1], D]) });
    b.context({ id: "wall-left-header", name: "Wall above the left door", role: "wall", box: box([-wt, 0], [leftOpening.top, H], leftOpening.z) });

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
    b.context({ id: "wall-left-return", name: "Wall left of the alcove", role: "wall", box: box([-P.leftReturn, -wt], [0, H], [D - wt, D]) });
    b.context({ id: "wall-right", name: "Right wall", role: "wall", box: box([W, W + wt], [0, H], [0, P.rightWall]) });

    b.view({ id: "front", title: "Elevation", kind: "elevation", look: "-z",
      dims: [{ from: "wall-left.x1", to: "wall-right.x0", offset: -4 }, { from: "floor.y1", to: "ceiling.y0", offset: -4 },
        { from: "wall-left.x1", to: "door-header.x0", offset: 6 }, { from: "door-header.x0", to: "door-header.x1", offset: 6 },
        { from: "door-header.x1", to: "wall-right.x0", offset: 6 }, { from: "door-header.y0", to: "ceiling.y0", offset: 6 },
        { from: "floor.y1", to: "door-header.y0", offset: 6 }] });
    b.view({ id: "left-wall", title: "Left wall, from inside the alcove", kind: "elevation", look: "-x", depth: [-wt, W / 2],
      dims: [{ from: "wall-back-left.z1", to: "left-door-casing-back.z0", offset: 6 }, { from: "left-door-casing-back.z0", to: "left-door-casing-front.z1", offset: 6 },
        { from: "left-door-casing-front.z1", to: "wall-left.z1", offset: 6 }, { from: "left-door.z0", to: "left-door.z1", offset: 40 },
        { from: "left-door-casing-head.y1", to: "ceiling.y0", offset: D / 2 }, { from: "floor.y1", to: "left-door-casing-head.y1", offset: D / 2 }] });
    b.view({ id: "section", title: "Section through the middle", kind: "section", look: "+x", cut: W / 2,
      dims: [{ from: "wall-back-left.z1", to: "wall-left.z1", offset: -4 }, { from: "floor.y1", to: "ceiling.y0", offset: -4 }] });
    b.view({ id: "plan", title: "Plan", kind: "plan", look: "-y", cut: H / 2,
      dims: [{ from: "wall-left.x1", to: "wall-right.x0", offset: 4 }, { from: "wall-back-left.z1", to: "wall-left.z1", offset: -4 },
        { from: "wall-right.z0", to: "wall-right.z1", offset: W - 4 }] });
  },
});
