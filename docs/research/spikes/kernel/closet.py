# Spike: closet-sized model in build123d. Measures build, booleans, HLR projection, exports,
# and whether part labels survive into STEP and glTF.
import time
t0 = time.perf_counter()
from build123d import *
t_import = time.perf_counter() - t0

MIN = (Align.MIN, Align.MIN, Align.MIN)
def box(label, x, y, z, w, d, h):
    # x from left wall, y out from the back wall, z up from floor (build123d is Z-up)
    b = Pos(x, y, z) * Box(w, d, h, align=MIN)
    b.label = label
    return b

t1 = time.perf_counter()
parts = []
for side, x in (("left", 28), ("right", 51.25)):
    p = box(f"partition-{side}", x, 0, 0, 0.75, 23.25, 84)
    # dado for the fixed center shelf at 70, 1/4 deep, on the inner face
    inner = x + 0.75 - 0.25 if side == "left" else x
    p = p - box("dado", inner, 0, 69.25, 0.25, 23.25, 0.75)
    # shelf pin holes, 5 mm, 2 rows, 27..68 at 1.5 in spacing, 3/8 deep
    holes = []
    for row_y in (2, 21.25):
        for i in range(28):
            z = 27 + i * 1.5
            hx = x + 0.75 if side == "left" else x
            c = Pos(hx, row_y, z) * Rot(0, 90, 0) * Cylinder(0.0984, 0.75)
            holes.append(c)
    p = p - Compound(holes)
    p.label = f"partition-{side}"
    parts.append(p)
for label, x, w in (("top-shelf-left", 0, 28), ("top-shelf-center", 28, 24), ("top-shelf-right", 52, 28)):
    parts.append(box(label, x, 0, 84, w, 12, 0.75))
parts.append(box("center-shelf-fixed", 28.5, 0, 69.25, 23.0, 23.25, 0.75))
parts.append(box("center-bottom", 28.75, 0, 4, 22.5, 23.25, 0.75))
parts.append(box("toe-kick", 28.75, 20.25 - 0.75, 0, 22.5, 0.75, 4))
for i, z in enumerate((28, 42, 55.75)):
    parts.append(box(f"center-shelf-adj-{i+1}", 28.8125, 0.25, z, 22.375, 22.5, 0.75))
parts.append(box("shelf-right-70", 52, 0, 69.25, 28, 12, 0.75))
for i in range(12):  # nailers, cleats, nosings, rods as boxes to reach ~30 parts
    parts.append(box(f"misc-{i}", 0, 0, 10 + i * 5, 10, 0.75, 3.5))
asm = Compound(children=parts, label="closet")
t_build = time.perf_counter() - t1

t2 = time.perf_counter()
visible, hidden = asm.project_to_viewport((40, 400, 48), viewport_up=(0, 0, 1), look_at=(40, 0, 48))
t_hlr = time.perf_counter() - t2
svg = ExportSVG(scale=4)
svg.add_layer("visible", line_weight=0.3)
svg.add_layer("hidden", line_color=(120, 120, 120), line_type=LineType.ISO_DOT)
svg.add_shape(visible, layer="visible"); svg.add_shape(hidden, layer="hidden")
svg.write("front.svg")

t3 = time.perf_counter(); export_step(asm, "closet.step"); t_step = time.perf_counter() - t3
t4 = time.perf_counter(); export_gltf(asm, "closet.glb", binary=True); t_gltf = time.perf_counter() - t4
t5 = time.perf_counter(); export_stl(asm, "closet.stl"); t_stl = time.perf_counter() - t5

print(f"parts={len(parts)} import={t_import:.2f}s build+booleans={t_build:.2f}s hlr={t_hlr:.2f}s step={t_step:.2f}s gltf={t_gltf:.2f}s stl={t_stl:.2f}s")
print("visible edges", len(visible), "hidden edges", len(hidden))
