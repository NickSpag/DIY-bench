// Notes tab (section 9.7): the project's notes.md, rendered with marked.
import { useMemo } from "react";
import { marked } from "marked";
import { useWb } from "../store.ts";

export function NotesPanel() {
  const notes = useWb((s) => s.notes);
  const html = useMemo(() => marked.parse(notes, { async: false, gfm: true }) as string, [notes]);
  if (!notes.trim()) return <div className="pane-pad empty">This project has no notes.md.</div>;
  return <div className="pane-pad notes" data-testid="notes" dangerouslySetInnerHTML={{ __html: html }} />;
}
