// The "?" card: keyboard shortcuts (section 9.10).
import { useWb } from "../store.ts";

const KEYS: [string, string][] = [
  ["1 – 5", "front, top, left, right, isometric view"],
  ["O", "orthographic / perspective"],
  ["F", "frame the selection (everything if none)"],
  ["E", "explode on / off"],
  ["S", "section on / off"],
  ["[  ]", "previous / next build step"],
  ["Esc", "clear the selection"],
  ["Shift-click", "add or remove a part from the selection"],
  ["?", "this card"],
];

export function HelpCard() {
  return (
    <div className="help" onClick={() => useWb.getState().set({ help: false })}>
      <div className="card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
        <h3>Keyboard</h3>
        <table><tbody>{KEYS.map(([k, v]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{v}</td></tr>)}</tbody></table>
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: 10 }}>Keys are ignored while a text field has focus. Click a part anywhere to select it everywhere.</p>
      </div>
    </div>
  );
}
