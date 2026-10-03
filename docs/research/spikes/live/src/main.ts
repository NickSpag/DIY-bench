import * as THREE from "three";
import { parts as initialParts, type Part } from "./model.ts";

// ---- one selection store, every view subscribes ----
let hovered: string | null = null;
const listeners: ((id: string | null) => void)[] = [];
export function setHover(id: string | null) { if (id === hovered) return; hovered = id; listeners.forEach(f => f(id)); }
(window as any).__spike = { setHover, get hovered() { return hovered; }, loadCount: ((window as any).__spike?.loadCount ?? 0) + 1 };

// ---- 3D ----
const el = document.getElementById("v")!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(el.clientWidth, el.clientHeight); renderer.localClippingEnabled = true;
el.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf4f4f4);
scene.add(new THREE.AmbientLight(0xffffff, 1.5)); const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(30, 80, 60); scene.add(dl);
const aspect = el.clientWidth / el.clientHeight;
// orthographic front view, fit to the 80 x 96 closet
const ortho = new THREE.OrthographicCamera(-50 * aspect, 50 * aspect, 50, -50, -500, 500);
ortho.position.set(40, 48, 100); ortho.lookAt(40, 48, 0);
const section = new THREE.Plane(new THREE.Vector3(0, 0, -1), 30); // keep z <= 30 (nothing cut yet)
const group = new THREE.Group(); scene.add(group);
const meshes = new Map<string, THREE.Mesh>();

function rebuild(parts: Part[]) {
  group.clear(); meshes.clear();
  for (const p of parts) {
    const g = new THREE.BoxGeometry(...p.size);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xddb987, clippingPlanes: [section] }));
    m.position.set(p.at[0] + p.size[0] / 2, p.at[1] + p.size[1] / 2, p.at[2] + p.size[2] / 2);
    m.userData.partId = p.id;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x5a4220, clippingPlanes: [section] }));
    m.add(edges);
    group.add(m); meshes.set(p.id, m);
  }
  drawElevation(parts); drawCutList(parts); paint(hovered);
}

function paint(id: string | null) {
  meshes.forEach((m, k) => (m.material as THREE.MeshStandardMaterial).color.set(k === id ? 0xffdd00 : 0xddb987));
  document.querySelectorAll("[data-part]").forEach(e => e.classList.toggle("hl", (e as HTMLElement).dataset.part === id));
  renderer.render(scene, ortho);
}
listeners.push(paint);

const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
renderer.domElement.addEventListener("pointermove", e => {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, ortho);
  // intersectObjects does not respect clipping planes on its own; filter hits on the clipped side
  const hit = ray.intersectObjects([...meshes.values()], false).find(h => section.distanceToPoint(h.point) >= 0);
  setHover(hit ? hit.object.userData.partId : null);
});

// ---- 2D elevation (front view: drop z) ----
function drawElevation(parts: Part[]) {
  const svg = document.getElementById("elev")!;
  svg.innerHTML = parts.map(p => `<rect data-part="${p.id}" x="${p.at[0]}" y="${96 - p.at[1] - p.size[1]}" width="${p.size[0]}" height="${p.size[1]}" fill="#ddb987" stroke="#5a4220" stroke-width=".2"/>`).join("");
}
function drawCutList(parts: Part[]) {
  const t = document.getElementById("cut")!;
  t.innerHTML = parts.map(p => `<tr data-part="${p.id}"><td>${p.name}</td><td>${p.size.filter(v => v !== 0.75).join(" × ")}</td></tr>`).join("");
}
document.addEventListener("pointerover", e => { const d = (e.target as HTMLElement).closest?.("[data-part]") as HTMLElement | null; if (d && !renderer.domElement.contains(e.target as Node)) setHover(d.dataset.part!); });

(window as any).__spike.meshes = meshes; (window as any).__spike.ortho = ortho; (window as any).__spike.section = section;
(window as any).__spike.render = () => renderer.render(scene, ortho);
rebuild(initialParts);

// ---- live reload: re-evaluate the model module, keep camera and selection ----
if (import.meta.hot) {
  import.meta.hot.accept("./model.ts", mod => { if (mod) { rebuild(mod.parts); (window as any).__spike.modelReloads = ((window as any).__spike.modelReloads ?? 0) + 1; } });
}
