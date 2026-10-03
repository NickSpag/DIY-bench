// Spike: a minimal implementation of the modelling API that spec.md section 5 defines.
// Enough to evaluate the closet fixture, run the invariants and print a cut list.

export type Axis = "x" | "y" | "z";
export type Range = readonly [number, number];
export type Box = { x: Range; y: Range; z: Range };
export type Face = "left" | "right" | "bottom" | "top" | "back" | "front";
export type Finish = "prefinished" | "clear" | "paint" | "none";
export type Exposure = "exposed" | "hidden" | "limited";
export type JointKind =
  | "screws" | "pocket-screws" | "glue" | "pins" | "rests-on" | "slides" | "nails"
  | "dado" | "groove" | "rabbet" | "notch";
export const OVERLAPPING_JOINTS: JointKind[] = ["dado", "groove", "rabbet", "notch"];

export type Stock = { id: string; length: number; width: number; owned?: number; buy?: boolean; cost?: number; note?: string };
export type SheetMaterial = { type: "sheet"; name: string; thickness: number; grained: boolean; finish: Finish; kerf?: number; stock: Stock[] };
export type BoardMaterial = { type: "board"; name: string; thickness: number; width?: number; finish: Finish; nominal?: string };
export type Material = SheetMaterial | BoardMaterial;
export type Banding = { name: string; thickness: number; width: number; reducesCutSize: boolean };
export type HardwareItem = { name: string; unit: "each" | "pair" | "ft" | "set"; spec?: string };
export type Joint = { to: string; by: JointKind; note?: string };
export type Src = { file: string; line: number; col: number } | null;
export type Cylinder = { axis: Axis; from: number; to: number; center: readonly [number, number]; diameter: number };

type Common = {
  id: string; name: string; where?: string; phase: string; step?: string; removedIn?: string;
  moves?: Record<string, Box>; notes?: string; tags?: string[]; joins?: Joint[];
};
export type PanelSpec = Common & {
  material: string; box: Box; grain?: Axis; grainLock?: boolean; band?: Partial<Record<Face, string>>;
  exposure?: Exposure; exposureNote?: string; finish?: Finish; fitToSite?: boolean; cutIn?: string;
  strip?: { id: string; name: string; order: number };
};
export type HardwareSpec = Common & { item: string; qty: number; box?: Box; cylinder?: Cylinder; length?: number; fitToSite?: boolean };
export type ContextSpec = { id: string; name: string; where?: string; role: "wall" | "floor" | "contents"; box: Box; phase?: string; removedIn?: string; moves?: Record<string, Box> };

export type Part =
  | ({ kind: "panel" } & PanelSpec & { src: Src })
  | ({ kind: "board" } & PanelSpec & { src: Src })
  | ({ kind: "hardware" } & HardwareSpec & { src: Src })
  | ({ kind: "context" } & ContextSpec & { src: Src });

export type Step = { id: string; phase: string; title: string; text: string; parts?: string[]; src: Src };
export type Check = { id: string; label: string; pass: boolean; detail?: string; severity: "error" | "warning"; src: Src };
export type Ref = number | `${string}.${"x" | "y" | "z"}${0 | 1}`;
export type Dim = { from: Ref; to: Ref; offset: number; text?: string };
export type Label = { part?: string; at?: readonly [number, number]; text: string; anchor?: "start" | "middle" | "end"; rotate?: number };
export type View = {
  id: string; title: string; kind: "elevation" | "section" | "plan";
  look: "-z" | "+z" | "-x" | "+x" | "-y";
  cut?: number; depth?: Range; veil?: string[]; hiddenLines?: boolean;
  dims?: Dim[]; labels?: Label[]; caption?: string;
};

export type OptionDef = { label: string; choices: Record<string, string>; default: string };
export type Project<O extends Record<string, OptionDef>> = {
  id: string; title: string; units: "in" | "mm";
  options: O; phases: { id: string; title: string; summary?: string }[];
  materials: Record<string, Material>; banding: Record<string, Banding>; hardware: Record<string, HardwareItem>;
  build: (b: Builder, opt: { [K in keyof O]: keyof O[K]["choices"] & string }) => void;
};

export function defineProject<O extends Record<string, OptionDef>>(p: Project<O>) { return p; }
export const span = (start: number, length: number): Range => [start, start + length];
export const box = (x: Range, y: Range, z: Range): Box => ({ x, y, z });

function callerSite(depth = 3): Src {
  const line = (new Error().stack ?? "").split("\n")[depth] ?? "";
  const m = line.match(/\(?((?:file:\/\/)?[^()\s]+):(\d+):(\d+)\)?$/);
  return m ? { file: m[1].replace(/^file:\/\//, ""), line: +m[2], col: +m[3] } : null;
}

export class Builder {
  parts: Part[] = []; steps: Step[] = []; checks: Check[] = []; views: View[] = [];
  private byId = new Map<string, Part>();
  private add<P extends Part>(p: P): P {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.id)) throw new Error(`part id "${p.id}" is not kebab-case`);
    if (this.byId.has(p.id)) throw new Error(`duplicate part id "${p.id}"`);
    this.byId.set(p.id, p); this.parts.push(p); return p;
  }
  panel(s: PanelSpec) { return this.add({ kind: "panel", ...s, src: callerSite() } as Part & { kind: "panel" }); }
  board(s: PanelSpec) { return this.add({ kind: "board", ...s, src: callerSite() } as Part & { kind: "board" }); }
  hardware(s: HardwareSpec) { return this.add({ kind: "hardware", ...s, src: callerSite() } as Part & { kind: "hardware" }); }
  context(s: ContextSpec) { return this.add({ kind: "context", ...s, src: callerSite() } as Part & { kind: "context" }); }
  step(s: Omit<Step, "src">) { this.steps.push({ ...s, src: callerSite() }); }
  check(id: string, label: string, pass: boolean, detail?: string, severity: "error" | "warning" = "warning") {
    this.checks.push({ id, label, pass, detail, severity, src: callerSite() });
  }
  view(v: View) { this.views.push(v); }
  part(id: string) { const p = this.byId.get(id); if (!p) throw new Error(`no part "${id}"`); return p; }
  boxOf(id: string): Box { const p = this.part(id) as { box?: Box }; if (!p.box) throw new Error(`part "${id}" has no box`); return p.box; }
}
