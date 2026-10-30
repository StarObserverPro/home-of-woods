import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("public/assets/manifest.json", root), "utf8"),
);
assert.equal(manifest.assets.length, 5);
assert.ok(manifest.worldSource,'Terrain provenance is required for this batch');
const worldBytes=await readFile(new URL(manifest.worldSource.file,root));
assert.equal(createHash('sha256').update(worldBytes).digest('hex'),manifest.worldSource.sha256,'terrain data hash');
const worldData=JSON.parse(worldBytes.toString());
const rows=(worldData.max-worldData.min)/worldData.step+1;
assert.equal(worldData.heights.length,rows*rows,'complete surface grid');
assert.ok(worldData.heights.every(Number.isFinite),'finite terrain heights');
const listed = new Set();
for (const asset of manifest.assets) {
  assert.match(asset.file, /^public\/assets\/m0\/[a-z]+\.glb$/);
  assert.ok(!listed.has(asset.file));
  listed.add(asset.file);
  const bytes = await readFile(new URL(asset.file, root));
  assert.equal(bytes.length, asset.bytes, asset.assetId + " size");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    asset.sha256,
    asset.assetId + " hash",
  );
  assert.equal(bytes.subarray(0, 4).toString(), "glTF");
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const gltf = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
  );
  for (const entry of [...(gltf.buffers || []), ...(gltf.images || [])])
    assert.ok(!entry.uri, "GLB must be self-contained");
  for (const material of gltf.materials || [])
    assert.equal(
      material.pbrMetallicRoughness?.metallicFactor ?? 1,
      0,
      "nonmetallic palette",
    );
  if (asset.license.id === "CC0-1.0") {
    assert.match(
      await readFile(new URL(asset.license.evidence, root), "utf8"),
      /Creative Commons Zero, CC0/,
    );
    const original = await readFile(
      new URL("sources/kenney/" + asset.source.part, root),
    );
    assert.equal(
      createHash("sha256").update(original).digest("hex"),
      asset.source.sha256.toLowerCase(),
    );
  }
  if (asset.assetId === "how-m0-ranger") {
    // Blender adds numeric suffixes when a separate scene shares a file with earlier models.
    // The runtime resolves these pivot prefixes; require exactly one matching pivot per limb.
    for (const name of ["leg_L", "leg_R", "arm_L", "arm_R"]) {
      const matches = gltf.nodes.filter(
        (node) => node.name?.replace(/\.\d+$/, "") === name,
      );
      assert.equal(matches.length, 1, name + " unique pivot");
      assert.ok(
        matches[0].children?.length,
        name + " has visible child meshes",
      );
    }
  }
}
assert.deepEqual(
  (await readdir(new URL("public/assets/m0/", root))).sort(),
  [...listed].map((path) => path.split("/").at(-1)).sort(),
);
console.log(
  "Verified 5 runtime GLBs and terrain data: hashes, provenance, embedded resources, nonmetallic palette, character pivots and complete finite surface grid.",
);
