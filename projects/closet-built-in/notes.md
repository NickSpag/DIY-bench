# Closet built-in: design notes

The reasoning behind `project.ts`, carried over from the concept sheet
(`concept-sheet.html`). The model holds the numbers; this file holds the why.

## Summary

A reach-in closet with three sections behind a 48½″ opening: double hang on the
left, a 24″ column in the middle with a rolling hamper, three drawers and shelves,
and long hang on the right with the floor left open below it.

- **Interior:** 80″ W × 24″ D × 95½″ H.
- **Opening:** 48½″ W × 80½″ H, no doors.
- **Returns:** 15¾″ each side. This assumes the opening is centred; measure both
  sides before cutting.
- **Header:** 15″ of wall above the opening. It hides everything above 80½″,
  including the 10¾″ between the top shelves and the ceiling.

**Left, 28″ wide, double hang.** Top shelf at 84″, 12″ deep, running the full
80″. Upper rod at 81½″ (shirts, jackets), lower rod at 41″ (shirts, folded
pants). About 28 hangers per rod, so roughly 55 garments. Of each 28″ rod, about
12″ is in front of you; the rest slides out from behind the return.

**Center, 24″ wide, 22⁹⁄₁₆″ inside.** The rolling hamper at the base, three
drawers above it, a hardwood top at 49″, then shelves.

**Right, 28″ wide, long hang with open floor.** Top shelf at 84″, 12″ deep; a
12″ shelf at 70″ for hats, bags and folded sweaters; the rod at 67½″ for suits,
coats and dresses. A 55″ coat clears the floor by about 10″. Suits (about 40″)
leave 25″ or more of open floor for shoes, a hamper or a bag. To set the rod for
your own clothes, measure your longest garment from hook to hem and add about
10″.

## Why the depths are what they are

- **The header and the 12″ gap.** Everything above 80½″ is behind the header, so
  the only way a box comes down is through the gap between a shelf's front edge
  and the front wall. Bins about 11″ deep drop straight down through a 12″ gap;
  deeper ones need a tilt.
- **Why the top shelf is not full depth.** A full-depth shelf would leave ¾″ in
  front of it and trap whatever is up there. At 12″ deep (11¼″ of plywood plus
  a ¾″ nosing) it leaves a 12″ gap under the header.
- **Rods 12″ off the back wall.** The shelf above each rod is 12″ deep, so its
  front edge sits right over the rod. Keep the rod at 12″ rather than pulling it
  back under the shelf: coats are 20–22″ across the shoulders and need the room
  behind. Hangers need about 20″ of depth, and there is 24″.
- **The center column runs full depth up to the 70″ shelf.** That is the highest
  shelf with useful room in front of it: 9¾″ clear before the header, so stacks
  slide straight out. Above it, the column uses the same 12″ top shelf as the
  sides.
- **Nosings.** A 1½″ hardwood nosing is glued to the 28″ shelves so they do not
  sag under sweaters. The center one fits between the partitions, since the
  center top shelf sits on them.

## The center column

- **Width.** 24″ outside, 22⁹⁄₁₆″ inside with 23/32″ partitions. That gives
  21⁹⁄₁₆″ drawer boxes with ½″ side-mount slides. Check your slides' spec before
  building boxes. A wider column would take hanging space from both sides.
- **Drawers clear the jambs.** The column sits fully inside the opening (28″ to
  52″ from the left wall, inside the 15¾″ to 64¼″ opening). The hamper frame and
  drawers open 21″ into the room, on 21″ full-extension slides in a 23¼″ deep
  carcass. Keep about 24″ clear in front of the opening.
- **The hamper rolls out the open left side.** It sits on the floor inside a frame
  with a right side, a back and a top rail on the left; the left side stays open.
  With the frame fully open, only its front 15½″ is clear of a 4½″ thick front
  wall, so the frame's back sits 15½″ behind the face and the hamper can be at
  most 15″ deep. The top rail runs from 24″ to 27″ off the floor, so a 23″ tall
  hamper rolls out under it. A thicker wall means a shallower hamper: measure
  yours. Keep a path to the left for the hamper.
- **The frame's slides carry only the frame.** The hamper rolls on the floor.
- **Faces.** They overlay ⅜″ of each partition edge and finish flush with the
  front wall's inside face. There is no toe kick: the hamper face runs to ¼″ off
  the floor. The faces are cut in order from one strip of the owned 48 × 56
  piece, so the grain runs up the column.
- **A hard floor is assumed.** Casters drag on carpet.

## Check before you cut

- Measure each return. If the opening is off-centre, shift the center column to
  stay centred on the opening, not the closet.
- Check the ceiling height at the front, the back and both corners.
- Check the walls for plumb and the back corners for square.
- Find the studs on all three walls for the cleats and rod sockets.
- Note any outlet, switch or attic hatch inside the closet.

## Extras to consider

- A valet rod for staging tomorrow's clothes.
- A felt-lined top drawer for watches and jewellery.
- Belt and tie pull-outs on a partition.
- Fabric bags for the hamper, so laundry lifts out.
- An LED strip under the top shelves.
- Slide-out shelves in the center column instead of fixed ones.

## Assumptions

Values in `project.ts` that are not on the concept sheet. Each is marked
`inferred` in the file or listed here.

| Value | In the model | Why |
|---|---|---|
| Adjustable shelf placement | z from 23¼ − 22½ to 23¼ (front flush with the partitions); size 22⁷⁄₁₆ × 22½ | The sheet gives the size but not the placement. |
| Shelf clearance each side | 1/16″ | Width 22⁷⁄₁₆ in a 22⁹⁄₁₆ opening. |
| Baseboard | 5½ × ¾ on the back wall and both side walls; the partitions are notched over the back baseboard | The sheet gives no baseboard size. The thickness is approximate: the measurement was "maybe ¾″". |
| Floor rail placement | in front of the baseboard (z ¾ to 1½) | The sheet does not resolve the clash between the floor rail and the baseboard. |
| Drawer box and hamper frame stock | ordinary plywood sold as ½″, modelled at 15/32″, bought as a 4×8 | The sheet specifies 12 mm Baltic birch on a 5×5; ordinary plywood was chosen on 2026-10-04. The frame back becomes 20¹¹⁄₃₂ (sheet: 20⁵⁄₁₆); fronts and backs stay 20⅝. Measure the actual sheet before cutting fronts and backs. |
| Drawer box vertical position | ½″ above each drawer zone's bottom | The sheet gives heights, not positions. |
| Drawer bottom fit | ¼″ grooves, 1/16″ play | Gives the sheet's 21 × 20⁷⁄₁₆. |
| Rod lengths | between sockets, ⅛″ socket allowance | Gives the sheet's 2 @ 26¼, 1 @ 27. |
| Rod backer | 6″ along z centred on the rod, 3½″ tall | The sheet gives "1×4, 6″" only. |
| Cleat placement | side cleats z ¾ to 11¼, back cleats between them | Derived from the sheet's lengths (10½, 26½). |
| Hamper placement | phase 1 z 6 to 21; phase 2 ⅛″ in front of the frame back | Taken from the section drawing. |
| Banding thickness | 0.02″ (0.5 mm), does not reduce the cut size | The sheet does not subtract it. |
| Contents (bins, garments) | approximate boxes | For the drawings only. |

## Open questions

- **Baseboard thickness.** The model uses ¾″ from "maybe ¾″". Confirm it before
  notching the partitions.

## Decisions log

- 2026-10-03: three drawers, hardwood top at 49″; the two-drawer option dropped.
- 2026-10-03: the hamper frame raised to 27″ with its top rail at 24″ to 27″, so a
  23″ hamper rolls out under it.
- 2026-10-03: "¾″" plywood modelled at its real 23/32″; the center column is
  22⁹⁄₁₆″ inside.
- 2026-10-03: the only design option is the hardwood top thickness, 1″ (default)
  or ¾″.
- 2026-10-04: drawer boxes and the hamper frame in ordinary ½″ plywood (15/32″)
  instead of 12 mm Baltic birch.
- 2026-10-04: baseboard 5½″ tall, about ¾″ thick, on the back and both side walls.
