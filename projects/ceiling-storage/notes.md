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
- A 2×4 post stands in each corner under the beam ends, screwed to the wall so the frame cannot rack. The
  back-left post stands in the corner between the back wall and the left door's casing: the gap there is
  2¼″ to 2⅜″ up its height, the 2″ post leaves ¼″, and it stands under 1⅛″ of the back beam (the
  `posts-under-beams` rule asks for at least 1″). With the rails hung beside the beams (third beam choice) the
  back beam sits farther out, so that post stands in front of the casing instead, stopping at the doorway.
- A 2×4 tie joins the two beams at each side.
- The frame stops ½″ under the ceiling, so it stands up without jamming.
- The rails screw to the beams on the floor, before the beams go up.

Each beam carries half the loaded rack (149 lb) over a 70½″ span: the `beam-strength` rule works out the
bending stress and sag for a doubled 2×4 and both are well inside the limits for spruce-pine-fir No. 2.

The beams are a choice (the "Beams" option); the default is the user's design:

- **Ripped 2×4 with a steel angle along the bottom** (default). A 2×4 ripped to 2″, on edge (1½″ × 2″), with a
  2″ × 2″ × ⅛″ solid steel angle, 72″ long, wrapped around its bottom outer corner and screwed on through both
  legs every 8″. The rail screws up through the angle's flat leg into the wood, centred under the beam. The beam
  is 2⅛″ deep, so the tops of the rails are 95⅞″ off the floor and the raised rack may hang 9⅛″ below them. The
  steel does four-fifths of the work: at full load the wood sees about 350 psi, the steel about 10,500 psi
  (21,600 allowed), and the pair sags about 5/32″ (3/16″ allowed, worked out as if the whole load hung at
  mid-span). Nothing sits between the rails, where the rack's lifting parts move.
  At each end the wood stops 1½″ short and the tie sits on the angle's flat leg instead, running the full depth
  from the back angle to the front one, right over the posts: post, angle and tie end stack in one line. The
  ties are screwed up through the flat leg and through the upright leg into their ends; the beam's wood butts
  into the tie's face and is screwed through it.
- **Doubled 2×4s, rail underneath.** Simplest, 3½″ deep: the raised rack may hang 7¾″.
- **Doubled 2×4s, rail hung beside the beam** from a 48″ angle. Rails highest (97⅞″, 11⅛″ for the rack), but
  the beams sit just inside the rails, where the rack's lifting parts may hit them.

With the steel-angle beams, the posts are 2×4s ripped to 2″, the depth of the beam and its angle front to back:
1½″ × 2″. A post carries about 75 lb with the rack evenly loaded, and at worst about 170 lb (contents piled at
one end, plus the frame). A 96″ post only 1½″ thick is too slender on its own (length over thickness 64; the
limit for wood columns is 50), so each post is screwed to the wall at the top, middle and bottom, no more than
32″ apart. Braced like that it holds about 530 lb, three times the worst case (the `post-strength` rule).
Across its 2″ width the post is braced only top and bottom, at a slenderness of 48.

The beams can no longer be ripped shallower: the steel-angle beam gains more than ripping did.

With the third choice the rails hang from steel angles: a 2″ × 2″ × ⅛″ angle, 48″ long, lag-screwed
to each beam's outer face with its flat leg flush with the beam top, and the rail bolted up under the flat leg.
The beams move just inside the rails. The tops of the rails go from 94½″ to 97⅞″ off the floor, so the raised
rack may hang 11⅛″ below them instead of 7¾″. With the angles, ripping the beams gains nothing, because the
rails hang from the beam tops. The rail's load now sits about 1″ out from the beam face, so it twists the
beam a little; the ties at each end and the posts hold the beam ends square, and the angle's flat leg is
stiff enough at that length. Bolt heads go on top of the flat leg, since only ½″ is left under the ceiling,
so the rails go on before the beams are lifted.

Pressure-treated lumber is not used: it is sold wet, so it shrinks and bows more as it dries indoors, and it is
meant for outdoor and ground contact. Kiln-dried 2×4s (stamped KD or S-DRY), picked straight at the store and
installed crown up, bow least.

With full-depth beams the tops of the rails are 94½″ off the floor. The left door is 86¾″ tall and the raised rack hangs over its
swing, so the rack may hang at most 7¾″ below the tops of its rails when fully raised. The
`rack-raised-clears-doors` rule warns until that height is measured.

## Lumber on hand

The user has five straight, premium 2×4s: two at 52″, one at 68″, one at 88″ and one at 120″. The shopping list
cuts from them first: the 120″ gives one post, the 88″ one beam (69″), and the two 52″ boards the two ties (49½″). Four 8 ft
2×4s are still to buy, for three posts and the other beam; no other split needs fewer, since only the 120″ board
is long enough for a 96″ post. The 68″ board is spare. The posts come out at 95⅞″, so an 8 ft (96″) board
leaves only ⅛″: measure the ceiling at each corner first, and buy 10 ft boards for any corner over 98⅝″.

## Assumptions

| Value | Assumed | Why |
|---|---|---|
| Orientation | Back wall (with the exit doorway) at the far end of the 52″ depth, alcove open toward the room | "52″ deep looking at the exit door" |
| Wall left of the alcove | about 30″ | "30 inches or so", for the drawing only |
| Left door measurements | taken to the outside edge of the casing | gives a 34″ opening, about right for a door with its jamb; the back-wall side was measured to the casing (2¼–2⅜″) |
| Rack's raised height | 6″ from the top of the rails to the platform's underside | the rack ships in a box 5½″ thick; the steel-angle beam allows 9⅛″ |
| Rail spacing | 48″ centre to centre | "about 48 inches apart", to be checked |
| Rail width and thickness | 2″ × 1″ | "2ish inches"; thickness a guess |
| Rail screws or bolts | 4 per rail | until the holes are counted |
| Angle lag screws | 7 per angle (every 8″) | a common spacing |
| Angle screws | every 8″ on both legs | a common spacing |
| Post under beam | at least 1″ front to back | enough to screw down through the angle and carry about 170 lb |
| Post bracing | screwed to the wall every 32″ or closer | top, middle and bottom of a 96″ post |
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
- 2026-11-08: Beams may be ripped to 3″ or 2¾″ for headroom (an option until the rack's raised height is known).
  No pressure-treated lumber indoors; kiln-dried 2×4s instead.
- 2026-11-08: Rails may hang from steel angles beside the beams for 3⅜″ more headroom (an option until the
  rack's raised height is known).
- 2026-11-08: Default beam: a 2×2 wrapped in a 72″ steel angle, rail screwed up through the angle (user's design).
  The ripped-beam choice is gone.
- 2026-11-08: Rack's raised height estimated at 6″ from its 5½″-thick shipping box, leaving about 3″ over the left door.
- 2026-11-08: Posts ripped to 2⅛″ to match the steel-and-2×2 beams, screwed to the wall at top, middle and bottom.
- 2026-11-08: The steel-angle beams use 2×4s ripped to 2″ instead of a 2″ × 2″, so the user's own 2×4s can supply
  them; posts ripped to 2″ to match. The user's five 2×4s are used before anything is bought.
- 2026-11-09: Measured 2¼–2⅜″ from the back wall to the left door's casing; the back-left post goes in that corner.
- 2026-11-09: Ties sit on the steel angles at the corners and run the full depth; the beams' wood fits between them.
