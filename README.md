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

The research (`research.md`) was written before the repo had a name, so it calls the tool
`workbench`. Read that as DIY-bench. The spec and decisions use DIY-bench.

## Decided since the research

- **Name and home:** `DIY-bench`, private GitHub repo.
- **Selection:** clicking a part in any view to highlight it everywhere is enough.
  Hover is optional, not required.
- **Plywood:** "¾″" sheet goods are 23/32″; "½″" Baltic birch is 12 mm.
- **App shell:** a local Vite web app shown in VS Code's integrated browser, with
  Claude Code in the VS Code terminal on the right. Tauri may wrap it later.
- **UI framework:** React.
- **Outputs:** printed plans (PDF) and a CSV/text cut list. DXF waits until you use a
  CNC or cutting service; GLB, STL and STEP are deferred too.
- **Baseboard:** 5½″ tall, about ¾″ thick.
- **Closet project:** three drawers above a floor-level hamper frame (27″ tall, top
  rail at 24″ to 27″) with a rolling hamper that exits to the left; built in two
  phases. The only design option is the hardwood top thickness, 1″ or ¾″. `spec.md`
  §8 now matches the concept sheet.
- **The owned 48 × 56 sheet:** its grain runs along the 56″ side.

## Still open

- **Baltic birch sheet count:** the model needs two 5×5 sheets (the second holds only
  two drawer sides); the concept sheet says one.
- **Baseboard thickness:** confirm ¾″.
