// Placeholder until the 3D viewport (M5).
export const viewportApi: { standardView?: (n: 1 | 2 | 3 | 4 | 5) => void; frame?: () => void } = {};
export function Viewport3D() {
  return <div className="empty pane-pad">The 3D view arrives in M5.</div>;
}
