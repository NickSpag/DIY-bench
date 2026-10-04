# DIY-bench

A design workbench for woodworking and DIY projects. You describe a project to a coding agent in
a terminal, and a browser view beside it shows the design live, as:

- a 3D model;
- drawings: elevations, sections and plans, with dimensions;
- a cut list and a shopping list;
- sheet layouts for plywood and other sheet goods;
- build steps, phase by phase.

Click a part in any view and it is highlighted in all of them. The agent sees your selection, so
"make this one 2″ shorter" needs no part name. Every edit is checked for overlapping parts, parts
that don't fit their stock, and the design rules you've stated.

![A project with a part selected: the 3D view, an elevation and the cut list](docs/screenshots/workbench-light.png)

| Dark theme: a section cutting the 3D view, and the sheet layouts | Build steps beside a section |
|---|---|
| ![Dark theme with a section and sheet layouts](docs/screenshots/workbench-dark.png) | ![A section and the steps panel](docs/screenshots/steps-phase1.png) |

## Getting started

You need Node 22.15 or newer, and Google Chrome for the browser tests.

```sh
npm install
npm run dev        # http://127.0.0.1:5180
```

Open the page in VS Code's integrated browser with the terminal on the right, or in Chrome next
to any terminal. Then run `claude` in this folder and describe what you want to build.

## How a project works

Each project is one TypeScript file, `projects/<id>/project.ts`, that builds a list of named
parts. Most parts are boxes: panels cut from sheet goods, boards, hardware, and the room around
them (walls, floors, stairs) for context. Each part carries its material, grain direction,
edge banding, finish, phase and build step. Everything the app shows is computed from that list,
so the views can't disagree with each other.

- **Named dimensions** sit at the top of the file. Derived sizes are ordinary code, so changing
  one number moves everything that depends on it.
- **Phases** describe what is built when: a part can be added, moved or removed in a later phase.
- **Options** describe choices you haven't made yet ("one board high or two"). The top bar
  switches between them, and ⇄ shows what changes.
- **Design rules** ("the hamper must roll out under the rail") are checks with numbers. A
  failing rule shows in the Checks tab.
- **Notes** for each project live in `projects/<id>/notes.md`: the reasoning, the assumptions
  that still need measuring, and the open questions.

Sizes are in inches or millimetres. Imperial sizes are shown to the nearest 1/16″, and sheet
thicknesses as sold, such as 23/32″.

## The app

- **3D view:** orbit by dragging; pan with ⌘-drag or right-drag; scroll to zoom. Keys `1`–`5`
  give standard views, `O` toggles orthographic, `F` frames the selection, `E` explodes the
  model, and `S` adds a section cut. A selected part shows through anything in front of it.
- **Drawings:** each project declares its elevations, sections and plans. Wheel to zoom, drag
  to pan, double-click to fit. A section can cut the 3D view at the same plane.
- **Side panel:** cut list (copy as text, or download CSV), sheet layouts with what to buy,
  build steps, every part, checks, and the project's notes.
- **Selection:** click a part anywhere to select it everywhere; shift-click adds or removes.
- **Phases and steps:** the top bar and `[` `]` walk the build step by step in every view.
- **Layout:** three columns on a wide screen, two or one when narrow, so it fits half a VS Code
  window. Columns can be resized or collapsed. `?` lists the keyboard shortcuts.
- **Live updates:** saving `project.ts` updates every view in place, keeping the camera and
  the selection. If the model breaks, a red bar shows the error and its line while the views
  keep the last good version.

## With Claude Code

`AGENTS.md` holds the agent's instructions, and `.claude/settings.json` adds two hooks:

- **Before every prompt,** the agent sees what you have selected in the viewer: each part's
  name, size, material, position and the line in `project.ts` that defines it.
- **After every edit to a project,** every configuration is checked. Errors go back to the agent
  to fix before it replies; otherwise it gets a summary of what changed: parts resized or moved,
  cut-list rows, sheets to buy.

Claude Code loads hooks when a session starts, so restart `claude` after pulling changes to
them. Two skills come with it: `new-project`, which asks for measurements and sets up a project,
and `review-design`, which checks a design end to end.

## Command line

The same engine runs from the terminal. The agent uses these, and so can you.

```sh
./wb list                                     # the projects
./wb check --all-configs                      # check every project in every configuration
./wb parts --project <id>                     # the parts
./wb part <part-id>                           # one part: size, phases, joints, cut-list row, sheet, source line
./wb cutlist --format text|csv|json           # the cut list
./wb shopping                                 # what to buy
./wb sheets [--svg out/]                      # sheet layouts, optionally as SVG
./wb diff --against opt:<key>=<value>         # what switching an option changes (or a git ref, or last-good)
./wb status                                   # is the dev server running, and what the viewer shows
./wb state                                    # what is selected, as the agent sees it
./wb show --select <part-id> --phase <phase>  # point the open viewer at something
./wb render --view <view> --out file.png      # one view as a PNG: a drawing, 3d-iso, sheets, cutlist, …
./wb new <id> --template blank|shelf|cabinet|closet
./wb snapshot [--update]                      # compare or rewrite projects/<id>/expected/
```

## Repository

| Path | What it is |
|---|---|
| `core/` | The model, evaluation, checks, cut list, shopping list, sheet layouts, drawings and diff: plain TypeScript shared by the app and the command line |
| `app/` | The browser app (React, three.js through react-three-fiber) |
| `tools/` | The `./wb` command line, the dev-server plugin and headless rendering |
| `projects/<id>/` | A project: `project.ts`, `notes.md`, and `expected/` (reference output the tests compare against) |
| `AGENTS.md`, `.claude/` | Instructions, hooks and skills for Claude Code |
| `tests/` | Unit tests, reference-output tests, hook tests and browser tests |
| `docs/research/` | The design research: a survey of tools, the decisions, the spec, and the experiments behind them |

## Development

```sh
npm run typecheck   # TypeScript
npm test            # unit tests, hook tests, and every project against its expected/ files
npm run e2e         # browser tests in Chrome (starts the dev server if needed)
```

Tested on macOS with Chrome and Claude Code 2.1.289. VS Code's integrated browser hasn't been
checked by hand yet.
