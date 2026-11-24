import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Resources } from '../src/scene/resources.ts';
import { createTentExterior } from '../src/scene/tent/exterior.ts';
import { TENT_CLOTH, TENT_HANGING_SOCKETS } from '../src/content/tent.ts';

test('the front is a real opening and a closed curtain covers the same doorway', () => {
  const r = new Resources(), tent = createTentExterior(r);
  tent.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.2, 5), new THREE.Vector3(0, 0, -1));
  assert.equal(ray.intersectObject(tent.panels.front).length, 0);
  assert.ok(ray.intersectObject(tent.panels.back).length > 0);
  assert.ok(ray.intersectObjects(tent.doorTargets).length > 0);
  const lowered = tent.group.getObjectByName('tent:door-curtain-lowered') as THREE.Mesh;
  const raised = tent.group.getObjectByName('tent:door-curtain-gathered')!;
  assert.equal(lowered.visible, false);
  tent.setDoorOpen(false);
  assert.equal(lowered.visible, true); assert.equal(raised.visible, false);
  assert.ok(ray.intersectObject(lowered).length > 0);
  assert.equal((lowered.material as THREE.Material).transparent, false);
  tent.setDoorOpen(true);
  assert.equal(lowered.visible, false); assert.equal(raised.visible, true);
  const line = tent.group.getObjectByName('tent:ridge-guy-lines') as THREE.Mesh;
  line.geometry.computeBoundingBox();
  assert.ok(line.geometry.boundingBox!.max.z < 0, 'the front entrance has no central guy line');
  r.dispose();
});

test('each curved roof is a closed thick shell with finite outward geometry', () => {
  const r = new Resources(), tent = createTentExterior(r);
  for (const mesh of [tent.panels.left, tent.panels.right]) {
    const g = mesh.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal'), index = g.index!;
    const edges = new Map<string, number>(); let volume = 0;
    for (let k = 0; k < p.count; k++) assert.ok([p.getX(k), p.getY(k), p.getZ(k), n.getX(k), n.getY(k), n.getZ(k)].every(Number.isFinite));
    for (let k = 0; k < index.count; k += 3) {
      const ids = [index.getX(k), index.getX(k + 1), index.getX(k + 2)];
      const [a, b, c] = ids.map(i => new THREE.Vector3().fromBufferAttribute(p, i));
      assert.ok(b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-8);
      volume += a.dot(b.clone().cross(c)) / 6;
      for (let edge = 0; edge < 3; edge++) {
        const endpoints = [ids[edge], ids[(edge + 1) % 3]].sort((a, b) => a - b), key = endpoints.join(':');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    assert.ok(volume > .7 && volume < .9);
    assert.ok([...edges.values()].every(count => count === 2), 'all shell edges are manifold');
  }
  r.dispose();
});

test('wind bends only the canvas interior, is bounded and stops with reduced motion', () => {
  const r = new Resources(), tent = createTentExterior(r);
  const positions = tent.panels.left.geometry.getAttribute('position');
  const rest = Float32Array.from(positions.array), weights = tent.panels.left.geometry.getAttribute('tentWindWeight');
  const anchors = [...tent.sockets.values()].map(anchor => anchor.position.clone());
  let moved = false;
  for (let step = 0; step < 80; step++) {
    tent.update({ time: step / 8, delta: 1 / 8, reducedMotion: false, windStrength: 1 });
    assert.ok(tent.stats().windDisplacement <= TENT_CLOTH.maxWindDisplacement);
    for (let i = 0; i < positions.count; i++) {
      const offset = Math.hypot(positions.getX(i) - rest[i * 3], positions.getY(i) - rest[i * 3 + 1], positions.getZ(i) - rest[i * 3 + 2]);
      if (weights.getX(i) < 1e-6) assert.ok(offset < 1e-7, 'sewn supports remain pinned');
      else moved ||= offset > .005;
    }
  }
  assert.ok(moved);
  const frozen = Float32Array.from(positions.array);
  tent.update({ time: 79 / 8, delta: 5, reducedMotion: false, windStrength: 1 });
  assert.deepEqual(Float32Array.from(positions.array), frozen, 'host time freezes wind without an independent loop');
  assert.deepEqual([...tent.sockets.values()].map(anchor => anchor.position), anchors);
  assert.deepEqual([...tent.sockets.keys()], TENT_HANGING_SOCKETS.map(socket => socket.id));
  tent.update({ time: 79 / 8, delta: 0, reducedMotion: true });
  assert.equal(tent.stats().windDisplacement, 0); assert.deepEqual(Float32Array.from(positions.array), rest);
  r.dispose();
});

test('a canvas upgrade preserves filtered fiber maps and Resources owns every generated map', () => {
  const r = new Resources(), tent = createTentExterior(r), material = tent.panels.left.material as THREE.MeshPhysicalMaterial;
  assert.ok(material.isMeshPhysicalMaterial); assert.ok(material.sheen > 0);
  const bump = material.bumpMap!, roughness = material.roughnessMap!, oldMap = material.map!;
  let disposed = 0;
  for (const texture of [bump, roughness, oldMap]) texture.addEventListener('dispose', () => disposed++);
  assert.equal(oldMap.colorSpace, THREE.SRGBColorSpace); assert.equal(bump.colorSpace, THREE.NoColorSpace);
  for (const texture of [bump, roughness, oldMap]) {
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter); assert.equal(texture.generateMipmaps, true);
  }
  tent.setCanvasVariant('sage'); assert.notEqual(material.map, oldMap);
  const sage = material.map!; sage.addEventListener('dispose', () => disposed++);
  assert.equal(material.bumpMap, bump); assert.equal(material.roughnessMap, roughness);
  assert.equal(tent.panels.right.material, material);
  assert.ok(tent.stats().triangles < 9000); assert.ok(tent.stats().meshes <= 24);
  r.dispose(); r.dispose();
  assert.equal(disposed, 4); assert.equal(r.stats().extras, 0);
});
