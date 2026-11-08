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

So far the model is only the room; the frame and the rack come next.

## Assumptions

| Value | Assumed | Why |
|---|---|---|
| Orientation | Back wall (with the exit doorway) at the far end of the 52″ depth, alcove open toward the room | "52″ deep looking at the exit door" |
| Wall left of the alcove | about 30″ | "30 inches or so", for the drawing only |
| Left door measurements | taken to the outside edge of the casing | gives a 33¾″ opening, about right for a door with its jamb |
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
- Which rack: its platform size, lift height, load rating and how it mounts.

## Decisions log

- 2026-10-15: Project started. The rack hangs from a freestanding 2×4 frame, not the metal ceiling joists.
  The model is the alcove only for now.
- 2026-11-08: The doorway in the back wall, the right wall running on to 80″ and the wall turning left
  at the alcove's open side added to the drawing.
- 2026-11-08: Both doors added: the back door in its recessed frame, the left door with its casing.
- 2026-11-08: Both doors swing in, hinged on the left. They are closed whenever the rack is lowered, so only the
  frame and the raised rack must clear their swings.
