# Handoff: starting work on DIY-bench

You are picking up a project that was planned in an earlier Claude Code session.
Read this file, then `README.md`, before doing anything else.

## What DIY-bench is

The user does small woodworking and DIY projects (built-ins, shelving,
furniture). They want a workbench where they talk to a coding agent in a
terminal and watch the design change live. The views are:

- a 3D model;
- drawings: elevations, sections and plans with dimensions;
- a cut list;
- plywood sheet layouts;
- build steps by phase.

Clicking a part in one view highlights it in all the others. Nothing is built
yet.

## How it got here

1. **The closet.** The user designed a closet built-in with Claude, as a
   single HTML page with SVG drawings generated from a small JavaScript model:
   `projects/closet-built-in/concept-sheet.html`. That page is the reference
   for what the tool should produce, and the closet is its first project and
   test fixture.
2. **The research.** A research agent surveyed open-source options and wrote
   three documents:
   - `docs/research/research.md`: the survey;
   - `docs/research/decisions.md`: 18 proposed decisions;
   - `docs/research/spec.md`: an implementation spec with milestones M0 onward.

   The experiments behind its claims are in `docs/research/spikes/`.
3. **The repo.** It was created, and the user answered some of the open
   questions. The answers are in the README under "Decided since the research".

## What is proposed, not yet agreed

The user has not reviewed the decisions or the spec in detail. In short, they
propose:

- **Model:** a TypeScript model of named parts, one `project.ts` per project.
- **One evaluation for everything:** 3D, drawings, cut list, sheets and steps
  all come from it.
- **3D:** three.js via react-three-fiber.
- **Drawings and sheets:** our own SVG drawings and our own guillotine packer
  for sheet layouts.
- **Shell:** a local Vite app shown in VS Code's built-in browser, beside
  Claude Code in the VS Code terminal.
- **Agent:** Claude Code hooks pass the selected part to the agent, and a
  `./wb` command-line tool covers the rest.

## Known gaps in the spec

- **Repo name.** It calls the tool `workbench` and assumes
  `~/Development/workbench`. The repo is `DIY-bench`.
- **Hover.** It treats hover as a core interaction. The user said clicking to
  select is enough and hover is optional.
- **The closet in §8 is out of date.** The concept sheet is the current
  design. Where they differ, §8 still has:
  - ¾″ plywood; it should be 23/32″, which makes the center column 22⁹⁄₁₆″ inside;
  - ½″ drawer box stock; it should be 12 mm Baltic birch;
  - the hamper frame's top rail at 21½″; the frame is now raised to 27″ and the rail sits at 24″;
  - a two-drawer design option; the user chose three drawers and dropped the option.
- **Open questions.** The README lists the ones still open: app shell (VS Code
  versus Tauri; the earlier session recommended starting as a web app in
  VS Code and wrapping it in Tauri later if wanted), React versus Svelte,
  whether DXF or printed plans are needed, and the closet's baseboard size.

## What to do first

1. **Walk the user through the open questions and the decisions** that shape
   everything else: the model format, the shell and the UI framework. Keep it
   short; they asked not to get into the weeds before the repo existed, and
   want to move at a sensible pace now.
2. **Update the documents to match:** fix `spec.md` for the gaps above and
   record new decisions in `decisions.md`.
3. **Start M0 (Scaffold) from `spec.md` §12** once the user agrees.

Ask before committing or pushing until the user says how they want commits
handled in this repo.

## The user's preferences

- **Vocabulary:** use standard terms and plain phrases. Never coin shorthand
  labels for concepts.
- **Recommendations:** give a recommendation rather than a list of options.
  Keep replies concise.
- **Inches:** fractions to 1/16″.

## Live copy of the closet page

The page is also published at https://claude.ai/artifact/JY93PQjuaw3V4VBxaU4eEw.
The copy in this repo is a snapshot of it. If the two differ, ask the user
which is current.
