# Importing rooms from LiDAR scans and photos

Status: research only, to resume later. Written 2026-10-04.

## The problem

A project's room (walls, floors, openings, stairs) is entered by hand from tape measurements,
and the parts we can't measure easily are guessed from photos. The stairwell project, for
example, had its rise, run and step counts read from three photos and marked as assumptions. A
phone scan could fill in the room with real dimensions, and leave the tape for spot checks.

## Options, most accurate first

1. **Phone LiDAR scans (iPhone or iPad Pro).** Accurate to a couple of centimetres. Polycam
   claims about ½″ on normal interior captures.
2. **Measuring against a known size in the same photo.** You mark the four corners of something
   of known size on a flat surface (a 4×8 sheet, an 80″ door, a stair riser), and the tool maps
   that surface so other points on it can be measured. Usually within a few percent on that
   surface; poor for anything off it. Needs no machine learning.
3. **Depth estimation from one photo** (Apple's Depth Pro, Depth Anything V2 and similar).
   Errors around 5–10%: useful for "about 3 ft deep", not for cut sizes.
4. **The agent reading photos** for layout and counts. Not a measuring tool.

This document covers option 1. Option 2 is a separate idea: a "measure a photo" panel.

## Apple RoomPlan

The best fit. RoomPlan is a framework in iOS (16 and later) on LiDAR devices. Rather than only
producing a mesh, it recognises the room and returns a parametric model:

- **Surfaces:** walls, doors, windows and openings.
- **Objects:** furniture categories, including stairs, fireplace, storage and television.
- **For each of these:** its dimensions (width × height × depth), a 3D transform, a confidence
  level and a unique identifier.

These map almost directly onto DIY-bench's context parts: a wall is a box with role `wall`,
stairs become floor-role boxes, and doors and windows could be new roles or openings in walls.

RoomPlan exports USD, USDA or USDZ. Some apps also export its JSON.

**Limit:** stairs come back as one bounding box, not individual treads. The rise, run and number
of steps still need a count and one measurement, or a mesh scan, to model the treads.

## Apps that scan

| App | Notes |
|---|---|
| Apple's RoomPlan sample app | Reference implementation of the API. |
| [3D Scanner App](https://apps.apple.com/us/app/3d-scanner-app/id1419913995) (Laan Labs) | Free. Exports OBJ, USDZ, STL, GLB, PLY, FBX, DAE and point clouds (LAS, PTS, XYZ). |
| [Polycam](https://learn.poly.cam/hc/en-us/articles/27756102599572-What-File-Types-Can-Polycam-Export) | Room mode makes floor plans (DXF, SVG, PNG). The free plan exports glTF only; other formats are paid. |

## Open source

| Project | What it does |
|---|---|
| [Stray Scanner](https://github.com/strayrobots/scanner) | Records raw RGB-D data on LiDAR iPhones: video, depth, confidence, camera poses, IMU. A maintained fork exists. |
| [ScanSpace](https://github.com/aabdlwahab/3d-scanner) | Meshes plus RoomPlan room data and floor plans, with exports including GLB, OBJ, PLY and RoomPlan JSON. Small project, not vetted. |
| [lidar-scanner-ios](https://github.com/Dominik-Hagmann/lidar-scanner-ios) | Point-cloud capture with PLY export. |
| Open3D (Python) | Point-cloud and mesh processing, including finding planes (walls, floors, treads). |
| trimesh (Python) | Reading and measuring meshes. |
| usd-core (Pixar, Python) | Reading USD and USDZ files, such as RoomPlan exports. |

## Proposed design

**In the app: an Import button that opens a modal.** The flow:

1. **Choose the file:** a RoomPlan USDZ or JSON, or a mesh (OBJ, PLY, GLB).
2. **Processing:** progress while the file is read and its surfaces and objects are extracted.
3. **Options:**
   - which surfaces and objects to import;
   - which wall is the reference wall, and so where x = 0 and the facing direction are;
   - which floor or landing is y = 0;
   - units and rounding (to 1/16″);
   - whether to replace the project's existing context parts or add to them;
   - a name prefix for the new ids.
4. **Preview:** the imported boxes drawn over the current model in the 3D view, before anything
   is written.
5. **Import:** writes the context parts into `project.ts`, with a comment naming the scan file
   and date. Each value is marked as coming from the scan, so `notes.md` can list what is
   scanned and what is measured.

**On the command line:** `./wb import-room <file> --project <id> [--reference-wall …]`, the same
engine as the modal, so the agent can run it too.

**Processing:** a RoomPlan export already holds boxes, so it can be read in TypeScript (USDZ is a
zip of USD files; the JSON is simpler). A raw mesh needs plane-finding, which is easier in
Python with Open3D, run as a separate optional step.

## Open questions

- Which apps export RoomPlan's JSON as well as USDZ, and is that JSON stable between iOS
  versions?
- How RoomPlan's stairs box is oriented, and whether its dimensions are enough to derive rise
  and run once the step count is known.
- Whether to model doors and windows as their own context role, or as openings in walls.
- How to keep a re-import from overwriting hand-made adjustments: ids per scanned surface, and a
  merge step in the modal.

## Next step

Scan a real room (the stairwell) with a RoomPlan app and the 3D Scanner App, put the files in
the repo, and build the importer against them, not against a guessed format.

## Sources

- [RoomPlan, WWDC22](https://developer.apple.com/videos/play/wwdc2022/10127/)
- [RoomPlan enhancements, WWDC23](https://developer.apple.com/videos/play/wwdc2023/10192/)
- [Apple Machine Learning Research: 3D parametric room representation with RoomPlan](https://machinelearning.apple.com/research/roomplan)
- [it-jim: RoomPlan API, object categories](https://www.it-jim.com/blog/apple-roomplan-api/)
- [3D Scanner App](https://apps.apple.com/us/app/3d-scanner-app/id1419913995)
- [Polycam: export file types](https://learn.poly.cam/hc/en-us/articles/27756102599572-What-File-Types-Can-Polycam-Export)
- [Polycam: 3D room scanner](https://poly.cam/tools/3d-room-scanner)
- [Stray Scanner](https://github.com/strayrobots/scanner)
- [ScanSpace](https://github.com/aabdlwahab/3d-scanner)
- [lidar-scanner-ios](https://github.com/Dominik-Hagmann/lidar-scanner-ios)
