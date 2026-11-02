import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Models } from '../src/scene/models.ts';
import { Resources } from '../src/scene/resources.ts';
import { createWildlifePresentation } from '../src/scene/wildlife-presentation.ts';
import { createWildlife, advanceWildlife, wildlifeViews } from '../src/domain/wildlife.ts';
import { WILDLIFE_DEFINITIONS } from '../src/content/wildlife.ts';
import { START, WORLD_SEED } from '../src/content/world.ts';
import { makeColliders, makeTrees } from '../src/world/layout.ts';
import { characterModels, parseGeometryFile } from './glb-fixtures.ts';

test('actual normalized models share a scale family and only the admitted two locomotion clips', async () => {
  for (const id of ['squirrel', 'hare']) {
    const gltf = await parseGeometryFile(`public/assets/wildlife/${id}.glb`), mixer = new THREE.AnimationMixer(gltf.scene);
    assert.deepEqual(gltf.animations.map(a => a.name).sort(), ['idle', 'walk']);
    mixer.clipAction(gltf.animations.find(a => a.name === 'idle')!).play(); mixer.update(0);
    gltf.scene.updateMatrixWorld(true); gltf.scene.traverse(o => { if (o instanceof THREE.SkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } });
    const box = new THREE.Box3().setFromObject(gltf.scene);
    assert.ok(Math.abs(box.min.y) < .005); assert.ok(box.max.y > 1.08 && box.max.y < 1.14);
    mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
    gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose(); });
  }
});
test('five real model spawn/despawn cycles release private skeletons/materials without destroying shared assets', async () => {
  const { resources, models } = await characterModels(), initial = resources.stats().extras;
  const state = createWildlife(0); advanceWildlife(state, 0, WORLD_SEED, START, makeColliders(makeTrees()), WILDLIFE_DEFINITIONS.map(d => d.id));
  const views = wildlifeViews(state, 2), camera = new THREE.PerspectiveCamera(); camera.position.set(-36, 26, 10);
  const presentation = createWildlifePresentation(resources, models);
  for (let i = 0; i < 5; i++) {
    presentation.update(views, i * 5, 14, camera, false); assert.equal(presentation.stats().active, 2);
    assert.equal(presentation.group.children[0].name, views[0].id);
    presentation.update(views, i * 5, 23, camera, false); assert.equal(presentation.stats().visible, 0);
    presentation.update([], i * 5 + 1, 14, camera, false); assert.equal(presentation.stats().active, 0);
    assert.equal(resources.stats().extras, initial, 'private instance resources must leave the owner set');
  }
  assert.equal(presentation.stats().created, 10); assert.equal(presentation.stats().released, 10);
  presentation.dispose(); presentation.dispose(); presentation.update(views, 30, 14, camera, false);
  assert.equal(presentation.stats().active, 0); models.clear(); resources.dispose(); assert.equal(resources.stats().extras, 0);
});
test('optional animal download failure leaves required game assets loaded and does not fabricate an animal', async () => {
  const original = GLTFLoader.prototype.loadAsync, owner = new Resources(), models = new Models(owner), warn = console.warn;
  console.warn = () => {};
  GLTFLoader.prototype.loadAsync = async function(url) {
    if (url.includes('/wildlife/')) throw new Error('fixture offline animal');
    return parseGeometryFile('public' + url);
  };
  try {
    await models.load(); assert.ok(models.templates.has('ranger')); assert.ok(models.templates.has('cabin'));
    const presentation = createWildlifePresentation(owner, models); assert.deepEqual(presentation.available(), []);
    presentation.dispose();
  } finally { GLTFLoader.prototype.loadAsync = original; console.warn = warn; models.clear(); owner.dispose(); }
});
