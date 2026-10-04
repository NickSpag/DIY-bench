// The model's types: what a project file declares (section 5.2 of the spec) and what
// evaluation resolves it to (section 6.2). Pure types; no runtime code.

export type Axis = "x" | "y" | "z";
export type Range = readonly [number, number]; // [from, to], from < to
export type Box = { x: Range; y: Range; z: Range }; // axis-aligned, world coordinates
export type Face = "left" | "right" | "bottom" | "top" | "back" | "front";
export type Finish = "prefinished" | "clear" | "paint" | "none";
export type Exposure = "exposed" | "hidden" | "limited"; // limited: visible only partly or from below; say how in exposureNote
export type JointKind =
  | "screws" | "pocket-screws" | "glue" | "pins" | "rests-on" | "slides" | "nails"
  | "dado" | "groove" | "rabbet" | "notch"; // the last four allow the two parts to overlap
export type Cylinder = { axis: Axis; from: number; to: number; center: readonly [number, number]; diameter: number };
// center is the coordinate pair on the two other axes in x,y,z order (for axis "x": [y, z]).

export type Units = "in" | "mm";

export type Stock = {
  id: string; // unique within the material, e.g. "4x8", "owned-56x48"
  length: number; // along the grain
  width: number;
  owned?: number; // how many the user already has; used before anything is bought
  buy?: boolean; // purchasable in any quantity
  cost?: number; // per piece, optional
  note?: string;
};
export type SheetMaterial = {
  type: "sheet"; name: string; thickness: number; grained: boolean; finish: Finish;
  thicknessLabel?: string; // display text for the thickness, e.g. "12 mm"; see section 5.6
  color?: string; // display colour in the 3D view and drawings (a CSS colour), for a painted or coloured material
  kerf?: number; // default 0.125 in, 3 mm
  trim?: number; // edge trim per side before layout, default 0
  oversize?: number; // added to length and width of every cut size, default 0
  stock: Stock[];
};
export type BoardMaterial = {
  type: "board"; name: string; thickness: number;
  thicknessLabel?: string; // display text for the thickness; see section 5.6
  color?: string; // display colour in the 3D view and drawings (a CSS colour), for a painted or coloured material
  width?: number; // fixed section width for dimensional lumber (1×4 → 3.5); omit for glued-up panels
  nominal?: string; // "1×4"
  finish: Finish;
  stockLengths?: number[]; // e.g. [96, 120], for the shopping list
  kerf?: number; // saw kerf between pieces cut from one board, default 0.125 in, 3 mm
  oversize?: number; // added to length and width of every cut size, default 0
};
export type Material = SheetMaterial | BoardMaterial;
export type Banding = { name: string; thickness: number; width: number; reducesCutSize: boolean };
export type HardwareItem = { name: string; unit: "each" | "pair" | "ft" | "set"; spec?: string; cost?: number };
export type Joint = { to: string; by: JointKind; note?: string };
export type Src = { file: string; line: number; col: number } | null;

type Common = {
  id: string; // kebab-case, unique, stable for the life of the physical piece
  name: string; // cut-list name; interchangeable parts share it ("Partition")
  where?: string; // which instance ("left"); shown in tooltips and part lists
  phase: string; // phase in which it is built or installed
  step?: string; // step that installs it
  removedIn?: string; // phase from which it is no longer in the build
  moves?: Record<string, Box>; // phase id → new placement from that phase on
  notes?: string; // shown in the cut list and part details
  tags?: string[]; // free-form, for filtering
  joins?: Joint[];
};
export type PanelSpec = Common & {
  material: string; // key into materials (sheet for panel, board for board)
  box: Box;
  grain?: Axis; // world axis the grain runs along; required when the material is grained
  grainLock?: boolean; // default true; false lets nesting turn the part (say why in notes)
  band?: Partial<Record<Face, string>>; // banded faces → banding id; only edge faces
  exposure?: Exposure; // default "exposed"
  exposureNote?: string;
  finish?: Finish; // what to apply; default the material's finish
  fitToSite?: boolean; // listed at nominal size; measure in place before cutting
  cutIn?: string; // phase in which it is cut, if earlier than `phase`
  strip?: { id: string; name: string; order: number }; // grain-matched sequence cut from one strip
};
export type HardwareSpec = Common & {
  item: string; // key into hardware catalogue
  qty: number; // in the item's unit
  box?: Box; cylinder?: Cylinder; // optional geometry for drawings and 3D
  length?: number; // for stock cut to length (rods)
  fitToSite?: boolean;
};
export type ContextRole = "wall" | "floor" | "fixture" | "contents" | "space";
export type ContextSpec = {
  id: string; name: string; where?: string;
  role: ContextRole; // walls, floor and fixtures take part in overlap checks; contents and spaces never do. A fixture is
  // something fixed in the room that the build works around (a TV, an air conditioner, a radiator): drawn solid.
  // A space is room kept for something not chosen yet (a media console): a dashed outline, never in overlap checks.
  box: Box; phase?: string; removedIn?: string; moves?: Record<string, Box>;
  color?: string; // display colour in the 3D view and drawings (a CSS colour), e.g. water or soil
};

export type PartKind = "panel" | "board" | "hardware" | "context";
export type PanelPart = PanelSpec & { kind: "panel"; src: Src };
export type BoardPart = PanelSpec & { kind: "board"; src: Src };
export type HardwarePart = HardwareSpec & { kind: "hardware"; src: Src };
export type ContextPart = ContextSpec & { kind: "context"; src: Src };
export type CutPart = PanelPart | BoardPart; // parts that appear in the cut list
export type Part = PanelPart | BoardPart | HardwarePart | ContextPart;

export type StepSpec = { id: string; phase: string; title: string; text: string; parts?: string[] };
export type Step = StepSpec & { src: Src };
export type Severity = "error" | "warning";
export type Check = { id: string; label: string; pass: boolean; detail?: string; severity: Severity; src: Src };

export type Ref = number | `${string}.${Axis}${0 | 1}`; // a number, or a part face: "partition-left.x0"
export type Dim = { from: Ref; to: Ref; offset: number; text?: string }; // text: "{}" is replaced by the length
export type Label = {
  part?: string; at?: readonly [number, number]; // at: view coordinates (u, v)
  text: string; // tokens {x0} {x1} {y0} {y1} {z0} {z1} {x} {y} {z} (centres) {len} — formatted lengths
  anchor?: "start" | "middle" | "end"; rotate?: number; dx?: number; dy?: number;
};
export type Look = "-z" | "+z" | "-x" | "+x" | "-y";
export type View = {
  id: string; title: string;
  kind: "elevation" | "section" | "plan";
  look: Look; // the direction the viewer looks
  cut?: number; // section and plan: position of the cut plane on the look axis
  depth?: Range; // optional: ignore parts outside this range on the look axis
  veil?: string[]; // parts drawn as a translucent hatch instead of opaque (front walls, headers)
  hiddenLines?: boolean; // draw hidden edges dashed; default false
  showContents?: boolean; // default true
  dims?: Dim[]; labels?: Label[]; caption?: string;
  scale?: number; // text and line scale; default derived from the view's extent
};

export type OptionDef = { label: string; choices: Record<string, string>; default: string };
export type Phase = { id: string; title: string; summary?: string };
export type OptionValues<O extends Record<string, OptionDef>> = { [K in keyof O]: keyof O[K]["choices"] & string };

// The builder's public surface, declared here so Project can name it without a circular import.
export interface ModelBuilder {
  panel(spec: PanelSpec): PanelPart;
  board(spec: PanelSpec): BoardPart;
  hardware(spec: HardwareSpec): HardwarePart;
  context(spec: ContextSpec): ContextPart;
  step(spec: StepSpec): void;
  check(id: string, label: string, pass: boolean, detail?: string, severity?: Severity): void;
  view(v: View): void;
  part(id: string): Part;
  boxOf(id: string): Box;
}

export type Project<O extends Record<string, OptionDef> = Record<string, OptionDef>> = {
  id: string; title: string; units: Units;
  options: O; phases: Phase[];
  materials: Record<string, Material>; banding: Record<string, Banding>; hardware: Record<string, HardwareItem>;
  build: (b: ModelBuilder, opt: OptionValues<O>) => void;
};
// Any project, whatever its options. Used by functions that accept every project.
export type AnyProject = Project<any>;

export type Config = Record<string, string>;

// ---------- resolved (section 6.2) ----------

export type Sizes = { l: number; w: number; t: number; lAxis: Axis; wAxis: Axis; tAxis: Axis };
export type ResolvedExtra = {
  bounds?: Box; // box, or the cylinder's bounding box
  sizes?: Sizes; // panels and boards
  materialDef?: Material; // panels and boards: materials[material] (material itself stays the key)
  finishApplied?: Finish; // panels and boards: finish ?? material.finish
  cutPhase: string; // cutIn ?? phase (context parts with no phase: the first phase)
};
export type ResolvedPanel = PanelPart & ResolvedExtra;
export type ResolvedBoard = BoardPart & ResolvedExtra;
export type ResolvedHardware = HardwarePart & ResolvedExtra;
export type ResolvedContext = ContextPart & ResolvedExtra;
export type ResolvedCutPart = ResolvedPanel | ResolvedBoard;
export type ResolvedPart = ResolvedPanel | ResolvedBoard | ResolvedHardware | ResolvedContext;

export type PhaseState = { phase: string; step?: string; parts: { part: ResolvedPart; box?: Box }[] }; // box after moves
export type IssueSeverity = "error" | "warning" | "info";
export type Issue = {
  severity: IssueSeverity; code: string; message: string;
  parts?: string[]; phases?: string[]; src?: Src;
};
export type ResolvedStep = Step & { parts: string[] }; // parts filled from part.step when not listed

export type Resolved = {
  project: { id: string; title: string; units: Units };
  config: Config;
  phases: Phase[];
  materials: Record<string, Material>;
  banding: Record<string, Banding>;
  hardware: Record<string, HardwareItem>;
  parts: ResolvedPart[]; // every part, every phase, in declaration order
  steps: ResolvedStep[];
  checks: Check[];
  views: View[];
  issues: Issue[];
  part(id: string): ResolvedPart | undefined;
  stateAt(phase: string, step?: string): PhaseState; // memoised
};
