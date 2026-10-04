# Stairwell Vine Wall: design notes

The reasoning behind `project.ts`. The model holds the numbers; this file holds the why.

## Summary

A climbing vine on the tall wall of the stairwell, above the second landing. The stairwell turns
180° in two quarter turns. Flight 1 comes down from the upper floor to landing 1. Flight 2 runs
along the 102″ back wall to landing 2. Flight 3 goes on down to the lower floor beside flight 1,
with the stairwell's open centre between them. The vine wall rises 165″ from landing 2 to the
ceiling and is 45¼″ wide: 35½″ over the landing, and the rest over the top of flight 3. Facing it,
the back wall is on the left and the stairs drop away on the right.

The whole stairwell is modelled as room context (treads, landings, floors, walls), so the drawings
and the 3D view show the trellis and planter in place. None of it appears in the cut list.

- **Two phases.** Phase 1 is the planter and one full 96″ sheet of lattice standing on it, enough
  to plant the vine and let it climb. Phase 2, when the vine outgrows it, adds the second sheet the
  rest of the way to the ceiling (about 31″).
- **Trellis:** the two 4×8 sheets of wood lattice you already have (¼″ slats in two layers, slats
  just under 1½″ wide), ripped to 45⅛″. The lattice starts at the top of the planter, not the
  landing, so nothing hangs below the planter and its weight goes down through the planter's legs.
- **Frame:** each sheet sits on a frame of your 1×1s, kept inside the sheet's edges, so the lattice
  stands ¾″ off the wall and the vine can weave behind it. The first frame's bottom rail stands on
  the planter's back board. The full-width rails also screw into every stud they cross; rails are
  at most 24″ apart. Paint the frame the wall colour.
- **Planter:** the front and ends are your blue 1½ × 9 board, resawn in half through its thickness
  into two boards about 11/16″ thick. The back, against the wall and never seen, is 23/32″ plywood
  from the same sheet as the bottom, which saves the board. A liner goes inside. Its top is 38″ above the landing. It runs the full width of the vine wall with its back
  against the wall, so its right end overhangs flight 3, and sticks out 11″ into the landing.
  One board high or two is a design option; two (18″) gives about 16¾″ of soil, one (9″) about 7¾″.
- **Legs:** two square legs, ripped full thickness from the same board before it is resawn, directly under the back of the planter, so they
  take nothing from the walking area, and carry the planter and the trellis on it to the floor. The
  left leg stands on the landing at the back-wall end. The right leg is a design option: on the edge
  of the landing, or at the planter's right end, running down to the first step of flight 3 (7½″
  longer).

## Assumptions

Every value marked `// inferred` in `project.ts`, with why it was chosen.

| Value | Assumed | Why |
|---|---|---|
| Landing orientation | its 35½″ side runs along the vine wall from the back-wall corner, and its 37½″ side along the back wall | Read from the photos; the other 9¾″ of the vine wall rises over flight 3. |
| Stair layout | flight 1: 6 risers, flight 2: 4, flight 3: 5; 7½″ rise, 10″ treads, 1½″ thick | From the photos; flight 2's treads (9″) are what fits the 102″ back wall between two landings. |
| Landing 1 | the same size as landing 2 | Not measured. |
| Upper floor | 75″ above landing 2, so 90″ to the ceiling | Follows from the risers. |
| Board | 1½ × 9 (measured), 144″ long | The length is a placeholder until you measure it. |
| Resawn thickness | 11/16″ | Half of 1½″ after a ⅛″ saw kerf. |
| 1×1 | ¾ × ¾ actual | Standard size. |
| Planter depth | 11″ front to back | Not specified yet. |
| Legs | 1½ × 1½, ripped from the 2×10 | Matches the planter. |
| Clearance | ⅛″ at the back wall and the ceiling | Room to fit the lattice without binding. |
| Frame spacing | rails at most 24″ apart | Lattice this thin needs support every couple of feet. |
| Side wall thickness | 4½″ | Drawing only. |

## Open questions

- The stair counts, rise and run are read from photos; count the steps in each flight to confirm.
- The board's length. With the back in plywood, it needs about 85″ for a two-high planter with
  both legs on the landing (92″ with the right leg down to the step), or about 61″ one high.
- One board high or two (the planter option).
- Which plant? It sets the soil depth.

## Decisions log

- 2026-10-04: lattice ripped to width; the lower sheet runs full length and the upper is cut to the ceiling.
- 2026-10-04: horizontal standoff rails rather than vertical, so every rail reaches studs.
- 2026-10-04: the blue board only on the planter's front and ends; the back is plywood.
- 2026-10-04: planter top at 38″; the board is resawn in half; one or two boards high is an option.
- 2026-10-04: the lattice and frame stand on the planter instead of reaching the landing; the planter's back goes against the wall; the second sheet moves to a phase 2.
- 2026-10-04: planter widened to the full vine wall, legs moved under it; the stair-side (right) leg's placement is an option.
- 2026-10-04: planter from the user's 2×10, raised on two back legs fixed to the lattice frame; lattice framed with 1×1s and run from the landing to the ceiling.
- 2026-10-04: the whole stairwell modelled as context, from the 102″ back wall and the 37½ × 35½ landing.
