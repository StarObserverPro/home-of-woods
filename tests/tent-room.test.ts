import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTentRoom } from '../src/scene/tent/room.ts';
import { createInteriorLighting } from '../src/scene/lighting/interior-lighting.ts';
import { createSkySample, sampleSkyLight } from '../src/scene/lighting/sky-light.ts';

test('the real tent remains inside the HUD-safe frame after resize, orbit and zoom reset', () => {
  const room = createTentRoom(), point = new THREE.Vector3();
  const model = room.scene.getObjectByName('felt-camp-tent')!;
  const projected = () => {
    const bounds = new THREE.Box3();
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object.userData.tentDoor) return;
      const positions = object.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).project(room.camera);
        assert.ok([point.x, point.y, point.z].every(Number.isFinite));
        bounds.expandByPoint(point);
      }
    });
    return bounds;
  };
  const assertFits = () => {
    const bounds = projected(), safe = room.stats().camera.safeInsets;
    assert.ok(safe.top >= .13 && safe.bottom >= .19 && safe.left >= .05);
    assert.ok(bounds.min.x >= -1 + safe.left * 2 && bounds.max.x <= 1 - safe.right * 2);
    assert.ok(bounds.min.y >= -1 + safe.bottom * 2 && bounds.max.y <= 1 - safe.top * 2);
    assert.ok(bounds.min.z > -1 && bounds.max.z < 1);
  };
  try {
    for (const [width, height] of [[1000, 740], [390, 844], [844, 390]]) {
      room.camera.aspect = width / height; room.camera.updateProjectionMatrix();
      room.resetCamera(); room.update(1.3, .016, false); assertFits();
      // Explicit zoom remains available; only reset/default fit promises the full shell.
      const originalDistance = room.camera.position.distanceTo(new THREE.Vector3().fromArray(room.stats().camera.target));
      room.zoomBy(1.6); room.update(1.4, .016, false);
      assert.ok(room.camera.position.distanceTo(new THREE.Vector3().fromArray(room.stats().camera.target)) < originalDistance * .7);
      room.resetCamera(); room.update(1.5, .016, false); assertFits();
      for (const [yaw, pitch] of [[.7, .2], [2.2, -2], [1.5, 2]]) {
        room.orbit(yaw, pitch); room.update(2.6, .016, false); assertFits();
      }
    }
  } finally { room.dispose(); }
});

test('felt scatter and lining reflection keep night readable without another shadow map', () => {
  const scene = new THREE.Scene(), light = createInteriorLighting(scene, new THREE.Vector3(0, 3.2, 3.7));
  const sample = createSkySample();
  const luminance = (rgb: number[]) => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  try {
    sampleSkyLight(sample, 14, 0, 0); light.setSky(sample, 14);
    const day = light.stats();
    assert.equal(day.sky, 1.7475); assert.equal(day.opening, 4.41); assert.equal(day.reflection, 0);
    sampleSkyLight(sample, 1, 0, 0); light.setSky(sample, 1);
    const night = light.stats();
    const dayDiffuse = day.sky * luminance(day.skyColor), nightDiffuse = night.sky * luminance(night.skyColor);
    assert.ok(night.sky > 1.6 && night.opening > 2 && night.reflection > .8);
    assert.ok(nightDiffuse > .5, 'night has enough broad light for the small furnishings');
    assert.ok(dayDiffuse > nightDiffuse * 1.7, 'night retains lower diffuse light than day');
    assert.ok(night.skyColor[2] > night.skyColor[0], 'night scatter retains the cool moon tint');
    const reflection = scene.getObjectByName('tent-cloth-reflection') as THREE.DirectionalLight;
    assert.ok(reflection instanceof THREE.DirectionalLight, 'metal needs a directional specular source');
    assert.deepEqual(reflection.position.toArray(), [-3.8, 4.8, 5]);
    assert.deepEqual(reflection.target.position.toArray(), [0, 1, 0]);
    assert.ok(reflection.color.b > reflection.color.r);
    assert.equal(reflection.castShadow, false);
    light.setOpening(false);
    assert.equal(light.stats().sky, night.sky);
    assert.equal(light.stats().reflection, night.reflection);
    assert.equal(light.stats().opening, night.opening * .12);
    sampleSkyLight(sample, 1, 1, 1); light.setSky(sample, 1);
    assert.ok(light.stats().sky < night.sky, 'weather still reduces the inherited ambient sample');
    assert.ok(light.stats().reflection < night.reflection, 'reflected light follows the same weather input');
    assert.equal(light.stats().exposure, day.exposure);
    const lights = scene.children.filter(child => child instanceof THREE.Light);
    assert.equal(lights.length, 4);
    assert.equal(lights.filter(light => light.castShadow).length, 1);
  } finally { light.dispose(); }
  assert.equal(scene.children.length, 0);
});
