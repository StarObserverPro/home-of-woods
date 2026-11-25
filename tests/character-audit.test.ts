import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {deflateSync} from 'node:zlib';
import {inspectGlb, inspectGlbFile, parseGlb} from '../tools/characters/glb-inspect.mjs';
import {validateCharacterAssets} from '../tools/characters/validate.mjs';
import {CHARACTER_QUALITY_VERSION} from '../src/content/character-quality.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CRC_TABLE = Array.from({length: 256}, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function pngChunk(type: string, data: Buffer) {
  const bytes = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  const head = Buffer.alloc(4), tail = Buffer.alloc(4);
  head.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, bytes, tail]);
}
function bodyPng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1024, 0); header.writeUInt32BE(1024, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(Buffer.alloc((1 + 1024 * 4) * 1024))), pngChunk('IEND', Buffer.alloc(0))]);
}
const PNG = bodyPng();

/** Real buffer-backed geometry, skin, morph and PNG; no fabricated count-only GLB. */
function fixture({triangles = 1, instances = 1, sparse = false, morph = false, badIndex = false, externalImage = false} = {}) {
  const chunks: Buffer[] = [], bufferViews: any[] = [], accessors: any[] = [];
  let length = 0;
  function view(data: Buffer) {
    const padding = (4 - length % 4) % 4;
    if (padding) {chunks.push(Buffer.alloc(padding)); length += padding;}
    const index = bufferViews.length;
    bufferViews.push({buffer: 0, byteOffset: length, byteLength: data.length}); chunks.push(data); length += data.length;
    return index;
  }
  function accessor(data: Float32Array | Uint16Array, type: string, count: number) {
    const index = accessors.length;
    accessors.push({bufferView: view(Buffer.from(data.buffer)), componentType: data instanceof Float32Array ? 5126 : 5123, type, count});
    return index;
  }
  const positions = accessor(new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 0]), 'VEC3', 3);
  if (sparse) {
    delete accessors[positions].bufferView;
    accessors[positions].sparse = {count: 2,
      indices: {bufferView: view(Buffer.from(new Uint16Array([1, 2]).buffer)), componentType: 5123},
      values: {bufferView: view(Buffer.from(new Float32Array([1, 0, 0, 0, 2, 0]).buffer))}};
  }
  const normal = accessor(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 'VEC3', 3);
  const uv = accessor(new Float32Array([0, 0, 1, 0, 0, 1]), 'VEC2', 3);
  const joints = accessor(new Uint16Array(12), 'VEC4', 3);
  const weights = accessor(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), 'VEC4', 3);
  const indexData = new Uint16Array(triangles * 3);
  for (let i = 0; i < indexData.length; i++) indexData[i] = i % 3;
  if (badIndex) indexData[0] = 99;
  const indices = accessor(indexData, 'SCALAR', indexData.length);
  const primitive: any = {attributes: {POSITION: positions, NORMAL: normal, TEXCOORD_0: uv, JOINTS_0: joints, WEIGHTS_0: weights}, indices, material: 0};
  if (morph) primitive.targets = [{POSITION: accessor(new Float32Array(9), 'VEC3', 3)}];
  const image = externalImage ? {uri: 'do-not-download.png'} : {mimeType: 'image/png', bufferView: view(PNG)};
  const nodes: any[] = [{mesh: 0, skin: 0, children: [1]}, {name: 'spine'}];
  const roots = [0];
  for (let i = 1; i < instances; i++) {roots.push(nodes.length); nodes.push({mesh: 0, skin: 0, translation: [i * 2, 0, 0]});}
  const gltf = {asset: {version: '2.0'}, scenes: [{nodes: roots}], scene: 0, nodes,
    meshes: [{name: 'body', extras: {howCharacterPart: 'body', ...(morph ? {targetNames: ['blink']} : {})}, primitives: [primitive]}],
    skins: [{joints: [1]}], materials: [{name: 'body', pbrMetallicRoughness: {baseColorTexture: {index: 0}, metallicFactor: 0}}],
    images: [image], textures: [{source: 0}], accessors, bufferViews, buffers: [{byteLength: length}]};
  return packGlb(gltf, Buffer.concat(chunks));
}
function packGlb(gltf: any, bin: Buffer) {
  const json = Buffer.from(JSON.stringify(gltf));
  const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const paddedBin = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
  const header = Buffer.alloc(20), binaryHeader = Buffer.alloc(8);
  header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + paddedJson.length + paddedBin.length, 8);
  header.writeUInt32LE(paddedJson.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binaryHeader.writeUInt32LE(paddedBin.length); binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, paddedJson, binaryHeader, paddedBin]);
}

const entry = (file: string | null, overrides = {}) => ({id: 'test-visitor', file, tier: 'visitor', status: 'ready', visibility: 'local-only',
  source: {modification: true, gameUse: true, redistribution: false, evidence: 'original test fixture'},
  review: {proportions: 'approved', wardrobe: 'approved', deformation: 'approved'}, ...overrides});
const config = (...assets: any[]) => ({contractVersion: CHARACTER_QUALITY_VERSION, assets});

test('GLB inspection counts rendered instances and actual embedded geometry/texture capabilities', () => {
  const report = inspectGlb(fixture({triangles: 3, instances: 2, morph: true}));
  assert.deepEqual(report.issues, []);
  assert.equal(report.totals.triangles, 6);
  assert.equal(report.totals.drawCalls, 2);
  assert.equal(report.totals.vertices, 6);
  assert.equal(report.totals.bones, 1);
  assert.equal(report.totals.texturePixels, 1024 ** 2, 'shared image is not counted twice');
  assert.deepEqual(report.capabilities.blinkMorphs, ['blink']);
  assert.equal(report.totals.morphTargetsMaximum, 1);
  assert.deepEqual(report.partTriangles, {body: 6});
  assert.deepEqual(report.bounds.size, [3, 2, 0]);
  assert.equal(report.proportions.headToBody, null, 'cannot derive head proportion from the whole mesh box');
});

test('sparse positions are measured from bytes, and malformed indices cannot pass', () => {
  const sparse = inspectGlb(fixture({sparse: true}));
  assert.deepEqual(sparse.issues, []);
  assert.deepEqual(sparse.bounds.size, [1, 2, 0]);
  assert.ok(inspectGlb(fixture({badIndex: true})).issues.some(issue => issue.message.includes('Triangle index exceeds')));
  const broken = Buffer.from(fixture()); broken.writeUInt32LE(12, 8);
  assert.throws(() => parseGlb(broken), /length/);
});

test('unindexed triangles and strip/fan counts follow the glTF primitive mode', () => {
  const {gltf, binary} = parseGlb(fixture());
  const primitive = gltf.meshes[0].primitives[0];
  delete primitive.indices;
  for (const mode of [4, 5, 6]) {
    primitive.mode = mode;
    assert.equal(inspectGlb(packGlb(gltf, binary)).totals.triangles, 1);
  }
  primitive.mode = 1;
  assert.ok(inspectGlb(packGlb(gltf, binary)).issues.some(issue => issue.code === 'primitive-mode'));
});

test('default Three.js color-pass estimate includes double-sided transparent materials', () => {
  const {gltf, binary} = parseGlb(fixture());
  gltf.materials[0].alphaMode = 'BLEND'; gltf.materials[0].doubleSided = true;
  const report = inspectGlb(packGlb(gltf, binary));
  assert.equal(report.totals.primitives, 1);
  assert.equal(report.totals.drawCalls, 2);
});

test('pending assets stay unmeasured, present over-budget files fail, and smaller meshes are never padded', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'how-character-audit-'));
  try {
    await writeFile(path.join(root, 'good.glb'), fixture());
    await writeFile(path.join(root, 'large.glb'), fixture({triangles: 8001}));
    const report = await validateCharacterAssets(config(
      entry('good.glb', {id: 'small'}), entry('large.glb', {id: 'large'}),
      entry('missing.glb', {id: 'waiting', status: 'pending'}), entry(null, {id: 'not-acquired', status: 'pending'}),
    ), {root});
    assert.equal(report.assets[0].status, 'passed-technical');
    assert.ok(report.assets[0].issues.some(issue => issue.code === 'below-target' && issue.severity === 'note'));
    assert.equal(report.assets[1].status, 'failed');
    assert.ok(report.assets[1].issues.some(issue => issue.code === 'budget-triangles' && issue.severity === 'error'));
    assert.equal(report.assets[2].status, 'pending-assets');
    assert.equal(report.assets[2].inspection, null);
    assert.equal(report.assets[3].status, 'pending-assets');
    assert.equal(report.summary.measured, 2);
    assert.equal(report.strictFailure, true);
    const pending = config(entry(null, {status: 'pending'}));
    assert.equal((await validateCharacterAssets(pending, {root})).strictFailure, false);
    assert.equal((await validateCharacterAssets(pending, {root, requireAll: true})).strictFailure, true);
    assert.equal((await validateCharacterAssets(config(entry('absent.glb')), {root})).strictFailure, true);
    assert.equal((await validateCharacterAssets(config(entry('absent.glb', {status: 'legacy'})), {root})).strictFailure, true);
  } finally {await rm(root, {recursive: true, force: true});}
});

test('legacy is not an exemption for corrupt geometry or broken texture references', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'how-character-legacy-'));
  try {
    await writeFile(path.join(root, 'broken.glb'), fixture({badIndex: true}));
    const report = await validateCharacterAssets(config(entry('broken.glb', {status: 'legacy'})), {root});
    assert.equal(report.assets[0].status, 'failed');
    assert.equal(report.strictFailure, true);
    assert.ok(report.assets[0].issues.some(issue => issue.code === 'mesh-data' && issue.severity === 'error'));
  } finally {await rm(root, {recursive: true, force: true});}
});

test('a selected model cannot pass with external images, missing skin/UV, or unrecorded public rights', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'how-character-audit-'));
  try {
    await writeFile(path.join(root, 'external.glb'), fixture({externalImage: true}));
    let report = await validateCharacterAssets(config(entry('external.glb', {visibility: 'public'})), {root});
    const errors = report.assets[0].issues.filter(issue => issue.severity === 'error').map(issue => issue.code);
    assert.ok(errors.includes('external-resource')); assert.ok(errors.includes('redistribution'));
    const {gltf, binary} = parseGlb(fixture());
    delete gltf.nodes[0].skin; delete gltf.meshes[0].primitives[0].attributes.TEXCOORD_0;
    await writeFile(path.join(root, 'no-rig.glb'), packGlb(gltf, binary));
    report = await validateCharacterAssets(config(entry('no-rig.glb')), {root});
    assert.ok(report.assets[0].issues.some(issue => issue.code === 'missing-skin'));
    assert.ok(report.assets[0].issues.some(issue => issue.code === 'missing-uv'));
    report = await validateCharacterAssets(config(entry('public/private.glb')), {root});
    assert.equal(report.strictFailure, true, 'a ready declaration cannot permit publishing private input');
  } finally {await rm(root, {recursive: true, force: true});}
});

test('staged source models report all problems without becoming ready; require-all blocks unfinished staging', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'how-character-staging-'));
  try {
    await writeFile(path.join(root, 'source.glb'), fixture({triangles: 8001}));
    const pending = config(entry('source.glb', {status: 'pending', source: undefined}));
    const report = await validateCharacterAssets(pending, {root});
    assert.equal(report.assets[0].status, 'pending-review');
    assert.ok(report.assets[0].issues.some(issue => issue.code === 'budget-triangles' && issue.severity === 'error'));
    assert.ok(report.assets[0].issues.some(issue => issue.code === 'source-rights' && issue.severity === 'error'));
    assert.equal(report.summary.passedTechnical, 0);
    assert.equal(report.strictFailure, false);
    assert.equal((await validateCharacterAssets(pending, {root, requireAll: true})).strictFailure, true);
    await writeFile(path.join(root, 'ready-shape.glb'), fixture());
    const structurallyFine = config(entry('ready-shape.glb', {status: 'pending'}));
    const all = await validateCharacterAssets(structurallyFine, {root, requireAll: true});
    assert.equal(all.strictFailure, true, 'a staged file cannot silently become ready just because numerical checks pass');
    assert.ok(all.assets[0].issues.some(issue => issue.code === 'pending-intake'));
  } finally {await rm(root, {recursive: true, force: true});}
});

test('actual public fallback is measured as legacy; its 1024×1280 atlas is not called normalized', async () => {
  for (const name of ['player', 'visitor']) {
    const file = `public/assets/characters/${name}.glb`;
    const measured = await inspectGlbFile(path.join(ROOT, file));
    assert.deepEqual(measured.issues, []);
    assert.equal(measured.totals.triangles, 7574);
    assert.equal(measured.totals.bones, 23);
    assert.equal(measured.images[0].width, 1024);
    assert.equal(measured.images[0].height, 1280);
    const report = await validateCharacterAssets(config(entry(file, {status: 'legacy', visibility: 'public'})), {root: ROOT});
    assert.equal(report.assets[0].status, 'legacy-inspected');
    assert.equal(report.strictFailure, false);
    assert.ok(report.assets[0].issues.some(issue => issue.code === 'base-atlas-size' && issue.severity === 'warning'));
  }
});

test('CLI strict produces a real JSON report and a failure exit for a provided over-budget asset', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'how-character-cli-'));
  try {
    const model = path.join(root, 'large.glb'), configPath = path.join(root, 'intake.json'), output = path.join(root, 'audit.json');
    await writeFile(model, fixture({triangles: 8001}));
    await writeFile(configPath, JSON.stringify(config(entry(model))));
    const run = spawnSync(process.execPath, ['--experimental-strip-types', 'tools/characters/audit.mjs', 'validate', '--config', configPath, '--strict', '--json', output], {cwd: ROOT, encoding: 'utf8'});
    assert.equal(run.status, 1, run.stderr);
    const report = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(report.assets[0].inspection.totals.triangles, 8001);
    assert.equal(report.strictFailure, true);
  } finally {await rm(root, {recursive: true, force: true});}
});
