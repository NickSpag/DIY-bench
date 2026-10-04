# TV Wall Shelves: design notes

The reasoning behind `project.ts`. The model holds the numbers; this file holds the why.

## Summary

Bought floating shelves around a 48″ wide, 29″ tall wall-mounted TV, centred on a 128″ wall that is 96″
high. There are two rows of 30″ shelves on each side of the TV and one 120″ run above it. An air
conditioner hangs from the ceiling 45″ from the left end of the wall, 35″ wide and 15″ deep.

The shelves are DIY Cartel linear floating shelves (diycartel.com, "Industrial Steel Shelves"): 14-gauge
steel bent into an L, an 8″ deep plate with a 2½″ flange turned up at the back. The flange screws to the
wall through three holes (one at each end, one in the middle); screws and drywall anchors come with each
shelf, and the maker rates it at over 60 lb when screwed into a stud. The listed length is the real
length. Nothing is cut: the model places the shelves, and the shopping list prices them.

- **Cost** (raw steel, 8″ deep, prices on 2026-10-04): 36 + 48 + 36 comes to $650 with the four 30″ side
  shelves; 60 + 60 comes to $694.

- **Horizontal.** The shelves are sold 30, 36, 48 and 60″ long, so any run of them is a multiple of 6″.
  A 120″ run leaves 4″ at each end of the wall, and the side rows start there: 4″ to 34″ on the left,
  94″ to 124″ on the right. That leaves 6″ between each side row and the TV, and the long shelf's ends
  line up with the side rows' outer ends. With 36″ side shelves the gap to the TV would be 3″, too tight.
- **The long shelf** is 36 + 48 + 36 by default. Its two seams then fall at 40″ and 88″, on the TV's
  edges, and the 48″ shelf sits centred over the TV. The option `span` compares 60 + 60, which has
  fewer seams but puts one in the middle of the wall.
- **Vertical.** The heights come from three numbers: the height of the space for a console (24″),
  the gap above it to the TV (4″) and the space left under the air conditioner (14″). The TV's bottom edge and the lowest
  shelf tops sit at 28″; the long shelf's top is 14″ under the AC at 67″; the upper side shelves split
  the height between, at 47½″, a 19½″ pitch. The TV's centre is at 42½″, the top of the usual seated
  range. The open heights between shelves are about 19⅜ / 19⅜″, there is 14″ over the long shelf, and
  the TV top is 9⅞″ below the long shelf. Roomy for books, with 7–10″ over a row of hardcovers for
  other things. The 2½″ flange stands up behind the books.
- **Media console** (not bought yet). The first layout had the TV's bottom at 22″, which left room for
  a console only 20″ tall, lower than most. With the space under the AC cut from 19″ to 14″, the TV
  and the lowest shelves move up to 28″. The drawings show the space for a console as a dashed box;
  the option `console` puts a common size in it (48 × 20, 60 × 22, 60 × 24, 70 × 22, 72 × 26) and two
  rules say whether that size fits. In 3D the dashed box shows with the Contents button. What to look
  for:
  - **height** 24″ or less, which leaves at least 4″ under the TV;
  - **width** up to 60″, the space between the lowest side shelves. A 60″ console's ends line up
    with the shelves' inner ends; anything wider runs under those shelves, which sit only about 4″
    above a 24″ top;
  - **depth** anything usual (16–18″); the shelves are 8″ deep.
- **The air conditioner** sits entirely over the TV and the 48″ middle shelf, so the outer ends of the
  long shelf have 34″ clear to the ceiling. Put tall things there. Its midpoint is 1½″ left of the
  wall's centre, so it is the one thing on the wall that is slightly off the symmetry.

## Assumptions

| Value | Assumed | Why |
|---|---|---|
| `shelf.t` | 0.075″ | 14-gauge steel, from the maker's listing |
| `shelf.depth`, `shelf.flange` | 8″, 2½″ | the maker's listing (8″ D × 2½″ H); 8″ holds most hardcovers, oversized art books may overhang |
| `price` | $79 / 110 / 114 / 189 | raw-steel prices for 30, 36, 48, 60″ on 2026-10-04; powder-coated are within a dollar or two |
| `tv.standoff`, `tv.depth` | 1½″ off the wall, 2½″ deep | a flat wall mount; for drawing only |
| `ac.depth` | 9″ | a typical wall-mounted mini-split head; for drawing and overlap checks |
| `wallT` | 4½″ | for drawing only |
| side walls | walls at both ends of the 128″ | the layout's 4″ end margins read as distance from corners |
| `minTvGap` | 4″ | the least gap to the TV that still looks deliberate; the design has 6″ |
| `consoleSpace` | 24″ tall, 18″ deep | the tallest console the TV sits 4″ above; a usual depth. Its width is the 60″ between the lowest side shelves |
| `consoles` | 16″ deep (18″ for the 72″) | common sizes to try; depths are typical, not from a particular product |
| `consoleGap` | 4″ | from the console top to the TV's bottom edge; 2″ was too tight, 4–6″ is the usual advice |

## Open questions

- Finish: raw steel, or matte black, matte white or gold powder coat?
- Stud positions. Each shelf has only three screw holes, so check which land on a stud; the rest go
  into the supplied anchors. A loaded book shelf is the case where that matters.
- Is the TV centre at 42½″ comfortable from the sofa? Each inch more over the console raises it an inch.
- Which way does the air conditioner blow? Straight down onto the long shelf would argue for dropping it.

## Decisions log

- 2026-10-04: Project created from an earlier conversation. Two rows of 30″ side shelves, a 120″ long
  shelf of 36 + 48 + 36, shelf tops at 22, 42 and 62″, TV bottom at 22″.
- 2026-10-04: Shelves are DIY Cartel linear floating shelves, 8″ deep. Modelled as bought items
  (steel plate plus back flange) instead of 1½″ boards; shelf tops kept where they were.
- 2026-10-04: Room for a media console. TV and lowest shelves up from 22″ to 26″, pitch from 20″ to
  18½″, long shelf from 62″ to 63″: 18″ under the AC instead of 19″, and a console up to 24″ tall fits.
- 2026-10-04: 14″ under the AC is plenty (`acHeadroom`), and 2″ over the console was too tight
  (`consoleGap` now 4″). The stack is now derived from those two and the console height: TV and lowest
  shelves at 28″, long shelf at 67″, 19½″ pitch. The rule for even open heights now covers the spaces
  between shelves only, since the space over the long shelf is set by the AC.
- 2026-10-04: The console is drawn as the space for one (dashed), with an option to try common sizes in it.
  The space, not the console, sets the TV height.
