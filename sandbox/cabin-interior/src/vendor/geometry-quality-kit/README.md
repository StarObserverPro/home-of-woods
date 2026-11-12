# Geometry quality kit provenance

Portable geometry tools adopted from Scott Sun's [Threejs-Awesome-Graphics-Agent-Skills](https://github.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills), the `geometry-quality-kit` bundled with `threejs-procedural-geometry`, through the installed skill snapshot on 2026-11-12. The six JavaScript modules are kept together as directed by the upstream skill. The MIT license is reproduced in `LICENSE`.

The cabin uses `panelWithHoles`, `cleanMesh`, `toGeometry` and `auditMeshData` to build closed wall segments with actual window/door apertures. The kit does not own the game state or renderer. Local authored shell code supplies the wall plan, materials, transforms, split walls and opening trim.

Run the independent upstream geometry checks from the repository root:

```sh
node sandbox/cabin-interior/src/vendor/geometry-quality-kit/selftest.js
```

Adoption check: 171/171 assertions passed. These checks establish mesh invariants, not visual acceptance of the cabin.
