// Reads the initial state from the URL (section 9.2). Kept apart from url.ts, which installs
// the URL writer as a side effect.
export type UrlState = { project?: string; config: Record<string, string>; phase?: string; step?: string | null; view?: string; tab?: string };

export function readUrl(search: string = location.search): UrlState {
  const q = new URLSearchParams(search);
  const config: Record<string, string> = {};
  for (const [k, v] of q) if (k.startsWith("opt.")) config[k.slice(4)] = v;
  const out: UrlState = { config };
  const project = q.get("project"), phase = q.get("phase"), step = q.get("step"), view = q.get("view"), tab = q.get("tab");
  if (project) out.project = project;
  if (phase) out.phase = phase;
  if (step) out.step = step;
  if (view) out.view = view;
  if (tab) out.tab = tab;
  return out;
}
