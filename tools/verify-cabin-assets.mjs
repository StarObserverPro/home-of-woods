/** Check the adopted cabin files, their unchanged source bytes and their redistribution notice. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/assets/cabin-interior');
const source = resolve(root, 'sources/kaykit/furniture-bits');
const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
const expected = {bed: 'bed_single_B', table: 'table_medium', stool: 'chair_stool_wood', 'wall-shelf': 'shelf_B_large', rug: 'rug_rectangle_stripes_A'};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const checkHash = (bytes, expectedHash, label) => {
  assert.match(expectedHash, /^[a-f0-9]{64}$/, `${label}: missing SHA-256`);
  assert.equal(hash(bytes), expectedHash, `${label}: SHA-256 mismatch`);
};
assert.equal(manifest.version, 1);
assert.equal(manifest.sourceUrl, 'https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0');
assert.equal(manifest.sourceCommit, '96d5930a8dbdb363409bbc2d3341718b00e17c9c');
assert.equal(manifest.license, 'CC0-1.0');
assert.equal(manifest.licenseFile, 'KayKit-Furniture-Bits-1.0-CC0.txt');
assert.deepEqual(manifest.assets.map(asset => asset.id).sort(), Object.keys(expected).sort(), 'Exactly the five adopted models must be listed');

const [sourceLicense, distributedLicense, sourceAtlas, atlas] = await Promise.all([
  readFile(resolve(source, 'LICENSE.txt')), readFile(resolve(output, manifest.licenseFile)),
  readFile(resolve(source, 'models/furniturebits_texture.png')), readFile(resolve(output, 'furniture-atlas.png')),
]);
checkHash(sourceLicense, manifest.licenseSha256, 'source CC0 notice');
checkHash(distributedLicense, manifest.licenseSha256, 'distributed CC0 notice');
assert.match(sourceLicense.toString('utf8'), /Creative Commons Zero, CC0/);
assert.match(sourceLicense.toString('utf8'), /Kay Lousberg/);
assert.equal(manifest.texture.path, 'furniture-atlas.png');
assert.equal(manifest.texture.modified, false);
assert.equal(atlas.length, manifest.texture.bytes, 'atlas byte count');
checkHash(sourceAtlas, manifest.texture.sha256, 'original atlas');
checkHash(atlas, manifest.texture.sha256, 'runtime atlas');
assert.equal(atlas.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'atlas PNG signature');
assert.equal(atlas.readUInt32BE(16), 1024, 'atlas PNG width');
assert.equal(atlas.readUInt32BE(20), 1024, 'atlas PNG height');

let triangles = 0, bytes = atlas.length;
for (const asset of manifest.assets) {
  assert.equal(asset.sourceName, expected[asset.id]);
  assert.equal(asset.path, `${asset.id}.glb`);
  const [sourceJson, sourceBin, glb] = await Promise.all([
    readFile(resolve(source, `models/${asset.sourceName}.gltf`)),
    readFile(resolve(source, `models/${asset.sourceName}.bin`)), readFile(resolve(output, asset.path)),
  ]);
  checkHash(sourceJson, asset.sourceHashes.gltf, `${asset.id} original glTF`);
  checkHash(sourceBin, asset.sourceHashes.bin, `${asset.id} original binary`);
  checkHash(glb, asset.sha256, `${asset.id} runtime GLB`);
  assert.equal(glb.length, asset.bytes, `${asset.id} byte count`);
  assert.equal(glb.readUInt32LE(0), 0x46546c67, `${asset.id} GLB magic`);
  assert.equal(glb.readUInt32LE(4), 2, `${asset.id} GLB version`);
  assert.equal(glb.readUInt32LE(8), glb.length, `${asset.id} GLB total length`);
  assert.equal(glb.readUInt32LE(16), 0x4e4f534a, `${asset.id} JSON chunk`);
  const jsonLength = glb.readUInt32LE(12), json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const binHeader = 20 + jsonLength;
  assert.equal(glb.readUInt32LE(binHeader + 4), 0x004e4942, `${asset.id} binary chunk`);
  const binLength = glb.readUInt32LE(binHeader), binary = glb.subarray(binHeader + 8);
  assert.equal(binary.length, binLength, `${asset.id} binary chunk length`);
  assert.equal(json.buffers.length, 1); assert.equal(json.buffers[0].byteLength, sourceBin.length);
  assert.equal(json.buffers[0].uri, undefined, `${asset.id} GLB buffer must be embedded`);
  assert.ok(binary.subarray(0, sourceBin.length).equals(sourceBin), `${asset.id} geometry binary changed`);
  assert.ok(binary.subarray(sourceBin.length).every(value => value === 0), `${asset.id} GLB padding`);
  assert.equal(json.images.length, 1); assert.equal(json.images[0].uri, manifest.texture.path, `${asset.id} shared local atlas`);
  assert.equal(json.asset.extras.license, manifest.license);
  assert.equal(json.asset.extras.sourceCommit, manifest.sourceCommit);
  const original = JSON.parse(sourceJson.toString('utf8'));
  assert.deepEqual(json.meshes, original.meshes, `${asset.id} mesh declarations changed`);
  assert.deepEqual(json.accessors, original.accessors, `${asset.id} geometry accessors changed`);
  const count = json.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n, primitive) => n + json.accessors[primitive.indices].count / 3, 0), 0);
  assert.equal(count, asset.triangles, `${asset.id} triangle count`);
  triangles += count; bytes += glb.length;
}
console.log(`Cabin assets verified: ${manifest.assets.length} models, ${triangles} source triangles, ${bytes} runtime bytes; original sources, shared PNG and both CC0 notices match.`);
