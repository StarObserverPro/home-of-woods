// Small, reproducible glTF edits: retain Kenney topology, normalize pivots/scale and palette.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const specs = [
  { name: 'branches', part: 'campfire_logs.glb', size: [1.9, .32, 1.25], colors: ['#a47742', '#765532'] },
  { name: 'mushrooms', part: 'mushroom_tanGroup.glb', size: [1.5, .95, 1.25], colors: ['#f0d6a1', '#d39a51'] },
];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const results = [];
for (const spec of specs) {
  const source = fs.readFileSync(`sources/kenney/${spec.part}`);
  const gltf = JSON.parse(source.subarray(20, 20 + source.readUInt32LE(12)));
  const parsed = await new GLTFLoader().parseAsync(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), '');
  const bounds = new THREE.Box3().setFromObject(parsed.scene), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = spec.size.map((value, i) => value / size.getComponent(i));
  const wrapper = gltf.nodes.length;
  gltf.nodes.push({ name: spec.name, children: gltf.scenes[gltf.scene ?? 0].nodes, scale, translation: [-center.x * scale[0], -bounds.min.y * scale[1], -center.z * scale[2]] });
  gltf.scenes[gltf.scene ?? 0].nodes = [wrapper];
  gltf.materials.forEach((m, i) => {
    const c = new THREE.Color(spec.colors[i]);
    m.pbrMetallicRoughness = { baseColorFactor: [...c.toArray(), 1], metallicFactor: 0, roughnessFactor: .68 };
  });
  gltf.asset.generator = 'Home of Woods glTF normalization; Kenney Nature Kit 2.1 CC0';
  const json = Buffer.from(JSON.stringify(gltf)), padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const bin = source.subarray(20 + source.readUInt32LE(12));
  const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + padded.length + bin.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const output = Buffer.concat([header, padded, bin]);
  fs.writeFileSync(`public/assets/gathering/${spec.name}.glb`, output);
  results.push({ name: spec.name, source: spec.part, sourceSha256: sha(source), originalBounds: bounds, size: spec.size, bytes: output.length, sha256: sha(output), topology: 'unchanged', materials: 'nonmetallic; project palette; roughness .68' });
  parsed.scene.traverse(o => { if (o.isMesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } });
}
fs.writeFileSync('evidence/gathering/asset-normalization.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 }))));
