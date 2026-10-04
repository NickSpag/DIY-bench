# Stairwell Vine Wall: design notes

The reasoning behind `project.ts`. The model holds the numbers; this file holds the why.

## Summary

A climbing vine on the tall end wall of the stairwell, above the second landing. The stairwell
turns 180°: three flights and two landings. The vine wall is 45¼″ wide and 165″ from the second
landing to the ceiling.

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
| Landing orientation | its 37½″ side runs along the vine wall, from the wall's left end | The wall is 45¼″ wide, so about 7¾″ of it rises above the next flight rather than the landing. |
| Planter size | 9″ deep × 16″ tall, as long as the landing | Deep enough soil for a vine without crowding a 35½″ landing. |
| Side-wall clearance | ⅛″ each side and at the ceiling | Room to fit the lattice without binding. |
| Rail spacing | at most 48″, plus one at each end and at the seam | Lattice this thin needs support every few feet. |
| Side wall thickness | 4½″ | Drawing only. |

## Open questions

- Which side of the vine wall is the landing on, and does its 37½″ or its 35½″ side run along the
  wall?
- Which plant? It sets the soil depth and the light the vine needs.
- The 102″ back wall is recorded but not modelled yet. It matters if the vine is to turn the corner.

## Decisions log

- 2026-10-04: lattice ripped to width; the lower sheet runs full length and the upper is cut to the ceiling.
- 2026-10-04: horizontal standoff rails rather than vertical, so every rail reaches studs.
