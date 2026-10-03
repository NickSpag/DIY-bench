# DIY-bench

A design workbench for woodworking and DIY projects: describe a project to a
coding agent in a terminal and see it change live as a 3D model, drawings, a cut
list, sheet layouts and build steps.

Nothing is built yet. This repo holds the research and the first project.

## What's here

| Path | What it is |
|---|---|
| `docs/research/research.md` | Survey of open-source CAD, 3D, drawing, cut-list and nesting tools |
| `docs/research/decisions.md` | Proposed decisions, with reasons and rejected alternatives |
| `docs/research/spec.md` | Implementation spec and milestones for building the tool |
| `docs/research/spikes/` | Throwaway experiments that settled facts the docs couldn't (see its README) |
| `projects/closet-built-in/concept-sheet.html` | The closet design as a standalone page: elevation, sections, plan, phases, cut list, sheet layouts. Open it in a browser. |

The research was written before the repo had a name, so it calls the tool
`workbench`. Read that as DIY-bench.

## Decided since the research

- **Name and home:** `DIY-bench`, private GitHub repo.
- **Selection:** clicking a part in any view to highlight it everywhere is enough.
  Hover is optional, not required.
- **Plywood:** "¾″" sheet goods are 23/32″; "½″" Baltic birch is 12 mm.
- **Closet project:** three drawers above a floor-level hamper frame with a
  rolling hamper that exits to the left; built in two phases. The concept sheet
  is the current design. The closet model encoded in `spec.md` §8 predates these
  changes:
  - it still uses ¾″ plywood;
  - it still has the hamper frame's top rail at 21½″ (now 24″, with the frame raised to 27″);
  - it still includes the two-drawer option.
- **The owned 48 × 56 sheet:** its grain runs along the 56″ side.

## Still open

- **App shell:** a local web app shown in VS Code, a Tauri app, or something else.
- **UI framework:** React (as the spec has it) or Svelte.
- **Outputs needed:** DXF for a CNC or cutting service, printed plans.
- **Baseboard height and thickness:** for the closet partitions' notches.
