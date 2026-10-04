import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function listProjects(): string[] {
  const dir = join(root, "projects");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "project.ts")))
    .map((e) => e.name)
    .sort();
}

const [command] = process.argv.slice(2);

if (command === "list") {
  const projects = listProjects();
  console.log(projects.length === 0 ? "no projects" : projects.join("\n"));
} else {
  console.error("usage: wb list");
  process.exit(command === undefined ? 0 : 1);
}
