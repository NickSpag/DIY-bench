// Self-accepting loader: owns the glob of project modules. When a project (or anything it imports)
// changes, this module re-executes and pushes the fresh project into the long-lived store.
import { store } from "./store.ts";
const mods = import.meta.glob("../projects/*/project.ts");
export async function load(id: string) {
  const m: any = await mods[`../projects/${id}/project.ts`]();
  store.setProject(m.default);
}
load(store.projectId);
if (import.meta.hot) import.meta.hot.accept();
