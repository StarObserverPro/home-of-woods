/** Rebuild the admitted Vuena fox from the pinned local source, without network access. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = new URL('../', import.meta.url);
const sourceFile = 'sources/vuena/cute-pets/animal_fox.glb';
const outputFile = 'public/assets/wildlife/fox.glb';
const sourceCommit = 'a3944e5e54eb7e1ab2c24744b88a1ae6617e4534';
const sourceSha256 = '78aed50756a15654bf544859d676556fd0cf884ef69bfdb4eb4945741cd64432';
const sourceUrl = `https://github.com/Vuena/free-low-poly-animals-cc0/blob/${sourceCommit}/GLB/animal_fox.glb`;
const height = 1.10;
const clipNames = ['idle', 'walk', 'run'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function decodeGlb(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  const binOffset = 20 + jsonLength;
  assert.equal(bytes.readUInt32LE(binOffset + 4), 0x004e4942);
  const bin = bytes.subarray(binOffset + 8, binOffset + 8 + bytes.readUInt32LE(binOffset));
  return { doc, bin };
}

function encodeGlb(doc, bin) {
  let json = Buffer.from(JSON.stringify(doc));
  json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const paddedBin = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const out = Buffer.alloc(28 + json.length + paddedBin.length);
  out.write('glTF');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(json.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  json.copy(out, 20);
  const binOffset = 20 + json.length;
  out.writeUInt32LE(paddedBin.length, binOffset);
  out.writeUInt32LE(0x004e4942, binOffset + 4);
  paddedBin.copy(out, binOffset + 8);
  return out;
}

function compactBinary(doc, sourceBin) {
  const accessors = [], bufferViews = [], chunks = [];
  const accessorMap = new Map(), viewMap = new Map();
  let byteLength = 0;
  const view = oldIndex => {
    if (viewMap.has(oldIndex)) return viewMap.get(oldIndex);
    const original = doc.bufferViews[oldIndex];
    assert.equal(original.buffer, 0);
    const padding = (4 - byteLength % 4) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
    const bytes = sourceBin.subarray(original.byteOffset ?? 0, (original.byteOffset ?? 0) + original.byteLength);
    const newIndex = bufferViews.length;
    bufferViews.push({ ...original, buffer: 0, byteOffset: byteLength });
    chunks.push(bytes); byteLength += bytes.length;
    viewMap.set(oldIndex, newIndex);
    return newIndex;
  };
  const accessor = oldIndex => {
    if (accessorMap.has(oldIndex)) return accessorMap.get(oldIndex);
    const original = doc.accessors[oldIndex];
    assert.ok(!original.sparse, 'Pinned fox does not require sparse accessor rewriting');
    const newIndex = accessors.length;
    accessors.push({ ...original, bufferView: view(original.bufferView) });
    accessorMap.set(oldIndex, newIndex);
    return newIndex;
  };
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
    for (const attribute of Object.keys(primitive.attributes)) primitive.attributes[attribute] = accessor(primitive.attributes[attribute]);
    primitive.indices = accessor(primitive.indices);
    assert.ok(!primitive.targets, 'Pinned fox has no morph targets');
  }
  for (const skin of doc.skins) skin.inverseBindMatrices = accessor(skin.inverseBindMatrices);
  for (const image of doc.images) image.bufferView = view(image.bufferView);
  for (const animation of doc.animations) for (const sampler of animation.samplers) {
    sampler.input = accessor(sampler.input);
    sampler.output = accessor(sampler.output);
  }
  doc.accessors = accessors;
  doc.bufferViews = bufferViews;
  doc.buffers = [{ byteLength }];
  return Buffer.concat(chunks);
}

// Only scene bounds are inspected here; the original PNG bytes are copied unchanged.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 2048, height: 2048, close() {} });
globalThis.ProgressEvent = class extends Event {
  constructor(type, init) { super(type); Object.assign(this, init); }
};
const loader = new GLTFLoader();
const parse = bytes => loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
function idleBounds(gltf) {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'idle')).play();
  mixer.update(0);
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(object => {
    if (object.isSkinnedMesh) { object.skeleton.update(); object.computeBoundingBox(); }
  });
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
  return bounds;
}

const bytes = await readFile(new URL(sourceFile, root));
assert.equal(hash(bytes), sourceSha256, 'Source changed; review the new source before admitting it');
const { doc, bin: sourceBin } = decodeGlb(bytes);
assert.equal(doc.meshes.length, 2);
assert.equal(doc.skins.length, 1);
assert.equal(doc.skins[0].joints.length, 19);
const lod0MeshIndex = doc.meshes.findIndex(mesh => mesh.name === 'fox_LOD0');
const lod1MeshIndex = doc.meshes.findIndex(mesh => mesh.name === 'fox_LOD1');
assert.ok(lod0MeshIndex >= 0 && lod1MeshIndex >= 0);
const lidIndex = doc.nodes.findIndex(node => node.name === 'Lids');
assert.ok(lidIndex >= 0);
const lidsRestPosition = [...doc.nodes[lidIndex].translation];
// Preserve the authored fully closed position as evidence for procedural blinking.
const sourceIdle = doc.animations.find(animation => animation.name === 'idle');
const sourceLidsChannel = sourceIdle.channels.find(channel => channel.target.node === lidIndex && channel.target.path === 'translation');
const sourceLidsAccessor = doc.accessors[sourceIdle.samplers[sourceLidsChannel.sampler].output];
assert.equal(sourceLidsAccessor.componentType, 5126);
assert.equal(sourceLidsAccessor.type, 'VEC3');
const sourceLidsView = doc.bufferViews[sourceLidsAccessor.bufferView];
const sourceLidsOffset = (sourceLidsView.byteOffset ?? 0) + (sourceLidsAccessor.byteOffset ?? 0);
let lidsClosedPosition = [...lidsRestPosition];
for (let index = 0; index < sourceLidsAccessor.count; index++) {
  const offset = sourceLidsOffset + index * (sourceLidsView.byteStride ?? 12);
  const position = [0, 1, 2].map(axis => sourceBin.readFloatLE(offset + axis * 4));
  if (position[1] > lidsClosedPosition[1]) lidsClosedPosition = position;
}
const lidsClosedDelta = lidsClosedPosition.map((value, axis) => value - lidsRestPosition[axis]);
const originalMaterial = JSON.stringify(doc.materials);
const originalImages = doc.images.map(image => {
  const view = doc.bufferViews[image.bufferView];
  return hash(sourceBin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
});

// Keep one actual mesh, not an invisible second LOD in the scene or its binary payload.
const nodeMap = new Map();
doc.nodes.forEach((node, index) => { if (node.mesh !== lod1MeshIndex) nodeMap.set(index, nodeMap.size); });
doc.nodes = doc.nodes.filter(node => node.mesh !== lod1MeshIndex).map(node => {
  if (node.children) node.children = node.children.filter(index => nodeMap.has(index)).map(index => nodeMap.get(index));
  if (node.mesh !== undefined) { assert.equal(node.mesh, lod0MeshIndex); node.mesh = 0; }
  return node;
});
doc.meshes = [doc.meshes[lod0MeshIndex]];
for (const scene of doc.scenes) scene.nodes = scene.nodes.filter(index => nodeMap.has(index)).map(index => nodeMap.get(index));
for (const skin of doc.skins) {
  skin.joints = skin.joints.map(index => nodeMap.get(index));
  if (skin.skeleton !== undefined) skin.skeleton = nodeMap.get(skin.skeleton);
}
doc.animations = clipNames.map(name => {
  const animation = doc.animations.find(candidate => candidate.name === name);
  assert.ok(animation, `Missing ${name}`);
  const samplerMap = new Map(), samplers = [];
  const channels = animation.channels.filter(channel => !(channel.target.node === lidIndex && channel.target.path === 'translation')).map(channel => {
    if (!samplerMap.has(channel.sampler)) {
      samplerMap.set(channel.sampler, samplers.length);
      samplers.push({ ...animation.samplers[channel.sampler] });
    }
    return { ...channel, sampler: samplerMap.get(channel.sampler), target: { ...channel.target, node: nodeMap.get(channel.target.node) } };
  });
  assert.equal(channels.length, 56);
  return { ...animation, samplers, channels };
});
const bin = compactBinary(doc, sourceBin);
assert.equal(JSON.stringify(doc.materials), originalMaterial, 'Keep the authored material');
doc.images.forEach((image, index) => {
  const view = doc.bufferViews[image.bufferView];
  assert.equal(hash(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength)), originalImages[index], 'Keep original embedded PNG bytes');
});
// The pinned ORM's blue channel is identically zero (512 x 512 pixels).
// Making that authored nonmetallic result explicit is equivalent to the source
// glTF default factor 1 multiplied by the same zero-valued metallic texture.
for (const material of doc.materials) material.pbrMetallicRoughness.metallicFactor = 0;
const prepared = await parse(encodeGlb(doc, bin));
const sourceBounds = idleBounds(prepared);
const size = sourceBounds.getSize(new THREE.Vector3()), center = sourceBounds.getCenter(new THREE.Vector3());
const scale = height / size.y;
const translation = [-center.x * scale, -sourceBounds.min.y * scale, -center.z * scale];
const scene = doc.scenes[doc.scene ?? 0];
doc.nodes.push({ name: 'HOW_fox_root', children: [...scene.nodes], scale: [scale, scale, scale], translation });
scene.nodes = [doc.nodes.length - 1];
doc.asset.extras = {
  ...doc.asset.extras,
  source: sourceUrl, sourceCommit, sourceSha256, license: 'CC0-1.0',
  adaptedFor: 'HOW-WILDLIFE-FOX-1',
  modification: 'Only original LOD0; idle/walk/run without Lids translation; unchanged geometry, roughness and PNGs; explicit metallicFactor=0 equals the original zero-blue ORM; centered, grounded root at 1.10 idle-frame height; +Y up and +Z forward retained.',
};
const out = encodeGlb(doc, bin);
const verified = await parse(out), outputBounds = idleBounds(verified);
const outputSize = outputBounds.getSize(new THREE.Vector3()), outputCenter = outputBounds.getCenter(new THREE.Vector3());
assert.ok(Math.abs(outputSize.y - height) < 1e-6);
assert.ok(Math.abs(outputBounds.min.y) < 1e-6 && Math.abs(outputCenter.x) < 1e-6 && Math.abs(outputCenter.z) < 1e-6);
assert.equal(doc.nodes.filter(node => node.mesh !== undefined).length, 1);
for (const clip of verified.animations) assert.ok(!clip.tracks.some(track => track.name === 'Lids.position'));
await mkdir(new URL('public/assets/wildlife/', root), { recursive: true });
await writeFile(new URL(outputFile, root), out);
const triangles = doc.meshes[0].primitives.reduce((sum, primitive) => sum + doc.accessors[primitive.indices].count / 3, 0);
const vertices = doc.meshes[0].primitives.reduce((sum, primitive) => sum + doc.accessors[primitive.attributes.POSITION].count, 0);
console.log(JSON.stringify({
  sourceFile, sourceCommit, sourceSha256, sourceBytes: bytes.length,
  outputFile, outputSha256: hash(out), outputBytes: out.length,
  meshes: 1, primitives: doc.meshes[0].primitives.length, materials: doc.materials.length,
  triangles, vertices, joints: doc.skins[0].joints.length,
  clips: verified.animations.map(clip => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length })),
  sourceBounds: { min: sourceBounds.min.toArray(), max: sourceBounds.max.toArray() },
  normalizedBounds: { min: outputBounds.min.toArray(), max: outputBounds.max.toArray() },
  normalization: { height, idleSampleTime: 0, scale, translation, up: '+Y', forward: '+Z' },
  materialAdjustment: 'Explicit metallicFactor=0 is equivalent to the original ORM blue channel, which is zero at every pixel; authored roughness and texture bytes are unchanged.',
  eyes: {
    lidsRestPosition, lidsClosedPosition, lidsClosedDelta,
    atlasCenters: [[0.412841796875, 0.26025390625], [0.586669921875, 0.26025390625]],
    atlasHalfSize: [0.028076171875, 0.04052734375],
    sourceImageSha256: originalImages,
  },
}, null, 2));
