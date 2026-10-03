// Long-lived state; it is never re-executed by project edits.
export const store = {
  projectId: "closet",
  project: null as any,
  setProject(p: any) { this.project = p; (window as any).__wb = { ...(window as any).__wb, project: p, loads: ((window as any).__wb?.loads ?? 0) + 1 }; },
};
(window as any).__wb = { storeEvaluations: ((window as any).__wb?.storeEvaluations ?? 0) + 1 };
