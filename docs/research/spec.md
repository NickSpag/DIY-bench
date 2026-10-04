# DIY-bench: implementation spec

DIY-bench is a personal design tool for woodworking and DIY projects. The user talks to Claude Code in a terminal. The agent edits a plain-text parametric model, and a browser view beside the terminal shows that model live in five forms: 3D, technical drawings, a cut list, sheet layouts and build steps. Clicking a part in any of them selects it and highlights it in all of them.

This spec is written for coding agents that will build the repo. It is meant to be complete enough to implement without asking. The reasoning behind each choice is in `decisions.md` (referenced as D1–D21); the tool survey and spike results are in `research.md`. Where this spec says *verified*, a spike in `spikes/` demonstrated it; *inferred* marks design choices not yet proven by running code.

Contents:
1. Scope
2. Architecture and data flow
3. Runtime and dependencies
4. Repository layout
5. The model: schema and builder API
6. Evaluation semantics and invariants
7. Derived outputs
8. The closet project, fully encoded
9. Views and interactions
10. Agent integration
11. CLI, dev-server endpoints and the future MCP surface
12. Milestones
13. Verification and testing
14. Risks
15. Open questions for the user

---

## 1. Scope

**In scope (v1):**
- Rectangular sheet-goods projects: built-ins, closets, shelving, cabinets, simple furniture.
- One TypeScript model per project, giving five synchronised outputs:
  - 3D view
  - drawings (elevations, sections, plans)
  - cut list
  - sheet layouts
  - build steps
- Phases, steps and design options (variants).
- Selecting a part by clicking, which highlights it everywhere it appears.
- Agent loop:
  - the agent edits the model;
  - the view updates in under a second;
  - every edit is checked automatically;
  - the user's selection reaches the agent with every prompt.
- Exports: PDF plan set (printed plans) and a CSV/text cut list.

**Later (planned milestones, optional):**
- Features on parts (dados, grooves, notches, holes) rendered with a mesh kernel, with feature-level selection.
- GLB, STL, DXF and STEP exports, deferred until needed (for example DXF when the user starts using a CNC or cutting service).
- A single-window mode with an embedded terminal.
- An MCP server.

**Not in scope:**
- Curved or freeform parts.
- Structural or load calculations.
- CAM toolpaths.
- Multi-user editing.
- A GUI for editing geometry. The agent and the user's words are the editor.

---

## 2. Architecture and data flow

```
                ┌──────────────────────────── VS Code window ────────────────────────────┐
                │ editor area: integrated browser tab            │ panel (moved right):   │
                │  ┌───────────── DIY-bench app (Vite) ─────────┐ │  terminal: claude      │
                │  │ 3D viewport │ drawing panel │ side panel   │ │                        │
                │  └────────────────────────────────────────────┘ │                        │
                └─────────────────────────────────────────────────┴────────────────────────┘

 projects/<id>/project.ts ──(file write by agent)──► Vite watcher ──HMR──► app/loader.ts (self-accepting)
        │                                                                   │
        │                                                                   ▼
        │                                              core/evaluate(project, config) → Resolved
        │                                                                   │
        │                        ┌──────────────┬──────────────┬────────────┼─────────────┐
        │                        ▼              ▼              ▼            ▼             ▼
        │                    3D scene      drawings SVG    cut list    sheet layouts   steps
        │                        └──────────────┴──── selection store (zustand) ─────────┘
        │                                                     │ debounced POST /__wb/state
        │                                                     ▼
        │                                     Vite plugin → .diy-bench/state.json
        │                                                     │
        │      UserPromptSubmit hook ◄────────────────────────┘ (prints selection into the prompt)
        │
        └──► PostToolUse hook → ./wb check --changed → core/evaluate (Node, type stripping)
                                   exit 2 + errors on stderr │ or additionalContext summary

 ./wb show …  → POST /__wb/control → server.ws.send("wb:control") → app applies (select, phase, view)
 ./wb render … → headless Chrome (playwright-core, channel "chrome") → PNG → agent reads it
```

Data flow, in order:
1. The agent (or the user) edits `projects/<id>/project.ts` or a helper file it imports.
2. Vite's watcher sees the change. The self-accepting `app/loader.ts` re-imports the project module. Verified in two spikes (`research.md`, "Spike results"):
   - A module accepting its model dependency rebuilt the scene 47–63 ms after the file write, with no page reload.
   - A self-accepting glob loader picked up edits to a project and to its helper files with no page reload, and the store module was evaluated only once.
3. The app calls `evaluate(project, config)` from `core/`. That gives a `Resolved` model: parts, phase states, steps, checks, views and issues.
4. Every view derives from `Resolved`, using pure functions in `core/`.
5. If evaluation throws, or an invariant reports an error, the app keeps showing the last good `Resolved` and shows an error bar with the message and a `file:line` link. Vite's own overlay handles syntax errors (verified).
6. Selection goes to a single store. Every view reads it. The store's agent-relevant fields are posted to the dev server, which writes `.diy-bench/state.json`.
7. Two hooks talk to Claude Code:
   - On each prompt, the `UserPromptSubmit` hook prints the current selection. The model sees it with the prompt (verified).
   - After each `Edit`/`Write`, the `PostToolUse` hook runs `./wb check`. On failure it exits 2 and the model sees the errors (verified). On success it prints a summary of what changed in the derived outputs.
8. The agent uses `./wb` to query the model, drive the viewer and render views to PNG.

Nothing in `core/` touches the DOM or Node APIs, so the same code runs in the browser and in Node. `tools/` (CLI, hooks) uses Node APIs; `app/` uses the DOM.

---

## 3. Runtime and dependencies

- **Node:** 22.15 or newer. TypeScript runs directly through type stripping. Every script uses `node --experimental-strip-types --disable-warning=ExperimentalWarning` (verified on 22.15.1).
- **TypeScript:** source must be erasable-only (no `enum`, no `namespace`, no parameter properties). Every relative import names its `.ts` extension (verified: Node fails without it; Vite accepts it).
- **Package manager:** npm. `.npmrc` has `save-exact=true`.

Dependencies, exact versions as published on 2026-10-03:

| Package | Version | Licence | Used by |
|---|---|---|---|
| typescript | 7.0.2 | Apache-2.0 | type checking (`tsc --noEmit`) |
| vite | 8.3.2 | MIT | dev server, HMR, build |
| @vitejs/plugin-react | 6.1.1 | MIT | JSX (peer `vite ^8`; its other peers are optional) |
| react, react-dom | 19.3.0 | MIT | UI |
| three | 0.186.1 | MIT | 3D |
| @types/three | 0.186.0 | MIT | types |
| @types/react, @types/react-dom | 19.3.0 | MIT | types (needed for JSX under `strict`) |
| @react-three/fiber | 9.8.1 | MIT | 3D in React (peer `react >=19 <19.4`) |
| @react-three/drei | 10.7.9 | MIT | CameraControls, Edges, Outlines, GizmoHelper, Bounds |
| zustand | 5.0.15 | MIT | selection and UI store |
| marked | 18.0.14 | MIT | renders `notes.md` in the Notes tab |
| vitest | 5.0.3 | MIT | unit and golden tests |
| @playwright/test | 1.63.0 | Apache-2.0 | browser tests; `channel: "chrome"` uses installed Google Chrome, so there is no browser download |
| playwright-core | 1.63.0 | Apache-2.0 | `./wb render`, `./wb export --pdf` |
| @tarikjabiri/dxf | 2.9.0 | MIT | DXF export (M9, deferred) |
| gltf-validator | 2.0.0-dev.3.10 | Apache-2.0 | test only (M9, deferred) |
| @types/node | 26.6.4 | MIT | types for `tools/` |
| manifold-3d | 3.5.4 | Apache-2.0 | M10 only |
| replicad, replicad-opencascadejs | 1.1.0 | MIT, LGPL-2.1-only | M10 only, loaded on demand |

Do not add other runtime dependencies without recording why in `AGENTS.md`.

---

## 4. Repository layout

```
DIY-bench/
├── AGENTS.md                      instructions for agents (outline in section 10.1)
├── CLAUDE.md                      one line: @AGENTS.md
├── README.md                      for the human: how to start, the layout, the loop
├── package.json                   "type": "module"; scripts in section 11.4
├── .npmrc                         save-exact=true
├── tsconfig.json                  strict, noEmit, allowImportingTsExtensions, erasableSyntaxOnly, verbatimModuleSyntax,
│                                  module/moduleResolution nodenext, target es2023, lib es2023+dom+dom.iterable, jsx react-jsx,
│                                  skipLibCheck
├── vite.config.ts                 react plugin + diyBenchPlugin(); root app/, build.outDir ../dist;
│                                  server.host 127.0.0.1, port 5180, strictPort false
├── wb                             executable shell script: exec node --experimental-strip-types
│                                  --disable-warning=ExperimentalWarning "$(dirname "$0")/tools/wb.ts" "$@"
├── .gitignore                     node_modules, dist, .diy-bench/, test-results/
├── .vscode/
│   ├── settings.json              section 10.5
│   ├── tasks.json                 "diy-bench: dev" runs npm run dev (isBackground, problemMatcher none)
│   └── extensions.json            recommends anthropic.claude-code
├── .claude/
│   ├── settings.json              hooks + permissions (section 10.3)
│   ├── hooks/
│   │   ├── selection-context.ts   UserPromptSubmit hook (section 10.2)
│   │   └── check-after-edit.ts    PostToolUse hook (section 10.2)
│   └── skills/
│       ├── new-project/SKILL.md   start a project: measurements interview, scaffold
│       └── review-design/SKILL.md walk the design: checks, renders, phases, open questions
├── core/                          pure TypeScript, no DOM, no Node APIs
│   ├── model/
│   │   ├── types.ts               every type in section 5
│   │   ├── builder.ts             defineProject, Builder, span, box, callerSite
│   │   └── index.ts               re-exports (what projects import)
│   ├── units.ts                   format and parse lengths (section 5.6)
│   ├── evaluate.ts                evaluate(project, config) → Resolved (section 6)
│   ├── invariants.ts              the checks in section 6.4
│   ├── geometry.ts                box ops: extent, intersect, overlap, cylinder bounds, project to view
│   ├── cutlist.ts                 section 7.1
│   ├── nesting.ts                 section 7.2
│   ├── drawings/
│   │   ├── view-mapping.ts        view mapping (section 7.3.1)
│   │   ├── hidden.ts              visible/hidden segment computation
│   │   ├── section.ts             cut classification, hatching
│   │   ├── dims.ts                dimension and label layout
│   │   └── svg.ts                 deterministic SVG writer
│   ├── steps.ts                   section 7.4
│   ├── shopping.ts                section 7.5
│   ├── diff.ts                    compare two Resolved (parts, cut list, sheets)
│   └── export/                    csv.ts now; glb.ts, stl.ts, dxf.ts, step.ts deferred (section 7.6)
├── app/                           the browser UI (React)
│   ├── index.html
│   ├── main.tsx                   mounts <App/>; imports store then loader
│   ├── loader.ts                  import.meta.glob of projects; self-accepting (section 9.9)
│   ├── store.ts                   zustand store (section 9.8)
│   ├── sync.ts                    posts state to /__wb/state; listens for wb:control
│   ├── App.tsx                    layout (section 9.1)
│   ├── panels/                    Viewport3D.tsx, DrawingPanel.tsx, CutListPanel.tsx, SheetsPanel.tsx,
│   │                              StepsPanel.tsx, PartsPanel.tsx, ChecksPanel.tsx, NotesPanel.tsx
│   ├── components/                TopBar.tsx, ErrorBar.tsx, PartTooltip.tsx, Splitter.tsx
│   ├── highlight.ts               the generated <style> for [data-part~=…] rules
│   └── theme.css                  tokens; light and dark
├── tools/
│   ├── wb.ts                      the CLI (section 11)
│   ├── vite-plugin.ts             diyBenchPlugin(): endpoints, state file, control relay (section 11.2)
│   └── render.ts                  headless Chrome rendering for ./wb render and PDF
├── projects/
│   └── closet-built-in/
│       ├── project.ts             section 8
│       ├── notes.md               design reasoning in prose (section 8.3)
│       └── expected/              golden files (section 13.2)
├── tests/
│   ├── unit/                      vitest: units, geometry, evaluate, invariants, cutlist, nesting, drawings, diff, export
│   ├── golden.test.ts             every project × every configuration against expected/
│   ├── hooks.test.ts              runs both hooks with fixture inputs
│   └── e2e/                       Playwright: cross-highlight, picking with section, HMR, state, control, render
└── .diy-bench/                    gitignored runtime state: state.json, server.json, last-good/<project>.json
```

---

## 5. The model: schema and builder API

A working minimal implementation of this API, enough to evaluate the closet, is in `spikes/fixture/dsl.ts`. The closet in section 8 evaluates against it (verified; section 8 gives the type-check status). The production `core/model/` must accept every program that the spike accepts.

### 5.1 Coordinates
- x runs from the left wall to the right, as seen facing the back wall. y runs up from the floor. z runs out from the back wall toward the room. Right-handed, the same as three.js.
- "Front" means facing +z (toward the room). "Left" means −x.
- All numbers are in the project's `units` (`"in"` or `"mm"`).
- Face names map to axes as follows:

| Face | Axis side |
|---|---|
| left | x− |
| right | x+ |
| bottom | y− |
| top | y+ |
| back | z− |
| front | z+ |

### 5.2 Types

```ts
// core/model/types.ts
export type Axis = "x" | "y" | "z";
export type Range = readonly [number, number];          // [from, to], from < to
export type Box = { x: Range; y: Range; z: Range };     // axis-aligned, world coordinates
export type Face = "left" | "right" | "bottom" | "top" | "back" | "front";
export type Finish = "prefinished" | "clear" | "paint" | "none";
export type Exposure = "exposed" | "hidden" | "limited"; // limited: visible only partly or from below; say how in exposureNote
export type JointKind =
  | "screws" | "pocket-screws" | "glue" | "pins" | "rests-on" | "slides" | "nails"
  | "dado" | "groove" | "rabbet" | "notch";               // the last four allow the two parts to overlap
export type Cylinder = { axis: Axis; from: number; to: number; center: readonly [number, number]; diameter: number };
// center is the coordinate pair on the two other axes in x,y,z order (for axis "x": [y, z]).

export type Stock = {
  id: string;                 // unique within the material, e.g. "4x8", "owned-56x48"
  length: number;             // along the grain
  width: number;
  owned?: number;             // how many the user already has; used before anything is bought
  buy?: boolean;              // purchasable in any quantity
  cost?: number;              // per piece, optional
  note?: string;
};
export type SheetMaterial = {
  type: "sheet"; name: string; thickness: number; grained: boolean; finish: Finish;
  thicknessLabel?: string;    // display text for the thickness, e.g. "12 mm"; see section 5.6
  kerf?: number;              // default 0.125 in, 3 mm
  trim?: number;              // edge trim per side before layout, default 0
  oversize?: number;          // added to length and width of every cut size, default 0
  stock: Stock[];
};
export type BoardMaterial = {
  type: "board"; name: string; thickness: number;
  thicknessLabel?: string;    // display text for the thickness; see section 5.6
  width?: number;             // fixed section width for dimensional lumber (1×4 → 3.5); omit for glued-up panels
  nominal?: string;           // "1×4"
  finish: Finish;
  stockLengths?: number[];    // e.g. [96, 120], for the shopping list
};
export type Material = SheetMaterial | BoardMaterial;
export type Banding = { name: string; thickness: number; width: number; reducesCutSize: boolean };
export type HardwareItem = { name: string; unit: "each" | "pair" | "ft" | "set"; spec?: string; cost?: number };
export type Joint = { to: string; by: JointKind; note?: string };
export type Src = { file: string; line: number; col: number } | null;

type Common = {
  id: string;                 // kebab-case, unique, stable for the life of the physical piece
  name: string;               // cut-list name; interchangeable parts share it ("Partition")
  where?: string;             // which instance ("left"); shown in tooltips and part lists
  phase: string;              // phase in which it is built or installed
  step?: string;              // step that installs it
  removedIn?: string;         // phase from which it is no longer in the build
  moves?: Record<string, Box>;// phase id → new placement from that phase on
  notes?: string;             // shown in the cut list and part details
  tags?: string[];            // free-form, for filtering
  joins?: Joint[];
};
export type PanelSpec = Common & {
  material: string;           // key into materials (sheet for panel, board for board)
  box: Box;
  grain?: Axis;               // world axis the grain runs along; required when the material is grained
  grainLock?: boolean;        // default true; false lets nesting turn the part (say why in notes)
  band?: Partial<Record<Face, string>>; // banded faces → banding id; only edge faces
  exposure?: Exposure;        // default "exposed"
  exposureNote?: string;
  finish?: Finish;            // what to apply; default the material's finish
  fitToSite?: boolean;        // listed at nominal size; measure in place before cutting
  cutIn?: string;             // phase in which it is cut, if earlier than `phase`
  strip?: { id: string; name: string; order: number }; // grain-matched sequence cut from one strip
};
export type HardwareSpec = Common & {
  item: string;               // key into hardware catalogue
  qty: number;                // in the item's unit
  box?: Box; cylinder?: Cylinder; // optional geometry for drawings and 3D
  length?: number;            // for stock cut to length (rods)
  fitToSite?: boolean;
};
export type ContextSpec = {
  id: string; name: string; where?: string;
  role: "wall" | "floor" | "contents";   // walls and floor take part in overlap checks; contents never do
  box: Box; phase?: string; removedIn?: string; moves?: Record<string, Box>;
};

export type Ref = number | `${string}.${Axis}${0 | 1}`;   // a number, or a part face: "partition-left.x0"
export type Dim = { from: Ref; to: Ref; offset: number; text?: string }; // text: "{}" is replaced by the length
export type Label = {
  part?: string; at?: readonly [number, number];   // at: view coordinates (u, v)
  text: string;               // tokens {x0} {x1} {y0} {y1} {z0} {z1} {x} {y} {z} (centres) {len} — formatted lengths
  anchor?: "start" | "middle" | "end"; rotate?: number; dx?: number; dy?: number;
};
export type View = {
  id: string; title: string;
  kind: "elevation" | "section" | "plan";
  look: "-z" | "+z" | "-x" | "+x" | "-y";  // the direction the viewer looks
  cut?: number;               // section and plan: position of the cut plane on the look axis
  depth?: Range;              // optional: ignore parts outside this range on the look axis
  veil?: string[];            // parts drawn as a translucent hatch instead of opaque (front walls, headers)
  hiddenLines?: boolean;      // draw hidden edges dashed; default false
  showContents?: boolean;     // default true
  dims?: Dim[]; labels?: Label[]; caption?: string;
  scale?: number;             // text and line scale; default derived from the view's extent
};

export type OptionDef = { label: string; choices: Record<string, string>; default: string };
export type Phase = { id: string; title: string; summary?: string };
export type Project<O extends Record<string, OptionDef>> = {
  id: string; title: string; units: "in" | "mm";
  options: O; phases: Phase[];
  materials: Record<string, Material>; banding: Record<string, Banding>; hardware: Record<string, HardwareItem>;
  build: (b: Builder, opt: { [K in keyof O]: keyof O[K]["choices"] & string }) => void;
};
```

### 5.3 Builder

```ts
// core/model/builder.ts
export function defineProject<O extends Record<string, OptionDef>>(p: Project<O>): Project<O>;
export const span: (start: number, length: number) => Range;   // [start, start + length]
export const box: (x: Range, y: Range, z: Range) => Box;

export class Builder {
  panel(spec: PanelSpec): Part;          // sheet-material part
  board(spec: PanelSpec): Part;          // board-material part (solid wood, dimensional lumber)
  hardware(spec: HardwareSpec): Part;
  context(spec: ContextSpec): Part;
  step(spec: { id: string; phase: string; title: string; text: string; parts?: string[] }): void;
  check(id: string, label: string, pass: boolean, detail?: string, severity?: "error" | "warning"): void; // default warning
  view(v: View): void;
  part(id: string): Part;                // throws if unknown
  boxOf(id: string): Box;                // throws if the part has no box
}
```

Each builder method records its call site as `src`. Each method parses `new Error().stack` and takes the frame of the caller of the builder method; under type stripping that frame points at the exact line and column (verified). In the browser, Vite serves the module with a URL path, so `src.file` is normalised to the repo-relative path by stripping the dev-server origin and any `?t=` query. When stack parsing fails, `src` is `null`, and nothing may depend on it being present.

The builder throws immediately when it gets:
- a duplicate `id`;
- an `id` that is not kebab-case (`/^[a-z0-9]+(-[a-z0-9]+)*$/`);
- a `Range` with `from >= to`.

### 5.4 Conventions for project authors (and agents)
- **Named dimensions:** put them in one `const P = {...}` at the top of `project.ts`, each with a short comment when the meaning is not obvious. Derived values are computed inside `build`, never typed as literals a second time.
- **Inferred values:** a value that is not from the user or a measurement gets the comment `// inferred` and an entry in `notes.md` under "Assumptions".
- **Interchangeable parts:** they share `name` and differ by `id` and `where`.
- **Repetition:** generate it with loops or helpers inside `build`.
- **Splitting large projects:** a large project may be split into helper modules beside `project.ts`, imported with `.ts` extensions. HMR follows helper imports (verified).
- **Design rules:** anything the user states as a requirement ("the hamper must roll out", "bins must come down") becomes a `b.check(...)` with the numbers in `detail`.
- **Options:** each option is read only through `opt` inside `build`.

### 5.5 Part (resolved shape)
`Part` is the spec plus `kind: "panel" | "board" | "hardware" | "context"` and `src`. After evaluation every part also has a `ResolvedPart` form (section 6.2).

### 5.6 Units (`core/units.ts`)

```ts
export function fmtLength(n: number, opts?: { units?: "in" | "mm"; display?: "in" | "mm"; denom?: 16 | 32; marks?: boolean; feet?: boolean }): string;
export function parseLength(s: string, units: "in" | "mm"): number; // throws with a message naming the input
```

Imperial formatting:
- Round to the nearest 1/16 (or 1/32).
- Write halves, quarters and eighths with ½ ¼ ¾ ⅛ ⅜ ⅝ ⅞, and sixteenths with superscript and subscript digits: `1⁵⁄₁₆`.
- Prefix `≈` when the value was not already a multiple of the denominator (tolerance 1e-6).
- Append `″` when `marks` is true.
- Write feet only when asked (`opts.feet`). The reference never uses feet.

Examples: 23.25 → `23¼`; 0.75 → `¾`; 1.3125 → `1⁵⁄₁₆`; 50.8333 → `≈50¹³⁄₁₆`; 0 → `0`. Thickness: 0.71875 → `23/32`; 12 mm stock → `12 mm`.

Parsing accepts:
- `23 1/4`, `23-1/4`, `23.25`, `23¼`
- `2' 3-1/2"`, `2ft 3.5in`, `23¼″`
- `590mm`, `59cm`

A bare number is read in the project's units.

Metric display: millimetres, rounded to 0.5, with no `≈`.

Thickness display. A part's thickness is shown from its material, not from the length formatter above:
- if the material has `thicknessLabel`, that text is shown (`12 mm`);
- otherwise, if the thickness is a multiple of 1/32 but not of 1/16, it is shown to 1/32″ with a plain slash (`23/32`);
- every other thickness uses the normal 1/16 formatting.

The cut list size column, the CSV, the text export and the tooltips use this rule, so 23/32″ plywood never prints as `≈¾` and 12 mm Baltic birch never prints as `≈½`. Material names carry the trade size ("sold as ¾″").

---

## 6. Evaluation semantics and invariants

### 6.1 Configurations
A configuration is one choice per option: `{ top: "1" }`.
- The default configuration takes every option's `default`.
- `allConfigs(project)` returns the full cross product. If it has more than 32 configurations, the checks run only the default plus each single-option deviation from it, and the result says so.

### 6.2 Resolving
```ts
export function evaluate(project: Project<any>, config: Record<string, string>): Resolved;
type Resolved = {
  project: { id: string; title: string; units: "in" | "mm" };
  config: Record<string, string>;
  phases: Phase[];
  parts: ResolvedPart[];                 // every part, every phase
  steps: (Step & { parts: string[] })[]; // parts filled from part.step when not listed
  checks: Check[];
  views: View[];
  issues: Issue[];
  stateAt(phase: string, step?: string): PhaseState; // memoised
};
type ResolvedPart = Part & {
  kind: "panel" | "board" | "hardware" | "context";
  bounds?: Box;                          // box, or the cylinder's bounding box
  sizes?: { l: number; w: number; t: number; lAxis: Axis; wAxis: Axis; tAxis: Axis }; // panels and boards
  material?: Material; finishApplied?: Finish; cutPhase: string;
};
type PhaseState = { phase: string; step?: string; parts: { part: ResolvedPart; box?: Box }[] }; // box after moves
type Issue = { severity: "error" | "warning" | "info"; code: string; message: string; parts?: string[]; phases?: string[]; src?: Src };
```

Phase state at phase P:
- **Included parts:** a part with no phase (context) is in every phase. Otherwise it is included when `index(phase) ≤ index(P)` and either `removedIn` is unset or `index(P) < index(removedIn)`.
- **Placement:** the latest `moves[q]` with `index(q) ≤ index(P)`, else `box`. For a cylinder, use its bounds.

Step state at step S of phase P:
- the state at the previous phase,
- plus the parts whose `step` comes at or before S in declaration order within P,
- minus the parts with `removedIn = P`, but only once the first step of P is reached.

Membership in a step state is decided by each part's own `step` field. A step's `parts` list only decides which parts the step highlights and lists. That list may name parts not yet installed: `p1-bench` lists the partitions, which are worked on the bench before `p1-stand` installs them. The 3D view draws such parts as translucent ghosts.

`sizes` for panels and boards:
- **Thickness axis (`tAxis`):** the one axis whose extent equals the material thickness. If more than one axis matches, the axis that is not the grain axis and not the largest extent.
- **Length axis (`lAxis`):** `grain` when set; otherwise the larger of the other two axes.
- **Width axis (`wAxis`):** the remaining axis.

`cutPhase` is `cutIn ?? phase`.

### 6.3 Errors in the program
If `build` throws, `evaluate` throws an `EvaluationError` carrying the message and the `src` of the throwing frame inside the project file, when one exists. The app shows it and keeps the last good `Resolved`. The CLI prints it and exits 1.

### 6.4 Invariants
`core/invariants.ts` runs these on every evaluation. Each produces `Issue`s with the code shown. "Overlap" means positive volume on all three axes, beyond a tolerance of 1e-6. Faces that only touch are fine.

| Code | Severity | Rule |
|---|---|---|
| `unknown-ref` | error | Every `joins[].to`, `step.parts[]`, `view.veil[]`, label part, and dimension reference names an existing part; every dimension ref's axis and side are valid. |
| `unknown-step` / `unknown-phase` / `unknown-material` / `unknown-banding` / `unknown-hardware` | error | Names resolve. |
| `range-order` | error | Every range has from < to (also enforced by the builder). |
| `thickness` | error | A panel or board has at least one axis whose extent equals its material's thickness. |
| `board-width` | error | A board whose material has `width` has one axis whose extent equals that width. |
| `grain-axis` | error | `grain` is not the thickness axis; grained materials require `grain` on panels. |
| `band-face` | error | Banded faces are edges, not the two broad faces on the thickness axis. |
| `overlap` | error | In each phase state, no two parts overlap, and no part overlaps a context part with role `wall` or `floor`. Exempt: pairs joined by `dado`, `groove`, `rabbet` or `notch` (either direction); pairs of context parts; contents. One issue per pair, listing every phase where it occurs. |
| `outside-room` | warning | If a project has wall or floor context parts, every built part lies within the bounding box of those context parts. Contents are exempt. This catches a sign error or a misplaced decimal, not a scribing problem. |
| `unfinished-exposed` | warning | An `exposed` part whose applied finish is `none`. |
| `no-step` | warning | A non-context part with no `step`. |
| `strip-mismatch` | error | Members of one strip share material, cut phase and width (the dimension across the strip), and have distinct `order`. |
| `cut-precision` | warning | A cut length or width is not a multiple of 1/32 in (0.5 mm metric). This means a division result was not rounded deliberately. |
| `check:<id>` | per check | Every `b.check` whose `pass` is false. |
| `nesting:unplaced` | error | Section 7.2 could not place a part (reason given). |

Issue messages name parts by `id` and give lengths in display units, for example `p1: partition-left overlaps top-shelf-center-nosing by ¾ × ¾ × ¾`. That is the exact format the spike produced.

---

## 7. Derived outputs

All functions below take a `Resolved`, plus a phase or step where stated. They are deterministic: the same input gives byte-identical output. Numbers in serialised output are rounded to 4 decimals.

### 7.1 Cut list (`core/cutlist.ts`)

```ts
export function cutList(r: Resolved, opts?: { phase?: string }): CutList;
type CutList = {
  rows: CutRow[];            // panels and boards
  strips: Strip[];
  boards: { material: string; name: string; pieces: number; totalLength: number }[];
  hardware: { item: string; name: string; unit: string; qty: number; ids: string[]; spec?: string }[];
  banding: { banding: string; name: string; length: number; ids: string[] }[];
};
type CutRow = {
  phase: string;             // cut phase
  material: string; materialName: string; kind: "panel" | "board";
  name: string; qty: number; ids: string[]; where: string[];
  finished: { l: number; w: number; t: number };
  cut: { l: number; w: number; t: number };
  band: Partial<Record<"l1" | "l2" | "w1" | "w2", string>>; // long edges l1/l2, short edges w1/w2
  tags: string[];            // derived, never typed by hand
  notes: string[];           // unique notes of the members
  strip?: string;
};
type Strip = { id: string; name: string; phase: string; material: string; l: number; w: number; members: string[] }; // l = Σ member l + kerf × (n − 1)
```

How rows are built:
- **Sizes:**
  - The finished size comes from `sizes`.
  - Cut size: `cut.l = finished.l + oversize − Σ thickness of banding on the two w-edges (if reducesCutSize)`, and likewise `cut.w` with the l-edges.
- **Edge naming:** a face perpendicular to `wAxis` lies along the length, so it is an l-edge; a face perpendicular to `lAxis` is a w-edge.
- **Grouping key:** `(cutPhase, material, name, cut.l, cut.w, cut.t, band signature, sorted tags)`.
- **Tags**, in this order when present:
  - `hidden`, or the exposure note for `limited`
  - `needs finish`, when the material's finish is `none` and the applied finish is `clear` or `paint`
  - `paint`
  - `cut to fit`
  - `grain free`
  - `band <faces>`
  - `from strip <name>`
- **Sorting:** by cut phase order, then sheet materials before boards, then material key, then descending `cut.l × cut.w`, then name.
- **Boards:** total length is the sum of `cut.l` per board material.
- **Hardware:** quantities are summed per catalogue item. For the length of a hardware part with `length` (rods), list each length in the row's `notes`: "2 @ 26¼, 1 @ 27".
- **Banding:** the length per banding id is the sum of the banded edges' lengths.
- **Strips** appear in their cut phase as one row ("Strip for the phase 2 faces", qty 1, `l × w`), and each member also appears as its own row in its install phase with the tag `from strip …`.

Text export (`./wb cutlist --format text`), modelled on the reference's "Copy as text":
```
CLOSET BUILT-IN · CUT LIST (in) · top=1

PHASE 1 · SHELL, RODS AND SHELVES
23/32″ prefinished maple plywood (sold as ¾″)
  2 × Partition  —  84 × 23¼ × 23/32  [band front]
…
```

### 7.2 Sheet layouts (`core/nesting.ts`)

```ts
export function nest(r: Resolved, opts?: { phase?: string }): Nesting[];   // one per (cut phase, sheet material)
type Nesting = {
  phase: string; material: string; kerf: number;
  sheets: { stock: string; owned: boolean; length: number; width: number;
            placements: { ids: string[]; x: number; y: number; l: number; w: number; turned: boolean;
                          members?: { id: string; x: number; l: number }[] }[];  // members for strips
            offcuts: { x: number; y: number; l: number; w: number }[] }[];
  unplaced: { id: string; reason: "no-stock" | "too-big" | "no-space" }[];
  bought: Record<string, number>; strategy: string;
};
```

Algorithm. This is the spike's algorithm, which reproduced the reference layout (verified):
1. **Items.** Take the panels whose material is a sheet. The item size is `(cut.l, cut.w)` in grain orientation, with `turnable = grainLock === false || !material.grained`. A strip becomes one item, `(Σl + kerf·(n−1), max w)`, locked. Its members are recorded for expansion.
2. **Stock.**
   - Owned pieces (`owned: n`) are available `n` times. Purchasable pieces (`buy: true`) are unlimited.
   - Stock is oriented with its length along the grain.
   - With trim, the usable area shrinks by `trim` on each side.
   - Owned stock is consumed in phase order. A piece used in phase p1 is not available in p2; offcut tracking across phases is out of scope for v1.
3. **Placing one item.** Free rectangles start as the whole sheet. An item may go in any free rectangle on any open sheet that fits it in an allowed orientation; pick the one with the best (smallest) short-side leftover. After placing, split the free rectangle with a guillotine cut, removing the kerf. Three split rules:
   - `shorterLeftover`: split along the axis that leaves the shorter strip first.
   - `longerLeftover`: the opposite.
   - `alongGrain`: always make the first cut along the length.
4. **Opening a sheet.** If nothing fits, open a new sheet. Candidates are stock that fits the item in some allowed orientation, ordered: owned first, then the `prefer` stock, then the smallest area.
5. **Strategy search.** Try every combination of:
   - sort order: area, longest side or perimeter, all descending;
   - split rule: the three above;
   - `prefer`: none, or each stock id.

   Keep the result with the lowest score: purchased area × 10⁶ + sheet count × 10³ − largest free rectangle / 10³.
6. **Unplaced items.** An item larger than every stock is `too-big`. An item whose material has no stock left is `no-stock`. Anything else is `no-space`. Unplaced items become `nesting:unplaced` errors.
7. **Offcuts** are the remaining free rectangles with both sides ≥ 3 in (75 mm).

Invariants checked in the unit tests:
- Placements lie inside the sheet.
- No two placements overlap once the kerf is included.
- Locked items are not turned.
- The layout is guillotine-separable: recursively, a set of placements can always be split by a full-length cut along x or y that crosses no placement, until each piece holds one placement.

Sheet SVG (`sheetSvg(nesting)`):
- One `<g>` per sheet, with its title ("4×8 · 23/32″ prefinished maple plywood, 96 × 48").
- One rect per placement with `data-part` set to all its IDs. A strip also draws its members' boundaries.
- Labels with name and size.
- Hatch fill for unfinished materials, and a blue outline for `needs finish`. These are the reference's visual conventions.
- A grain arrow per sheet.

### 7.3 Drawings (`core/drawings/`)

```ts
export function drawView(r: Resolved, viewId: string, opts: { phase: string; step?: string; display: "in" | "mm" }): string; // SVG
```

#### 7.3.1 View mapping
Each view maps a world point to view coordinates `(u, v)` and a depth `d`. A larger `d` is nearer the viewer. SVG `y = −v`.

| look | u | v | d | typical use |
|---|---|---|---|---|
| `-z` | x | y | z | front elevation (from the room toward the back wall) |
| `+z` | −x | y | −z | rear elevation |
| `+x` | z | y | −x | side section, back wall on the left, room on the right (as in the reference) |
| `-x` | −z | y | x | side section from the right |
| `-y` | x | −z | y | plan, back wall at the top, room at the bottom (as in the reference) |

Every row was derived from the camera basis: right = forward × up, with up = +y, except the plan, where up = −z. The `+x` row matches the reference's "back wall on the left, room on the right". Mirroring is an easy mistake. The build123d spike's first elevation came out mirrored, because two axes were swapped when the model was moved into build123d's Z-up frame. Any exporter to a Z-up format (STEP for some CAD tools, STL for slicers) must therefore use the rotation (x, y, z) → (x, −z, y), never a swap. The drawing tests (section 12, M6) assert orientation using parts known to sit on the left and at the back.

#### 7.3.2 Classifying parts
- **Elevation:** every part in the phase state is a *beyond* part, except veil parts (drawn as veil) and contents (drawn faint).
- **Section and plan with cut `c`:** let `cd` be the cut's depth (for `+x`, `cd = −c`; for `-y`, `cd = c`; and so on). Then:
  - a part with `dmin ≥ cd` is *removed* (between the viewer and the plane);
  - a part with `dmin < cd < dmax` is *cut*;
  - otherwise the part is *beyond*.
- **`depth` range:** parts outside the view's `depth` range are ignored.

#### 7.3.3 Fill and edges (exact for boxes)
- Each beyond part projects to a rectangle `[u0,u1] × [v0,v1]`. Its visible face is at depth `dmax`.
- **Painter's fill:** draw rectangles in ascending `dmax` (far first), with ties broken by id. Fill styles come from the part's kind and material.
- **Occlusion:** part Q occludes part P where Q lies entirely in front: `Q.dmin ≥ P.dmax − 1e-9`. Overlapping parts (joints) do not occlude each other. Veil parts and contents never occlude.
- **Visible and hidden segments:** split each edge of P's rectangle against every occluder's rectangle interior.
  - A horizontal edge at `v = v0` is covered on `(Q.u0, Q.u1)` when `Q.v0 < v0 < Q.v1` (strict).
  - Vertical edges work the same way.
  - Covered pieces are hidden; the rest are visible.
  - Coincident boundaries count as visible, so where a shelf meets a partition the line is drawn once, solid.
- **Merge:** join collinear touching segments of the same kind and part.
- **Cylinders:**
  - viewed along their axis, a circle;
  - viewed across it, a rectangle;
  - occlusion uses the rectangle in both cases.
- **Cut parts:** draw the intersection rectangle with a cut style. Walls and floors get the 45° hatch pattern. Built parts get a darker wood fill and a heavier outline. Cut parts are drawn after beyond parts.
- **Veil parts:** drawn last, as a translucent fill plus hatch, with no outline except along the opening (the reference's dashed blue opening).
- **Contents:** a translucent fill with a dashed outline, drawn after fills and before edges.

#### 7.3.4 Dimensions and labels
- **Resolving a `Ref`:** `"part.x0"` resolves to that part's box minimum on x in the current phase state; a number is used as is.
- **Axis:** a dimension measures along the axis of its refs. Both refs must share an axis; a number takes the other ref's axis. It is drawn in views where that axis maps to `u` or `v`; elsewhere it is skipped silently.
- **Placement:** `offset` is the coordinate along the other screen axis, in model units, the same as the reference's `dimH(x0, x1, y)`.
- **Text:** the formatted length (`fmtLength`), with `{}` in `text` replaced by it.
- **Drawing:** extension ticks and 45° slashes, as in the reference's `dimH` and `dimV`.
- **Tags:** each dimension `<g>` gets `data-part` set to the IDs of its refs, and `data-dim="<viewId>:<index>"`.
- **Labels:** placed at the part's projected centre plus `dx`/`dy`, or at `at`. Tokens are replaced with formatted values. Labels get a paint-order stroke halo, as in the reference's `.s-lbl`.
- **Collisions:** no automatic collision avoidance in v1. Authors adjust `dx`/`dy`. This is listed as a risk.

#### 7.3.5 SVG structure
```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="…" data-view="front" data-phase="p2">
  <defs> hatch patterns: wall, raw (unfinished), veil </defs>
  <g class="fills">    <rect data-part="partition-left" class="part k-panel m-ply-pre" …/> … </g>
  <g class="contents"> … </g>
  <g class="hidden">   <path data-part="…" d="…"/> … </g>      (only when hiddenLines)
  <g class="edges">    <path data-part="…" d="…"/> … </g>
  <g class="cut">      … </g>
  <g class="veil">     … </g>
  <g class="dims">     <g class="dim" data-part="wall-left partition-left" data-dim="front:1"> … </g> … </g>
  <g class="labels">   … </g>
</svg>
```
- **`viewBox`:** the bounds of everything drawn, plus a margin of 6% of the larger side, plus dimension offsets.
- **Styling:** all styling uses classes and CSS custom properties, with no inline colours, so light and dark themes work. Take the reference page's tokens and class names as the starting palette (`--wood`, `--face`, `--dim`, …).
- **Highlighting:** done by the app's generated stylesheet, not inside the SVG (section 9.8).

### 7.4 Build steps (`core/steps.ts`)
```ts
export function buildSteps(r: Resolved): { phase: Phase; steps: { id: string; title: string; text: string; parts: string[]; src: Src }[] }[];
```
- Each step's parts are `step.parts`, or else the parts whose `step` is this step.
- Parts that are removed in a phase are listed under that phase's first step as "Take out: …".
- Parts that move in a phase are listed under that phase's first step as "Move: … to …".

### 7.5 Shopping list (`core/shopping.ts`)
```ts
export function shoppingList(r: Resolved, opts?: { phase?: string }): {
  sheets: { material: string; stock: string; count: number; cost?: number }[];   // purchased only, from nest()
  owned: { material: string; stock: string; used: number }[];
  boards: { material: string; totalLength: number; suggested: { length: number; count: number }[] }[]; // first-fit into stockLengths
  hardware: { item: string; name: string; qty: number; unit: string }[];
  banding: { banding: string; length: number; withWaste: number }[];               // +10 %
  total?: number;
};
```

### 7.6 Exports (`core/export/`)

In scope now: the CSV/text cut list and the PDF plan set. GLB, STL, DXF and STEP are deferred (M9) until the user needs them; their specs stay below.

**Up axis.**
- GLB is written in model coordinates unchanged. glTF defines +Y as up and +Z as the front of the asset, which is exactly the model's frame [I: glTF 2.0 specification convention].
- STEP and STL are written Z-up through the rotation (x, y, z) → (x, −z, y) from section 7.3.1, because CAD tools and slicers usually assume Z-up [I].
- The M9 STEP test re-imports the file in build123d and checks bounding boxes in the rotated frame.

- **`csv.ts`** — the cut list as CSV. Columns: phase, material, name, qty, cut length, cut width, thickness, tags, ids, notes.
- **`glb.ts`** — writes glTF 2.0 binary directly:
  - one node per built part, named by id, with an `extras` object carrying `{ name, where, kind, material, phase, step }`;
  - box meshes with positions and normals;
  - one material per material key, with a colour from the theme;
  - context parts optional (`--with-context`).
- **`stl.ts`** — binary STL, one file per part, in a zip (`STORE`, no compression) or a folder.
- **`dxf.ts`** — through `@tarikjabiri/dxf` 2.9:
  - one DXF per panel and board, at the origin, as length × width;
  - `$INSUNITS` 1 (in) or 4 (mm);
  - the outline as a closed LWPOLYLINE on layer `OUTLINE`;
  - one DXF per sheet layout, with each placement on `OUTLINE` and a label `TEXT` on `LABELS`;
  - features (M10) on `POCKET_<depth>`, `DRILL_<diameter>`, `GROOVE_<depth>`.
- **`step.ts`** — AP214, written directly:
  - each built part as a `MANIFOLD_SOLID_BREP` of six planar faces;
  - a `PRODUCT` named by part id, placed under one assembly `PRODUCT` named by the project id;
  - units declared as inches through `CONVERSION_BASED_UNIT`, or as millimetres.
  - Parts with features (M10) go through Replicad's `exportSTEP` instead.
- **PDF** (`tools/render.ts`):
  - opens `/?project=…&print=1` in headless Chrome;
  - the print stylesheet lays out a title sheet, every declared view (one per page, each at the current phase), the cut list, sheet layouts and steps;
  - `page.pdf({ preferCSSPageSize: true })`, with `@page { size: letter landscape }` by default (`--page tabloid`);
  - a title block from `@page` margin boxes: project, configuration, phase, date and page number.

---

## 8. The closet project, fully encoded

`projects/closet-built-in/project.ts` is the first fixture. It encodes the concept sheet `projects/closet-built-in/concept-sheet.html` as committed in c10ee19:
- double hang on the left;
- long hang on the right;
- a 24″ center column with a pull-out frame, 27″ tall with its top rail at 24″ to 27″, holding a 23″ rolling hamper at the floor;
- three drawers;
- a hardwood top at 49″, with shelves above;
- a 5½″ baseboard on the back and both side walls;
- two build phases.

There is no two-drawer option. The only design option is the hardwood top thickness: 1″ (the default) or ¾″. The concept sheet lists "Hardwood top, ¾″ or 1″".

The file below started from `spikes/fixture/closet.ts`. It was updated on 2026-10-03 to the current concept sheet and evaluated with the spike's evaluator. The spike folder itself is unchanged and still holds the older version. The current file evaluates in 4–13 ms per configuration (verified). The TypeScript 7 type-check (`strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`) was verified for the older version only; the current file adds the `thicknessLabel` field to `bb-12`, which M1 adds to the material types (section 5.2). M1 reproduces the file in the repo.

### 8.1 `projects/closet-built-in/project.ts`

```ts
// Closet built-in: the first fixture. Encodes projects/closet-built-in/concept-sheet.html as committed in c10ee19.
// Axes: x from the left wall (looking at the back wall), y up from the floor, z out from the back wall. Inches.
// Values marked "inferred" are not on the concept sheet; everything else is.
import { defineProject, span, box, type Box, type Range } from "../../core/model/index.ts";

const T = 23 / 32;   // plywood sold as ¾″
const B = 0.75;      // 1× pine boards and the ¾″ hardwood
const BB = 12 / 25.4; // 12 mm Baltic birch, sold as ½″

export const P = {
  room: { width: 80, depth: 24, height: 95.5, wall: 4.5 },
  opening: { x: [15.75, 64.25] as Range, height: 80.5 },
  baseboard: { height: 5.5, t: 0.75 },  // thickness approximate: the user measured "maybe ¾″"
  column: [28, 52] as Range,            // outside faces of the two partitions
  partitionHeight: 84,
  partitionDepth: 23.25,                // leaves ¾″ at the back to scribe
  topShelfDepth: 11.25,                 // plus the ¾″ nosing = 12″
  nosing: { t: 0.75, h: 1.5 },
  rightShelfAt: 70,
  centerFixedAt: 70,
  adjustableP1: [28, 42, 55.75],        // bottom faces of the three adjustable shelves in phase 1
  adjustableDepth: 22.5,
  rods: { leftUpper: 81.5, leftLower: 41, right: 67.5, fromBack: 12, dia: 1.3125, socket: 0.125 },
  cleat: { side: 3.5, back: 1.5, sideLength: 10.5 },
  faces: { overlay: 0.375, gap: 0.125 },
  hamper: { bay: 28, faceOffFloor: 0.25, w: 19.5, d: 15, h: 23, backFromFace: 15.5 },
  frame: { height: 26.5, offFloor: 0.5, rail: 3 },
  drawerZones: [8, 7, 6],
  drawerBoxHeights: [6.5, 5.5, 4.5],
  boxLength: 21, slide: 0.5, groove: { depth: 0.25, up: 0.25 },
};

export default defineProject({
  id: "closet-built-in",
  title: "Closet Built-In",
  units: "in",
  options: {
    top: {
      label: "Hardwood top thickness",
      choices: { "1": "1″ hardwood top", "0.75": "¾″ hardwood top" },
      default: "1",
    },
  },
  phases: [
    { id: "p1", title: "Shell, rods and shelves", summary: "The closet is fully usable after this phase." },
    { id: "p2", title: "Hamper frame and drawers" },
  ],
  materials: {
    "ply-pre": { type: "sheet", name: "23/32″ prefinished maple plywood (sold as ¾″)", thickness: T, grained: true, finish: "prefinished", kerf: 0.125,
      stock: [{ id: "4x8", length: 96, width: 48, buy: true }, { id: "4x4", length: 48, width: 48, buy: true }] },
    "ply-raw": { type: "sheet", name: "23/32″ plywood, unfinished (owned piece)", thickness: T, grained: true, finish: "none", kerf: 0.125,
      stock: [{ id: "owned-56x48", length: 56, width: 48, owned: 1, note: "Grain runs along the 56″ side" }] },
    "bb-12": { type: "sheet", name: "12 mm Baltic birch (sold as ½″)", thickness: BB, thicknessLabel: "12 mm", grained: true, finish: "none", kerf: 0.125,
      stock: [{ id: "5x5", length: 60, width: 60, buy: true }] },
    "ply-quarter": { type: "sheet", name: "¼″ plywood", thickness: 0.25, grained: true, finish: "none", kerf: 0.125,
      stock: [{ id: "4x4", length: 48, width: 48, buy: true }] },
    "pine-1x4": { type: "board", name: "1×4", nominal: "1×4", thickness: B, width: 3.5, finish: "none" },
    "pine-1x2": { type: "board", name: "1×2", nominal: "1×2", thickness: B, width: 1.5, finish: "none" },
    "hw-nosing": { type: "board", name: "Hardwood nosing ¾ × 1½", thickness: 0.75, width: 1.5, finish: "clear" },
    "hw-1in": { type: "board", name: "Hardwood, 1″ thick", thickness: 1, finish: "clear" },
    "hw-34": { type: "board", name: "Hardwood, ¾″ thick", thickness: 0.75, finish: "clear" },
  },
  banding: {
    maple: { name: "Iron-on maple edge banding, ¾″", thickness: 0.02, width: 0.8125, reducesCutSize: false },
  },
  hardware: {
    "rod": { name: "Closet rod, 1⁵⁄₁₆″", unit: "each" },
    "rod-socket": { name: "Rod sockets", unit: "pair" },
    "shelf-pin": { name: "Shelf pins, 5 mm", unit: "each" },
    "hamper": { name: "Rolling hamper", unit: "each", spec: "19½ W × 15 D × 23 H max, or a ½″ ply box on four 2″ casters" },
    "slide-21": { name: "21″ full-extension side-mount slides", unit: "pair", spec: "Soft-close for the drawers" },
    "pull": { name: "Pulls", unit: "each" },
  },

  build(b, opt) {
    const R = P.room, BBd = P.baseboard;
    const [pl, colR] = P.column;
    const pr = colR - T;                        // left face of the right partition
    const C0 = pl + T, C1 = pr;                 // inside faces of the center column: 22⁹⁄₁₆″ apart
    const zFront = P.partitionDepth;            // 23.25
    const fx: Range = [C0 - P.faces.overlay, C1 + P.faces.overlay]; // faces overlay ⅜″ of each partition edge
    const topY = P.partitionHeight;             // top shelves sit on the partitions
    const topT = Number(opt.top);

    // ---------- room (context) ----------
    b.context({ id: "floor", name: "Floor", role: "floor", box: box([-R.wall, R.width + R.wall], [-1, 0], [-R.wall, R.depth + R.wall]) });
    b.context({ id: "ceiling", name: "Ceiling", role: "wall", box: box([-R.wall, R.width + R.wall], [R.height, R.height + 1.5], [-R.wall, R.depth + R.wall]) });
    b.context({ id: "wall-back", name: "Back wall", role: "wall", box: box([-R.wall, R.width + R.wall], [0, R.height], [-R.wall, 0]) });
    b.context({ id: "wall-left", name: "Left wall", role: "wall", box: box([-R.wall, 0], [0, R.height], [0, R.depth + R.wall]) });
    b.context({ id: "wall-right", name: "Right wall", role: "wall", box: box([R.width, R.width + R.wall], [0, R.height], [0, R.depth + R.wall]) });
    b.context({ id: "return-left", name: "Left return", role: "wall", box: box([0, P.opening.x[0]], [0, R.height], [R.depth, R.depth + R.wall]) });
    b.context({ id: "return-right", name: "Right return", role: "wall", box: box([P.opening.x[1], R.width], [0, R.height], [R.depth, R.depth + R.wall]) });
    b.context({ id: "header", name: "Header", role: "wall", box: box(P.opening.x, [P.opening.height, R.height], [R.depth, R.depth + R.wall]) });
    b.context({ id: "baseboard-back", name: "Baseboard", where: "back wall", role: "wall", box: box([0, R.width], [0, BBd.height], [0, BBd.t]) });
    b.context({ id: "baseboard-left", name: "Baseboard", where: "left wall", role: "wall", box: box([0, BBd.t], [0, BBd.height], [BBd.t, R.depth]) });
    b.context({ id: "baseboard-right", name: "Baseboard", where: "right wall", role: "wall", box: box([R.width - BBd.t, R.width], [0, BBd.height], [BBd.t, R.depth]) });

    // ---------- phase 1: partitions ----------
    for (const [side, x] of [["left", pl], ["right", pr]] as const) {
      b.panel({
        id: `partition-${side}`, name: "Partition", where: side, material: "ply-pre", phase: "p1", step: "p1-stand",
        box: box(span(x, T), [0, P.partitionHeight], [0, P.partitionDepth]),
        grain: "y", band: { front: "maple" },
        joins: [{ to: "baseboard-back", by: "notch", note: `Notch the back bottom corner ${BBd.height} × ${BBd.t} for the baseboard` }],
        notes: "Shelf pin holes on the inner face only, 27″ to 68″. Notch for the baseboard.",
      });
    }

    // ---------- top shelves, nosings, cleats (shelves sit at the partition tops) ----------
    // The nosing is glued to the shelf's front edge. Its x range defaults to the shelf's; the center one fits between the partitions.
    const shelfOnCleats = (id: string, name: string, where: string, x: Range, y: number, material: string, extra: object, nosingX: Range = x) => {
      b.panel({ id, name, where, material, phase: "p1", step: "p1-tie", box: box(x, span(y, T), [0, P.topShelfDepth]), grain: "x", fitToSite: true, ...extra });
      b.board({ id: `${id}-nosing`, name: "Shelf nosing", where, material: "hw-nosing", phase: "p1", step: "p1-finish",
        box: box(nosingX, [y + T - P.nosing.h, y + T], span(P.topShelfDepth, P.nosing.t)), grain: "x",
        joins: [{ to: id, by: "glue" }] });
    };
    shelfOnCleats("top-shelf-left", "Top shelf", "left", [0, pl], topY, "ply-raw",
      { exposure: "limited", exposureNote: "Behind the header; only the underside shows" });
    shelfOnCleats("top-shelf-center", "Center top shelf", "center", [pl, colR], topY, "ply-raw",
      { exposure: "limited", exposureNote: "Behind the header", joins: [{ to: "partition-left", by: "screws" }, { to: "partition-right", by: "screws" }] },
      [C0, C1]);
    shelfOnCleats("top-shelf-right", "Top shelf", "right", [colR, R.width], topY, "ply-raw",
      { exposure: "limited", exposureNote: "Behind the header; only the underside shows" });
    shelfOnCleats("shelf-right-70", "Right 70″ shelf", "right, at 70″", [colR, R.width], P.rightShelfAt, "ply-pre",
      { grain: "z", grainLock: false, notes: "Cut from the 4×8 offcut, so the grain runs front to back; the nosing covers the front edge." });

    const cleats = (prefix: string, x0: number, x1: number, shelfY: number) => {
      const yS: Range = [shelfY - P.cleat.side, shelfY], yB: Range = [shelfY - P.cleat.back, shelfY];
      const zS = span(B, P.cleat.sideLength);
      b.board({ id: `${prefix}-cleat-a`, name: "Side cleat", where: `${prefix}, wall end`, material: "pine-1x4", phase: "p1", step: "p1-cleats", box: box(span(x0, B), yS, zS), grain: "z", exposure: "hidden" });
      b.board({ id: `${prefix}-cleat-b`, name: "Side cleat", where: `${prefix}, partition end`, material: "pine-1x4", phase: "p1", step: "p1-cleats", box: box([x1 - B, x1], yS, zS), grain: "z", exposure: "hidden" });
      b.board({ id: `${prefix}-cleat-back`, name: "Back cleat", where: prefix, material: "pine-1x2", phase: "p1", step: "p1-cleats", box: box([x0 + B, x1 - B], yB, [0, B]), grain: "x", exposure: "hidden", fitToSite: true });
    };
    cleats("top-left", 0, pl, topY);
    cleats("top-right", colR, R.width, topY);
    cleats("right-70", colR, R.width, P.rightShelfAt);

    // ---------- center column, phase 1 ----------
    b.panel({ id: "center-shelf-fixed", name: "Center fixed shelf", material: "ply-pre", phase: "p1", step: "p1-tie",
      box: box([C0, C1], span(P.centerFixedAt, T), [0, zFront]), grain: "x", band: { front: "maple" },
      joins: [{ to: "partition-left", by: "screws" }, { to: "partition-right", by: "screws" }],
      notes: "Add ½″ to the length if you dado it in." });
    for (const [i, id] of (["nailer-top", "nailer-70"] as const).entries()) {
      const y = i === 0 ? topY : P.centerFixedAt;
      b.panel({ id, name: "Nailer", where: i === 0 ? "behind the center top shelf" : "under the back of the 70″ shelf", material: "ply-raw", phase: "p1", step: "p1-cleats",
        box: box([C0, C1], [y - 3.5, y], [0, T]), grain: "x", grainLock: false, exposure: "hidden" });
    }
    b.board({ id: "floor-rail", name: "Floor rail", material: "pine-1x4", phase: "p1", step: "p1-tie",
      box: box([C0, C1], [0, 3.5], span(BBd.t, B)), grain: "x", exposure: "hidden",   // in front of the baseboard: inferred
      notes: "On edge at the back of the center column, in front of the baseboard. Ties the partition bottoms and screws to studs." });

    // Adjustable shelves: three on pins in phase 1; phase 2 keeps the ones the drawers leave room for.
    const adjBox = (y: number): Box => box([C0 + 0.0625, C1 - 0.0625], span(y, T), [zFront - P.adjustableDepth, zFront]); // front flush: inferred
    const zones = P.drawerZones;
    const topAt = P.hamper.bay + zones.reduce((a, h) => a + h, 0);          // 49
    const keep = evenShelves(topAt + topT, P.centerFixedAt, 2).slice(0, -1);  // the last one is the fixed 70″ shelf
    P.adjustableP1.forEach((y, i) => {
      const n = i + 1, moved = keep[keep.length - (3 - i)];                    // the top-most shelves stay; undefined = removed
      b.panel({ id: `center-shelf-adj-${n}`, name: "Center adjustable shelf", where: `#${n}`, material: "ply-pre", phase: "p1", step: "p1-finish",
        box: adjBox(y), grain: "x", band: { front: "maple" },
        ...(moved === undefined ? { removedIn: "p2" } : { moves: { p2: adjBox(moved) } }),
        joins: [{ to: "partition-left", by: "pins" }, { to: "partition-right", by: "pins" }] });
    });

    // ---------- rods (hardware with geometry) ----------
    const rod = (id: string, name: string, x0: number, x1: number, y: number, step: string) =>
      b.hardware({ id, name, item: "rod", qty: 1, phase: "p1", step, fitToSite: true, length: x1 - x0,
        cylinder: { axis: "x", from: x0, to: x1, center: [y, P.rods.fromBack], diameter: P.rods.dia } });
    const s = P.rods.socket;
    rod("rod-left-upper", "Rod, left upper", B + s, pl - B - s, P.rods.leftUpper, "p1-finish");
    rod("rod-left-lower", "Rod, left lower", B + s, pl - s, P.rods.leftLower, "p1-finish");
    rod("rod-right", "Rod, right", colR + B + s, R.width - B - s, P.rods.right, "p1-finish");
    b.board({ id: "rod-backer", name: "Rod backer", material: "pine-1x4", phase: "p1", step: "p1-cleats",
      box: box([0, B], [P.rods.leftLower - 1.75, P.rods.leftLower + 1.75], [P.rods.fromBack - 3, P.rods.fromBack + 3]), grain: "z", exposure: "hidden",
      notes: "Left side wall at 41″, for the lower rod's socket." });
    b.hardware({ id: "rod-sockets", name: "Rod sockets", item: "rod-socket", qty: 3, phase: "p1", step: "p1-finish" });
    b.hardware({ id: "shelf-pins", name: "Shelf pins", item: "shelf-pin", qty: 12, phase: "p1", step: "p1-finish" });

    // ---------- the rolling hamper: on the floor in phase 1, inside the frame in phase 2 ----------
    const hx = span((C0 + C1) / 2 - P.hamper.w / 2, P.hamper.w);
    const backZ = zFront - P.hamper.backFromFace;                               // 7.75: front face of the frame back
    b.hardware({ id: "rolling-hamper", name: "Rolling hamper", item: "hamper", qty: 1, phase: "p1", step: "p1-finish",
      box: box(hx, [0, P.hamper.h], [6, 6 + P.hamper.d]),
      moves: { p2: box(hx, [0, P.hamper.h], span(backZ + 0.125, P.hamper.d)) } });

    // ---------- phase 2: faces, cut in phase 1 from one strip of the owned piece ----------
    const faceTops = [P.hamper.bay, ...zones.map((_, i) => P.hamper.bay + zones.slice(0, i + 1).reduce((a, h) => a + h, 0))];
    b.panel({ id: "hamper-face", name: "Hamper face", material: "ply-raw", phase: "p2", step: "p2-faces", cutIn: "p1",
      box: box(fx, [P.hamper.faceOffFloor, P.hamper.bay - P.faces.gap], [zFront, zFront + T]), grain: "y",
      finish: "clear", strip: { id: "faces", name: "Strip for the phase 2 faces", order: 0 },
      joins: [{ to: "hamper-frame-side", by: "screws" }, { to: "hamper-frame-rail", by: "screws" }] });
    zones.forEach((h, i) => {
      b.panel({ id: `drawer-face-${i + 1}`, name: "Drawer face", where: `drawer ${i + 1}`, material: "ply-raw", phase: "p2", step: "p2-faces", cutIn: "p1",
        box: box(fx, [faceTops[i], faceTops[i] + h - P.faces.gap], [zFront, zFront + T]), grain: "y",
        finish: "clear", strip: { id: "faces", name: "Strip for the phase 2 faces", order: i + 1 },
        joins: [{ to: `drawer-${i + 1}-front`, by: "screws" }] });
    });

    // ---------- phase 2: hamper frame (12 mm Baltic birch + hardwood rail) ----------
    const F = P.frame, frameY = span(F.offFloor, F.height);                     // ½″ to 27″
    const bx0 = C0 + P.slide, bx1 = C1 - P.slide;                               // box and frame outside width 21⁹⁄₁₆″
    const boxZ = [zFront - P.boxLength, zFront] as Range;                       // 2.25 .. 23.25
    b.panel({ id: "hamper-frame-side", name: "Hamper frame side", material: "bb-12", phase: "p2", step: "p2-frame",
      box: box([bx1 - BB, bx1], frameY, boxZ), grain: "z", exposure: "hidden" });
    b.board({ id: "hamper-frame-rail", name: "Hamper frame top rail", material: "hw-34", phase: "p2", step: "p2-frame",
      box: box(span(bx0, B), [frameY[1] - F.rail, frameY[1]], boxZ), grain: "z", exposure: "hidden",
      notes: "The left slide mounts to it and the hamper rolls out under it." });
    b.panel({ id: "hamper-frame-back", name: "Hamper frame back", material: "bb-12", phase: "p2", step: "p2-frame",
      box: box([bx0 + B, bx1 - BB], frameY, [backZ - BB, backZ]), grain: "x", exposure: "hidden",
      joins: [{ to: "hamper-frame-side", by: "screws" }, { to: "hamper-frame-rail", by: "screws" }] });

    // ---------- phase 2: drawer boxes ----------
    zones.forEach((_, i) => {
      const n = i + 1, h = P.drawerBoxHeights[i], y0 = faceTops[i] + 0.5;     // box ½″ above the zone bottom: inferred
      const yr = span(y0, h), g = P.groove;
      const side = (id: string, x: Range) => b.panel({ id, name: "Drawer box side", where: `drawer ${n}`, material: "bb-12", phase: "p2", step: "p2-drawers",
        box: box(x, yr, boxZ), grain: "z", exposure: "hidden" });
      side(`drawer-${n}-side-l`, span(bx0, BB)); side(`drawer-${n}-side-r`, [bx1 - BB, bx1]);
      for (const [end, z] of [["front", [boxZ[1] - BB, boxZ[1]]], ["back", [boxZ[0], boxZ[0] + BB]]] as const) {
        b.panel({ id: `drawer-${n}-${end}`, name: "Drawer box front or back", where: `drawer ${n} ${end}`, material: "bb-12", phase: "p2", step: "p2-drawers",
          box: box([bx0 + BB, bx1 - BB], yr, z as Range), grain: "x", exposure: "hidden",
          joins: [{ to: `drawer-${n}-side-l`, by: "glue" }, { to: `drawer-${n}-side-r`, by: "glue" }] });
      }
      const inset = g.depth - 0.0625;                                           // bottom sits in ¼″ grooves with 1/16″ play
      b.panel({ id: `drawer-${n}-bottom`, name: "Drawer bottom", where: `drawer ${n}`, material: "ply-quarter", phase: "p2", step: "p2-drawers",
        box: box([bx0 + BB - inset, bx1 - BB + inset], span(y0 + g.up, 0.25), [boxZ[0] + BB - inset, boxZ[1] - BB + inset]),
        grain: "x", grainLock: false, exposure: "hidden",
        joins: ["side-l", "side-r", "front", "back"].map(k => ({ to: `drawer-${n}-${k}`, by: "groove" as const })) });
    });
    b.board({ id: "center-top", name: "Hardwood top", material: topT === 1 ? "hw-1in" : "hw-34", phase: "p2", step: "p2-top",
      box: box([C0, C1], span(topAt, topT), [0, R.depth]), grain: "x", finish: "clear",
      joins: [{ to: "partition-left", by: "pocket-screws" }, { to: "partition-right", by: "pocket-screws" }] });
    b.hardware({ id: "slides", name: "Slides, 21″", item: "slide-21", qty: zones.length + 1, phase: "p2", step: "p2-drawers" });
    b.hardware({ id: "pulls", name: "Pulls", item: "pull", qty: zones.length + 1, phase: "p2", step: "p2-faces" });

    // ---------- contents shown in the drawings (not built) ----------
    for (const [a, z] of [[2, 26], [30, 50], [54, 78]]) b.context({ id: `bins-${a}`, name: "Bins", role: "contents", box: box([a, z], [topY + T, topY + 8.5], [0.8, 10.8]) });
    b.context({ id: "hang-left-upper", name: "Shirts, jackets", role: "contents", box: box([0.9, pl - 1.2], [P.rods.leftUpper - 1.6 - 36, P.rods.leftUpper], [2, 22]) });
    b.context({ id: "hang-left-lower", name: "Shirts, folded pants", role: "contents", box: box([0.9, pl - 1.2], [P.rods.leftLower - 1.6 - 37, P.rods.leftLower], [2, 22]) });
    b.context({ id: "hang-right", name: "Suits, coats, dresses", role: "contents", box: box([colR + 0.9, R.width - 1.2], [P.rods.right - 1.6 - 55, P.rods.right], [2, 22]) });

    // ---------- build steps ----------
    b.step({ id: "p1-bench", phase: "p1", title: "On the bench",
      text: "Edge band the partition fronts, drill the shelf pin holes on their inner faces from 27″ to 68″, and notch the bottoms for the baseboard. The holes are far easier to drill flat than in place. Cut the strip for the phase 2 faces and set it aside.",
      parts: ["partition-left", "partition-right"] });
    b.step({ id: "p1-cleats", phase: "p1", title: "Cleats and nailers",
      text: "Screw the cleats and nailers into the studs. Level them off marks at 84″ and 70″ rather than measuring up from the floor." });
    b.step({ id: "p1-stand", phase: "p1", title: "Stand the partitions",
      text: "They are 84″ tall and the opening is 80½″, so bring each one in tilted and stand it up inside. The diagonal clears the ceiling." });
    b.step({ id: "p1-tie", phase: "p1", title: "Tie them together",
      text: "The floor rail at the back and the fixed 70″ shelf, then the three top shelf pieces and the right 70″ shelf." });
    b.step({ id: "p1-finish", phase: "p1", title: "Finish",
      text: "Glue on the nosings, hang the rods, and drop in the adjustable shelves at 28″, 42″ and 55¾″. The rolling hamper goes on the floor below them." });
    b.step({ id: "p2-frame", phase: "p2", title: "Build the hamper frame",
      text: "The right side, the back 15½″ behind where the face goes, and the top rail on the left. The left side stays open. Pull the two lower adjustable shelves first." });
    b.step({ id: "p2-drawers", phase: "p2", title: "Drawer boxes and slides",
      text: "Build the drawer boxes and mount the slides on the partitions, using a spacer board cut to each slide's height so both sides match. The frame's slides go at the top of the frame." });
    b.step({ id: "p2-top", phase: "p2", title: "Fix the hardwood top", text: "At 49″, with pocket screws into the partitions from below." });
    b.step({ id: "p2-faces", phase: "p2", title: "Hang the faces",
      text: "With ⅛″ gaps, starting with the hamper face ¼″ off the floor, then set the remaining shelf." });

    // ---------- design rules from the concept sheet ----------
    const railBottom = b.boxOf("hamper-frame-rail").y[0];
    b.check("hamper-under-rail", "The rolling hamper rolls out under the frame's top rail",
      P.hamper.h <= railBottom, `hamper ${P.hamper.h}″ tall, rail underside ${railBottom}″ off the floor`);
    b.check("hamper-depth", "The hamper fits between the frame back and the face", P.hamper.d <= P.hamper.backFromFace - 0.25,
      `hamper ${P.hamper.d}″ deep, ${P.hamper.backFromFace}″ from frame back to face`);
    b.check("column-in-opening", "The center column sits inside the opening, so drawers clear the jambs",
      pl >= P.opening.x[0] && colR <= P.opening.x[1], undefined, "error");
    b.check("partition-tilts-in", "A partition can be tilted up inside the closet",
      Math.hypot(P.partitionHeight, P.partitionDepth) < R.height, `diagonal ${Math.hypot(P.partitionHeight, P.partitionDepth).toFixed(2)}″`, "error");
    b.check("bins-come-down", "Bins on the top shelf come down through the gap under the header",
      R.depth - (P.topShelfDepth + P.nosing.t) >= 11, `gap ${R.depth - (P.topShelfDepth + P.nosing.t)}″`);
    b.check("coat-clears-floor", "A 55″ coat on the right rod clears the floor by at least 8″", P.rods.right - 1.6 - 55 >= 8);

    // ---------- drawing views ----------
    b.view({ id: "front", title: "Front elevation", kind: "elevation", look: "-z",
      veil: ["return-left", "return-right", "header"], caption: "Looking at the back wall. Hatched areas sit behind the front wall.",
      dims: [
        { from: "wall-left.x1", to: "wall-right.x0", offset: -7 },
        { from: "wall-left.x1", to: "partition-left.x0", offset: -2.6 },
        { from: "partition-left.x0", to: "partition-right.x1", offset: -2.6 },
        { from: "partition-right.x1", to: "wall-right.x0", offset: -2.6 },
        { from: "wall-left.x1", to: "return-left.x1", offset: R.height + 5 },
        { from: "return-left.x1", to: "return-right.x0", offset: R.height + 5, text: "{} opening" },
        { from: "return-right.x0", to: "wall-right.x0", offset: R.height + 5 },
        { from: "floor.y1", to: "ceiling.y0", offset: -10 },
        { from: "floor.y1", to: "header.y0", offset: -4.6, text: "{} opening" },
      ],
      labels: [
        { part: "rod-left-upper", text: "rod {y}" }, { part: "rod-left-lower", text: "rod {y}" }, { part: "rod-right", text: "rod {y}" },
        { part: "shelf-right-70", text: "shelf {y0} · 12″ deep" }, { part: "top-shelf-right", text: "top shelf {y0} · 12″ deep" },
      ] });
    b.view({ id: "section-a", title: "Section A · left hanging section", kind: "section", look: "+x", cut: 14,
      caption: "Cut front to back, back wall on the left, room on the right.",
      dims: [{ from: "wall-back.z1", to: "top-shelf-left-nosing.z1", offset: R.height + 4 }, { from: "top-shelf-left-nosing.z1", to: "return-left.z0", offset: R.height + 4, text: "{} gap" }] });
    b.view({ id: "section-b", title: "Section B · center column", kind: "section", look: "+x", cut: (C0 + C1) / 2, hiddenLines: true });
    b.view({ id: "plan", title: "Plan", kind: "plan", look: "-y", cut: 45,
      dims: [{ from: "wall-left.x1", to: "wall-right.x0", offset: -7.7 }, { from: "wall-back.z1", to: "return-left.z0", offset: -7.7 }] });
  },
});

// n shelves between `from` and `to`, evenly spaced, the last one with its bottom face at `to`; rounded to 1/16″.
export function evenShelves(from: number, to: number, n: number): number[] {
  const clear = (to - from - (n - 1) * T) / n;
  const out: number[] = [];
  let y = from;
  for (let i = 0; i < n; i++) { const at = Math.round((y + clear) * 16) / 16; out.push(at); y = at + T; }
  out[n - 1] = to;
  return out;
}
```

### 8.2 Values in the fixture that are not on the concept sheet
Each of these is marked `inferred` in the file or below. Each must also be listed under "Assumptions" in `notes.md`.

| Value | Fixture | Why |
|---|---|---|
| Adjustable shelf depth placement | z from 23¼ − 22½ to 23¼ (front flush with the partitions); size 22⁷⁄₁₆ × 22½ | The sheet gives the size but not the placement. |
| Shelf clearance each side | 1/16″ | Width 22⁷⁄₁₆ in a 22⁹⁄₁₆ opening. |
| Baseboard | 5½ × ¾ on the back wall and both side walls; the thickness is approximate (the user's measurement was "maybe ¾″"); the partitions are notched over the back baseboard | The sheet gives no baseboard size. |
| Floor rail placement | in front of the baseboard (z ¾ to 1½) | The sheet does not resolve the clash between the floor rail and the baseboard. |
| 12 mm Baltic birch | modelled at its exact thickness, 12/25.4″. The drawer box fronts and backs (≈20⅝), the frame back (≈20⁵⁄₁₆) and the drawer bottoms (≈21 × ≈20⁷⁄₁₆) are therefore not exact sixteenths, and display with ≈ | The sheet says to measure the actual sides before cutting fronts and backs. |
| Drawer box vertical position | ½″ above each drawer zone's bottom | The sheet gives heights, not positions. |
| Drawer bottom fit | ¼″ grooves, 1/16″ play | Gives the sheet's 21 × 20⁷⁄₁₆. |
| Rod lengths | between sockets, ⅛″ socket allowance | Gives the sheet's 2 @ 26¼, 1 @ 27. |
| Rod backer | 6″ along z centred on the rod, 3½″ tall | The sheet gives "1×4, 6″" only. |
| Cleat placement | side cleats z ¾ to 11¼, back cleats between them | Derived from the sheet's lengths (10½, 26½). |
| Hamper placement | phase 1 z 6 to 21; phase 2 ⅛″ in front of the frame back | Taken from the section drawing. |
| Banding thickness | 0.02″ (0.5 mm), does not reduce cut size | The sheet does not subtract it. |
| Contents boxes (bins, garments) | approximate | For the drawings only. |

### 8.3 `projects/closet-built-in/notes.md` (outline)
Carry over the concept sheet's prose. It is design reasoning, not data:
- **Summary:** interior 80 × 24 × 95½; opening 48½ × 80½, no doors; returns 15¾; header 15″.
- **Why the depths are what they are:** the header and the 12″ gap; rods 12″ off the back wall; why the top shelf is not full depth.
- **The center column:** width tradeoff; drawers clear the jambs; the hamper rolls out the open left side; a hard floor is assumed.
- **Check before you cut:** returns, ceiling at four points, plumb and square, studs, outlets.
- **Extras to consider:** valet rod, felt-lined drawer, belt and tie pull-outs, hamper bags, LED strip, slide-out shelves.
- **Assumptions:** the table in 8.2.
- **Open questions:** Baltic birch sheet count (one 5×5 or two); baseboard thickness to confirm.
- **Decisions log:** dated one-liners, for example "2026-10-03: three drawers, top at 49″".

### 8.4 What evaluation must report for the fixture
In both configurations (`top=1` and `top=0.75`), evaluation reports no issues: no errors and no warnings.

The overlap check (section 6.4) is tested by deliberately breaking the fixture. Each breakage must produce exactly these `overlap` errors:
- **(a)** Widen the center nosing to span the partitions (`[pl, colR]` instead of `[C0, C1]`): `top-shelf-center-nosing` with `partition-left`, and with `partition-right`, in p1 and p2.
- **(b)** Widen the frame back to `[bx0, bx1 - BB]`: `hamper-frame-rail` with `hamper-frame-back`, in p2.
- **(c)** Remove the partitions' `notch` joint: `partition-left` and `partition-right`, each with `baseboard-back`, in p1 and p2.

All three were checked against the spike's evaluator on 2026-10-03.

---

## 9. Views and interactions

Part selection is by clicking. Hover highlighting is optional and may be added later using the same store field, `hovered`. Nothing required here, and no required test, depends on pointer movement. The `hovered` field, the `--hover` flag of `wb show`, `hover` in `Control` and `hovered` in the viewer state all belong to that later enhancement.

### 9.1 Layout
```
┌ Top bar: project ▾ │ option controls │ phase ▸ step │ ⟲ explode │ section │ in/mm │ issues: 0 ✕ 1 ⚠ ┐
├──────────────────────────────┬───────────────────────────────┬────────────────────────────────────┤
│ 3D viewport                  │ Drawing panel                 │ Side panel (tabs)                  │
│                              │ [Front][Section A][B][Plan]   │ Cut list · Sheets · Steps · Parts  │
│                              │                               │ · Checks · Notes                   │
└──────────────────────────────┴───────────────────────────────┴────────────────────────────────────┘
  Error bar (only when the current model failed): message · file:line · "showing last good model"
```
- The panes have draggable splitters. Their sizes are stored in `localStorage`, wrapped in try/catch.
- When the window is narrower than 1100 px (a VS Code editor half), the layout drops to two panes: the 3D viewport, and a tabbed pane holding Drawing, Cut list, Sheets, Steps, Parts, Checks and Notes. Below 700 px it is one tabbed pane.
- **Theme:** follows `prefers-color-scheme`. The tokens come from the reference page's palette.
- **Fonts:** Barlow Condensed (headings), Source Sans 3 (body) and JetBrains Mono (numbers), loaded from Google Fonts as the reference does, with system fallbacks.
- **Numbers** use `font-variant-numeric: tabular-nums`.

### 9.2 Top bar
- **Project picker:** lists `projects/*`.
- **Option controls:** one segmented control per option, labelled by `label`, with the choice labels as tooltips.
- **Phase selector:** a segmented control, plus a step stepper (`‹ step 3/5 ›`) when a phase is selected. "All" shows the final phase.
- **Toggles:** explode (a slider from 0 to 1.5), section (off / x / y / z, plus a position slider), in/mm display.
- **Issue counter:** opens the Checks tab.
- The URL query mirrors `project`, `opt.*`, `phase`, `step` and `view`, so reloading or bookmarking returns to the same state.

### 9.3 3D viewport
- **Scene:** every part in the current phase or step state.
  - Panels and boards are `BoxGeometry` meshes, with drei `<Edges>` at a threshold of 15°.
  - Hardware with a cylinder is a `CylinderGeometry`, rotated to its axis. Hardware with a box is a translucent box.
  - Context walls are drawn as a translucent shell, and the floor as a grid. Contents are hidden by default (toggle).
- **Colours:** per material, from theme tokens. Prefinished is light, unfinished is hatched in 2D and a slightly darker tone in 3D, hardware is grey.
- **Camera:**
  - drei `<CameraControls>`: orbit, pan, zoom.
  - Perspective by default; `O` toggles orthographic.
  - Standard views, each followed by `fitToBox` of the built parts: `1` front, `2` top, `3` left, `4` right, `5` isometric.
  - `F` frames the selection.
  - A view cube through drei `<GizmoHelper><GizmoViewcube/></GizmoHelper>`.
  - The camera is never reset by a model reload. `<Canvas>` and the controls stay mounted.
- **Picking:**
  - Pointer events on part meshes. A click sets `selected = [id]` and calls `e.stopPropagation()`. Shift-click toggles membership. A click on empty space (`onPointerMissed`) clears the selection.
  - Optional, later: `onPointerOver` sets `hovered = [id]`; `onPointerOut` clears it.
  - When a section plane is active, an intersection on the removed side of the plane must be ignored, because three.js raycasting ignores clipping planes (verified). Implement this by checking `section.distanceToPoint(e.point) < 0` and returning without `stopPropagation`, so the next intersection gets the event.
- **Highlight:**
  - Selected parts get drei `<Outlines>` and an emissive tint (`--hl-select`).
  - Optional, later: hovered parts get a lighter emissive tint (`--hl-hover`).
  - Parts of the current step are tinted `--hl-step`; earlier parts at normal colour; later parts hidden.
- **Section:**
  - `renderer.localClippingEnabled = true` (`<Canvas gl={{ localClippingEnabled: true }}>`).
  - One `THREE.Plane` shared by every part material.
  - When the drawing panel shows a section or plan view, a link icon syncs the 3D plane to that view's cut.
  - Stencil caps (three's `webgl_clipping_stencil` example) are a stretch goal within M5.
- **Explode:** each part is offset by `(centre(part) − centre(all built parts)) × k`, animated over 300 ms (respect `prefers-reduced-motion`). Context does not move.
- **Tooltip:** a small card next to the selected part shows the name and where, the size, material and phase, and `project.ts:line`. (It may also show on hover once hover highlighting exists.)

### 9.4 Drawing panel
- **Tabs:** one tab per declared view. The SVG comes from `drawView(resolved, viewId, { phase, step, display })`, recomputed when the model, phase, step or display unit changes.
- **Navigation:** wheel zoom and drag pan (a viewBox transform). Double-click fits the drawing.
- **Click:** reads `data-part` from the event target and selects. For dimensions, clicking selects both referenced parts. Shift-click toggles.
- **Caption:** shown under the drawing.
- **Hidden lines:** a toggle overrides `hiddenLines` for the session.
- **Export:** a "Copy SVG" button and a "Download SVG" button.

### 9.5 Cut list tab
- **Grouping:** rows grouped by phase heading, then a sub-table per material. Columns: Part, Qty, Size (`l × w`, thickness in the material caption), Tags (pills, styled as the reference), Notes.
- **Selection:** clicking a row selects all its members, highlighting each in 3D, the drawings and the sheets. When a part is selected elsewhere, its row is highlighted and scrolled into view.
- **Below the rows:** boards, hardware, banding totals, and the shopping list.
- **Buttons:** "Copy as text" (section 7.1 format) and "Download CSV".

### 9.6 Sheets tab
- One SVG per `Nesting` sheet, grouped by phase and material, with the purchase summary first ("Buy: 1 × 4×8, 1 × 4×4 prefinished plywood; use your 56 × 48").
- Clicking a rect selects it, by `data-part`. A strip selects all its members.
- Unplaced parts are listed in red with their reasons.

### 9.7 Steps, Parts, Checks, Notes tabs
- **Steps:** phases with numbered steps, each with its text and its part chips. Clicking a step selects its parts and sets the step state in every view. `[` and `]` step backward and forward.
- **Parts:** a table of every part (id, name, where, kind, material, size, phase, step, src). It has a filter box. Each row has an "Open in editor" link, `vscode://file/<abs path>:<line>:<col>` (inferred to work through VS Code's URL handler; the M4 smoke test confirms it).
- **Checks:** every issue and every `b.check`, with pass or fail state. Clicking an issue selects its parts.
- **Notes:** `notes.md` rendered as markdown with `marked`.

### 9.8 Selection store (`app/store.ts`)
```ts
type WbState = {
  projectId: string; config: Record<string, string>; phase: string; step: string | null;
  drawingView: string; sideTab: "cutlist" | "sheets" | "steps" | "parts" | "checks" | "notes";
  // hovered and hoverSource are optional: unused until hover highlighting is added
  hovered: string[]; hoverSource: "3d" | "drawing" | "cutlist" | "sheets" | "steps" | "parts" | "checks" | "agent" | null;
  selected: string[];
  camera: { mode: "perspective" | "orthographic" }; section: { axis: "x" | "y" | "z"; at: number; enabled: boolean };
  explode: number; display: "in" | "mm"; showContents: boolean;
  resolved: Resolved | null; lastGood: Resolved | null; error: { message: string; src?: Src } | null;
};
```
- `app/highlight.ts` subscribes to `selected` (and to `hovered`, once hover exists) and rewrites a single `<style id="wb-hl">`:
  ```css
  [data-part~="partition-left"] { --hl: var(--hl-hover); }   /* optional, later */
  [data-part~="drawer-face-2"] { --hl: var(--hl-select); }
  ```
  The SVG and table styles read `--hl`, for example `fill: color-mix(in oklab, var(--fill) 60%, var(--hl, transparent))`.
- The 3D viewport subscribes to the same fields.
- `app/sync.ts` posts `{ projectId, config, phase, step, drawingView, selected }` (plus `hovered` if hover exists) plus summaries (section 10.4) to `/__wb/state`, debounced 150 ms, but only when one of those fields changed.

### 9.9 Live reload (`app/loader.ts`)
```ts
import { useWb } from "./store.ts";
const modules = import.meta.glob("../projects/*/project.ts");
export async function loadProject(id: string) { /* import, evaluate with current config, set resolved or error */ }
loadProject(useWb.getState().projectId);
if (import.meta.hot) import.meta.hot.accept();   // re-executes this module on any project or helper change
```
This exact pattern was verified:
- an edit to a project file or to a helper it imports re-evaluates through the loader;
- there is no page reload;
- the store module is evaluated once.

Evaluate in a `try`:
- On success, set `resolved` and `lastGood`, and clear `error`.
- On failure, set `error`, keep `lastGood` and render from it.

Selection is kept by ID. IDs that no longer exist are dropped.

### 9.10 Keyboard
| Key | Action |
|---|---|
| `1` – `5` | 3D standard views |
| `O` | orthographic / perspective |
| `F` | frame the selection (all parts if none) |
| `E` | explode on/off |
| `S` | section on/off |
| `[` / `]` | previous / next step |
| `Esc` | clear selection |
| `?` | shortcut help |

Keys are ignored while a text field has focus.

---

## 10. Agent integration

### 10.1 `AGENTS.md` (outline; `CLAUDE.md` contains only `@AGENTS.md`)

1. **What this repo is.** DIY-bench, a design tool for woodworking and DIY projects. Projects live in `projects/<id>/project.ts`. A browser view shows them live. Nothing in `expected/` or `.diy-bench/` is edited by hand.
2. **The loop.**
   - The user describes a change.
   - You edit `project.ts`.
   - The `PostToolUse` hook checks your edit and prints what changed. If it fails, fix it before saying anything else.
   - Then tell the user, in one or two sentences, what changed in what they will build: parts resized, cut-list rows, sheets bought.
   - Use `./wb diff` when the hook summary is not enough.
3. **"This one", "that shelf".**
   - Every prompt may start with `[diy-bench]` lines giving what the user has selected, with the source line. (If hover highlighting is added, a hovered line follows; prefer the selection.)
   - If nothing is selected, or the state is marked stale, ask which part they mean. Do not guess.
   - If the request is ambiguous for a part generated in a loop (one of several identical shelves), say whether the change applies to one or all, and ask if unclear.
4. **Where to make a change.**
   - Change named dimensions in `P` rather than editing boxes.
   - Keep derived values derived.
   - A change to one instance of a looped part needs an explicit exception in the loop; never copy the loop body.
   - Keep IDs stable: a renamed or resized piece keeps its ID; a new physical piece gets a new ID.
   - Mark anything you assumed with `// inferred` and add it to `notes.md` under "Assumptions".
5. **Units.**
   - The project's units are in `defineProject`. Imperial values are decimal inches.
   - Round anything you compute by division to 1/16″ with `Math.round(x * 16) / 16`, or the `cut-precision` warning will fire.
   - Speak to the user in fractions (`23¼″`), never decimals.
6. **Design rules.** When the user states a requirement, add a `b.check` for it with the numbers in `detail`. Never delete a failing check to make the hook pass; tell the user.
7. **Phases, steps and options.**
   - `phase`, `removedIn`, `moves` and `cutIn` express time.
   - `options` express undecided choices.
   - Never create a second project to compare a variant; add an option.
8. **Seeing your work.**
   - `./wb render <project> --view front --out /tmp/x.png`, then read the PNG.
   - `./wb show --select id1,id2 --phase p2` points the user at something in their open viewer.
9. **Materials, stock and cost.** Ask before changing a material, a stock list or anything that changes what the user buys. Report sheet-count changes explicitly.
10. **Starting a project.** Use the `new-project` skill. It asks for measurements and creates `projects/<id>/` from the template. Never invent room measurements; use placeholders marked `// inferred` and list them as questions.
11. **Model API cheat sheet.** The builder methods and the field reference from spec section 5, condensed to one screen, with the closet's `shelfOnCleats` and drawer loop as examples.
12. **When the hook fails.** A table of invariant codes (spec section 6.4), each with its usual fix.
13. **Working on the tool itself** (`core/`, `app/`, `tools/`).
    - Run `npm test` and `npm run e2e`.
    - Golden files change only through `./wb snapshot --update <project>`, and only after you have looked at the diff and can explain each change.
    - Keep `core/` free of DOM and Node APIs.
14. **Do not:**
    - edit `.diy-bench/` or `expected/` by hand;
    - commit unless asked;
    - add dependencies without recording why;
    - silence an invariant;
    - start a second dev server (check `./wb status` first).
15. **Writing style for `notes.md` and messages to the user.** Plain sentences. Standard woodworking terms (dado, rabbet, nosing, cleat, face frame, overlay, inset, kerf, grain). No invented labels.

### 10.2 Hooks

**`UserPromptSubmit` → `.claude/hooks/selection-context.ts`**
- **Input:** the hook's stdin JSON. Only `cwd` is used.
- **What it reads:** `.diy-bench/state.json`. If the file is missing, it prints nothing and exits 0. The hook must never fail a prompt.
- **Output:** plain stdout, at most 8 lines (verified to reach the model). A `hovered:` line follows only if hover highlighting is added later:
  ```
  [diy-bench] closet-built-in · top=1 · phase p2 · view: front elevation (state 40 s old)
  [diy-bench] selected: drawer-face-2 "Drawer face" (drawer 2) · 6⅞ × 23⁵⁄₁₆ × 23/32 ply-raw · x ≈28⅜–≈51¹¹⁄₁₆ y 36–42⅞ z 23¼–≈24 · projects/closet-built-in/project.ts:193
  ```
- **Selection size:** more than 5 selected parts are summarised: `selected: 6 parts (drawer-1-side-l, …)`.
- **Staleness:**
  - If the state is older than 2 hours, it prints one line: `[diy-bench] viewer state is 3 h old; confirm which part the user means`.
  - It prints nothing at all if the state is older than 24 hours.
- **Budget:** under 100 ms. It is plain JSON reading with no evaluation, run as `node --experimental-strip-types`.

**`PostToolUse` (matcher `Edit|Write`) → `.claude/hooks/check-after-edit.ts`**
- **Input:** stdin JSON. Uses `tool_input.file_path`.
- **Scope:**
  - If the path is not under `projects/` or `core/`, exit 0 silently.
  - For `projects/<id>/…`, check that project. For `core/…`, check every project.
- **Run:** `evaluate` for every configuration (section 6.1), `nest` for the default configuration, then compare with `.diy-bench/last-good/<id>.json`.
- **On any error:**
  - Exit 2. Errors go to stderr (verified to reach the model), at most 15 lines, worst first. Format: `wb check failed: closet-built-in (top=1): ERROR overlap: p2: center-top overlaps drawer-face-3 by … — projects/closet-built-in/project.ts:224`.
  - A thrown `EvaluationError` prints its message and `src`.
- **On success:**
  - Exit 0 with `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"<summary>"}}` on stdout.
  - The summary is at most 10 lines:
    ```
    [diy-bench] closet-built-in ok in 2 configurations · no issues
    changed vs last good: partition-left, partition-right 84 → 82 tall; top-shelf-* down 2
    cut list: 2 rows changed (Partition 84 × 23¼ → 82 × 23¼); sheets: unchanged (prefinished plywood: 4×8 + 4×4)
    ```
  - Then it writes the new last-good snapshot.
- **Budget:** under 3 s for the closet; the target is under 1 s. Type checking is not part of the hook. `npm run typecheck` covers it, and runtime errors still surface through evaluation.
- **Concurrency:** if two edits land back to back, the second run sees the latest file. No locking is needed beyond an atomic write of the snapshot (write to a temporary file, then rename).

### 10.3 `.claude/settings.json`
```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "node --experimental-strip-types --disable-warning=ExperimentalWarning \"$CLAUDE_PROJECT_DIR/.claude/hooks/selection-context.ts\"" } ] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write",
        "hooks": [ { "type": "command", "command": "node --experimental-strip-types --disable-warning=ExperimentalWarning \"$CLAUDE_PROJECT_DIR/.claude/hooks/check-after-edit.ts\"" } ] }
    ]
  },
  "permissions": {
    "allow": [ "Bash(./wb *)", "Bash(npm test *)", "Bash(npm run *)", "Edit(projects/**)", "Write(projects/**)" ]
  }
}
```
The hook command format and `$CLAUDE_PROJECT_DIR` follow the hooks documentation [V]. The spike used absolute paths, so the `$CLAUDE_PROJECT_DIR` form is inferred from the docs. M8's acceptance test runs it for real.

### 10.4 `.diy-bench/state.json`
```ts
type ViewerState = {
  version: 1; updatedAt: string;                       // ISO time
  project: string; title: string; config: Record<string, string>;
  phase: string; step: string | null; drawingView: string; viewTitle: string;
  hovered?: PartSummary[]; selected: PartSummary[];       // hovered: optional, later
  issues: { errors: number; warnings: number };
  modelError: string | null;                           // when the viewer is showing the last good model
};
type PartSummary = {
  id: string; name: string; where?: string; kind: string; material?: string;
  size?: string;                                       // "6⅞ × 23⁵⁄₁₆ × 23/32", formatted in display units
  box?: Box; src?: string;                             // "projects/closet-built-in/project.ts:193"
};
```
The app computes the summaries, so the hook does no evaluation. The Vite plugin writes the file atomically (temporary file, then rename).

### 10.5 `.vscode/settings.json`
```json
{
  "workbench.panel.defaultLocation": "right",
  "workbench.browser.newTabPlacement": "activeGroup",
  "workbench.browser.autoReloadOnFileChange": false,
  "workbench.browser.openLocalhostLinks": true,
  "files.watcherExclude": { "**/.diy-bench/**": true }
}
```
All four `workbench.*` settings exist in VS Code 1.139.1 (verified in the installed bundle). `autoReloadOnFileChange` defaults to `true`; it is turned off so that HMR alone updates the page.

### 10.6 Skills
- **`.claude/skills/new-project/SKILL.md`** (`description`: "Start a new DIY-bench project from room measurements"). The steps:
  1. Ask for the project type and name.
  2. Ask for the measurement checklist for that type. For a closet or built-in: width at three heights, depth at both ends, ceiling at four points, opening width and height, return widths, wall thickness, baseboard height and thickness, plumb, square, stud locations, outlets and switches.
  3. Run `./wb new <id> --template <type>`.
  4. Fill `P` from the answers, marking unknowns `// inferred`.
  5. Write `notes.md`.
  6. Run `./wb check`.
- **`.claude/skills/review-design/SKILL.md`.** It runs:
  1. `./wb check --all-configs`
  2. `./wb render` for each view, reading every PNG
  3. `./wb cutlist`
  4. `./wb shopping`

  Then it reports to the user: failing checks, things that look wrong in the renders, sheet efficiency, and open questions from `notes.md`.

---

## 11. CLI, dev-server endpoints and the future MCP surface

### 11.1 `./wb` commands
Common flags:
- `--project <id>`: default is the only project, else the project in `.diy-bench/state.json`, else an error listing the projects.
- `--opt key=value`: repeatable; defaults to each option's default.
- `--phase <id>`: default is the last phase.
- `--json`: machine-readable output. Without it, output is human-readable and fractional.

Exit codes:
- 0: ok
- 1: model errors or failed checks of severity error
- 2: usage error
- 3: viewer not running (for `show` and `state` only)

| Command | Inputs | Output (`--json` shape) |
|---|---|---|
| `wb list` | — | `{ projects: { id, title, options, phases }[] }` |
| `wb status` | — | `{ server: { url, pid, startedAt } \| null, state: ViewerState \| null }` |
| `wb check [--all-configs] [--changed <file>] [--hook]` | project or file | `{ ok, results: { config, issues: Issue[] }[] }`. With `--hook`, behaves as in section 10.2. |
| `wb parts [--kind panel\|board\|hardware\|context] [--phase]` | — | `{ parts: { id, name, where, kind, material, size: {l,w,t}, box, phase, step, src }[] }` |
| `wb part <id>` | part id | the part, its cut-list row, its sheet placement, its joints (both directions), its step, its src |
| `wb cutlist [--phase] [--format text\|csv\|json]` | — | `CutList` (section 7.1) |
| `wb sheets [--phase] [--svg <dir>]` | — | `Nesting[]` (section 7.2). `--svg` writes one SVG per material and phase. |
| `wb shopping [--phase]` | — | section 7.5 |
| `wb diff [--against last-good\|<git-ref>\|opt:key=value]` | — | `{ parts: { added, removed, changed: { id, field, from, to }[] }, cutlist: { added, removed, changed }, sheets: { from, to } }`. `--against opt:top=0.75` compares two configurations of the current model. |
| `wb state` | — | `ViewerState` (exit 3 when the viewer has not written state in 24 h) |
| `wb show [--select ids] [--hover ids] [--phase] [--step] [--opt k=v] [--view id] [--tab name] [--frame]` | — | `{ delivered: boolean }`. Sends a `Control` to the open viewer (section 11.2). |
| `wb render --view <viewId\|3d-front\|3d-iso\|3d-top\|sheets\|cutlist> [--phase] [--step] [--opt] [--select ids] [--size 1600x1000] [--out file.png]` | — | `{ file, width, height }`. Uses the running dev server if there is one, else starts a temporary one. Headless Chrome with `channel: "chrome"`; the URL has `?render=<target>`, which shows only that panel full-window. |
| `wb export --format csv\|pdf (glb, stl, dxf, step are deferred) [--out dir] [--page letter\|tabloid] [--with-context]` | — | `{ files: string[] }` |
| `wb snapshot [--update]` | project | writes or compares `expected/` (section 13.2); exit 1 on differences without `--update` |
| `wb new <id> --template closet\|shelf\|cabinet\|blank [--title]` | — | creates `projects/<id>/` with `project.ts`, `notes.md` and `expected/`, and prints the path |

Implementation notes:
- `tools/wb.ts` uses `node:util` `parseArgs`, with no CLI library.
- It imports `core/` directly.
- It loads projects with `await import(pathToFileURL(file).href)` under type stripping.

### 11.2 Dev-server plugin (`tools/vite-plugin.ts`)
**Startup:**
- Writes `.diy-bench/server.json`: `{ url, pid, startedAt, token }`. `token` is 32 random hex characters, new on each start.
- On close, removes the file.

**Endpoints**, all on the Vite server, which listens on 127.0.0.1:

| Method and path | Who calls it | Body | Behaviour |
|---|---|---|---|
| `POST /__wb/state` | the app | `ViewerState` | Rejected unless `Origin` equals the server's own origin. Writes `.diy-bench/state.json` atomically. Returns 204. |
| `GET /__wb/state` | CLI | — | The current `ViewerState`, or 404. |
| `POST /__wb/control` | CLI | `Control` | Requires the header `x-wb-token: <token>`. Broadcasts `server.ws.send({ type: "custom", event: "wb:control", data })` [V: Vite HMR API], then waits up to 2 s for a `wb:ack` with the same `id`, sent by the app through `import.meta.hot.send`. Returns `{ delivered }`. |
| `GET /__wb/health` | CLI | — | `{ ok: true, projects: string[] }` |

The `Control` message:
```ts
type Control = { id: string; select?: string[]; hover?: string[]; phase?: string; step?: string | null;
                 config?: Record<string, string>; view?: string; tab?: string; frame?: boolean; project?: string };
```

**Why the token and Origin checks [I]:** browsers do not apply CORS to simple cross-origin POSTs in a way that prevents side effects. Without them, any web page could drive the viewer or overwrite the state file the agent trusts.

### 11.3 Future MCP server (M12, optional)
A stdio server, `tools/mcp.ts`, built on `@modelcontextprotocol/server` 2.x (v2 is the stable line; v1 `@modelcontextprotocol/sdk` 1.32 is maintenance-only [V]). Each tool wraps the same functions as the CLI:

| Tool | Input | Output |
|---|---|---|
| `get_state` | — | `ViewerState` |
| `list_parts` | `{ project?, kind?, phase?, config? }` | parts as in `wb parts` |
| `get_part` | `{ id, project?, config? }` | as `wb part` |
| `check` | `{ project?, allConfigs? }` | issues |
| `cut_list` | `{ project?, phase?, config? }` | `CutList` |
| `sheets` | `{ project?, phase?, config? }` | `Nesting[]` |
| `diff` | `{ against }` | as `wb diff` |
| `show_in_viewer` | `Control` | `{ delivered }` |
| `render_view` | `{ view, phase?, config?, select? }` | image content (PNG) |

Registered with `claude mcp add --transport stdio --scope project diy-bench -- node --experimental-strip-types tools/mcp.ts`, which writes `.mcp.json` [V: Claude Code MCP docs]. Claude Code asks for approval before first use [V].

### 11.4 `package.json` scripts
```json
{
  "dev": "vite",
  "build": "vite build",
  "typecheck": "tsc --noEmit -p .",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test",
  "wb": "node --experimental-strip-types --disable-warning=ExperimentalWarning tools/wb.ts"
}
```

---

## 12. Milestones

Each milestone is a slice a coding agent can finish in one session and verify on its own. "AC" lists the acceptance criteria. Each criterion is a command with an expected result, or a test that must exist and pass. Every milestone also requires `npm run typecheck` and `npm test` to pass, and every milestone after M0 must keep earlier milestones' tests green.

Order: M0 → M1 → M2 → M3 → M4 → (M5 and M6, in either order) → M7 → M8 → M9. M10–M12 are optional and independent of each other.

### M0. Scaffold
**Deliverables:**
- package.json, .npmrc, tsconfig.json, vite.config.ts (React plugin and an empty `diyBenchPlugin`)
- vitest config and playwright config (`use: { channel: "chrome" }`, `webServer: npm run dev`)
- the `wb` script, a `.gitignore`, a stub `AGENTS.md` and `CLAUDE.md`
- an `app/` that renders the title "DIY-bench"

**AC:**
- `npm install` succeeds. `npm ls` shows the exact versions from section 3.
- `npm run typecheck` exits 0.
- `npm test` runs one placeholder test, which passes.
- `./wb list` prints `no projects` and exits 0.
- `npm run dev` serves on `http://127.0.0.1:5180`, and `curl -s` on that URL returns HTML containing "DIY-bench".
- `npm run e2e` opens the page in Chrome and finds the title.

### M1. Model, units, evaluation, invariants; the closet fixture
**Deliverables:** in `core/`: `model/`, `units.ts`, `geometry.ts`, `evaluate.ts`, `invariants.ts`. Also `projects/closet-built-in/project.ts` (section 8.1 verbatim), its `notes.md` (section 8.3), and the commands `./wb check`, `./wb parts` and `./wb part`.

**AC:**
- **Units tests:** a table test of at least 30 cases, covering every example in section 5.6 and these parse inputs:
  - `2' 3-1/2"` → 27.5
  - `23¼` → 23.25
  - `590mm` in an inch project → 23.228…
  - an invalid string throws, naming the input
- **Builder tests:** a duplicate id, a non-kebab id and a reversed range each throw. The test file's own call sites resolve to the right `src.line`.
- **Invariant tests:** for every code in section 6.4, a minimal project that triggers it and one that does not.
- **Evaluation tests:** the phase-state rules (`moves`, `removedIn`, `cutIn`) and step states, on a three-part synthetic project.
- **Fixture command:** `./wb check --project closet-built-in --all-configs` exits 0. In both configurations it reports no issues.
- **Fixture assertions:** every value in section 13.1 under "Model" is asserted by `tests/unit/closet.test.ts`.
- **Overlap-check regression test:** a test copies the fixture into a temporary directory and makes each of the three breakages in section 8.4. It asserts the `overlap` errors named there for each.
- **`./wb part drawer-face-2 --json`** returns `src` ending in `projects/closet-built-in/project.ts:193:9`.

### M2. Cut list, shopping list, CSV and text
**Deliverables:** `core/cutlist.ts`, `core/shopping.ts`, `core/export/csv.ts`, and the commands `./wb cutlist` and `./wb shopping`.

**AC:**
- `./wb cutlist --project closet-built-in --json` contains every row in section 13.1 "Cut list". The test matches rows by name, size, quantity and tags.
- Banding total is 257⅞″.
- Hardware rows: rods 3 (notes "2 @ 26¼, 1 @ 27"), rod sockets 3 pairs, shelf pins 12, rolling hamper 1, slides 4 pairs, pulls 4.
- The strip row "Strip for the phase 2 faces" is 48⅝ × 23⁵⁄₁₆ in phase 1, with the 4 members.
- The `--format text` output matches the golden file `expected/cutlist.top=1.txt`.
- The CSV parses back into the same row count.

### M3. Sheet layouts
**Deliverables:** `core/nesting.ts`, `sheetSvg`, and the command `./wb sheets`.

**AC:**
- **Closet, default configuration:** sheet assignments as in section 13.1 "Sheets". The tests assert which stock each part lands on, not coordinates.
- **Closet, `top=0.75`:** the same purchases.
- **Property test:** 300 seeded random part sets, 1–30 parts, mixed locked and free, with 1–3 stock types and owned pieces. For every result:
  - placements are inside their sheet;
  - placements do not overlap, kerf included;
  - locked parts are not turned;
  - the layout is guillotine-separable (section 7.2);
  - every part is either placed or listed as unplaced with the right reason.
- **Timing:** the closet takes under 50 ms in total.
- **Golden files:** `expected/sheets.<config>.json` and `expected/sheets.<config>.<phase>.<material>.svg`.

### M4. App shell, live loop, side panels, state sync
**Deliverables:**
- `app/`: layout, top bar (project, options, phase), store, loader, sync, highlight stylesheet
- panels: Cut list, Sheets, Parts, Checks, Notes
- the error bar
- the `tools/vite-plugin.ts` endpoints `/__wb/state` and `/__wb/health`, and `.diy-bench/server.json`

**AC (Playwright tests):**
- **Live edit:** writing a changed `project.ts` (partition height 84 → 82) updates the Partition row to `82 × 23¼` within 2 s. `window.__wbLoadCount` stays 1, so there was no full reload.
- **Syntax error:** a syntax error shows Vite's overlay. Restoring the file recovers, again with no reload.
- **Thrown error:** a `throw` inside `build` shows the error bar with the message and `project.ts:<line>`. The cut list keeps showing the last good model.
- **Cross-selection:**
  - Clicking the Partition row gives both partition rects in the Sheets SVG a computed style that differs from the unselected state.
  - Clicking a sheet rect highlights its cut-list row.
- **Selection sync:** clicking a Parts-table row writes `.diy-bench/state.json` within 1 s. Its `selected[0].id` matches and `src` is present.
- **Same-origin rule:** `POST /__wb/state` with a foreign `Origin` returns 403.
- **Manual smoke test** (recorded in README under "Verified on"): open the app in VS Code's integrated browser through `workbench.browser` (or the "Open in integrated browser" link) with the panel on the right. Check that it renders, that editing `project.ts` updates it, and that the `vscode://file/…` link from the Parts table opens the file at the line.

### M5. 3D viewport
**Deliverables:** `Viewport3D.tsx` with parts, edges, picking, highlight, camera controls, standard views, orthographic toggle, the view cube, phase and step visibility, explode, the section plane with filtered picking, and the tooltip.

**AC (Playwright; the app exposes `window.__wb` in dev builds with `meshes`, `camera`, `section` and `project(id)` returning the screen point of a part's centre):**
- Clicking at `project("partition-left")` sets `selected` to `["partition-left"]`.
- Clicking the Partition row in the cut list gives both partition meshes the selection tint (`--hl-select`).
- At phase p2, with a section that keeps z < 10, clicking at `project("hamper-face")` never yields `selected` containing `hamper-face`. The face spans z 23¼ to 23³¹⁄₃₂ (23¼ + 23/32), so it is entirely clipped. This mirrors the spike's verified trap: unfiltered raycasts return clipped parts.
- Across a model edit, the camera position and target are unchanged (compared with 1e-9 tolerance), and `selected` is kept.
- At phase `p1`, no p2 part has a visible mesh, and `center-shelf-adj-3` is at y 55¾. At `p2` it is at 59⅝, and adj-1 and adj-2 are absent.
- Explode at k = 1 moves `partition-left`'s mesh by `(centre − assembly centre)`, within 1e-6.
- Key `1` sets a front view: the camera direction is (0, 0, −1) within 1e-3. `O` switches to orthographic.

### M6. Drawings
**Deliverables:** `core/drawings/*` (the view mapping, classification, visible and hidden segments, sections and hatching, veil, contents, dimensions, labels, the SVG writer) and `DrawingPanel.tsx`.

**AC:**
- **Orientation tests:**
  - In `front`, `partition-left`'s rect has a smaller SVG x than `partition-right`'s.
  - In `section-a` (look `+x`), the `wall-back` cut is left of everything.
  - In `plan` (look `-y`), `wall-back` is above (smaller SVG y than) the partitions.
- **Hidden-line unit tests** on synthetic setups:
  - two boxes side by side: no hidden segments;
  - a small box fully in front of a large one: the large box's covered edges hidden, the small box's all visible;
  - a shelf butting a partition: the coincident edge is visible once;
  - joint-overlapping boxes: neither occludes the other.
- **Section tests:**
  - In `section-b` (cut at x 40), `center-shelf-fixed` and `center-top` are classified as cut, and `partition-right` as beyond.
  - In `plan` (cut at y 45), `partition-left` is cut, and `top-shelf-left` is removed.
- **Element coverage:** every part that is visible in a view's phase state has at least one element with its id in `data-part`.
- **Front-view dimensions:** the `front` view has 9 `g.dim` elements. Their texts include `80`, `28`, `24`, `28`, `15¾`, `48½ opening`, `15¾`, `95½`, `80½ opening`. `data-part` on the third is `"partition-left partition-right"`.
- **Golden SVGs:** for the 4 closet views × phases p1 and p2 × the default configuration (`expected/view.<id>.<phase>.svg`). They are deterministic: two runs give byte-identical output.
- **E2E:**
  - clicking a drawing rect selects and tints the mesh;
  - clicking a dimension selects both referenced parts in 3D;
  - when a section view is shown with sync on, the 3D section plane matches its cut.

### M7. Phases, steps, options, compare
**Deliverables:** the Steps panel, the step stepper, option controls, compare mode (`core/diff.ts`, `./wb diff`), and URL state.

**AC:**
- **Steps:** the Steps panel lists 2 phases and 9 steps. Clicking step `p2-frame` sets the step state and selects `hamper-frame-side`, `hamper-frame-rail` and `hamper-frame-back`. At step `p1-stand`, the 3D view shows the parts of `p1-bench` (none), `p1-cleats` and `p1-stand`, and no top shelves.
- **Compare:** `./wb diff --project closet-built-in --against opt:top=0.75 --json` reports:
  - changed: `center-top` thickness 1 → ¾ (y from 49 to 50 becomes 49 to 49¾), and material `hw-1in` → `hw-34`;
  - `center-shelf-adj-3`'s p2 position 59⅝ → 59½;
  - cut list: the Hardwood top row moves from Hardwood 1″ to Hardwood ¾″;
  - unchanged sheet purchases.
- **URL state:** switching the option control in the UI updates the URL. Reloading restores the option, phase and view.

### M8. Agent integration
**Deliverables:**
- `.claude/settings.json`, both hooks, the full `AGENTS.md` (section 10.1) and both skills
- the commands `./wb state`, `./wb status`, `./wb show` and `./wb render`
- `/__wb/control` with its token and ack
- `.vscode/settings.json`, `tasks.json` and `extensions.json`

**AC:**
- **Selection hook tests** (`tests/hooks.test.ts`) feed it a fixture `state.json`:
  - a fresh state prints the exact two-line format of section 10.2;
  - a state 3 h old prints the stale line;
  - a state 25 h old or a missing file prints nothing;
  - it runs in under 300 ms, measured.
- **Check hook tests:**
  - On a temporary copy of the closet with an overlap introduced, it exits 2. Stderr contains `overlap` and `project.ts:`.
  - On the valid closet, it exits 0 with stdout JSON whose `hookSpecificOutput.additionalContext` starts with `[diy-bench] closet-built-in ok`.
  - After changing `partitionHeight` to 82, the summary mentions `partition-left` and `84 → 82`.
  - A full run on the closet takes under 3 s.
- **`./wb show`:** with the dev server running, `./wb show --select partition-left --phase p1` returns `{ "delivered": true }`, and the viewer's store matches. With the server stopped, it exits 3.
- **`./wb render`:** `./wb render --view front --out /tmp/front.png` writes a PNG at least 1200 px wide, and its centre pixel region is not uniform.
- **Live test** (skipped unless `RUN_CLAUDE_TESTS=1`): `claude -p` with `--model haiku`, in a temporary copy of the repo, replicating the two hook spikes in `spikes/hook/`. It asks which part is selected, and asserts the answer contains the id from the state file.

### M9. Exports
**In scope now (printed plans and cut list)**

**Deliverables:** the PDF plan set in `tools/render.ts`, and `./wb export --format csv|pdf` (the CSV and text cut list come from M2).

**AC:**
- **PDF:** the page count equals 1 title page + views + cut list + sheets + steps. The extracted text (via `pdftotext` if present, else `pdfjs-dist` in the test) contains "CUT LIST" and "Closet Built-In".
- **CSV:** `./wb export --format csv` writes the same file as `./wb cutlist --format csv`.

**Deferred until needed.** GLB, STL, DXF and STEP are not required now. The user prints plans and has no CNC; DXF waits until a CNC or cutting service is used (D19). Their specs stay in section 7.6, and the deliverables and criteria below stay as written for when they are needed.

**Deliverables (deferred):** `glb.ts`, `stl.ts`, `dxf.ts`, `step.ts`, and their `./wb export` formats.

**AC (deferred):**
- **GLB:** passes `gltf-validator` with 0 errors. It has one node per built part, named by id, with `extras.material` present.
- **STL:** one file per part, with 12 triangles per box part.
- **DXF:**
  - The text contains `$INSUNITS` with value 1.
  - Each part file has exactly one closed LWPOLYLINE on layer `OUTLINE`, with vertices matching the cut size.
  - Each sheet file has one polyline per placement.
- **STEP:** it has `PRODUCT('closet-built-in'` and one `PRODUCT('<id>'` per built part. Re-importing in build123d (`spikes/kernel` venv, `import_step`) yields as many solids as parts, with the same bounding boxes within 1e-4.

### M10 (optional). Features and the mesh kernel
**Deliverables:**
- `PanelSpec.features?: Feature[]` with types `dado`, `groove`, `rabbet`, `notch` (each a box in world coordinates, plus a `with` part id), `holes` (face, rows, spacing, diameter, depth), and `pocket-screws` (positions, for steps and DXF only).
- Rendering through manifold-3d, with `runOriginalID` mapped to `partId#featureId`.
- A machining list in the cut list.
- DXF layers.
- STEP for featured parts through Replicad, loaded on demand.

**AC:**
- **Closet holes:** the closet's partitions gain shelf-pin holes in two rows, 27″ to 68″ (spacing is an open question for the user; default 1¼″, `// inferred`).
- **Feature selection:** clicking a hole row in the machining list highlights only those faces in 3D. The test checks that the highlighted triangle count equals the holes' triangle count.
- **Budget:** manifold evaluation of the closet stays under 200 ms.

### M11 (optional). Single-window mode with an embedded terminal
**Deliverables:**
- A fourth column with xterm.js 6 (`@xterm/xterm`, `@xterm/addon-fit`) and node-pty 1.2.0-beta (pinned; 1.1.0 is broken on macOS), over a WebSocket on 127.0.0.1.
- The connection checks `Origin` and requires the token from `server.json`.
- Key handling: Ctrl+J and Shift+Enter send a newline; `macOptionIsMeta` is on; a bell triggers a browser notification.
- The column is off by default (`?terminal=1`).

**AC:**
- `claude` starts in the pane, renders, and accepts a prompt.
- Resizing the column resizes the pty.
- A connection with a wrong token or a foreign `Origin` is refused.

### M12 (optional). MCP server
**Deliverables:** `tools/mcp.ts` with the tools in section 11.3, and README instructions for `claude mcp add`.

**AC:**
- An SDK client test lists the tools.
- `get_part` returns the same JSON as `./wb part`.
- `render_view` returns an image content block.

---

## 13. Verification and testing

### 13.1 The closet fixture: expected values
All values are for the default configuration (`top=1`) unless marked. They were verified with the spike's evaluator on the 2026-10-03 closet (section 8). The second configuration is `top=0.75`.

**Model**
- Built parts: 58 (33 panels, 17 boards, 8 hardware). Context parts: 17 (room, baseboard and contents). Steps: 9. Checks: 6. Views: 4.
- Built parts in the phase state: p1 33, p2 56, in both configurations.
- Issues: none, in both configurations.
- `center-top`:
  - `top=1`: y 49 to 50, material `hw-1in`;
  - `top=0.75`: y 49 to 49¾, material `hw-34`.
- `center-shelf-adj-*`:
  - p1: 28, 42, 55¾;
  - p2: adj-1 and adj-2 removed; adj-3 at 59⅝ (`top=1`) or 59½ (`top=0.75`).
- `drawer-face-2` has `src` `project.ts:193:9`.

**Cut list** (finished sizes; length along the grain × width × thickness; thickness is displayed by the rule in section 5.6)

| Cut phase | Material | Qty | Name | Size | Tags |
|---|---|---|---|---|---|
| p1 | 23/32″ prefinished | 2 | Partition | 84 × 23¼ × 23/32 | band front |
| p1 | 23/32″ prefinished | 1 | Center fixed shelf | 22⁹⁄₁₆ × 23¼ × 23/32 | band front |
| p1 | 23/32″ prefinished | 3 | Center adjustable shelf | 22⁷⁄₁₆ × 22½ × 23/32 | band front |
| p1 | 23/32″ prefinished | 1 | Right 70″ shelf | 11¼ × 28 × 23/32 | cut to fit; grain free |
| p1 | 23/32″ unfinished (owned) | 2 | Top shelf | 28 × 11¼ × 23/32 | Behind the header; only the underside shows; cut to fit |
| p1 | 23/32″ unfinished (owned) | 1 | Center top shelf | 24 × 11¼ × 23/32 | Behind the header; cut to fit |
| p1 | 23/32″ unfinished (owned) | 2 | Nailer | 22⁹⁄₁₆ × 3½ × 23/32 | hidden; grain free |
| p1 | 23/32″ unfinished (owned) | 1 | Strip for the phase 2 faces | 48⅝ × 23⁵⁄₁₆ × 23/32 | (strip of hamper face, drawer faces 1–3) |
| p1 | Hardwood nosing | 3 / 1 | Shelf nosing | 28 / 22⁹⁄₁₆ × 1½ × ¾ | |
| p1 | 1×4 | 6 | Side cleat | 10½ × 3½ × ¾ | hidden |
| p1 | 1×4 | 1 | Floor rail | 22⁹⁄₁₆ × 3½ × ¾ | hidden |
| p1 | 1×4 | 1 | Rod backer | 6 × 3½ × ¾ | hidden |
| p1 | 1×2 | 3 | Back cleat | 26½ × 1½ × ¾ | hidden; cut to fit |
| p2 (cut p1) | 23/32″ unfinished (owned) | 1 | Hamper face | 27⅝ × 23⁵⁄₁₆ × 23/32 | needs finish; from strip |
| p2 (cut p1) | 23/32″ unfinished (owned) | 1 each | Drawer face | 7⅞, 6⅞, 5⅞ × 23⁵⁄₁₆ × 23/32 | needs finish; from strip |
| p2 | 12 mm Baltic birch | 1 | Hamper frame side | 21 × 26½ × 12 mm | hidden |
| p2 | 12 mm Baltic birch | 1 | Hamper frame back | ≈20⁵⁄₁₆ × 26½ × 12 mm | hidden |
| p2 | 12 mm Baltic birch | 2 each | Drawer box side | 21 × 6½, 5½, 4½ × 12 mm | hidden |
| p2 | 12 mm Baltic birch | 2 each | Drawer box front or back | ≈20⅝ × 6½, 5½, 4½ × 12 mm | hidden |
| p2 | ¼″ plywood | 3 | Drawer bottom | ≈21 × ≈20⁷⁄₁₆ × ¼ | hidden; grain free |
| p2 | Hardwood 1″ | 1 | Hardwood top | 22⁹⁄₁₆ × 24 × 1 | |
| p2 | Hardwood ¾″ | 1 | Hamper frame top rail | 21 × 3 × ¾ | hidden |

With `top=0.75`, the Hardwood top row is 22⁹⁄₁₆ × 24 × ¾ under Hardwood ¾″.

Banded front edges total 257⅞″.

Hardware: rods 3 (2 @ 26¼, 1 @ 27), rod sockets 3 pairs, shelf pins 12, rolling hamper 1 (19½ W × 15 D × 23 H max), slides 4 pairs, pulls 4.

**Sheets**

| Phase | Material | Stock | Parts on it |
|---|---|---|---|
| p1 | 23/32″ prefinished | 4×8 (buy) | partition-left, partition-right, shelf-right-70 (turned) |
| p1 | 23/32″ prefinished | 4×4 (buy) | center-shelf-fixed, center-shelf-adj-1, -2, -3 |
| p1 | 23/32″ unfinished | owned 56×48 | the faces strip (48⅝ × 23⁵⁄₁₆), top-shelf-left, top-shelf-right, top-shelf-center, nailer-top, nailer-70 |
| p2 | 12 mm Baltic birch | 5×5 (buy), two sheets | first: hamper-frame-side, hamper-frame-back, drawer 1 and 2 boxes, drawer-3-front and -back; second: only drawer-3-side-l and drawer-3-side-r |
| p2 | ¼″ plywood | 4×4 (buy) | the 3 drawer bottoms |

Phase 1 still matches the concept sheet's layout. Phase 2 Baltic birch differs: the concept sheet says one 5×5, which was true before the frame was raised to 27″. It stays two sheets even with the frame panels grain-free (open question in section 15). `top=0.75` gives the same purchases.

### 13.2 Golden files
`projects/<id>/expected/` holds, per configuration:
- `resolved.<config>.json`: parts with boxes per phase, and issues.
- `cutlist.<config>.json` and `.txt`.
- `sheets.<config>.json` and the sheet SVGs.
- `view.<viewId>.<phase>.svg` for every declared view and phase.

`<config>` is `key=value` pairs joined by `,`, for example `top=1`.

`tests/golden.test.ts` evaluates every project in every configuration and compares the results byte for byte. On a difference, it fails and prints a unified diff of the first 40 lines. `./wb snapshot --update` rewrites the files. AGENTS.md requires the agent to explain each changed line before updating.

### 13.3 Test layers
| Layer | Tool | Runs |
|---|---|---|
| Unit (core) | vitest | `npm test`, every milestone |
| Golden | vitest | `npm test` |
| Property (nesting) | vitest with a seeded PRNG (the reference's LCG) | `npm test` |
| Hooks | vitest, spawning the hook scripts | `npm test` |
| Browser | Playwright, `channel: "chrome"`, `webServer: npm run dev` on a test port | `npm run e2e` |
| Live agent | `claude -p --model haiku` | only with `RUN_CLAUDE_TESTS=1` |
| Manual | VS Code integrated browser smoke test (M4), STEP opened in FreeCAD (M9) | recorded in README "Verified on" |

### 13.4 Smoke test before any hand-off
`npm run typecheck && npm test && npm run e2e && ./wb check --all-configs` must all pass.

---

## 14. Risks

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| r3f, React, three and postprocessing version coupling (r3f 9.8.1 needs `react <19.4`; postprocessing caps `three <0.187`) | medium | an upgrade breaks the 3D view | Exact pins; upgrade only deliberately with the full e2e suite. If it hurts, fall back to plain three.js in the viewport (the spike shows it is about 100 lines). |
| VS Code integrated browser WebGL is slow or misbehaves; a VS Code update changes its behaviour | low–medium | the main layout degrades | The M4 smoke test; Chrome beside the terminal works the same; `autoReloadOnFileChange: false` is set. |
| Claude Code changes hook semantics | low | selection or edit checks stop reaching the model | The hook tests (M8) and an optional live test; the behaviour was verified on 2.1.288. |
| Hook latency makes every edit feel slow | low | agent friction | Budget under 3 s, with a test; no type checking in the hook; evaluation is milliseconds. |
| Auto-generated drawings are less legible than the hand-made sheet (label collisions, dimension crowding) | medium | the user goes back to hand-made pages | Dimensions and labels are declared per view with `dx`/`dy`; golden SVGs make changes reviewable; collision avoidance is a later improvement. |
| Box-only geometry cannot express a future project (curves, angles) | medium over time | blocked projects | M10 adds features through manifold-3d; Replicad or build123d for exact non-box geometry (D13). |
| The packer is weak on larger jobs | low for closets | wasted plywood | The strategy search; the `--optimise` path through PackingSolver (D8). |
| The agent edits a looped part's instance wrongly, or breaks ID stability | medium | wrong cut list | AGENTS.md rules; the hook's change summary shows renamed or removed IDs; golden files. |
| A stale selection misleads the agent ("this one" means something selected an hour ago) | medium | wrong part changed | Timestamps and staleness lines; AGENTS.md says to ask when unclear. |
| Material is bought at a different thickness than modelled | low | parts collide or gaps appear | Resolved for the closet: 23/32″ plywood and 12 mm Baltic birch are modelled at their real thicknesses (D21). Thickness lives on the material, so one change ripples if the stock changes; the `thickness` invariant catches a mismatch. |
| The local dev server can be driven by other pages | low | state file poisoned | Bind to 127.0.0.1, same-origin check on `/__wb/state`, token on `/__wb/control`. |
| Concept-sheet inconsistencies get copied into the model | medium | wrong parts | Invariants found three in the earlier closet model; the sheet has since adopted the fixes, and section 8.4 keeps them as a regression test. Encode design rules as `b.check`. |

---

## 15. Open questions for the user

Only questions the user alone can answer. Each has a default that the spec assumes until it is answered.

1. **Baltic birch sheet count.** The 12 mm Baltic birch needs two 5×5 sheets; the second holds only the two sides of drawer 3. The concept sheet says one. Buy a second 5×5, or change something to fit one sheet? Default: two sheets, as the model computes.
2. **Baseboard thickness.** The model uses 5½ × ¾ on the back and side walls, from your "maybe ¾″". Please confirm the thickness. Default: ¾″.
3. **Shelf-pin spacing**, for the partitions' holes in M10. Default: 1¼″, marked `// inferred`.
