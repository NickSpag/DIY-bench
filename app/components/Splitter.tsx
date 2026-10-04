// A vertical splitter between two panes. It reports the pointer's x as a fraction of the
// workspace width; the workspace turns that into a column size and remembers it.
import { useRef, useState } from "react";

export function Splitter({ className, onMove, onDone }: { className: string; onMove: (clientX: number) => void; onDone: () => void }) {
  const [dragging, setDragging] = useState(false);
  const active = useRef(false);
  return (
    <div
      className={`splitter ${className}${dragging ? " dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => {
        active.current = true;
        setDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (active.current) onMove(e.clientX);
      }}
      onPointerUp={(e) => {
        if (!active.current) return;
        active.current = false;
        setDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        onDone();
      }}
    />
  );
}
