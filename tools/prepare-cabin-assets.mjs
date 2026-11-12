/** Repack only the five adopted CC0 KayKit models; original geometry and atlas remain intact. */
import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'sources/kaykit/furniture-bits');
const output = resolve(root, 'public/assets/cabin-interior');
const sourceCommit = '96d5930a8dbdb363409bbc2d3341718b00e17c9c';
const selected = {
  bed: 'bed_single_B', table: 'table_medium', stool: 'chair_stool_wood',
  'wall-shelf': 'shelf_B_large', rug: 'rug_rectangle_stripes_A',
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pad = (bytes, value = 0) => Buffer.concat([bytes, Buffer.alloc((4 - bytes.length % 4) % 4, value)]);
await mkdir(output, {recursive: true});
const texture = await readFile(resolve(source, 'models/furniturebits_texture.png'));
const license = await readFile(resolve(source, 'LICENSE.txt'));
await writeFile(resolve(output, 'furniture-atlas.png'), texture);
await copyFile(resolve(source, 'LICENSE.txt'), resolve(output, 'KayKit-Furniture-Bits-1.0-CC0.txt'));
const assets = [];
for (const [id, sourceName] of Object.entries(selected)) {
  const jsonBytes = await readFile(resolve(source, `models/${sourceName}.gltf`));
  const binary = await readFile(resolve(source, `models/${sourceName}.bin`));
  const json = JSON.parse(jsonBytes.toString('utf8'));
  if (json.buffers.length !== 1 || json.images.length !== 1) throw new Error(`Unexpected source structure: ${sourceName}`);
  delete json.buffers[0].uri;
  json.images[0].uri = 'furniture-atlas.png';
  json.asset.extras = {...json.asset.extras, source: `KayKit Furniture Bits 1.0 / ${sourceName}`, license: 'CC0-1.0', sourceCommit};
  const jsonChunk = pad(Buffer.from(JSON.stringify(json)), 0x20), binChunk = pad(binary);
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  jsonHeader.writeUInt32LE(jsonChunk.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(binChunk.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  const glb = Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]);
  await writeFile(resolve(output, `${id}.glb`), glb);
  let triangles = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) triangles += json.accessors[primitive.indices].count / 3;
  const positions = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  assets.push({id, path: `${id}.glb`, bytes: glb.length, sha256: sha(glb), triangles,
    sourceName, sourceHashes: {gltf: sha(jsonBytes), bin: sha(binary)},
    sourceBounds: {min: positions.min, max: positions.max},
    modifications: 'Lossless GLB repack with shared external atlas; runtime fits declared dimensions and applies forest palette material.'});
}
const manifest = {version: 1, name: 'Cabin interior adopted furniture', author: 'Kay Lousberg',
  sourceUrl: 'https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0', sourceCommit,
  authorUrl: 'https://kaylousberg.itch.io/furniture-bits', license: 'CC0-1.0',
  licenseFile: 'KayKit-Furniture-Bits-1.0-CC0.txt', licenseSha256: sha(license),
  texture: {path: 'furniture-atlas.png', bytes: texture.length, sha256: sha(texture), modified: false}, assets};
await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${assets.length} cabin models, ${assets.reduce((n, a) => n + a.bytes, texture.length)} bytes with one shared atlas.`);
