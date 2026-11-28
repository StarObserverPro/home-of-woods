import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Resources } from '../src/scene/resources.ts';
import { createInteriorMaterials } from '../src/scene/lighting/interior-materials.ts';

test('room visits keep shared outdoor sampler hooks intact and reuse one room variant', () => {
  const resources = new Resources(), room = createInteriorMaterials(resources);
  const texture = new THREE.Texture(), source = new THREE.MeshPhysicalMaterial({ map: texture, color: '#ab9c75', sheen: .4 });
  const outdoorUniform = { value: new THREE.Data3DTexture() };
  const compile: THREE.Material['onBeforeCompile'] = shader => { shader.uniforms.outdoorVolume = outdoorUniform; };
  source.onBeforeCompile = compile; source.customProgramCacheKey = () => 'outdoor-sampler-layout';
  const sourceVersion = source.version;
  const rig = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const skin = new THREE.Mesh(geometry, source), sleeves = new THREE.Mesh(geometry, [source, source]);
  const neighbour = new THREE.Mesh(geometry, source); rig.add(skin, sleeves);
  let variant: THREE.MeshPhysicalMaterial | undefined;
  for (let visit = 0; visit < 4; visit++) {
    room.bind(rig);
    const current = skin.material as THREE.MeshPhysicalMaterial;
    if (!variant) variant = current;
    assert.equal(current, variant);
    assert.notEqual(current, source); assert.equal(current.map, texture);
    assert.ok(current.color.equals(source.color)); assert.equal(current.sheen, source.sheen);
    assert.deepEqual(sleeves.material, [variant, variant]);
    assert.equal(neighbour.material, source, 'another outdoor user never changes');
    assert.notEqual(current.onBeforeCompile, compile);
    assert.equal(source.onBeforeCompile, compile);
    assert.equal(source.customProgramCacheKey(), 'outdoor-sampler-layout');
    assert.equal(source.version, sourceVersion, 'visits cannot rebuild the outdoor shader layout');
    assert.equal(room.stats().variants, 1);
    room.restore();
    assert.equal(skin.material, source); assert.deepEqual(sleeves.material, [source, source]);
  }
  let disposed = 0, sourceDisposed = 0, textureDisposed = 0;
  variant!.addEventListener('dispose', () => disposed++);
  source.addEventListener('dispose', () => sourceDisposed++); texture.addEventListener('dispose', () => textureDisposed++);
  room.bind(rig); room.dispose(); resources.dispose(); room.dispose();
  assert.equal(skin.material, source); assert.equal(disposed, 1);
  assert.equal(sourceDisposed, 0); assert.equal(textureDisposed, 0);
  source.dispose(); texture.dispose(); outdoorUniform.value.dispose(); geometry.dispose();
});

test('room variants follow blink maps and new wardrobe meshes without clone chains', () => {
  const resources = new Resources(), room = createInteriorMaterials(resources), rig = new THREE.Group();
  const open = new THREE.Texture(), closed = new THREE.Texture(), source = new THREE.MeshStandardMaterial({ map: open });
  const geometry = new THREE.BoxGeometry(), face = new THREE.Mesh(geometry, source); rig.add(face);
  room.bind(rig);
  const variant = face.material;
  const roomHook: THREE.Material['onBeforeCompile'] = shader => { shader.uniforms.roomVolume = { value: null }; };
  variant.onBeforeCompile = roomHook;
  source.map = closed; room.bind(rig);
  assert.equal(face.material, variant); assert.equal(variant.map, closed);
  assert.equal(variant.onBeforeCompile, roomHook, 'blinking keeps the room shader uniform owner');
  const coat = new THREE.Mesh(geometry, source); rig.add(coat); room.bind(rig);
  assert.equal(coat.material, variant); assert.equal(room.stats().variants, 1);
  const replacement = new THREE.MeshStandardMaterial({ color: '#567432' });
  coat.material = replacement; room.bind(rig);
  assert.equal(room.stats().variants, 2);
  room.restore(); assert.equal(face.material, source); assert.equal(coat.material, replacement);
  room.dispose(); resources.dispose(); source.dispose(); replacement.dispose(); open.dispose(); closed.dispose(); geometry.dispose();
});
