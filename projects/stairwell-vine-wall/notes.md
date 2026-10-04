# Stairwell Vine Wall: design notes

The reasoning behind `project.ts`. The model holds the numbers; this file holds the why.

## Summary

A climbing vine on the tall wall of the stairwell, above the second landing. The stairwell turns
180° in two quarter turns. Flight 1 comes down from the upper floor to landing 1. Flight 2 runs
along the 102″ back wall to landing 2. Flight 3 goes on down to the lower floor beside flight 1,
with the stairwell's open centre between them. The vine wall rises 165″ from landing 2 to the
ceiling and is 45¼″ wide: 35½″ over the landing, and the rest over the top of flight 3.

The whole stairwell is modelled as room context (treads, landings, floors, walls), so the drawings
and the 3D view show the trellis and planter in place. None of it appears in the cut list.

- **Trellis:** the two 4×8 sheets of wood lattice you already have (¼″ slats in two layers, slats
  just under 1½″ wide). Both are ripped to 45″. The lower one runs its full 96″, and the upper one
  is cut to fit up to the ceiling.
- **Standoff rails:** the lattice is screwed to horizontal 1×2 rails, so it sits ¾″ off the wall
  and the vine can weave behind it. The rails are horizontal so that each one crosses every stud,
  whichever way the studs are spaced. Paint them the wall colour; they show through the lattice.
- **Planter:** a 23/32″ plywood box at the foot of the wall, on the landing, with a waterproof
  liner. It is 9″ deep, to keep the landing clear, and 16″ tall, for about 14″ of soil.

## Assumptions

Every value marked `// inferred` in `project.ts`, with why it was chosen.

| Value | Assumed | Why |
|---|---|---|
| Landing orientation | its 35½″ side runs along the vine wall from the back-wall corner, and its 37½″ side along the back wall | Read from the photos; the other 9¾″ of the vine wall rises over flight 3. |
| Stair layout | flight 1: 6 risers, flight 2: 4, flight 3: 5; 7½″ rise, 10″ treads, 1½″ thick | From the photos; flight 2's treads (9″) are what fits the 102″ back wall between two landings. |
| Landing 1 | the same size as landing 2 | Not measured. |
| Upper floor | 75″ above landing 2, so 90″ to the ceiling | Follows from the risers. |
| Planter size | 9″ deep × 16″ tall, as long as the landing along the wall | Deep enough soil for a vine without crowding the landing. |
| Side-wall clearance | ⅛″ each side and at the ceiling | Room to fit the lattice without binding. |
| Rail spacing | at most 48″, plus one at each end and at the seam | Lattice this thin needs support every few feet. |
| Side wall thickness | 4½″ | Drawing only. |

## Open questions

- The stair counts, rise and run are read from photos; count the steps in each flight to confirm.
- Which plant? It sets the soil depth and the light the vine needs.

## Decisions log

- 2026-10-04: lattice ripped to width; the lower sheet runs full length and the upper is cut to the ceiling.
- 2026-10-04: horizontal standoff rails rather than vertical, so every rail reaches studs.
- 2026-10-04: the whole stairwell modelled as context, from the 102″ back wall and the 37½ × 35½ landing.
