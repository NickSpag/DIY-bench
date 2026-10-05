# DIY-bench

## 1. What this repo is

DIY-bench is a design tool for woodworking and DIY projects. Each project is a TypeScript
model in `projects/<id>/project.ts`, with its design reasoning in `projects/<id>/notes.md`. A
browser view (`npm run dev`, http://127.0.0.1:5180) shows the model live: 3D, drawings, cut
list, sheet layouts and build steps, updating on every save.

Nothing in `projects/<id>/expected/` or `.diy-bench/` is edited by hand.

## 2. The loop

1. The user describes a change.
2. You edit `project.ts`.
3. The `PostToolUse` hook checks your edit (every configuration, the invariants, the design
   rules) and tells you what changed against the last good model. If it fails, fix the model
   before you say anything else to the user.
4. Then tell the user, in one or two sentences, what changed in what they will build: parts
   resized or moved, cut-list rows, sheets bought.
5. Use `./wb diff` when the hook's summary is not enough.

## 3. "This one", "that shelf"

- Every prompt may start with `[diy-bench]` lines from the viewer: the project, options,
  phase and drawing view, then `selected:` with each selected part's id, name, size, material,
  position and source line (`projects/<id>/project.ts:193`). If hover highlighting is added
  later, a `hovered:` line follows; prefer the selection.
- If nothing is selected (`selected: nothing`), there are no `[diy-bench]` lines, or the line
  says the state is hours old, ask which part the user means. Do not guess.
- A part generated in a loop (one of several identical shelves or drawer sides) shares its
  source line with its siblings. Say whether the change applies to the one selected or to all
  of them, and ask if that is unclear.

## 4. Where to make a change

- Change the named dimensions in `P` at the top of `project.ts` rather than editing boxes.
- Keep derived values derived: compute them inside `build` from `P`, never type the result
  in a second time.
- A change to one instance of a looped part needs an explicit exception in the loop
  (`if (i === 2) …`). Never copy the loop body out.
- Keep IDs stable. A renamed or resized piece keeps its ID; a new physical piece gets a new
  ID. Cut lists, steps, drawings and the user's selection all refer to IDs.
- Mark anything you assumed with `// inferred` and add it to `notes.md` under "Assumptions".

## 5. Units

- The project's units are in `defineProject` (`units: "in"` or `"mm"`). Imperial values are
  decimal inches: 23.25, not "23 1/4".
- Round anything you compute by division to 1/16″ with `Math.round(x * 16) / 16`, or the
  `cut-precision` warning fires.
- Speak to the user in fractions (`23¼″`), never decimals. `./wb part <id>` prints sizes
  that way.

## 6. Design rules

When the user states a requirement ("the hamper must roll out", "bins must come down"), add
a `b.check(id, label, pass, detail, severity)` for it, with the numbers in `detail`. Never
delete or loosen a failing check to make the hook pass; tell the user it fails and why.

## 7. Phases, steps and options

- `phase`, `removedIn`, `moves` and `cutIn` express time: what is built when, what comes out
  later, what moves, what is cut early.
- Build steps are `b.step(...)`; each part names its `step`.
- `options` express choices the user has not made yet. Never create a second project to
  compare a variant; add an option and read it through `opt` inside `build`. The viewer's ⇄
  button and `./wb diff --against opt:key=value` compare the choices.

## 8. Seeing your work

- `./wb render --view front --out /tmp/front.png`, then read the PNG. `--view` takes a
  drawing view id (the project's `b.view` calls; a wrong id lists them), `3d-front`,
  `3d-iso`, `3d-top`, `sheets` or `cutlist`. Add `--phase`, `--step`, `--opt k=v` or `--select ids`.
- `./wb show --select id1,id2 --phase p2` points the user's open viewer at something.
  Other flags: `--step`, `--view <drawing view>`, `--tab cutlist|sheets|steps|parts|checks|notes`,
  `--opt k=v`, `--frame`. It exits 3 when no viewer is open.
- `./wb state` prints what the viewer shows and has selected; `./wb status` also says
  whether the dev server is running.
- Errors in the viewer (uncaught exceptions, scripts that fail to load, render crashes, a lost
  WebGL context) are kept in `.diy-bench/errors.json`. `./wb state` and `./wb status` list them,
  and a new one arrives with your next prompt as a `[diy-bench] viewer error:` line. When the
  user says the viewer is blank or gray, read these before asking them to open DevTools.
  Reloading the viewer marks older errors stale.

## 9. Materials, stock and cost

Ask before changing a material, a stock list, or anything else that changes what the user
buys. Report sheet-count changes explicitly ("now 2 sheets of 4×8 instead of 1"); the hook's
`sheets CHANGED:` line tells you when that happens.

## 10. Starting a project

Use the `new-project` skill. It asks for measurements and creates `projects/<id>/` with
`./wb new <id> --template blank|shelf|cabinet|closet`. Never invent room measurements; use
placeholders marked `// inferred` and list them in `notes.md` as open questions.

## 11. Model API cheat sheet

Coordinates: x runs left to right facing the back wall, y up from the floor, z out from the
back wall toward the room. "Front" faces +z. A `Range` is `[from, to]` with from < to; a
`Box` is `box(x, y, z)`; `span(start, length)` is `[start, start + length]`.

```ts
import { defineProject, span, box, type Range } from "../../core/model/index.ts";
export const P = { width: 30, shelves: 4 /* inferred */ };   // named dimensions
export default defineProject({
  id: "my-shelf", title: "My shelf", units: "in",
  options: { top: { label: "Top", choices: { "1": "1″", "0.75": "¾″" }, default: "1" } },
  phases: [{ id: "p1", title: "Build" }],
  materials: {   // sheet: stock list; board: optional fixed width
    ply: { type: "sheet", name: "23/32″ plywood (sold as ¾″)", thickness: 23 / 32, grained: true, finish: "paint",
           kerf: 0.125, stock: [{ id: "4x8", length: 96, width: 48, buy: true }] },
    "pine-1x4": { type: "board", name: "1×4", nominal: "1×4", thickness: 0.75, width: 3.5, finish: "none" },
  },
  banding: { edge: { name: "Edge banding", thickness: 0.02, width: 0.8125, reducesCutSize: false } },
  hardware: { pin: { name: "Shelf pins", unit: "each" } },
  build(b, opt) {
    b.panel({ id, name, where?, material, phase, step, box, grain: "x"|"y"|"z", band?: { front: "edge" },
              joins?: [{ to, by: "screws"|"pocket-screws"|"glue"|"pins"|"rests-on"|"slides"|"nails"|"dado"|"groove"|"rabbet"|"notch", note? }],
              exposure?: "exposed"|"hidden"|"limited", exposureNote?, finish?, fitToSite?, grainLock?, cutIn?, removedIn?, moves?: { p2: box(...) },
              strip?: { id, name, order }, notes?, tags? });
    b.board({ ...same fields, material: a board material });
    b.hardware({ id, name, item, qty, phase, step, box? | cylinder?: { axis, from, to, center: [a, b], diameter }, length?, fitToSite? });
    b.context({ id, name, role: "wall"|"floor"|"fixture"|"contents"|"space", box, color? });   // the room; walls, floor and fixtures (TV, AC, radiator) take part in overlap checks; a space (room kept for a console not bought yet) is a dashed outline
    b.step({ id, phase, title, text, parts? });
    b.check(id, label, pass, detail?, severity?: "warning"|"error");   // default warning
    b.view({ id, title, kind: "elevation"|"section"|"plan", look: "-z"|"+z"|"-x"|"+x"|"-y", cut?, dims?: [{ from: "part.x0", to: "part.x1", offset }], labels?, veil?, caption?, hiddenLines? });
    b.part(id); b.boxOf(id);   // read back what is already built
  },
});
```

Two patterns from `projects/closet-built-in/project.ts`:

- **A helper for repeated assemblies.** `shelfOnCleats(id, name, where, x, y, material, extra)`
  builds a shelf and its glued nosing in one call; each call site is one line, and the
  shelf's id prefixes the nosing's (`top-shelf-left-nosing`).
- **A loop with derived positions.** The drawers loop over `P.drawerZones` (`[8, 7, 6]`):
  face tops are running sums from `P.hamper.bay`, and every id carries the drawer number
  (`drawer-2-side-l`). A fourth drawer is a fourth zone, not new code.

A design rule, from the same file:

```ts
const railBottom = b.boxOf("hamper-frame-rail").y[0];
b.check("hamper-under-rail", "The rolling hamper rolls out under the frame's top rail",
  P.hamper.h <= railBottom, `hamper ${P.hamper.h}″ tall, rail underside ${railBottom}″ off the floor`);
```

## 12. When the hook fails

| Code | Usual fix |
|---|---|
| `overlap` | Two parts occupy the same space in a phase. Move or shorten one; if they really interlock, declare the joint (`dado`, `groove`, `rabbet` or `notch`) in `joins`. |
| `outside-room` | A part lies outside the walls and floor: usually a sign error or a misplaced decimal. |
| `thickness` | No axis of the box equals the material's thickness. Use `span(x, T)` on the thin axis. |
| `board-width` | A dimensional board's box does not match its fixed width (1×4 is 3½″). |
| `grain-axis` | `grain` is missing on a grained sheet, or lies along the thickness. |
| `band-face` | Banding is on a broad face; band edges only (`front`, `top`, …, whichever are edges). |
| `unknown-ref`, `unknown-step`, `unknown-phase`, `unknown-material`, `unknown-banding`, `unknown-hardware` | A name does not resolve: a typo, or a part, step or material that was renamed. |
| `range-order` | A range has from ≥ to. Check the arithmetic that produced it. |
| `strip-mismatch` | Parts in one grain-matched strip differ in material, cut phase or width, or share an `order`. |
| `cut-precision` (warning) | A size is not a multiple of 1/32″. Round computed values to 1/16″. |
| `unfinished-exposed` (warning) | An exposed part has finish `none`. Set a finish, or mark it `hidden` or `limited`. |
| `no-step` (warning) | A part has no `step`. Add it to the step that installs it. |
| `nesting:unplaced` | A part fits on no sheet in stock: it is too big, or the owned pieces are used up and nothing is marked `buy`. Ask before changing stock. |
| `check:<id>` | A design rule fails. Change the design, or tell the user; never delete the check. |
| `evaluation`, `cannot load` | The program threw or does not parse. The message gives the file and line. |

## 13. Working on the tool itself (`core/`, `app/`, `tools/`)

- The edit hook ignores these folders; check your own work.
- Run `npm run typecheck`, `npm test` and `npm run e2e`.
- Golden files change only through `./wb snapshot --update <project>`, and only after you
  have looked at the diff and can explain each change.
- Keep `core/` free of DOM and Node APIs.
- `tools/vite-plugin.ts` and anything it imports are part of Vite's config: editing them
  restarts the dev server and reloads the open viewer.
- Do not add runtime dependencies beyond those in `docs/research/spec.md` section 3 without
  recording why here. Added so far: `@types/react` and `@types/react-dom` (19.3.0), type
  declarations for React under strict TypeScript.

## 14. Do not

- edit `.diy-bench/` or `expected/` by hand;
- commit unless asked;
- add dependencies without recording why;
- silence an invariant or delete a failing check;
- start a second dev server: check `./wb status` first.

## 15. Writing style for `notes.md` and messages to the user

Plain sentences. Standard woodworking terms (dado, rabbet, nosing, cleat, face frame,
overlay, inset, kerf, grain). No invented labels.

## 16. Sharing the repo with other sessions

Several Claude Code sessions may work in this checkout at once, usually one per project. They
share the working tree, the dev server, the viewer and `.diy-bench/state.json`.

- **Check the project in the `[diy-bench]` lines.** The viewer shows one project at a time. If
  the lines name a project other than yours, the selection belongs to another session: ignore
  it, and ask which part the user means.
- **Stage only your own files.** Commit with explicit paths (`git add projects/<id>`, plus any
  tool files you changed yourself). Never `git add -A`, `git add .` or `git commit -a`: they
  sweep up another session's unfinished work.
- **Update only your project's reference files:** `./wb snapshot --update <id>`, never for every
  project at once. If a tool change alters another project's `expected/` files, say so and
  update them in the same commit only after reading the diff.
- **Don't start, stop or restart the dev server** if `./wb status` says it is running; another
  session is using it. Editing `tools/vite-plugin.ts` restarts it for everyone.
- **Tool changes affect every project.** Before committing a change to `core/`, `app/` or
  `tools/`, run `./wb check --all-configs` and `npm test`, not only your own project's checks.

