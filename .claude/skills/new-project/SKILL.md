---
name: new-project
description: Start a new DIY-bench project from room measurements. Use when the user wants to design something new (a closet, shelf, cabinet or other built-in) rather than change an existing project.
---

# Start a new DIY-bench project

Work through these steps in order. Ask for what the user already has in one go: measurements,
photos, a sketch, the materials they own. Start the model straight away with what you know, and
mark everything else as a placeholder (`// inferred`) rather than waiting for every number. Never
present a guessed measurement as a measured one.

Photos are useful for layout, counts (steps, shelves, studs between marks) and rough
proportions, but not for exact sizes: read what you can from them, mark it inferred, and say
which numbers to check with a tape.

## 1. What and what to call it

Ask what they are building and what to call it. Pick the template:

| They describe | Template |
|---|---|
| a reach-in or walk-in closet, wardrobe, built-in between walls | `closet` |
| a bookcase or open shelf unit | `shelf` |
| a base or wall cabinet with a door | `cabinet` |
| anything else | `blank` |

The project id is kebab-case (`hall-closet`, `garage-shelves`). Check it is free with
`./wb list`.

## 2. Measurements

Ask for the checklist for that kind of project, in inches unless they work in millimetres.
Say why each one matters in a few words, so they measure the right thing.

**Closet or built-in:**
- width at three heights (floor, middle, top), and depth at both ends;
- ceiling height at four points (the corners);
- the opening's width and height, and the return widths either side of it;
- wall thickness at the opening;
- baseboard height and thickness;
- whether the walls are plumb and the corners square (a level and a framing square, or the
  3-4-5 check);
- stud locations (distance from the left corner);
- outlets, switches, vents or anything else on the walls inside.

**Shelf or cabinet:** the space it goes in (width, height, depth), what it will hold, and
baseboard height and thickness where it meets a wall.

Anything they do not know yet becomes a placeholder.

## 3. Create the project

```sh
./wb new <id> --template <closet|shelf|cabinet|blank> --title "<Title>"
```

This writes `projects/<id>/project.ts`, `notes.md` and `expected/`, and the viewer picks the
project up (choose it in the top bar).

## 4. Fill in `P`

Edit the `P` block at the top of `project.ts` with their answers. Every value they did not
give stays a placeholder with `// inferred` after it. Keep derived values derived (section 4
of `AGENTS.md`). The check hook runs after each edit; fix anything it reports.

## 5. Write `notes.md`

- **Summary:** what it is, where it goes, the main dimensions.
- **Assumptions:** a table of every `// inferred` value with what was assumed and why.
- **Open questions:** one line per thing still to measure or decide.
- **Decisions log:** today's date and what was decided.

## 6. Check and show

```sh
./wb check --all-configs
./wb render --view front --out /tmp/<id>-front.png   # then read the PNG
```

Tell the user what you made in two or three sentences, list the open questions, and point
them at it with `./wb show --project <id> --view front`.
