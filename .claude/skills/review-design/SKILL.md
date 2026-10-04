---
name: review-design
description: Review a DIY-bench design end to end - checks in every configuration, renders of every view, the cut list, the shopping list and the open questions - and report what needs attention. Use when the user asks for a review, a sanity check, or "is this ready to build".
---

# Review a DIY-bench design

Run each step, read every output, then report. Use the project the viewer shows unless the
user names another (`--project <id>`).

## 1. Checks

```sh
./wb check --all-configs
```

Note every error and warning, and which configuration it is in.

## 2. Renders

Render each drawing view and the 3D views, and read every PNG:

```sh
./wb render --view <view-id> --out /tmp/review-<view-id>.png    # each view of the project
./wb render --view 3d-iso --out /tmp/review-iso.png
./wb render --view sheets --out /tmp/review-sheets.png
```

A wrong `--view` lists the project's view ids. For a project with phases, render the last
phase (the default) and also `--phase` for each earlier one. For each option, render the
front view with `--opt key=value` for the choice that is not the default.

Look for things that look wrong: parts floating or cutting through each other, a shelf at an
odd height, a door that hits something, dimensions that do not add up, parts missing from a
phase.

## 3. Cut list and shopping

```sh
./wb cutlist
./wb shopping
./wb sheets
```

Note how many sheets are bought, how full the last sheet of each material is, and any part
cut at a size that looks wrong.

## 4. Open questions

Read the "Assumptions" and "Open questions" sections of `projects/<id>/notes.md`, and search
`project.ts` for `// inferred`.

## 5. Report

In this order, short and plain:

1. **Failing checks:** errors first, then warnings, each with the part and the fix you suggest.
2. **What looks wrong in the renders**, with the view it is in.
3. **Sheets:** what to buy, and the yield of each layout ("the second 4×8 is a third used").
4. **Open questions** the user still has to answer, measurements first.

Do not change the model during a review. Offer the fixes and wait for the user.
