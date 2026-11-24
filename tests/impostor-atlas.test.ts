import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import {createExportFileMiddleware, EXPORTED_ASSET_ROUTE} from '../tools/impostors/export-files.mjs';
import {dilateTransparentRgb, impostorFrames, selectImpostorFrames, validateImpostorManifest} from '../src/scene/impostors/atlas-layout.ts';
import type {ImpostorManifest} from '../src/scene/impostors/atlas-layout.ts';
import {createImpostorBatch} from '../src/scene/impostors/runtime.ts';

const manifest = (): ImpostorManifest => ({version: 1, id: 'fixture', source: 'test geometry', encoding: 'linear-rgba8', normalSpace: 'asset', alpha: 'coverage',
  frameSize: 128, padding: 4, columns: 8, rows: 4, width: 1024, height: 512, frameSpan: 12,
  center: [0, 5, 0], bounds: {min: [-3, 0, -3], max: [3, 10, 3]}, frames: impostorFrames(), sourceTriangles: 80,
  albedo: 'fixture-albedo.png', normal: 'fixture-normal.png'});

test('25 unique captures cover the horizon, two upper rings and the zenith', () => {
  const frames = impostorFrames();
  assert.equal(frames.length, 25);
  assert.equal(new Set(frames.map(f => `${f.row}:${f.column}`)).size, 25);
  for (const frame of frames) assert.ok(Math.abs(Math.hypot(...frame.direction) - 1) < 1e-12);
  for (let i = 0; i < 24; i++) assert.equal(frames[i].row, Math.floor(i / 8));
  assert.deepEqual(frames[24].direction, [0, 1, 0]);
  assert.deepEqual(validateImpostorManifest(manifest()), manifest());
});

test('view weights remain normalized at azimuth seams, elevation boundaries and the pole', () => {
  for (const elevation of [-30, 0, 29.999, 30, 59.999, 60, 89.99, 90]) {
    for (const angle of [-.001, 0, .001, 44.99, 45, 45.01, 179.99, 359.999, 360]) {
      const e = elevation * Math.PI / 180, a = angle * Math.PI / 180;
      const sample = selectImpostorFrames([Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]);
      assert.ok(Math.abs(sample.weights.reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
      assert.ok(sample.weights.every(weight => weight >= 0 && weight <= 1));
      assert.ok(sample.indices.every(index => index >= 0 && index < 25));
    }
  }
  assert.equal(selectImpostorFrames([0, 1, 0]).indices[0], 24);
  assert.deepEqual(selectImpostorFrames([0, 0, 1]).indices, [0, 1, 8, 9]);
  assert.deepEqual(selectImpostorFrames([0, -1, 1]).indices, [0, 1, 8, 9]);
});

test('dilation extends RGB a bounded distance while preserving every coverage byte', () => {
  const rgba = new Uint8Array(9 * 9 * 4), center = (4 * 9 + 4) * 4;
  rgba.set([100, 180, 220, 128], center);
  const snapshot = rgba.slice(), expanded = dilateTransparentRgb(rgba, 9, 9, 2);
  assert.deepEqual(rgba, snapshot);
  for (let i = 3; i < expanded.length; i += 4) assert.equal(expanded[i], rgba[i]);
  assert.deepEqual([...expanded.subarray((4 * 9 + 6) * 4, (4 * 9 + 6) * 4 + 4)], [100, 180, 220, 0]);
  assert.deepEqual([...expanded.subarray((4 * 9 + 7) * 4, (4 * 9 + 7) * 4 + 4)], [0, 0, 0, 0]);
  assert.throws(() => dilateTransparentRgb(rgba, 8, 8, 1));
});

test('runtime bounds include the displaced card and disposal leaves a shared atlas alive', () => {
  const albedo = new THREE.Texture(), normal = new THREE.Texture();
  let textureDisposals = 0;
  albedo.addEventListener('dispose', () => textureDisposals++); normal.addEventListener('dispose', () => textureDisposals++);
  const atlas = {manifest: manifest(), albedo, normal, dispose() {albedo.dispose(); normal.dispose();}};
  const batch = createImpostorBatch(atlas, [{position: [100, 20, -40], scale: [2, 3, 2], yaw: .4}]);
  assert.deepEqual(batch.mesh.boundingSphere?.center.toArray(), [100, 35, -40]);
  assert.ok(batch.mesh.boundingSphere!.radius >= 12 * Math.SQRT1_2 * 3);
  assert.equal(batch.stats().triangles, 2);
  assert.equal(batch.stats().textureBytes, 4 * 1024 * 1024);
  assert.equal(batch.material.transparent, false); assert.equal(batch.material.depthWrite, true);
  let geometryDisposals = 0;
  batch.mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
  batch.dispose(); batch.dispose(); assert.equal(geometryDisposals, 1); assert.equal(textureDisposals, 0);
  assert.equal(batch.stats().disposed, true); atlas.dispose(); assert.equal(textureDisposals, 2);
});

test('unsupported atlas layout and invalid transforms fail before GPU resources are created', () => {
  const broken = manifest(); broken.frames[0].direction = [1, 0, 0];
  assert.throws(() => validateImpostorManifest(broken), /layout/);
  const atlas = {manifest: manifest(), albedo: new THREE.Texture(), normal: new THREE.Texture(), dispose() {}};
  assert.throws(() => createImpostorBatch(atlas, [{position: [0, 0, 0], scale: [1, 0, 1]}]), /placement/);
});

test('export route reads newly written files and never falls through to SPA HTML', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'how-impostor-route-'));
  const middleware = createExportFileMiddleware(directory, 'fixture');
  const request = async (url: string) => {
    let status = 0, headers: Record<string, string | number> = {}, body: Buffer | string = '', fallback = false;
    await middleware({url, method: 'GET'}, {
      writeHead(code: number, fields: typeof headers) {status = code; headers = fields;},
      end(bytes: typeof body) {body = bytes;},
    }, () => {fallback = true;});
    return {status, headers, body, fallback};
  };
  try {
    assert.equal((await request(`${EXPORTED_ASSET_ROUTE}fixture.json`)).status, 404);
    await fs.writeFile(path.join(directory, 'fixture.json'), JSON.stringify(manifest()));
    await fs.writeFile(path.join(directory, 'fixture-albedo.png'), Buffer.from([137, 80, 78, 71]));
    const json = await request(`${EXPORTED_ASSET_ROUTE}fixture.json`);
    assert.equal(json.status, 200); assert.equal(json.fallback, false);
    assert.match(String(json.headers['Content-Type']), /^application\/json/);
    assert.deepEqual(JSON.parse(json.body.toString()), manifest());
    const png = await request(`${EXPORTED_ASSET_ROUTE}fixture-albedo.png`);
    assert.equal(png.headers['Content-Type'], 'image/png');
    assert.deepEqual(png.body, Buffer.from([137, 80, 78, 71]));
    for (const name of ['missing.json', '../index.html', '%2e%2e/index.html']) {
      const missing = await request(EXPORTED_ASSET_ROUTE + name);
      assert.equal(missing.status, 404); assert.equal(missing.fallback, false);
    }
    assert.equal((await request('/tools/impostors/browser.ts')).fallback, true);
  } finally {await fs.rm(directory, {recursive: true, force: true});}
});
