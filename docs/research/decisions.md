# Decisions

Each entry gives the decision, the reasoning, the alternatives rejected and why, and what would make us revisit it. Evidence marks follow `research.md`: **[V]** verified from a source, **[S]** verified by a spike in `spikes/`, **[I]** inference.

---

## D1. The source of truth is a domain model of parts, not a CAD kernel

**Decision.** A project is a TypeScript module that builds a list of parts. Most parts are axis-aligned boxes (panels, boards). Some are hardware, with optional box or cylinder geometry. Some are context (walls, floor, contents). Each part carries woodworking metadata: material, grain axis, banded edges, exposure, finish, phase, step, joints. Every derived output is computed from that list: the 3D scene, drawings, cut list, sheet layouts, build steps and exports. A geometry kernel is optional and arrives later (D13). It never holds the truth.

**Reasoning.**
- The work is rectangular sheet goods. The closet encodes as 58 parts, every one a box or a rod. It evaluates in 3–12 ms, and its cut list and sheet layouts match the hand-made concept sheet [S: `spikes/fixture`].
- A domain model holds what a kernel cannot: grain, banding, finish, exposure, phase, which piece of stock a part comes from. No kernel knows what a panel is. Every woodworking precedent builds its cut list as a side channel: OpenSCAD `echo()` parsing, FreeCAD's `getDimensions`, OpenCutList reading SketchUp attributes [V].
- Part identity is lost through kernel projection. build123d's hidden-line SVG is two anonymous groups of lines [S]. Cross-highlighting needs an ID on every drawn element.
- Encoding the closet as boxes with an overlap check found three real problems in the concept sheet [S: `research.md`, "Discrepancies"]. That is the kind of check the domain model makes cheap.

**Rejected.**
- *A general B-rep kernel as the source of truth* (build123d, CadQuery, Replicad, FreeCAD). They are Python-only (build123d, CadQuery, FreeCAD) or a 22 MB wasm (Replicad) [S]. The metadata would sit beside the geometry anyway. Projections lose part IDs [S]. Fast-moving APIs make agent edits less reliable [V: build123d 0.12 release notes].
- *OpenSCAD.* Agents write it well [V: P3D-Bench], but it has no STEP export, no hidden-line drawings and no metadata [V].
- *Zoo KCL.* The geometry engine is closed and cloud-only [V].

**Revisit if.** Projects become mostly non-rectangular: curved parts, angled cuts, compound miters, lots of joinery. At that point make the kernel layer (D13) carry more of the geometry, but keep part metadata in the domain model.

---

## D2. The model is written in TypeScript, with a small builder API, one module per project

**Decision.** Each project is `projects/<id>/project.ts`. It exports `defineProject({...})` holding id, title, units, options, phases, materials, banding, a hardware catalogue, and a `build(b, opt)` function. Named dimensions sit in a plain `const P = {...}` at the top of the file. Derived values are ordinary expressions and helper functions in `build`. The builder's methods (`b.panel`, `b.board`, `b.hardware`, `b.context`, `b.step`, `b.check`, `b.view`) record each call's source file and line.

**Reasoning.**
- Plain text, diffable, parametric through ordinary code: loops for repeated parts, `if` for options, functions such as `evenShelves()` for derived layouts. The reference page was already written this way, in JavaScript constants and helpers.
- Agents edit TypeScript fluently, and the type checker catches wrong field names before evaluation does. The fixture type-checks under TypeScript 7.0.2 with `strict`, `erasableSyntaxOnly` and `verbatimModuleSyntax` [S].
- One file runs everywhere:
  - In the browser it is loaded through Vite.
  - In Node, for the CLI and hooks, it runs with no build step through `--experimental-strip-types` [S, Node 22.15.1].
  - Type stripping keeps positions, so `new Error().stack` gives each part's exact line and column [S]. The agent can be told "this part is defined at `project.ts:92`".

**Rejected.**
- *JSON or YAML with an expression language.* Diffable, but derived values need a second language. Repetition (shelves, drawer boxes) turns into either verbose data or templating.
- *Python* (to sit next to build123d). It would split the code: the browser views need JavaScript anyway, and the live loop would cross a process boundary.
- *A visual editor writing the model.* Not wanted; the agent and the user's words are the editor.

**Constraints that follow.**
- Imports must carry explicit `.ts` extensions, because Node requires them [S].
- Only erasable TypeScript syntax: no enums, no namespaces.
- The repo sets `"type": "module"`.

**Revisit if.** The user wants to edit parameters by dragging in the UI, which needs safe round-tripping from UI to source. That would call for parameters in a separate JSON file the UI can write, which `P` could be loaded from.

---

## D3. Coordinates and units

**Decision.**
- **Axes:** x runs from the left wall to the right, as seen facing the back wall. y runs up from the floor. z runs out from the back wall toward the room. This is three.js's own convention, so the scene uses model coordinates unchanged [S: live spike].
- **Model unit:** each project declares `units: "in" | "mm"`, and every number in it is in that unit. Imperial projects use decimal inches.
- **Display:**
  - Imperial values show as whole inches plus a fraction rounded to 1/16″. Halves, quarters and eighths use the single-character fractions (`23¼`). Sixteenths use superscript and subscript digits (`1⁵⁄₁₆`), as the reference does.
  - A value that is not a multiple of 1/16 gets a `≈` prefix.
  - A part's thickness is displayed from its material: to 1/32″ when the material thickness is a multiple of 1/32 (`23/32`), and in the material's `thicknessLabel` when it has one (`12 mm` for metric stock). So 23/32″ plywood does not print as `≈¾`, and 15/32″ plywood does not print as `≈½` (spec.md section 5.6).
  - Metric shows millimetres to 0.5 mm.
  - The UI can switch display units independently of the model unit.
- **Input parsing** (CLI and UI): accepts `23 1/4`, `23-1/4`, `23.25`, `23¼`, `2' 3-1/2"` and `590mm`.

**Reasoning.**
- Every multiple of 1/16 (any power-of-two fraction) is exact in IEEE-754 doubles. Adding and subtracting sixteenths therefore never drifts, and the model can use plain numbers [I: standard floating-point property; consistent with every fixture value printing exactly [S]].
- Only division produces values that need rounding. `evenShelves()` shows the intended pattern: round deliberately to 1/16 in the model, so cut sizes are always buildable.

**Rejected.**
- *Storing millimetres internally for imperial projects.* That converts every value the user said in inches.
- *Rational-number arithmetic* (Fraction.js). Unnecessary given the exactness above.
- *A units library* (mathjs). Heavy, and it has no fractional-inch display [V].

**Revisit if.** A project needs angles or curves where 1/16 rounding of derived values becomes visible. Then add a tolerance setting for the `≈` mark.

---

## D4. Stable part IDs, and every rendered thing carries them

**Decision.**
- **IDs:**
  - Every part has a human-chosen `id`: kebab-case, unique per project, stable for the life of the physical piece (`partition-left`, `drawer-2-side-r`). The builder rejects duplicates and IDs that are not kebab-case [S].
  - Features inside a part, when they arrive (D13), are addressed as `partId#featureId`. Dimensions are addressed as `dim:<viewId>:<index>`.
- **Labels:**
  - `name` is what the cut list shows. Interchangeable parts share a name ("Partition").
  - `where` tells instances apart ("left").
- **Tagging:** every rendered element carries `data-part` with one or more space-separated IDs: SVG elements in drawings and sheet layouts, cut-list rows, step items. Meshes carry `userData.partId`.

**Reasoning.**
- One attribute on everything lets a single CSS rule highlight a part across all 2D views: `[data-part~="partition-left"]`. One store field drives the 3D tint. The spike did exactly this across 3D, SVG and a table [S].
- Human-chosen IDs read well in agent conversation ("drawer-face-2") and survive edits. Generated IDs would change when the model is reordered.

**Rejected.**
- *Generated IDs* (hashes or indices): unstable across edits.
- *Names as IDs:* names repeat across instances, and the user may want to rename.

**Revisit if.** Projects grow past a few hundred parts and ID collisions become a nuisance. Then add namespacing by assembly (`center/drawer-2/side-r`).

---

## D5. All derived outputs come from one pure evaluation

**Decision.** `core/` is a set of pure TypeScript modules with no DOM. They run identically in the browser and in Node:
- `evaluate(project, config)` returns a resolved model: parts with phase states, steps, checks, views and issues.
- Pure functions over it produce:
  - `cutList()`
  - `nest()` (sheet layouts)
  - `drawView()` (SVG)
  - `buildSteps()`
  - `shoppingList()`
  - the exporters

The browser recomputes on every model change. The CLI and hooks call the same functions.

**Reasoning.**
- One code path means the agent's CLI view and the user's screen cannot disagree.
- Evaluation and nesting take milliseconds [S: 3–12 ms evaluation, 1–3 ms nesting per material], so nothing needs caching or a worker.

**Rejected.**
- *A server that evaluates and pushes results to the browser*, which is ocp_vscode's design [V]. It adds a process and a protocol for no gain at this size.

**Revisit if.** A project's evaluation passes about 100 ms, for example because kernel features (D13) are involved. Then move evaluation into a Web Worker. Moving it to a server is not needed.

---

## D6. 3D view: three.js through react-three-fiber and drei

**Decision.**
- **Stack:** React 19, `@react-three/fiber` 9, `@react-three/drei` 10 and `three` r186, with shared UI state in `zustand` 5.
- **Parts:** boxes become `BoxGeometry` meshes with `<Edges>`.
- **Highlight:** hover is an emissive tint; selection adds drei `<Outlines>`.
- **Camera:** perspective orbit by default, with an orthographic toggle, standard views and fit-to-bounds through drei `<CameraControls>`.
- **Sections:** section planes are `material.clippingPlanes`, with stencil caps as a later improvement.
- **Phases:** a phase or step selector changes which parts are visible and where they sit.
- **Explode:** each part is offset by `(part centre − assembly centre) × k`.

**Reasoning.**
- three.js has every primitive needed and the largest ecosystem [V].
- r3f makes the scene a function of state. Hovering a cut-list row and hovering a mesh write the same store field. Keeping `<Canvas>` mounted keeps the camera across model reloads. The same was shown with plain three.js [S].
- Prefer React because the panels around the scene (tables, steps, controls) are ordinary UI that agents build well in React.
- **Verified trap:** `Raycaster` ignores clipping planes. Picks must be filtered by plane distance [S]. In r3f this means a custom `raycast` on clipped meshes, or checking `e.intersections` against active planes before calling `stopPropagation`.

**Rejected.**
- *three-cad-viewer.* It is complete, but highlighting cannot be driven from outside without patching internals, it has its own UI, and it pins its own three version [V].
- *Babylon.js.* Capable, but no advantage here and a smaller React story [V/I].
- *Plain three.js without React.* It works, as the spike shows [S], but the surrounding UI would be hand-rolled.
- *xeokit.* AGPL, own renderer [V].

**Revisit if.** React 19/r3f version coupling becomes painful: r3f 9.8.1 requires `react >=19 <19.4`, and postprocessing caps `three <0.187` [V]. In that case drop to plain three.js for the viewport, keeping React for the panels. The user confirmed React on 2026-10-03, so a switch to Svelte is no longer on the table.

---

## D7. Drawings: our own projection of boxes to SVG, with our own dimensioning

**Decision.** `core/drawings/` turns a view declaration into SVG. Views are declared in the project with `b.view`; a view is an elevation, section or plan, with a look direction, a cut position for sections and plans, veil parts, dimensions and labels.
- **Fills:** parts are drawn as filled rectangles from far to near.
- **Visible and hidden edges:** each rectangle's outline is split into visible and hidden segments. A segment is hidden where a nearer part's rectangle covers it, computed by interval subtraction along each edge. Hidden segments are drawn dashed when `hiddenLines` is on.
- **Sections:** in a section, parts the plane crosses are drawn hatched. Parts beyond the plane are drawn as an elevation; parts before it are dropped.
- **Veil:** veil parts, such as front-wall returns and headers, which would hide everything behind them, are drawn as a translucent hatch over the view instead of opaque.
- **Dimensions** are declared with references to part faces (`"partition-left.x0"`), so they follow the model and can highlight what they measure.

**Reasoning.**
- For boxes this is exact and small: a few hundred lines [I]. It keeps a `data-part` on every element [S: cross-highlight in the spike].
- The reference already proves the visual style with hand-written SVG.
- No mature JavaScript library produces architectural dimension strings [V]. The reference's `dimH`/`dimV` helpers are the starting point.

**Rejected.**
- *build123d or Replicad hidden-line projection.* The output loses part identity [S]. It also needs Python or a 22 MB wasm.
- *three-edge-projection.* Not on npm, version 0.0.x, stale peer dependencies [V]. It is the right tool for meshes that are not boxes, so it is kept in reserve.
- *three.js `SVGRenderer`.* No hidden-line computation [V].
- *FreeCAD TechDraw.* Desktop-bound [V].

**Revisit if.** Parts with angled or curved faces appear in drawings. Then add three-edge-projection (installed from GitHub) for those parts only, using its per-mesh edge ranges to keep part IDs [V: `getRangeForMesh`].

---

## D8. Sheet layouts: our own guillotine packer

**Decision.** `core/nesting.ts`, about 200 lines, ported from the spike:
- **Input:** each sheet material has a stock list: purchasable sizes, and owned pieces with quantities. Grain runs along each stock item's length.
- **Placement:** parts carry a grain lock, with grain free allowed when recorded. Kerf defaults to 1/8″.
- **Algorithm:**
  - A best-short-side-fit guillotine heuristic over free rectangles.
  - The kerf is removed at every cut.
  - When a new sheet is needed, owned stock is opened first.
  - Several sort orders × split rules × preferred stock are tried. The result with the fewest purchased square inches, then fewest sheets, then the largest remaining offcut wins.
- **Strips:** grain-matched strips are packed as one item and expanded back into their members.
- **Output:** placements with part IDs, offcuts, and unplaced parts with a reason (`no-stock | too-big | no-space`).
- **Per phase:** nesting runs separately for each cut phase.

**Reasoning.**
- The spike packer reproduced the concept sheet's layout exactly from the model: 4×8 + 4×4 prefinished, everything unfinished on the owned 56 × 48. It ran in 1–3 ms per material [S].
- The library options each miss something:
  - `guillotine-packer` takes one bin size and a global rotation flag; it used two full 4×8s and throws on oversize parts [S].
  - PackingSolver is the best solver, but it is C++/Python only [V].
  - The one JavaScript/WASM library with the full feature set has 6 stars and is six months old [V].

**Rejected.**
- *PackingSolver in the live loop.* It needs a Python step for every change.
- *MaxRects packers.* Their cuts are not guillotine cuts, so they cannot be cut on a table saw or track saw [V].
- *Irregular nesting* (SVGnest, Deepnest). Meant for CNC and lasers [V].

**Revisit if.** A project uses many sheets (more than about 6 of one material) and layouts look wasteful. Then add an `wb nest --optimise` command that calls PackingSolver through Python and stores its result as the layout, keeping the built-in packer as the live default.

---

## D9. Cut-list semantics borrowed from OpenCutList

**Decision.**
- **Sizes:** each panel or board is listed as length × width × thickness. Length is the dimension along the grain; for parts with no grain, it is the longer side.
- **Thickness check:** thickness must equal the material's thickness on exactly one axis (an invariant).
- **Finished vs cut size:** cut size = finished size − banding thickness on each banded edge whose banding has `reducesCutSize`, + material oversize.
- **Grouping:** rows group parts by cut phase, material, name, cut size and tags. Each row lists quantity and member IDs, so hovering a row highlights all its members.
- **Tags:** derived from the data, never typed by hand:
  - `hidden`
  - the exposure note (for example "Behind the header")
  - `needs finish` (an unfinished material with a finish set on the part)
  - `cut to fit` (`fitToSite`)
  - `grain free`
  - banded faces
- **Other lists:** boards are listed with total length per profile. Hardware is aggregated by catalogue item and unit. Edge banding length is summed from banded edges.

**Reasoning.**
- This is the most complete open model of how woodworkers describe parts [V: OpenCutList docs and source].
- The fixture's derived cut list matches the hand-made one row for row [S].
- Deriving the tags removes the main way the reference could drift: its tags and notes were typed by hand.

**Rejected.**
- *The reference's mixed size conventions* (shelves width × depth, faces width × height). They are inconsistent, and they hide grain direction.

**Revisit if.** The user finds grain-first sizes confusing at the saw. If so, add a display option that orders sizes by role (width × height for faces) while keeping grain in the data.

---

## D10. Phases, steps and design options

**Decision.**
- **Phases** are an ordered list.
  - A part has `phase` (when it is built or installed) and optional `removedIn`.
  - It can have `moves` (a new box from a later phase on).
  - It can have `cutIn` (a phase where it is cut earlier than it is installed; the faces strip).
  - The state at phase P contains parts with `phase ≤ P` and not yet removed, each at its latest move.
- **Steps** belong to a phase, are ordered by declaration, and carry text. Parts name their step.
  - A built part that is in no step is a warning [S: invariant implemented].
  - Step view shows the state up to that step, with the step's parts highlighted.
- **Design options** are declared in `options`: id → label, choices and default. They are passed to `build(b, opt)`, where ordinary code branches on them.
  - A configuration is one choice per option.
  - The UI has a control per option.
  - The CLI takes `--opt top=0.75`.
  - A compare mode diffs two configurations' parts, cut lists and sheet counts.
- **Fixture:** the closet's one option is the hardwood top thickness (1″ or ¾″). It evaluates both ways (D21).

**Reasoning.** It separates what changes over time (phases) from what is undecided (options). The reference mixed them: "Phase 1", "Phase 2 · 2 drawers", "Phase 2 · 3 drawers" were one switcher. Shelves that move between phases are real (the adjustable shelves move from 55¾″ to 59⅝″), and `moves` plus `removedIn` express them without duplicate parts. The cut list therefore counts each board once.

**Rejected.**
- *Options as separate project files.* Duplication drifts.
- *Phases as options.* Phase states are cumulative; options are not.

**Revisit if.** Options interact so much that the configuration space needs constraints (choice A forbids choice B). In that case, add `validWhen` to options.

---

## D11. Cross-linking through one selection store

**Decision.** One zustand store holds:
- `hovered: string[]`
- `selected: string[]`
- `config`, `phase`, `step`, `view`
- display settings

How each surface uses it:
- **Writes:** every surface writes hover and selection with the IDs it represents.
- **2D highlight:** one generated `<style>` element turns the IDs into CSS rules (`[data-part~="id"]`).
- **3D highlight:** the viewport reads the same fields to tint or outline meshes.
- **Driving the 3D view from 2D:** hovering a section view in the drawing panel puts the same clip plane on the 3D view.
- **Viewer state for the agent:** the store's selection-related fields are posted to the dev server (debounced 150 ms) and written to `.diy-bench/state.json` for the agent (D14).

**Reasoning.**
- A single source of hover state avoids feedback loops between views.
- The CSS-rule approach updates thousands of SVG elements without touching each one [I].
- The spike's cross-highlight used the same idea with classes [S].

**Rejected.**
- *Per-view event buses*: they cause ordering bugs.
- *URL state for hover*: too chatty. The URL holds only project, configuration, phase and view, for bookmarking.

**Revisit if.** Performance profiling shows the style regeneration is slow. Then switch to toggling classes on a precomputed index of elements by part.

---

## D12. Shell and layout: a local Vite web app, shown inside VS Code beside the VS Code terminal

**Decision.**
- **The app:** a plain Vite app (`npm run dev`, bound to 127.0.0.1). It has its own internal panes: 3D viewport, drawing panel, and a side panel with tabs for cut list, sheets, steps, parts, checks and notes.
- **Primary layout:** VS Code. The app opens in VS Code's integrated browser in the editor area. Claude Code runs in VS Code's terminal, moved to the right with `workbench.panel.defaultLocation: "right"`. That gives the user's three columns: 3D, drawing, terminal.
- **Alternative layout:** Chrome beside any terminal.
- **Workspace settings:** `.vscode/settings.json` sets `workbench.browser.autoReloadOnFileChange: false` so the integrated browser never fights HMR.
- **Embedded terminal:** none in v1. An optional later milestone (M11) adds a single-window mode with an embedded terminal (xterm.js 6 + node-pty 1.2 beta).

**Reasoning.**
- The user lives in VS Code and the terminal.
- VS Code 1.139.1's settings make the layout possible with zero code [V: the settings exist in the installed bundle: `workbench.browser.newTabPlacement`, `workbench.panel.defaultLocation` (`left|bottom|top|right`), `terminal.integrated.defaultLocation`].
- Claude Code in VS Code's terminal keeps its editor integration (selection, diffs, diagnostics) [V].
- Embedding a terminal brings the TUI quirks of xterm.js and a broken node-pty release on macOS [V]. It would also mean running a shell over a local WebSocket, with Origin checks and tokens to get right [I].

**Rejected.**
- *A VS Code extension with a webview.* More code (CSP, message passing, packaging) for what the integrated browser already gives. It remains the upgrade path if tighter integration is wanted.
- *Tauri as the primary shell.* Rust toolchain, WebKit only, community pty plugin [V]. It remains possible as a later wrapper around the same Vite app.
- *Electron.* 130 MB, packaging work, and it duplicates what VS Code already is [V].
- *ttyd or wetty.* You get their page, not your layout [V].

**Confirmed by the user on 2026-10-03:** the VS Code layout, with the app in the integrated browser and Claude Code in the terminal on the right. Tauri may wrap the app later.

**Revisit if:**
- The integrated browser's WebGL proves slow or buggy (checked in M4's smoke test).
- The user wants DIY-bench without VS Code open (wrap the Vite app in Tauri).
- A VS Code update changes the integrated browser.

---

## D13. Optional geometry kernel for features: manifold-3d first, Replicad on demand

**Decision.**
- **Not in v1.** The kernel arrives in milestone M10, and every core milestone works without it.
- **manifold-3d:** when parts gain features (dados, grooves, rabbets, notches, holes, pocket cuts), it renders those parts. It is loaded in the browser and maps `runOriginalID` back to part and feature IDs, so hovering a dado in a machining list highlights its faces in 3D.
- **Replicad:** loaded only when exporting STEP for parts with features.

**Reasoning.**
- manifold-3d is small (205 KB gzipped) and fast: 79 ms for both partitions with a dado and 56 holes each. Its triangles trace back to the part or cutter they came from [S]. That is the user's "hover over a cut and highlight the face" for free.
- Replicad writes named STEP but costs a 7 MB gzipped download [S]. So it is fetched only when that export is asked for.

**Rejected.**
- *build123d as a sidecar.* A Python process in the loop, 3.7 s import [S]. Kept as an option for exact drawings of complex parts.
- *occt-wasm.* Promising, but under seven months old [V].
- *JSCAD.* A weaker kernel than Manifold [V].

**Revisit if.** Exact drawings of featured parts are needed. A dado shown as a hidden line in a section can be drawn from the feature's box without a kernel [I]; a curved cut cannot. In that case use Replicad's `drawProjection` for those parts only.

---

## D14. Agent integration: CLAUDE.md and AGENTS.md, two hooks, a CLI; MCP later

**Decision.**
- **Instructions:** `AGENTS.md` holds the instructions, and `CLAUDE.md` is one line: `@AGENTS.md`. This matches the user's existing repos [V: kitchen-sink].
- **Selection context:** a `UserPromptSubmit` hook prints the viewer's current selection, hover, configuration, phase and view on every prompt.
  - It reads `.diy-bench/state.json` and does no evaluation, so it is fast.
  - "Make this one 2 inches shorter" therefore arrives with `selected: drawer-face-2 "Drawer face (drawer 2)" … defined at projects/closet-built-in/project.ts:186`.
- **Edit checks:** a `PostToolUse` hook on `Edit|Write` runs `./wb check --changed <file> --hook`.
  - It evaluates every configuration of the affected project and runs the invariants and design-rule checks.
  - On failure it exits 2 with the errors on stderr.
  - On success it prints a short summary of derived changes as `additionalContext`, for example "partition-left 84 → 82; cut list: 1 row changed; sheets unchanged".
- **CLI:** `./wb` gives the agent queries and levers: `check`, `parts`, `part`, `cutlist`, `sheets`, `shopping`, `diff`, `state`, `show`, `render`, `export`, `new`.
- **MCP:** no MCP server in v1.

**Reasoning.**
- **Both hook routes were tested** with Claude Code 2.1.288 [S]:
  - The prompt hook's stdout reached the model. It answered with the selected and hovered IDs; without the hook it answered "UNKNOWN".
  - The edit hook's exit-2 stderr reached the model, which quoted it verbatim.
- **Why hooks:** they make the selection automatic, which is the point of hovering. Nothing else does that: no surveyed CAD MCP server routes the on-screen selection to the agent [V].
- **Why a CLI over MCP:**
  - It needs no approval prompt and no `.mcp.json`.
  - The agent uses Bash fluently.
  - A PNG from `./wb render` can be read with the Read tool.
- **Viewer control:** the dev server relays `./wb show` commands to the open viewer over Vite's WebSocket as custom events (`server.ws.send`) [V: Vite HMR API].

**Rejected:**
- *An MCP server in v1.* Same capabilities, more moving parts, and an approval prompt for project servers [V].
- *Claude Code "channels"* to push clicks into the session. A research preview behind a dangerous-sounding flag [V].
- *Imitating the VS Code extension's internal `ide` protocol.* Undocumented [V].

**Revisit if:**
- The user wants to drive DIY-bench from a non-Claude agent or from Claude Desktop. Then wrap the same core functions in a stdio MCP server, as in spec.md section 11.3.
- Bash permission prompts for `./wb` become a nuisance and allow-rules do not solve it.

---

## D15. Exports

**Decision.** Printed plans and the cut list come first. GLB, STL, DXF and STEP are deferred (D19); their designs below are kept for when they are needed.
- **CSV and text cut list:** own code.
- **GLB:** written directly from the resolved boxes, with node name = part ID and `extras` = part metadata. Validated with Khronos `gltf-validator` in tests.
- **STL:** one file per part, binary.
- **DXF:** one file per part at the origin through `@tarikjabiri/dxf` 2.9 (pinned):
  - `$INSUNITS = 1`
  - closed LWPOLYLINE outlines
  - one layer per operation once features exist
  - one DXF per sheet layout as well
- **STEP:** a small AP214 writer for boxes, with names. Replicad for parts with features (D13).
- **PDF plan set:** a print stylesheet rendered with Playwright `page.pdf({ preferCSSPageSize: true })` [V]. Letter or tabloid, with a title block in `@page` margin boxes [V: Chrome 131+].

**Reasoning.**
- Every route keeps part names [V/S].
- The core formats (GLB, STL, CSV) need no heavy dependency and run in Node for tests [I].
- PDF from the same SVG keeps one drawing pipeline.

**Rejected.**
- *three's `GLTFExporter` in Node.* It is browser-oriented [I]. Writing GLB for boxes is simpler and deterministic.
- *SVG-to-PDFKit.* Unmaintained; the fork is LGPL-3.0 [V].
- *Paged.js.* Unnecessary now that Chrome supports margin boxes [V].

**Revisit if.** A CNC shop requires a specific DXF dialect or CAM tool conventions; write a profile for that tool.

---

## D16. Verification: unit tests, golden files, invariants, browser smoke tests; the closet as the first fixture

**Decision.**
- **Unit tests:** vitest 5 for `core/`.
- **Golden files:** committed per project and configuration: cut list, sheets and resolved parts as JSON, plus SVG per view. They are reviewed when changed and updated only with `./wb snapshot --update`.
- **Invariants:** run on every evaluation (spec.md section 6.4).
- **Browser tests:** Playwright with `channel: "chrome"`, so no browser download is needed. They cover hover cross-linking, a section-aware pick, HMR keeping camera and selection, the state file, and `./wb show`.
- **First fixture:** the closet, with its expected values listed in spec.md section 13.

**Reasoning.** Every behaviour the spec relies on has an automated check that an agent can run without a human. The browser tests reuse patterns proven in the spikes [S].

**Rejected.**
- *Manual verification only.* Coding agents need checks they can run themselves.
- *Pixel-diff screenshots.* Brittle; structural SVG assertions and golden SVG text are steadier.

**Revisit if.** Golden files churn on every change. Then narrow them to the stable fields.

---

## D17. Runtime and versions

**Decision.**
- **Runtimes:** Node 22.15 or newer. Scripts call `node --experimental-strip-types --disable-warning=ExperimentalWarning`, which works on 22.15.1 [S]. Type stripping is on by default from Node 22.18 and 23.6 [I].
- **Pinned versions:**
  - TypeScript 7.0.2
  - Vite 8.3.2
  - React 19.3
  - `@react-three/fiber` 9.8.1
  - `@react-three/drei` 10.7.9
  - three 0.186.1
  - zustand 5.0.15
  - vitest 5.0.3
  - `@playwright/test` 1.63.0
  - `@tarikjabiri/dxf` 2.9.0
  - manifold-3d 3.5.4 (M10)
  - replicad 1.1.0 (M10)

  All of these were checked on npm on 2026-10-03 [V].
- **Package manager:** npm, with exact versions (`save-exact=true` in `.npmrc`).

**Reasoning.** Pinning protects an agent-built repo from minor-version breakage: three.js breaks APIs in minor releases [V], and the r3f peer ranges are narrow [V].

**Revisit:** at each deliberate upgrade, run the full test suite.

---

## D18. Repository shape: one repo, projects as folders

**Decision.**
- **Repo:** a new git repo, outside kitchen-sink, owned by the user. Its name is DIY-bench.
- **Layout:** the tool code (`core/`, `app/`, `tools/`) and the projects (`projects/<id>/`) live together.
- **Each project holds:**
  - `project.ts`
  - `notes.md` (design reasoning, measurements, decisions in prose)
  - `expected/` (golden files)
- **Repo-level files:**
  - `.diy-bench/` is gitignored runtime state.
  - `.claude/` holds hooks, settings and skills.

**Reasoning.**
- The agent sees the tool and the project together, so it can fix a drawing bug while working on a closet.
- Projects are small and personal, so one repo is enough.
- Git history then doubles as the design history: every agent edit is a diff the user can review.

**Rejected:**
- *Tool and projects in separate repos.* More friction, and no benefit for one user.
- *Projects as JSON exported from a GUI.* See D2.

**Revisit if:**
- The tool is shared with other people. Then split the tool into a package and keep projects in their own repos.

---

## D19. Outputs for v1: printed plans and a cut list

**Decision.** v1 produces a PDF plan set and a CSV/text cut list. GLB, STL, DXF and STEP are deferred (D15 keeps their designs).

**Reasoning.** The user prints plans and does not use a CNC. The CSV/text cut list is cheap, so it stays.

**Rejected.** *Building every export in M9.* It adds dependencies and tests for formats nobody uses yet.

**Revisit if.** The user starts using a CNC, a laser or a cutting service (DXF first), or wants a 3D file for another tool.

---

## D20. Selection by click; hover is optional

**Decision.** Clicking a part selects it and highlights it in every view. Hover highlighting is an optional later addition that uses the same store field, `hovered`.

**Reasoning.** The user said click-to-select is enough. Fewer required tests depend on pointer movement.

**Revisit if.** The user asks for hover.

---

## D21. The closet fixture follows the concept sheet

**Decision.**
- The fixture encodes the concept sheet as committed (c10ee19).
- The only design option is the hardwood top thickness, 1″ (default) or ¾″. The two-drawer option is dropped.
- Materials use their real thicknesses: plywood sold as ¾″ is 23/32″, and plywood sold as ½″ is 15/32″.
- The drawer boxes and hamper frame use ordinary ½″ plywood, not the concept sheet's 12 mm Baltic birch (user's choice, 2026-10-04). It all fits on one 4×8.
- The baseboard is modelled as 5½ × ¾ (thickness approximate) on the back and side walls, and the partitions are notched over the back baseboard.

**Reasoning.**
- The earlier fixture encoded a superseded sheet, so its expected values no longer matched the design.
- Real thicknesses make the cut list match what the user will cut and buy.
- The overlap check keeps testing real clashes: the notch, the nosing and the frame back fit only because the sheet now has the fixes.

**Rejected.** *Keeping the two-drawer option.* The user dropped it.

**Revisit if.** The sheet changes, or the baseboard thickness turns out not to be ¾″.
