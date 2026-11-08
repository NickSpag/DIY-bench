# Ceiling storage: design notes

The reasoning behind `project.ts`. The model holds the numbers; this file holds the why.

## Summary

A ceiling-hung storage rack for a basement alcove in an apartment: the kind seen in garages, with a
platform that lowers on a winch or crank, gets loaded, and is raised back up to the ceiling. The
building has metal ceiling joists and studs, which are not a reliable place to hang a loaded rack, so the
rack will hang from a freestanding 2×4 frame built inside the alcove instead.

The alcove is 72″ across, 52″ deep and 98½″ floor to ceiling. The exit doorway is in the back wall: 38″
wide, with 27½″ of wall to its left, 6½″ to its right and 15½″ above it (so it is 83″ tall). The right wall
runs on past the alcove (80″ is drawn); the left wall ends at the alcove's open side, where a wall turns
away to the left for about 30″.

Both doors swing into the alcove, hinged on the left as you face them from inside it. The back door sits 3″ into its doorway, in a 1″ frame, so the door itself is about
36″ × 82″. The left wall has a door near the back corner: its casing is 3¾″ wide all around, stands ¾″
proud of the wall into the alcove, and runs from 2½″ off the back wall to 8¼″ short of the open side and
up to 8″ below the ceiling. Inside the casing the opening is 33¾″ wide and 86¾″ tall. The doors are closed whenever the rack is lowered, so the lowered rack may stand in their swing; the frame
and the raised rack may not, below the top of each door. The design rules `back-door-swing-clear` and
`left-door-swing-clear` enforce that, testing each part against the quarter circle the door sweeps (the
drawings show the square around it). Opened all the way, the two doors overlap near the back-left
quarter of the alcove, so both cannot be wide open at once.

## The frame

The rack is a KOKORACKER 4×4 ft ceiling storage lift (250 lb capacity, 47 lb). Its two mounting rails run left
to right, so the frame carries them on two beams that span wall to wall across the 72″ width:

- Each beam is two 2×4s on edge, screwed together, centred under one rail. The rails are 48″ apart, so with
  the rack centred front to back the beams sit ½″ off the back wall and ½″ in from the open side.
- A 2×4 post stands in each corner under the beam ends, screwed to a wall stud near the top and bottom so the
  frame cannot rack. The back-left post stands in front of the left door's casing.
- A 2×4 tie joins the two beams at each side.
- The frame stops ½″ under the ceiling, so it stands up without jamming.
- The rails screw to the beams on the floor, before the beams go up.

Each beam carries half the loaded rack (149 lb) over a 70½″ span: the `beam-strength` rule works out the
bending stress and sag for a doubled 2×4 and both are well inside the limits for spruce-pine-fir No. 2.

The tops of the rails are 94½″ off the floor. The left door is 86¾″ tall and the raised rack hangs over its
swing, so the rack may hang at most 7¾″ below the tops of its rails when fully raised. The
`rack-raised-clears-doors` rule warns until that height is measured.

## Assumptions

| Value | Assumed | Why |
|---|---|---|
| Orientation | Back wall (with the exit doorway) at the far end of the 52″ depth, alcove open toward the room | "52″ deep looking at the exit door" |
| Wall left of the alcove | about 30″ | "30 inches or so", for the drawing only |
| Left door measurements | taken to the outside edge of the casing | gives a 33¾″ opening, about right for a door with its jamb |
| Rail spacing | 48″ centre to centre | "about 48 inches apart", to be checked |
| Rail width and thickness | 2″ × 1″ | "2ish inches"; thickness a guess |
| Rail screws | 4 per rail | until the holes are counted |
| Gap above the frame | ½″ | so the frame can be stood up under the ceiling |
| Door thickness | 1¾″ | for drawing only |
| Wall thickness | 5″ | for drawing only; deep enough for the back doorway's 3″ recess and a door |
| Room floor in front | 36″ | for drawing only |
| Walls | plumb and square, alcove the same size top to bottom | only one width, depth and height measured |

## Open questions

- Is the alcove open along the whole 72″ side, or is there a header across it?
- Width at floor, middle and top, and depth at both ends, to see whether the walls are out of square.
- Ceiling height at the four corners.
- Baseboard height and thickness, which the frame's posts have to clear or be notched around.
- Anything on the walls or ceiling: sprinkler heads, lights, ducts, pipes, outlets, switches.
- The rack's height when fully raised, from the top of the rails to the underside of the platform. It must
  be 7¾″ or less to clear the left door.
- The rail spacing (centre to centre), width and thickness, and the number of holes in each rail.
- Are there steel studs where the posts stand, to screw them to?

## Decisions log

- 2026-10-15: Project started. The rack hangs from a freestanding 2×4 frame, not the metal ceiling joists.
  The model is the alcove only for now.
- 2026-11-08: The doorway in the back wall, the right wall running on to 80″ and the wall turning left
  at the alcove's open side added to the drawing.
- 2026-11-08: Both doors added: the back door in its recessed frame, the left door with its casing.
- 2026-11-08: Both doors swing in, hinged on the left. They are closed whenever the rack is lowered, so only the
  frame and the raised rack must clear their swings.
- 2026-11-08: The frame: corner posts, a doubled 2×4 beam under each rack rail spanning wall to wall, ties at the
  sides. The rails run left to right and go onto the beams before the beams go up.
