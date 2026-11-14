# Woodworking stage — selected CC0 assets

| Input | Creator | Primary source | License |
| --- | --- | --- | --- |
| Handsaw Wood | Konrad Szałankiewicz | https://polyhaven.com/a/handsaw_wood | CC0 1.0 |
| Wood Table | Dimitrios Savva | https://polyhaven.com/a/wood_table | CC0 1.0 |

Poly Haven's asset license: https://polyhaven.com/license . The full CC0 dedication is retained in `CC0-1.0.txt`. Only the downloadable asset files are used; website photographs/previews, logos and text are not reused as game assets.

`handsaw/` preserves the selected 1k glTF, shared binary mesh and original texture maps. The original glTF refers to `textures/`; the unchanged maps are stored beside it here as preparation inputs, not as the runtime entry. `table/` preserves the selected 1k texture maps. The metadata and download manifest identify the originals; the table roughness input is retained but the stylized runtime material uses a constant roughness instead.

`../../../../sandbox/woodworking/tools/prepare-stage-assets.py` makes the runtime assets: the complete hand-saw silhouette, grip opening, rivets and saw teeth are retained (2,548 triangles), normalized to X handle→tip, Y away from teeth, Z thickness. The tooth rail is leveled; maps are reduced to 512px and contrast/normal strength softened. The table uses a softened 1k color and normal map on a few boards. These are modified CC0 assets, not newly claimed originals. Runtime hashes are in `sandbox/woodworking/assets/manifest.json`.

The try square, bench, distant trees and wood-grain shader are project-authored. They are not attributed to Poly Haven. No paid assets, external runtime downloads or imported font files are included.
