import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const root = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("public/assets/manifest.json", root), "utf8"),
);
assert.equal(manifest.assets.filter(a=>a.batchId==='HOW-M0-R3').length, 5);
assert.equal(manifest.assets.filter(a=>a.batchId==='HOW-GATHERING-1').length, 2);
assert.equal(manifest.assets.filter(a=>a.batchId==='HOW-CHARACTERS-1').length, 4);
assert.equal(manifest.assets.filter(a=>a.batchId==='HOW-WILDLIFE-PHASE1').length, 2);
assert.equal(manifest.assets.filter(a=>a.batchId==='HOW-WILDLIFE-PHASE2').length, 1);
assert.equal(manifest.assets.some(a=>a.assetId==='how-wildlife-goat'), false, 'rejected model is not shipped');
assert.equal(manifest.assets.filter(a=>a.batchId==='HOW-WILDLIFE-MOUNTAIN-GOAT').length, 1);
assert.ok(manifest.worldSource,'Terrain provenance is required for this batch');
const worldBytes=await readFile(new URL(manifest.worldSource.file,root));
assert.equal(createHash('sha256').update(worldBytes).digest('hex'),manifest.worldSource.sha256,'terrain data hash');
const worldData=JSON.parse(worldBytes.toString());
const rows=(worldData.max-worldData.min)/worldData.step+1;
assert.equal(worldData.heights.length,rows*rows,'complete surface grid');
assert.ok(worldData.heights.every(Number.isFinite),'finite terrain heights');
const listed = new Set();
for (const asset of manifest.assets) {
  assert.match(asset.file, /^public\/assets\/(m0|gathering|characters|wildlife)\/[a-z-]+\.glb$/);
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
      /Creative Commons Zero, CC0|CC0 1.0 Universal/,
    );
    if(asset.source.files){
      for(const source of asset.source.files)assert.equal(createHash('sha256').update(await readFile(new URL(source.file,root))).digest('hex'),source.sha256);
    }else{
      const original=await readFile(new URL('sources/kenney/'+asset.source.part,root));
      assert.equal(createHash('sha256').update(original).digest('hex'),asset.source.sha256.toLowerCase());
    }
  }
  if(asset.batchId === 'HOW-WILDLIFE-PHASE1') {
    assert.equal(gltf.skins.length, 1); assert.equal(gltf.skins[0].joints.length, 16);
    assert.deepEqual(gltf.animations.map(a=>a.name).sort(), ['idle','walk']);
    assert.equal(gltf.materials.length, 1);
    const triangles=gltf.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0),0);
    assert.ok(triangles <= 650);
  }
  if(asset.batchId === 'HOW-WILDLIFE-MOUNTAIN-GOAT') {
    assert.equal(gltf.skins.length, 1);
    assert.equal(gltf.skins[0].joints.length, 21);
    assert.deepEqual(gltf.animations.map(a=>a.name).sort(),['idle','lift_front','survey','walk']);
    assert.equal(gltf.materials.length, 1);
    assert.equal(gltf.images?.length??0, 0);
    assert.equal(gltf.meshes.length, 1);
    assert.ok(gltf.meshes[0].primitives[0].attributes.JOINTS_0!==undefined);
    assert.ok(gltf.meshes[0].primitives[0].attributes.NORMAL!==undefined);
    const triangles=gltf.accessors[gltf.meshes[0].primitives[0].indices].count/3;
    assert.ok(triangles>=700&&triangles<=2500,`Mountain goat facets ${triangles}`);
  }
  if(asset.batchId === 'HOW-WILDLIFE-PHASE2') {
    assert.equal(gltf.skins.length,1);
    const stag=asset.assetId==='how-wildlife-stag';
    assert.equal(gltf.skins[0].joints.length,stag?38:16);
    assert.deepEqual(gltf.animations.map(a=>a.name).sort(),stag?['bound','graze','idle','survey','walk']:['idle','walk']);
    assert.ok(gltf.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+gltf.accessors[p.indices].count/3,0),0)<5000);
  }
  if(['how-character-player','how-character-visitor'].includes(asset.assetId)){
    assert.equal(gltf.skins.length,1);assert.equal(gltf.skins[0].joints.length,23);
    assert.equal(gltf.meshes.length,1);assert.equal(gltf.materials.length,1);
    for(const name of ['upperarm.r','lowerarm.r','upperleg.l','lowerleg.l','handslot.r','handslot.l'])assert.ok(gltf.nodes.some(n=>n.name===name));
    assert.ok(gltf.images.every(i=>i.bufferView!==undefined));
  }
  if(asset.assetId==='how-character-motions'){
    assert.equal(gltf.animations.length,7);
    for(const name of ['Idle_A','Walking_A','Running_A','PickUp','Waving','Melee_2H_Attack_Slice','Melee_2H_Attack_Chop'])assert.ok(gltf.animations.some(a=>a.name===name));
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
for(const folder of ['m0','gathering','characters','wildlife']) assert.deepEqual(
  (await readdir(new URL(`public/assets/${folder}/`, root))).sort(),
  [...listed].filter(p=>p.startsWith(`public/assets/${folder}/`)).map((path) => path.split("/").at(-1)).sort(),
);
console.log(
  `Verified ${listed.size} registered GLBs and terrain data: hashes, source licenses, embedded resources, nonmetallic palette, legacy pivots, skinned characters and complete finite surface grid.`,
);
const uiManifest=JSON.parse(await readFile(new URL('public/assets/ui-r1/manifest.json',root),'utf8'));
assert.equal(uiManifest.batch,'HOW-UI-ART-R1');
const uiFiles=new Set();
for(const asset of uiManifest.files){
  assert.match(asset.file,/^public\/assets\/ui-r1\/(icons\/[a-z-]+-(64|128)\.png|inventory-slot\.png)$/);
  assert.ok(!uiFiles.has(asset.file));uiFiles.add(asset.file);
  const bytes=await readFile(new URL(asset.file,root));
  assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  if(asset.size){assert.equal(bytes.readUInt32BE(16),asset.size);assert.equal(bytes.readUInt32BE(20),asset.size);}
}
console.log(`Verified ${uiFiles.size} admitted generated UI PNGs: hashes, paths and image dimensions.`);
