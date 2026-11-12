# Adopted KayKit Furniture Bits 1.0 source

Author: **Kay Lousberg**. Source: [official repository](https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0), commit `96d5930a8dbdb363409bbc2d3341718b00e17c9c`; [author's asset page](https://kaylousberg.itch.io/furniture-bits). Retrieved 2026-11-12. The exact supplied CC0 notice is retained as `LICENSE.txt`.

Only `bed_single_B`, `table_medium`, `chair_stool_wood`, `shelf_B_large`, `rug_rectangle_stripes_A` and their shared atlas are retained. These files come from the freely available official repository, not the paid Extra or Source packs. Original glTF, binary and PNG bytes are unchanged.

Run `node tools/prepare-cabin-assets.mjs` from the repository root to rebuild the five runtime GLBs and the source/output SHA-256 manifest. Repacking leaves geometry, UVs, normals and the original atlas intact; GLBs share one local atlas URL. Runtime furniture material maps the blue cloth region to forest green and warm wood to a restrained cabin palette. Runtime transforms fit the registered dimensions, with ground at local Y=0; the standing shelf combines three adopted shelf inserts with a project-authored frame.

Run `node tools/verify-cabin-assets.mjs` to verify source/runtime hashes, unchanged geometry binary and accessors, PNG dimensions and both exact CC0 notices against the manifest. This checks asset integrity; it does not substitute for the sandbox's visual and interaction checks.

The chest, stove, lantern, bowl and plant are project-authored geometry in `sandbox/cabin-interior/src/scene/furniture.ts`. They are not attributed to KayKit and are not relabeled CC0. No promotional sample image or paid asset is included.
