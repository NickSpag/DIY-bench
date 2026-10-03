// UserPromptSubmit hook: print what the user is pointing at; stdout is added to the prompt's context.
import fs from "node:fs";
try {
  const s = JSON.parse(fs.readFileSync(new URL("./.workbench/selection.json", import.meta.url), "utf8"));
  console.log(`[workbench] selected: ${s.selected.join(", ") || "none"}; hovered: ${s.hovered ?? "none"}; view: ${s.view}; phase: ${s.phase}`);
} catch { /* no viewer running: print nothing */ }
