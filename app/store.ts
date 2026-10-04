// The one store every view reads (section 9.8 of the spec). It is long-lived: project edits
// re-run app/loader.ts, never this module, so selection, phase and camera settings survive.
import { create } from "zustand";
import type { AnyProject, Config, Resolved, Src } from "../core/model/types.ts";
import { toggleIds } from "./store-pure.ts";
export { toggleIds };

export type SideTab = "cutlist" | "sheets" | "steps" | "parts" | "checks" | "notes";
export type PaneTab = "3d" | "drawing" | SideTab; // what the tab strip shows in the two- and one-pane layouts
export type Source = "3d" | "drawing" | "cutlist" | "sheets" | "steps" | "parts" | "checks" | "agent" | "compare" | "keyboard" | null;
export type Axis = "x" | "y" | "z";

export type Section = { axis: Axis; at: number; enabled: boolean; flip: boolean }; // keeps axis < at, or axis > at when flipped
export type ThemePref = "auto" | "light" | "dark";

export type WbState = {
  projectId: string; projects: string[];
  project: AnyProject | null; // the loaded project module (for compare mode)
  config: Config; phase: string; step: string | null;
  drawingView: string; sideTab: SideTab; paneTab: PaneTab;
  // hovered and hoverSource are optional (D20): unused until hover highlighting is added
  hovered: string[]; hoverSource: Source;
  selected: string[]; selectSource: Source;
  camera: { mode: "perspective" | "orthographic" };
  section: Section; sectionSync: boolean;
  explode: number; display: "in" | "mm"; showContents: boolean; showRoom: boolean;
  hiddenLines: boolean | null; // session override of a view's hiddenLines; null keeps the view's own
  compare: Config | null; // compare mode: the other configuration
  resolved: Resolved | null; lastGood: Resolved | null;
  error: { message: string; src?: Src } | null;
  notes: string;
  loads: number; // successful evaluations so far
  theme: ThemePref;
  help: boolean;
};

export type WbActions = {
  select: (ids: string[], opts?: { toggle?: boolean; source?: Source }) => void;
  clearSelection: () => void;
  setPhase: (phase: string, step?: string | null) => void;
  setStep: (step: string | null) => void;
  setConfig: (key: string, value: string) => void;
  set: (patch: Partial<WbState>) => void;
};

export const useWb = create<WbState & WbActions>()((set, get) => ({
  projectId: "", projects: [],
  project: null,
  config: {}, phase: "", step: null,
  drawingView: "", sideTab: "cutlist", paneTab: "3d",
  hovered: [], hoverSource: null,
  selected: [], selectSource: null,
  camera: { mode: "perspective" },
  section: { axis: "x", at: 40, enabled: false, flip: false }, sectionSync: true,
  explode: 0, display: "in", showContents: false, showRoom: true,
  hiddenLines: null,
  compare: null,
  resolved: null, lastGood: null, error: null,
  notes: "",
  loads: 0,
  theme: "auto",
  help: false,

  select: (ids, opts = {}) => {
    const cur = get().selected;
    const next = opts.toggle ? toggleIds(cur, ids) : [...new Set(ids)];
    if (next.length === cur.length && next.every((id, i) => id === cur[i])) return;
    set({ selected: next, selectSource: opts.source ?? null });
  },
  clearSelection: () => {
    if (get().selected.length) set({ selected: [], selectSource: null });
  },
  setPhase: (phase, step = null) => set({ phase, step }),
  setStep: (step) => set({ step }),
  setConfig: (key, value) => set({ config: { ...get().config, [key]: value } }),
  set: (patch) => set(patch),
}));

declare global {
  interface Window {
    __wbLoadCount?: number;
    __wb?: Record<string, unknown>;
  }
}

if (import.meta.env.DEV) {
  window.__wb = { ...(window.__wb ?? {}), store: useWb };
}
