# Spikes (throwaway, 2026-10-03)

Each folder answers one question the spec depends on. Results are summarised in ../research.md, section "Spike results".

- nest/       Guillotine packer with multiple stock sizes, owned offcuts, grain lock per part and kerf. `node guillotine.mjs`
              Also `gp.mjs`: guillotine-packer (npm) on the same parts.
- live/       Vite 8 + three.js r186: picking, cross-highlight with SVG and table, section plane, ortho camera,
              HMR of the model file keeping camera and hover. `node drive.mjs`, `node rayclip.mjs`, `node drive2.mjs`
              (self-accepting glob loader), `node --experimental-strip-types src/where.ts` (source locations).
- kernel/     build123d 0.13.0 on the closet: build, HLR projection, STEP/glTF/STL export, labels. `.venv/bin/python closet.py`
- wasm/       manifold-3d 3.5.4 and replicad 1.1.0 in Node: init, booleans, originalID tracing, STEP names. `node kernels.mjs`, `node rep2.mjs`
- hook/       Claude Code 2.1.288 hooks: UserPromptSubmit stdout reaches the model; PostToolUse exit 2 stderr reaches the model.
- pypi.py     PyPI version/license lookup.
- fixture/    The closet encoded in a minimal version of the spec API: `node --experimental-strip-types evaluate.ts`, `... sheets.ts`.
