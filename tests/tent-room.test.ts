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

test('felt scatter preserves night and weather differences while a closed curtain retains ambient light', () => {
  const scene = new THREE.Scene(), light = createInteriorLighting(scene, new THREE.Vector3(0, 3.2, 3.7));
  const sample = createSkySample();
  const luminance = (rgb: number[]) => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  try {
    sampleSkyLight(sample, 14, 0, 0); light.setSky(sample, 14);
    const day = light.stats();
    sampleSkyLight(sample, 1, 0, 0); light.setSky(sample, 1);
    const night = light.stats();
    const dayDiffuse = day.sky * luminance(day.skyColor), nightDiffuse = night.sky * luminance(night.skyColor);
    assert.ok(nightDiffuse > .25, 'the shared night sky still illuminates the small furnishings');
    assert.ok(dayDiffuse > nightDiffuse * 2, 'night is visibly dimmer than day');
    assert.ok(night.skyColor[2] > night.skyColor[0], 'night scatter retains the cool moon tint');
    light.setOpening(false);
    assert.equal(light.stats().sky, night.sky);
    assert.equal(light.stats().opening, night.opening * .12);
    sampleSkyLight(sample, 1, 1, 1); light.setSky(sample, 1);
    assert.ok(light.stats().sky < night.sky, 'weather still reduces the inherited ambient sample');
    assert.equal(light.stats().exposure, day.exposure);
    assert.equal(scene.children.filter(child => child instanceof THREE.Light).length, 3);
  } finally { light.dispose(); }
  assert.equal(scene.children.length, 0);
});
