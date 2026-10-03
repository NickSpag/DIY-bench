# Design workbench for woodworking projects: tool survey

Date of survey: 2026-10-03. Machine: macOS 26.5, Apple silicon, Node 22.15.1, Python 3.14, VS Code 1.139.1, Claude Code 2.1.288.

## How to read this document

Every fact carries one of three marks:

- **[V]** verified against a primary source: the package registry (`npm view`, the PyPI JSON API, crates.io), the project's GitHub repository (releases, tags, source files, licence file) or its official documentation. The source is named or linked.
- **[S]** verified by a spike run on this machine for this survey. The spike code is in `spikes/` beside this file, and the section "Spike results" below gives the numbers.
- **[I]** my inference or general knowledge, not checked today.

Release dates are the publish date of the version named, taken from the registry's `time[version]` field, not its `time.modified` field (which moves when tags are edited). "Last commit" is the latest commit on the default branch as reported by the GitHub API.

The question behind the survey: what should a personal, agent-driven design workbench for rectangular sheet-goods projects (built-in closets, shelving, furniture) be built from, given that the user talks to Claude Code in a terminal and wants a 3D view, technical drawings, a cut list and sheet layouts that all update live and highlight each other?

---

## 1. Parametric CAD as code

### OpenSCAD
- Link: https://github.com/openscad/openscad
- Licence: GPL-2.0 with a CGAL linking exception [V: COPYING]. The npm `openscad-wasm-prebuilt` build declares GPL-2.0-or-later [V: npm].
- Activity: last stable release is 2021.01 [V: GitHub releases, openscad.org/downloads]. Nightly snapshots are current (2026.10.02), and an `openscad-2026.10-TEST` tag appeared on 2026-10-02 [V]. The Manifold backend became the default in snapshots in August 2025 [V: mailing-list announcement]. The snapshots ship a 3 MB WebAssembly build for the browser [V].
- Good at: a small declarative language that language models write reliably. P3D-Bench (arXiv 2606.11152) found OpenSCAD the strongest of JSON, OpenSCAD, CadQuery and three.js as an output format [V: paper]. Fast booleans with Manifold.
- Bad at: no B-rep, so no STEP export and no hidden-line drawings; `projection()` returns a filled silhouette or a slice, with no interior edges [V: manual]. No metadata on geometry: woodworking libraries such as `fxdave/woodworkers-lib` (GPL-3.0) produce cut lists by parsing `echo()` output [V: repo]. Functional language with no mutable data, awkward for derived tables.
- Fit: low to medium. Good for the agent to write, but the cut list, IDs and drawings would all be side channels.

### CadQuery
- Link: https://github.com/CadQuery/cadquery
- Licence: Apache-2.0 [V: PyPI; GitHub reports NOASSERTION for the licence file].
- Activity: 2.8.0 published 2026-06-21 on PyPI [V]; last commit 2026-09-23 [V].
- Runtime: Python 3.11+ on OCCT through `cadquery-ocp`, which pulls in VTK [V]. No browser.
- Good at: exact hidden-line SVG export (`exporters.export(..., 'SVG')` with `projectionDir`, `showHidden`) [V: `occ_impl/exporters/svg.py`]; assemblies with names, colours and materials; STEP, glTF, STL, DXF of sketches [V]. The most common target of research on generating CAD code with language models (CAD-Recode, Text2CAD-Bench) [V].
- Bad at: the fluent API with a hidden stack is easy to get wrong (P3D-Bench reports most CadQuery failures are wrong parameters or geometry rather than syntax) [V]; heavy install; no dimensioning.
- Fit: medium. Superseded for this use by build123d.

### build123d
- Link: https://github.com/gumyr/build123d
- Licence: Apache-2.0 [V].
- Activity: 0.13.0 published 2026-09-21 [V: PyPI]; last commit 2026-10-03 [V].
- Runtime: Python 3.11–3.14 on `cadquery-ocp-novtk` 8.0 [V]. The venv for the spike was 574 MB [S]. No browser.
- Good at:
  - Exact hidden-line projection: `Shape.project_to_viewport(origin, up, look_at)` returns `(visible, hidden)` edges; `ExportSVG` and `ExportDXF` with layers and ISO line types [V, S].
  - A drafting module with `Draft(unit=Unit.IN, fractional_precision=16)`, `DimensionLine`, `ExtensionLine`, `TechnicalDrawing` (LETTER, LEDGER pages) [V: `drafting.py`].
  - `Shape.label` reaches STEP `PRODUCT` names and glTF node names [S: all 24 labels present in both files].
  - Fast on a closet-sized model: 24 labelled parts with two dados and 112 shelf-pin holes built in 0.15 s, projected in 0.05 s, exported to STEP in 0.14 s; importing the kernel takes 3.7 s [S].
  - Ships `llms.txt` and `llms-full.txt` for agents [V].
- Bad at:
  - Projection output carries no part identity: the SVG is two anonymous groups of lines, `visible` and `hidden` [S]. Hover cross-linking would need one projection per part, which loses the hidden-line relation between parts.
  - Python only, so a TypeScript app would need a Python sidecar process.
  - Fast-moving API (0.12 removed many APIs) [V: release notes], so agents' training data goes stale.
  - No hatching export [V: code search].
  - Axis conventions are easy to get wrong when moving a model into its Z-up frame. The spike's first elevation came out mirrored [S]. The cause was the spike's own axis mapping, not build123d: it mapped the workbench's (x right, y up, z toward the room) to build123d's (X, Z, Y). That swaps two axes, which mirrors the model. The correct mapping is the rotation (x, y, z) → (X = x, Y = −z, Z = y) [I: right-handedness check].
- Fit: medium to high as an optional sidecar for STEP and exact drawings of non-rectangular parts; low as the source of truth.

### Replicad
- Link: https://github.com/sgenoud/replicad, https://replicad.xyz
- Licence: MIT; its OCCT build `replicad-opencascadejs` is LGPL-2.1-only [V: npm].
- Activity: 1.1.0 published 2026-09-04 [V: npm]; 1.0.0 on 2026-08-14 [V].
- Runtime: TypeScript on an OCCT WebAssembly build; browser and Node.
- Good at: the most practical B-rep kernel for the browser. `exportSTEP([{shape, name, color}], {unit})` writes named parts [S: `PRODUCT('partition-left')`]. `drawProjection(shape, "front")` does exact hidden-line removal [V, S]. A Manifold bridge for meshes in 1.x [V].
- Bad at: a 21.9 MB wasm (7.2 MB gzipped) [S]; 214 ms to initialise in Node [S]; booleans are slow if written naively (112 sequential hole cuts on two partitions took 2.6 s; one compound cut per partition took 0.44 s) [S]. One maintainer.
- Fit: high as an optional kernel loaded on demand for STEP export or parts with real joinery; too heavy to sit in the live loop.

### JSCAD (`@jscad/modeling`)
- Link: https://github.com/jscad/OpenJSCAD.org
- Licence: MIT [V].
- Activity: 2.13.0 published 2026-02-22; a V3 alpha is published monthly (3.0.7-alpha.0, 2026-08-02) [V].
- Good at: pure JavaScript, no native dependencies, 1.6 MB [V].
- Bad at: polygon CSG with no B-rep; projection gives a silhouette only [V: `extrusions/project.js`]; no STEP; metadata does not survive booleans [I].
- Fit: low to medium. manifold-3d does its job better.

### manifold-3d
- Link: https://github.com/elalish/manifold
- Licence: Apache-2.0 [V].
- Activity: 3.5.4 published 2026-09-25 [V: npm]; last commit 2026-10-03 [V].
- Runtime: C++ with WebAssembly for browser and Node; also Python.
- Good at:
  - Small and fast: 528 KB wasm (205 KB gzipped), 17 ms to initialise, 79 ms for both closet partitions with a dado and 56 holes each [S].
  - Identity survives booleans: each input gets an `originalID()`, and the output mesh's `runOriginalID` maps every run of triangles back to the input it came from [S]. In the spike every triangle traced back to either `partition-left`, `partition-right` or the cutter that made it. This is exactly what "hover a cut and highlight its faces in 3D" needs.
- Bad at: meshes only; no STEP; no hidden-line drawings (`slice` and `project` return cross-sections) [V].
- Fit: high as the optional geometry layer for parts with dados, grooves, notches and holes.

### OpenCascade.js and successors
- Link: https://github.com/donalffons/opencascade.js
- Licence: LGPL-2.1 [V].
- Activity: npm `latest` is 1.1.1, published 2020-09-27; the `beta` tag dates from 2023-03-23 [V: npm dist-tags]; last commit 2023-03-27 and an unanswered "Is this still maintained?" issue (#305) [V]. Effectively unmaintained.
- Successors [V]: `taucad/opencascade.js` (OCCT 8.0.1, pushed 2026-09); `andymai/occt-wasm` 5.5.0 (2026-10-01; claims ~4.5 MB brotli, XCAF STEP, a hidden-line facade and face-tracking history; under seven months old); the builds inside Replicad and bitbybit.
- Fit: low directly; use Replicad if a browser B-rep kernel is needed.

### FreeCAD (Python API) and woodworking add-ons
- Link: https://github.com/FreeCAD/FreeCAD
- Licence: LGPL-2.1 [V].
- Activity: 1.1.4 published 2026-09-28 [V]. FreeCAD 1.0 merged the mitigation of the topological naming problem [V: FreeCAD blog, 2024-11-19].
- Good at: the richest object model (names, labels, expressions, spreadsheets); TechDraw has hatching, section views and dimensions [V: `src/Mod/TechDraw/App`].
- Bad at: a 619 MB desktop application [V], GUI-first; the FCStd document is a zip, not diffable text; PDF export from TechDraw needs the GUI [V].
- Woodworking add-ons:
  - dprojects **Woodworking** workbench, MIT, release 3.0 on 2026-03-31, 570 stars [V]. Panels are `Part::Box` objects; `getDimensions` builds cut-list reports (by material, finished vs rough, edge banding, drilling, cost); edge banding is detected from face colour; grain is a per-face marker. No sheet-layout optimiser [V].
  - AIGenFurniture (LGPL-2.1, beta): turns placeholder boxes into cabinets from design rules [V].
  - Cubinets (GPL-3.0, 3 stars), FreeCAD-lumberjack (no licence, 3 stars) [V].
- Fit: low to medium. Read the Woodworking workbench for report ideas; do not build on FreeCAD.

### Zoo (KittyCAD) KCL
- Link: https://github.com/KittyCAD/modeling-app, https://zoo.dev/docs/kcl-lang
- Licence: the KCL language and client are MIT [V: Cargo.toml].
- Activity: `kcl-190` released 2026-10-02 [V].
- The geometry engine is closed source and runs in Zoo's cloud. The FAQ says "our CAD geometry engine is not open source" and "An internet connection is required for modeling, rendering". A Zoo account and API token are required, with metered billing [V: zoo.dev/docs/faq].
- Fit: low. A personal local workbench should not depend on a paid closed cloud kernel.

### Others found
- **CascadeStudio** (MIT): a browser playground over OCCT, not a library; no releases [V].
- **bitbybit** (MIT code, paid cloud tiers): `@bitbybit-dev/occt` 1.4.1, 2026-10-02, 96 MB unpacked [V].
- **Fornjot**: archived; "This project has been shut down" [V].
- **truck** (Rust, Apache-2.0): crates last published 2024-09 [V]. Experimental.
- **SolidPython2** (LGPL-2.1+): generates OpenSCAD, inherits its limits [V].
- **Chili3D** (AGPL-3.0): a GUI CAD app in the browser [V].
- **Onshape FeatureScript** (ideas only): community cut-list features treat the cut list as a table derived from named parts [V: forum].
- **Agent-plus-CAD MCP servers** (precedents, see section 5): build123d-mcp, openscad-mcp, freecad-mcp, blender-mcp, zoo-mcp.

### What the CAD-as-code survey settles
No kernel knows what a panel is [I, consistent with every precedent above]. Kernels keep names at the assembly or export level (build123d labels, Replicad STEP names, CadQuery assemblies), or track identity through history (Manifold `originalID`, FreeCAD naming, occt-wasm's claimed face history). Every woodworking precedent builds its cut list as a side channel. For axis-aligned panels, elevations, sections and plans can be computed directly from the boxes with part IDs on every line, which a kernel's projection loses [S]. A kernel earns its place only for non-rectangular features and STEP, and both have small, optional options (manifold-3d in the browser; Replicad or build123d on demand).

---

## 2. Woodworking-specific tools

### OpenCutList (SketchUp extension), the main source of schema ideas
- Link: https://github.com/lairdubois/lairdubois-opencutlist-sketchup-extension, docs at https://docs.opencutlist.org
- Licence: GPL-3.0 [V].
- Activity: v7.1.0 on 2025-12-10; last push 2026-10-03; 603 stars [V].
- How it models parts [V: docs and `part_def.rb`, `material_attributes.rb`]:
  - A part is a SketchUp component definition; instances with the same definition, material and thickness collapse into one cut-list row.
  - Length, width and thickness come from the component's local axes: red is length and therefore grain, green is width, blue is thickness.
  - Material types: Solid Wood, Sheet Good (real thicknesses, standard sheet sizes written length × width, a `grained` flag), Dimensional, Veneer, Edge Banding (thickness, and whether it reduces the cut size), Hardware.
  - Grain convention: grain always runs along a sheet's first dimension (length).
  - Parts carry `size` and `cutting_size`; banded edges are `xmin/xmax/ymin/ymax`, each with its own banding material, and `edge_length_decrement` / `edge_width_decrement` take the band off the cut size; faces `zmin/zmax` take veneer.
  - `ignore_grain_direction` per part, meant for hidden parts. `cumulable` lets identical narrow strips be cut as one blank.
- Cutting diagrams [V]: since 7.0 a C++ library, Packy, wraps a fork of **PackingSolver**. Guillotine options: blade width (default 1/8″), trimming, first cut direction, 2 or 3 stages, minimum offcut size to keep. Offcuts are entered as stock (`L x W x qty`). Reports efficiency, number of cuts, cut length and offcuts to keep.
- Exports: parts list CSV/XLSX, cutting diagrams SVG/DXF per sheet, labels with QR codes [V].
- Fit: do not use as a tool (SketchUp, GPL, model locked in .skp attributes). Copy its schema.

### Sheet nesting and cut-list libraries

| Name | Language | Licence | Guillotine | Kerf | Rotation per part (grain) | Several stock sizes incl. offcuts | Latest release / activity | Fit |
|---|---|---|---|---|---|---|---|---|
| PackingSolver (fontanf/packingsolver) | C++, Python | MIT | yes, 2/3/unlimited stages | yes, plus trims | yes (`oriented`) | yes, with cost, copies, defects, leftovers objective | PyPI 0.1.1060, 2026-10-03 [V] | best quality; Python only |
| doublesharp/bin-packing | Rust, npm wasm | MIT (crate, npm) | yes (`guillotine_required`) | yes | yes (`can_rotate`) | yes, with cost and cap | `@0xdoublesharp/bin-packing-wasm` 0.4.0, 2026-09-10, 6 stars [V] | only browser option with the full feature set; very young |
| opcut | Python, C | GPL-3.0 | yes | yes | yes (`can_rotate`) | panels listed one by one, no cost | PyPI 0.4.16, 2025-03-23 [V] | fallback |
| guillotine-packer (tyschroed) | TypeScript | MIT | yes | yes | no, one global flag | no, one bin size | npm 1.0.2, 2020-01-27 [V] | weak; failed the closet [S] |
| rectpack | Python | Apache-2.0 | yes (variant) | no | no | sizes with counts | PyPI 0.2.2, 2021-11-24 [V] | dormant |
| RectangleBinPack (juj) | C++ | public domain | yes | no | always rotates | no | last push 2023-09 [V] | reference only |
| maxrects-packer | TypeScript | MIT | no | padding | limited | same-size bins | npm 2.7.3 [V] | poor |
| binpackingjs | TypeScript | MIT | no | no | yes | sizes only | npm 4.1.0, 2026-05-14 [V] | poor |
| potpack, rectangle-packer | JS | ISC, MIT | no | no | no | no | 2025 [V] | not applicable |
| OR-Tools | C++, Python | Apache-2.0 | example only (`cgc.cc`) | build it | build it | build it | v9.15 [V] | only for a custom model |
| SVGnest, deepnest-next | JS | MIT | no (irregular nesting) | spacing | rotation steps | limited | 2024-02, 2026-07 [V] | for CNC or laser, out of scope |

Spike result [S]: `guillotine-packer` put phase 1's prefinished parts on two full 4×8 sheets, because it takes a single bin size. The hand layout uses a 4×8 and a 4×4. A 150-line guillotine packer written for the spike, with per-material stock lists, owned offcuts, grain lock per part, kerf and a small strategy search, reproduced the hand layout exactly in 2–3 ms. It produced a 4×8 holding both partitions and the cross-grain right 70″ shelf, and a 4×4 holding the four center shelves. Every unfinished part, including the grain-matched strip of phase 2 faces, went on the owned 56 × 48 piece.

### Open-source woodworking and cabinet apps
- **Panelizer** (pelletier197, MIT, TypeScript/React/three.js, created 2026-07): panels with `grain: 'length'|'width'|'none'`; mixes stock sizes and offcuts; MaxRects packer (not guillotine). Its unplaced-part reasons (`no-stock | too-big | no-space`) are worth copying [V].
- **WoodworkingShop / Cabinet Planner** (MIT): cabinet configurator with PDF, DXF, G-code and BOM output; MaxRects [V].
- **Home Builder 5** (Andrew Peel, GPL-3.0-or-later, Blender add-on, 5.2.4 on Blender Extensions 2026-09-14) [V]. Its closet model is `ClosetStarter → ClosetBay → ClosetOpening` with shelves, cleats, rods, drawers, fronts. Each cut part is a geometry-nodes object with Length, Width and Thickness inputs and six material slots: two surfaces and four edges (W1, W2, L1, L2). No cut-list export found. Good reference for decomposing a closet; GPL and tied to Blender.
- I found no add-on called "Snap" [V: search].
- autocut (AGPL-3.0), aklinker1/cutlist (MIT, reads Onshape), several 0-star 2026 repos [V].

### Commercial tools (ideas only)
- **Polyboard (Wood Designer)**: a cabinet is a box with construction rules (overlaps, recesses, thicknesses) into which components drop; hardware applied in one click updates its machining when the design changes; edging thickness changes the cut size, with a "net dimensions" option for edgebanders that pre-mill [V: product pages, forum].
- **Mozaik**: "construction methods" rebuild every part; part sizes shown before or after edge banding; separate cut lists for carcass parts, face frames and drawer boxes [V].
- **Cabinet Vision**: rule language (User Created Standards) over parameters; materials inherited by parts [V].
- **CutList Optimizer** (paid web app), **MaxCut** (free Windows community edition): cut thickness, grain ("orientation matters"), edge banding, labels, cut sequence and total cut length [V].
- **SketchUp + OpenCutList**: see above.

Concepts worth borrowing, with sources: finished size vs cut size (OpenCutList, Mozaik); edge banding per edge with a "reduces cut size" flag (OpenCutList, Polyboard); grain along the first dimension of both parts and stock (OpenCutList); a per-part grain override recorded with a reason (OpenCutList); owned offcuts as ordinary stock entries (OpenCutList, PackingSolver); minimum offcut size worth keeping; unplaced-part reasons (Panelizer); identical narrow strips cut as one blank (OpenCutList `cumulable`); a cabinet as a box with construction rules (Polyboard, Mozaik, Home Builder).

---

## 3. 3D in the browser

### three.js
- Link: https://github.com/mrdoob/three.js
- Licence: MIT [V].
- Activity: r186; npm 0.186.1 published 2026-09-24 [V]. Releases came roughly monthly through 2025 and about every two months in 2026 [V: npm time]. Minor releases break things; each has a migration-guide entry.
- APIs this project uses [V: source]: `Raycaster` (picking), `OrthographicCamera`, `Material.clippingPlanes` with `renderer.localClippingEnabled`, the `webgl_clipping_stencil` example for capped sections, `EdgesGeometry` + `LineSegments` and `LineSegments2`/`LineMaterial` for edges with real width, `OutlinePass`, `ViewHelper`, `GLTFExporter` (writes `object.name` to the node name and `userData` to `extras` [V: GLTFExporter.js]), `STLExporter`.
- Spike [S]: picking, ortho camera, a section plane, and cross-highlighting with an SVG elevation and an HTML table all worked in about 100 lines with Vite 8. **`Raycaster.intersectObjects` ignores clipping planes**: with every part clipped away it still returned hits on `partition-left`. Pick results must be filtered with `plane.distanceToPoint(hit.point) >= 0` for each active plane, which the spike did.
- Good at: every primitive needed; the largest ecosystem.
- Bad at: none of explode, capped sections, view presets or fit-to-bounds comes built in.
- Fit: high, as the base.

### react-three-fiber + drei (+ @react-three/postprocessing)
- Links: https://github.com/pmndrs/react-three-fiber, https://github.com/pmndrs/drei
- Licence: MIT [V].
- Versions [V: npm]: `@react-three/fiber` 9.8.1 (2026-09-24), peer `react >=19 <19.4`; `@react-three/drei` 10.7.9 (2026-09-25); `@react-three/postprocessing` 3.1.3 (2026-09-27), whose `postprocessing` dependency caps `three <0.187`. r3f v9.0.0 was the React 19 release (2025-02-19); a v10 alpha is in progress.
- Relevant APIs [V: source]: pointer events `onPointerOver/Out/onClick` with `e.stopPropagation()` (without it, parts behind also receive the event); `<OrthographicCamera makeDefault>`; `<Bounds fit clip observe>` and `useBounds()`; `<CameraControls>` (wraps yomotsu camera-controls: `fitToBox`, `rotateTo`, `setLookAt`); `<Edges>` (LineSegments2); `<Outlines>` (inverted hull); `<GizmoHelper>` + `<GizmoViewcube>`; postprocessing `<Selection>`/`<Select>` + `<Outline>`.
- Good at: the scene is a function of app state, so a shared store with `hoveredIds` drives the 3D tint, the SVG and the tables alike; keeping `<Canvas>` and controls mounted keeps the camera across model reloads [I, consistent with the plain three.js spike].
- Bad at: version coupling across React, three, drei and postprocessing.
- Fit: highest for a custom web app.

### Babylon.js
- Link: https://github.com/BabylonJS/Babylon.js
- Licence: Apache-2.0 [V].
- Activity: `@babylonjs/core` 9.29.0, 2026-10-01; weekly releases [V].
- APIs: `scene.pick`, `HighlightLayer`, `SelectionOutlineLayer`, `scene.clipPlane`–`clipPlane6`, `Camera.ORTHOGRAPHIC_CAMERA` [V: source; pick and ortho camera names I].
- Good at: batteries included (highlight layers, inspector, GUI). Bad at: heavier (70 MB unpacked package [V]); no equivalent of three-edge-projection; smaller React story [I].
- Fit: medium-high; nothing beats three.js here.

### three-cad-viewer
- Link: https://github.com/bernhard-42/three-cad-viewer
- Licence: MIT [V].
- Activity: 5.0.7, 2026-09-17; pins `three 0.184.0` [V].
- Offers [V: README, source]: tree view, three clipping planes with stencil caps, `setOrtho`, `presetCamera("iso"|"front"|…)`, `explode()`, measurement in TypeScript (no Python needed since v4), incremental `addPart`/`removePart`/`updatePart`. Input is its own JSON of tessellated shapes with path IDs you choose; boxes are easy to hand-write.
- Picking: GPU id-buffer picking; double-click sends `notifyCallback({lastPick: {path, …}})`. Hover is not reported through the callback, and there is no public "highlight path X" call, so driving the 3D highlight from a cut-list row would mean patching internals [V: source reading].
- Fit: high as a feature checklist or a one-day prototype; medium as the long-term view (own UI and theme, pinned three version, one maintainer, fast majors).

### ocp_vscode (OCP CAD Viewer for VS Code)
- Link: https://github.com/bernhard-42/vscode-ocp-cad-viewer
- Licence: Apache-2.0 [V].
- Activity: 4.1.0, released 2026-09-15 (PyPI 2026-09-16); `ocp-tessellate` 3.5.3 [V].
- Architecture [V: `src/controller.ts`, `ocp_vscode/comms.py`]: the VS Code extension host runs an HTTP server with a `ws` WebSocket server on port 3939 (or the next free port, registered in `~/.ocpvscode`). A `WebviewPanel` with `retainContextWhenHidden: true` runs three-cad-viewer. Python's `show(obj)` tessellates and pushes the model over the WebSocket; `reset_camera=KEEP` keeps the camera across pushes.
- What "live" means there: it does not watch files. You re-run the script (Ctrl+F5 or a Jupyter cell) and each `show()` pushes a new model. `watchCommands` is for visual debugging at breakpoints [V: extension.ts].
- Fit: the closest architectural precedent: a local relay, a "here is the whole model" push, and a viewer that keeps its camera. It lacks file watching and does not route the hovered part to an agent.

### Online3DViewer
- Link: https://github.com/kovacsv/Online3DViewer
- Licence: MIT [V]. Activity: 0.18.0, 2025-12-18 [V].
- Good at: viewing many formats (STEP via occt-import-js, IFC, 3DM, glTF…) with an embeddable `EmbeddedViewer` and `SetMeshesHighlight` [V].
- Bad at: no section planes (only near/far clipping), no explode; a file loader rather than a scene you build [V].
- Fit: low to medium; only to preview exported files.

### Other viewers and helpers
- **xeokit SDK**: AGPL-3.0 or commercial; 2.6.114 (2026-09-02); `SectionPlanesPlugin`, `NavCubePlugin`, entity `highlighted/selected/xrayed` flags [V]. Low fit: own renderer and AGPL.
- **That Open Engine** (`@thatopen/components` 3.4.8, MIT): `Clipper`, `OrthoPerspectiveCamera`, `Highlighter` — but the highlighter works on IFC Fragments IDs, not plain meshes [V]. Low to medium.
- **model-viewer** (Google, Apache-2.0, 4.3.1): no clipping, ortho or per-part control [V]. Low.
- **three-mesh-bvh** (MIT, 0.9.15, 2026-09-09): accelerated raycasting and a clipped-edges demo for drawing the outline of a section [V]. Helper.
- **camera-controls** (yomotsu, MIT, 3.1.2): `fitToBox`, `rotateTo`, `setLookAt`; works with perspective and orthographic cameras [V]. High as a helper; drei wraps it.
- **three-edge-projection** (gkjohnson, MIT): GitHub release v0.0.10 on 2026-06-11, active [V]. **Unpublished from npm on 2025-10-28** [V: `npm view` returns E404 "Unpublished on 2025-10-28"]; install from GitHub. `ProjectionGenerator.generateAsync(scene)` returns `visibleEdges` and `hiddenEdges` with `getRangeForMesh(mesh)`, so per-part line ranges survive; also `PlanarIntersectionGenerator` for section cuts. Projects along the y-axis only. Stale peer ranges (`three ^0.155`, `three-mesh-bvh ^0.6`) [V]. High fit for drawings of non-box parts, if ever needed.

---

## 4. 2D technical drawings

### Approaches
1. **Hand-written SVG from the domain model** (what the reference does). For axis-aligned boxes, a view is a drop of one axis. Hidden edges can be computed exactly by subtracting, along each projected rectangle edge, the intervals covered by nearer parts' rectangles. A section is the intersection of the cut plane with each box: crossed parts become hatched rectangles, parts beyond are drawn as an elevation [I: geometry for boxes is exact by construction]. Every element can carry `data-part`, which the spike used for cross-highlighting [S]. Good at: full control of line weights, fractions, hatching, labels; diffable output; part IDs on every element. Bad at: you write the geometry. **Best fit while parts are boxes.**
2. **Hidden-line projection from a B-rep kernel**: build123d (`project_to_viewport` + `ExportSVG`, drafting module with fractional-inch dimensions), CadQuery SVG export, FreeCAD TechDraw (the most complete drafting set, including hatching and sections, but GUI-bound for PDF), OpenSCAD `projection()` (silhouette only) [V]. The output loses part identity [S].
3. **Projection in the browser**: three-edge-projection (above); three.js `SVGRenderer` (painter's algorithm, no hidden lines) [V]; `three-svg-renderer` (GPL-3.0, dormant since 2023) [V].

### 2D and DXF libraries

| Tool | Licence | Latest | Good at | Bad at | Fit |
|---|---|---|---|---|---|
| maker.js (Microsoft) | Apache-2.0 | 0.19.2, 2026-01-27; not archived, commits 2026-09 [V] | DXF/SVG/PDF export with layers and `$INSUNITS`; path chaining into polylines; booleans | no dimensioning [V: code search] | medium, not needed |
| @tarikjabiri/dxf (dxfjs/writer) | MIT | 2.9.0, 2026-09-15; v3 alpha on `next` [V] | TypeScript; LWPOLYLINE, HATCH, DIMENSION entities, layers, `$INSUNITS` | v3 rewrite pending; default units unset | **use for DXF** (pin 2.9) |
| dxf-writer | MIT | 1.18.4, 2022-11-07 [V] | simple | dormant, no hatch or dimensions | no |
| ezdxf (Python) | MIT | 1.4.4, 2026-05-14 [V] | the reference DXF library; renders DIMENSION geometry; SVG/PDF drawing add-on | fractional and architectural dimension text "not supported" (`dim_base.py`) [V]; Python | alternative |
| svg.js / Two.js / paper.js / d3 | MIT / MIT / MIT / ISC | 3.2.8 / 0.8.24 / 0.12.18 / 7.9.0 [V] | SVG building or scales | nothing drafting-specific | not needed |
| @invisra/draft | MIT | 0.2.0, 2026-08-20; 0 stars, first published 2026-07 [V] | claims linear/chain dimensions, fractional inches, ANSI hatches, sheets, SVG/PDF/DXF | unproven, single author | read for ideas only |

**No mature open-source JavaScript library produces architectural dimension strings** [V: searches found only chart annotation tools, DXF viewers and @invisra/draft]. The reference's `dimH`/`dimV` helpers are the right starting point.

### Units and fractions
Fraction.js (MIT, 5.3.4) formats mixed numbers but does not round to 1/16 or add inch marks; mathjs units are heavy; `footinch` (2021) and `uom-tools` (0 stars) are too obscure to depend on [V]. A 40–80 line formatter and parser with tests is the right size [I]. A useful fact for the model: every multiple of 1/16 (indeed of any power-of-two fraction) is exactly representable in IEEE-754 doubles, so adding and subtracting sixteenths is exact; only division (for example spacing shelves evenly) produces values that need rounding for display [I: standard floating-point property].

---

## 5. The terminal pane and the agent loop

### Terminal in the browser
| Tool | Licence | Latest | Notes | Fit |
|---|---|---|---|---|
| @xterm/xterm | MIT | 6.0.0, 2025-12-22; beta 6.1.0-beta.304 [V] | VS Code's own terminal (VS Code depends on xterm ^6.1.0-beta and node-pty ^1.2.0-beta [V: vscode package.json]). 6.0 added synchronized output (DEC 2026), which Claude Code uses against flicker. | high, if a terminal is embedded |
| node-pty | MIT | 1.1.0, 2025-12-22; beta 1.2.0-beta.15 [V] | Prebuilt binaries for darwin-arm64. **1.1.0 ships `spawn-helper` without the execute bit on macOS**, so spawning fails with `posix_spawnp failed`; fixed only in the 1.2 beta line [V: npm pack file modes, issues #850, #919]. | high, pinned to 1.2 beta |
| ttyd | MIT | 1.7.7, 2024-03-30 [V] | one binary; you get its page, not your layout | prototype only |
| wetty | MIT | 3.3.5, 2026-09-29 [V] | SSH-oriented | low |
| gotty (fork) | MIT | 1.8.0 [V] | binds 0.0.0.0 by default | low |

Running Claude Code inside xterm.js inherits VS Code's known terminal issues because VS Code's terminal is xterm.js [V]: Shift+Enter needs a key binding (Ctrl+J always works), Option-as-Meta must be enabled, notifications need a bell handler, and open issues exist for mouse sequences leaking into input in browser-based xterm.js over WebSocket (#66289) and latency with screen-reader mode (#84712) [V: Claude Code docs and issues]. A shell on a local WebSocket must bind 127.0.0.1, check `Origin`, and require a per-launch token, because browsers do not apply CORS to WebSockets [I: standard threat model; the token pattern is the one Claude Code's own IDE bridge uses [V: VS Code integration docs]].

### Claude Code features that matter
- **VS Code extension** (`anthropic.claude-code`): `claude` run in VS Code's integrated terminal connects to the editor automatically. A hidden `ide` MCP server sends the current editor selection and active file with each prompt; only `getDiagnostics` and `executeCode` are exposed as tools. The protocol behind it is internal [V: code.claude.com/docs/en/vs-code].
- **Instruction files**: `CLAUDE.md` with `@path` imports. AGENTS.md is read natively from v2.1.277, but only when no CLAUDE.md exists, so a repo with both should have CLAUDE.md import `@AGENTS.md` [V: memory docs]. The user's existing repos already follow that pattern [V: kitchen-sink CLAUDE.md].
- **Hooks** [V: hooks docs; S: both routes tested with Claude Code 2.1.288]:
  - `UserPromptSubmit`: plain stdout is added to the model's context with the prompt. Spike: a hook printing the selection from a JSON file made the model answer "selected: partition-left; hovered: drawer-face-2"; the same prompt without the hook answered "UNKNOWN".
  - `PostToolUse` with matcher `Edit|Write`: exit code 2 shows stderr to the model after the edit. Spike: the model quoted the hook's invariant failure verbatim. Exit 0 with JSON `hookSpecificOutput.additionalContext` adds context without failing [V: docs].
  - `FileChanged` exists but its output does not reach the model [V].
- **Skills** in `.claude/skills/<name>/SKILL.md`; **permissions** in `.claude/settings.json` (`Bash(npm run *)`-style rules) [V].
- **MCP**: project servers live in `.mcp.json`; Claude Code asks for approval before using them in interactive sessions; tools appear as `mcp__<server>__<tool>`, loaded on demand [V: MCP docs]. The TypeScript SDK split: v2 is `@modelcontextprotocol/server` 2.3.0 (Apache-2.0, 2026-10-02); v1 `@modelcontextprotocol/sdk` 1.32.0 (MIT) is maintenance-only [V: npm, README]. "Channels" can push events into a session but are a research preview behind `--dangerously-load-development-channels` [V].

### Live reload
- **Vite** 8.3.2 (MIT, 2026-10-01), built on Rolldown and oxc [V: npm; S: oxc reported the parse error]. HMR API: `import.meta.hot.accept`, `hot.data`, `vite:error` events; server side `server.ws.send` custom events and the `hotUpdate`/`handleHotUpdate` hooks; `server.watcher` is chokidar [V: vite.dev docs]. Defaults: `host: 'localhost'`, `fs.strict` on [V].
- Spike [S]:
  - A file write to the model module re-evaluated it and rebuilt the three.js scene in **47–63 ms**, with no page reload, the camera unchanged and the hovered part still highlighted.
  - A syntax error showed Vite's overlay; fixing it recovered without a reload.
  - Projects loaded through `import.meta.glob` work when the module that owns the glob is self-accepting (`import.meta.hot.accept()`): editing a project file, or a helper file it imports, re-evaluated through that loader without a page reload, and the separate store module was evaluated only once.
  - Explicit `.ts` import extensions work in Vite 8, which matters because Node requires them.
- **Node type stripping** [S]: Node 22.15.1 runs the TypeScript model directly with `--experimental-strip-types` and `"type": "module"`, but only when imports carry explicit `.ts` extensions (`ERR_MODULE_NOT_FOUND` otherwise). Positions are preserved: a part's creation site captured from `new Error().stack` pointed at the exact line and column of the `panel(...)` call. Bun runs the same file with or without extensions. TypeScript 7.0.2 (the native build, 2026-07-08) is the current `typescript` on npm [V].
- **chokidar** 5.0.0 (MIT, ESM-only) and **esbuild** (watch mode polls; no JS hot reload) [V] are not needed alongside Vite.

### Agent + CAD precedents (MCP tool surfaces)
| Project | Licence | Activity | What it exposes |
|---|---|---|---|
| ahujasid/blender-mcp | MIT | ~29.9k stars, pushed 2026-09-30 [V] | scene info, create/modify objects, arbitrary Python, export; its Codex plugin lets you click an object to attach it to the next message — the closest precedent to hover-and-ask |
| neka-nat/freecad-mcp | MIT | 2026-09-24 [V] | create/edit objects, `get_view` screenshots, execute code |
| pzfreo/build123d-mcp | Apache-2.0 | 0.3.90, 2026-09-25 [V] | persistent session, PNG/SVG/DXF render, measuring, export; a live viewer fed over a UNIX socket |
| RobertCoop/openscad-mcp | MIT | 0.6.1, 2026-09-10 [V] | `render` (views, sections, stated mm/px scale), `check` (interference, clearance), `measure`, `validate`, `model` CRUD with etags, `export_model` |
| KittyCAD/zoo-mcp | MIT | 0.28.6, 2026-10-01 [V] | KCL execution, snapshots; needs a Zoo API token |

The shared surface is: apply model code, render a fixed view to an image, measure and check, export. None routes the user's on-screen selection to a terminal agent [V: their READMEs]; that is the gap this project fills.

---

## 6. App shell

| | Plain local web app (Vite) | VS Code extension with a webview | Tauri 2 | Electron |
|---|---|---|---|---|
| Version / licence | Vite 8.3.2, MIT [V] | VS Code API | CLI 2.12.1, Apache-2.0 OR MIT [V] | 44.5.1 (Chromium 152, Node 24), MIT [V] |
| Setup effort | lowest | medium (CSP, message passing, packaging) | high (Rust toolchain; pty via `portable-pty` or a small community plugin) | medium |
| Beside VS Code's terminal | yes: in VS Code's integrated browser or a separate window | best (a panel inside VS Code) | separate window | separate window |
| Terminal | use VS Code's, or embed xterm.js + node-pty | VS Code's own | xterm.js + Rust pty | xterm.js + node-pty over IPC |
| WebGL | full Chromium or Safari | Electron's Chromium | WKWebView: WebGL2 yes; WebGPU in third-party WKWebView unverified [V/I] | Chromium |
| Distribution | `npm run dev` | .vsix | signed app | ~130 MB zip [V] |
| Fit | **high, start here** | medium-high, later if wanted | low | low to medium |

VS Code facts checked on the installed 1.139.1 [V: settings schema in the app bundle]:
- The integrated browser exists, with `workbench.browser.newTabPlacement` (`activeGroup`, `sideGroup`, `window`; default `activeGroup`) and `workbench.browser.openLocalhostLinks`. `simpleBrowser.show` now redirects to it when present [V: vscode source, per the shell survey].
- `workbench.browser.autoReloadOnFileChange` defaults to `true`. The code around it appears to apply only to `file:` URLs, so pages served by the Vite dev server over `http` would be left to Vite's HMR [I: from reading minified code]. Setting it to `false` in the workspace costs nothing.
- `workbench.panel.defaultLocation` accepts `left`, `bottom`, `top`, `right`, and `terminal.integrated.defaultLocation` accepts `editor` or `view` [V]. So the three-column layout the user described (3D view, drawing, terminal) can be [integrated browser tab showing the app's 3D and drawing panes] beside [the panel moved to the right, holding Claude Code's terminal], with no terminal embedding.
- Whether WebGL in the integrated browser performs as well as Chrome is not verified [I: it is Chromium inside Electron, so it should].

---

## 7. Export and interop

| Format | Recommended route | Notes |
|---|---|---|
| glTF / GLB | write GLB directly from the resolved boxes (node name = part ID, `extras` = metadata), or three.js `GLTFExporter` in the browser | `GLTFExporter` keeps `name` and `userData` → `extras` [V]. Writing GLB for boxes is small and testable in Node [I]. The Khronos validator is on npm as `gltf-validator` (2.0.0-dev.3.10, Apache-2.0) [V]. |
| STL | per part, binary | STL cannot carry names [V: three's exporter writes `solid exported`]; export one file per part, zipped |
| DXF (CNC) | `@tarikjabiri/dxf` 2.9.x | `$INSUNITS = 1` (inches) [V: ezdxf units docs]; closed LWPOLYLINE outlines; one layer per operation with depth in the name (`OUTLINE`, `POCKET_0.25`, `DRILL_0.197`); one file per part at the origin [I: shop convention] |
| STEP | boxes: a small AP214 writer in TypeScript; parts with features: Replicad `exportSTEP` on demand, or build123d `export_step` in a Python sidecar | A box is ~100 STEP entities; validating the writer in FreeCAD is the real work [I]. `stepts` (MIT, 0.0.4) offers typed entities only [V]. Replicad and build123d both write part names [S]. |
| PDF plans | Playwright `page.pdf({ preferCSSPageSize: true })` on a print stylesheet | Vector output; Letter, Tabloid, Ledger formats; headless Chromium only [V: Playwright docs]. Chrome 131+ supports `@page` margin boxes for title blocks [V]. jsPDF 4.2.1 + svg2pdf.js 2.8.1 for browser-only export [V]. Avoid SVG-to-PDFKit (unmaintained; its fork is LGPL-3.0) [V]. |
| CSV / text cut list | own code | the reference's "Copy as text" format |

---

## Spike results

All spikes are in `spikes/` (see `spikes/README.md`). Numbers are from one run each on an Apple-silicon Mac; treat them as orders of magnitude.

| Question | Result |
|---|---|
| Can a small custom guillotine packer reproduce the closet's hand layout? | Yes. 150 lines; per-material stock, owned offcut, grain lock per part, kerf 1/8″, tries 3 sort orders × 3 split rules × preferred stock. Prefinished ¾″: one 4×8 (both partitions, right 70″ shelf turned cross-grain) + one 4×4 (fixed shelf, three adjustable shelves). Unfinished: everything on the owned 56 × 48, including the 48⅝″ face strip. 1–3 ms per material. No overlaps, all inside the sheet (checked). |
| Does `guillotine-packer` do it? | No: two full 4×8 sheets for phase 1, and it throws when a part is larger than the single bin size. |
| Picking, highlight and section in plain three.js with Vite | 10 of 10 checks passed: 3D hover picks the part; the matching SVG rect and table row highlight; hovering a table row tints the mesh; a section plane hides geometry and picking skips it (after filtering); HMR keeps camera and hover. |
| Does `Raycaster` respect clipping planes? | No. It returned `partition-left` twice with every part clipped. Filter hits by plane distance. |
| HMR latency, file write → scene rebuilt | 47–63 ms. |
| Syntax error during an agent edit | Vite overlay appears; fixing the file recovers without a page reload. |
| Self-accepting glob loader for projects and their helper files | Works: no page reload for an edit to a project or to a file it imports; the store module is evaluated once. |
| Same TypeScript model in Node | Works with `--experimental-strip-types` on Node 22.15.1 when imports use `.ts` extensions; source line and column of each part are exact. |
| build123d on a closet-sized model | 24 labelled parts, 2 dados, 112 holes: import 3.7 s, build 0.15 s, hidden-line projection 0.05 s, STEP 0.14 s, glTF 0.65 s, STL 0.98 s. Labels reach STEP `PRODUCT` names and glTF node names. Projected SVG has no part identity. |
| manifold-3d | 528 KB wasm (205 KB gz), init 17 ms, booleans 79 ms for both partitions with dado and 56 holes each; triangle runs trace back to the source part or the cutter. |
| Replicad | 21.9 MB wasm (7.2 MB gz), init 214 ms; 2.6 s with 112 sequential cuts, 0.44 s with one compound cut per partition; STEP 0.12 s with part names. |
| `UserPromptSubmit` hook stdout reaches the model | Yes (Claude Code 2.1.288). Control without the hook: "UNKNOWN". |
| `PostToolUse` exit 2 stderr reaches the model after an edit | Yes; the model quoted it verbatim. |

### The closet encoded as a model, end to end
`spikes/fixture/` holds a minimal implementation of the modelling API that `spec.md` defines (`dsl.ts`), the closet encoded in it (`closet.ts`, the same file as `spec.md` section 8), an evaluator with the spec's invariants and cut-list grouping (`evaluate.ts`), and sheet layouts derived from the model through the spike packer (`sheets.ts`). Results [S]:

- 58 parts, 14 context parts (walls, contents), 9 steps, 6 design-rule checks, 4 drawing views. Evaluation takes 3–12 ms per configuration.
- The derived cut list matches the concept sheet's, row for row. The differences are deliberate: the 20¼″ frame back (see below); lengths are written along the grain, so the cross-grain right 70″ shelf reads 11¼ × 28; and the phase 2 faces are listed one by one, cut in phase 1 as one strip.
- Banded front edges total 257⅝″ (21½ ft); the sheet says "about 20 ft".
- The derived sheet layouts match the sheet's layout: a 4×8 with both partitions and the right 70″ shelf, a 4×4 with the four center shelves, and the owned 56 × 48 holding the 48⅝″ face strip, the three top shelves and both nailers. Phase 2 fits one 5×5 of ½″ Baltic birch and one 4×4 of ¼″ plywood.
- Both configurations (three drawers, two drawers) evaluate. With two drawers the kept adjustable shelves move to 50 13/16″ and 60⅜″.

### Discrepancies found while encoding the reference
Encoding the sheet as boxes exposed three problems that the concept sheet does not mention. With the sheet's own sizes, the overlap check reports the first two as errors [S: `ERROR overlap: p1: partition-left overlaps top-shelf-center-nosing by ¾ × ¾ × ¾`, and the same for the right partition; `ERROR overlap: p2: hamper-frame-rail overlaps hamper-frame-back by ¾ × 3 × ½`]. The third is a design-rule check:
1. The center top shelf's 24″ nosing hangs ¾″ below the shelf, so it passes through the tops of both partitions. The fixture declares a notch joint with a note, which is what a builder would do.
2. The hamper frame's back panel, listed 21 × 24, collides with the 21″ top rail where the rail passes it. The fixture uses a 20¼″ back that butts the rail.
3. The rolling hamper may be "up to 22 tall", but the top rail it rolls out under has its underside 21½″ off the floor (a 3″ rail at the top of a frame that ends 24½″ up). The fixture keeps the sheet's numbers and the check fails as a warning; the user has to choose (see the open questions in `spec.md`).

---

## Comparison table

| Tool | Area | Licence | Latest release (as found) | Runtime | Good at | Bad at | Fit |
|---|---|---|---|---|---|---|---|
| OpenSCAD | CAD as code | GPL-2.0 | 2021.01 stable; snapshot 2026.10.02 | C++, wasm | agents write it well | no STEP, drawings or IDs | low–medium |
| CadQuery | CAD as code | Apache-2.0 | 2.8.0, 2026-06-21 | Python | exact HLR SVG, assemblies | heavy, fluent API errors | medium |
| build123d | CAD as code | Apache-2.0 | 0.13.0, 2026-09-21 | Python | HLR, drafting, labels into STEP/glTF | Python only; projection loses IDs | medium–high as optional sidecar |
| Replicad | CAD as code | MIT + LGPL-2.1 wasm | 1.1.0, 2026-09-04 | TS + wasm | browser B-rep, STEP names, HLR | 22 MB wasm | high as optional on-demand kernel |
| manifold-3d | mesh kernel | Apache-2.0 | 3.5.4, 2026-09-25 | wasm | 0.5 MB, fast, IDs survive booleans | no STEP or HLR | high as optional feature geometry |
| JSCAD | CAD as code | MIT | 2.13.0, 2026-02-22 | JS | no native deps | weak kernel | low–medium |
| OpenCascade.js | kernel | LGPL-2.1 | 1.1.1 (2020); beta 2023 | wasm | — | unmaintained | low |
| FreeCAD + Woodworking WB | CAD app | LGPL-2.1 / MIT | 1.1.4, 2026-09-28 / 3.0, 2026-03-31 | desktop | richest model, TechDraw | GUI-first, not diffable | low–medium (ideas) |
| Zoo KCL | CAD as code | MIT language, closed engine | kcl-190, 2026-10-02 | cloud | — | cloud account required | low |
| OpenCutList | cut lists | GPL-3.0 | 7.1.0, 2025-12-10 | SketchUp | best part schema | tied to SketchUp | ideas only |
| PackingSolver | nesting | MIT | 0.1.1060, 2026-10-03 | C++, Python | best guillotine solver | no JS | optional offline optimiser |
| doublesharp/bin-packing | nesting | MIT | 0.4.0, 2026-09-10 | Rust, wasm | full feature set in browser | 6 stars, young | watch |
| guillotine-packer | nesting | MIT | 1.0.2, 2020-01-27 | TS | simple | one bin size, global rotation | low |
| Custom packer (spike) | nesting | — | — | TS | reproduces reference; 2 ms | must be maintained | **adopt** |
| three.js | 3D | MIT | r186, 2026-09-24 | browser | everything needed | DIY explode/caps | **adopt** |
| r3f + drei | 3D | MIT | 9.8.1 / 10.7.9, 2026-09 | React 19 | state-driven scene | version coupling | **adopt** |
| Babylon.js | 3D | Apache-2.0 | 9.29.0, 2026-10-01 | browser | batteries included | heavier | medium-high |
| three-cad-viewer | 3D | MIT | 5.0.7, 2026-09-17 | browser | complete CAD viewer | no external highlight API, own UI | checklist |
| ocp_vscode | 3D in VS Code | Apache-2.0 | 4.1.0, 2026-09-15 | VS Code + Python | precedent for live push | no file watch, Python | precedent |
| Online3DViewer | 3D | MIT | 0.18.0, 2025-12-18 | browser | many formats | no sections | low–medium |
| xeokit | 3D | AGPL-3.0 | 2.6.114, 2026-09-02 | browser | section planes, BIM | licence, own renderer | low |
| three-edge-projection | drawings | MIT | v0.0.10 (GitHub), 2026-06-11; not on npm | browser | HLR with per-mesh ranges | 0.0.x, stale peers | reserve |
| Own box projection | drawings | — | — | TS | exact for boxes, IDs on every element | must be written | **adopt** |
| @tarikjabiri/dxf | DXF | MIT | 2.9.0, 2026-09-15 | TS | DXF with layers, hatches | v3 coming | **adopt** |
| maker.js | 2D | Apache-2.0 | 0.19.2, 2026-01-27 | TS | paths, DXF/SVG | no dimensions | not needed |
| ezdxf | DXF | MIT | 1.4.4, 2026-05-14 | Python | reference DXF | no fractional dimension text; Python | alternative |
| Playwright `page.pdf` | PDF | Apache-2.0 | 1.63.0, 2026-09-04 | Node + Chromium | vector PDF from HTML | needs Chromium | **adopt** |
| jsPDF + svg2pdf.js | PDF | MIT | 4.2.1 / 2.8.1 | browser | PDF without a server | font registration | alternative |
| @xterm/xterm + node-pty | terminal | MIT | 6.0.0 / 1.2.0-beta.15 | browser + Node | VS Code's own stack | Claude Code TUI quirks; node-pty 1.1.0 broken on macOS | optional later |
| ttyd / wetty / gotty | terminal | MIT | 1.7.7 / 3.3.5 / 1.8.0 | binaries | quick | not your layout | low |
| Vite | live reload | MIT | 8.3.2, 2026-10-01 | Node | HMR in ~50 ms, keeps state | — | **adopt** |
| Claude Code hooks | agent loop | — | Claude Code 2.1.288 | CLI | selection context, edit validation | Claude Code specific | **adopt** |
| MCP TypeScript SDK | agent loop | Apache-2.0 (v2) / MIT (v1) | 2.3.0 / 1.32.0, 2026-10-02 | Node | portable tool surface | approval prompt, more moving parts | later |
| VS Code integrated browser | shell | — | VS Code 1.139.1 | Electron | app beside the terminal, zero code | WebGL performance unverified | **adopt** |
| VS Code webview extension | shell | — | — | VS Code | tightest integration | more code | later |
| Tauri 2 | shell | Apache-2.0/MIT | 2.12.1, 2026-09-30 | Rust + WKWebView | small app | Rust pty, WebKit | low |
| Electron | shell | MIT | 44.5.1, 2026-09-30 | Chromium + Node | node-pty works directly | 130 MB, packaging | low–medium |
