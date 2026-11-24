import * as THREE from 'three';
import { SHADOW_PROFILES } from '../../content/shadows.ts';
import type { createSkySample } from './sky-light.ts';
import { snappedShadowPose } from '../../world/shadow-field.ts';

/** A room owns its lights; the host passes only the shared numerical sky sample.
 * Near shadows use the same world-unit → texel bias/softness convention outdoors. */
export function createInteriorLighting(scene: THREE.Scene, doorway: THREE.Vector3) {
  const p = SHADOW_PROFILES.interior;
  const sky = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  const opening = new THREE.PointLight('#d8d8c0', 0, 12, 2);
  opening.position.copy(doorway);
  sun.castShadow = true;
  sun.shadow.mapSize.set(p.mapSize, p.mapSize);
  Object.assign(sun.shadow.camera, {
    left: -p.span / 2, right: p.span / 2, bottom: -p.span / 2, top: p.span / 2,
    near: p.near, far: p.far,
  });
  sun.shadow.camera.updateProjectionMatrix();
  const texel = p.span / p.mapSize;
  sun.shadow.normalBias = texel * p.normalBiasTexels;
  sun.shadow.bias = texel * p.depthBiasTexels / (p.far - p.near);
  sun.shadow.radius = p.solidSoftness / texel;
  sun.target.position.set(0, 1, 0);
  scene.add(sky, sun, sun.target, opening);
  const clothDay = new THREE.Color('#ded2b8'), clothNight = new THREE.Color('#acbad4');
  const groundDay = new THREE.Color('#b8a58b'), groundNight = new THREE.Color('#8494b0');
  const clothTint = new THREE.Color(), groundTint = new THREE.Color();
  const direction = new THREE.Vector3();
  let exposure = 1, hour = 14, night = 0, sourceSun = 0, sourceAmbient = 0, aperture = 1;
  let openingStrength = 0;
  return {
    get exposure() { return exposure; },
    setOpening(open: boolean) {
      aperture = open ? 1 : .12;
      opening.intensity = openingStrength * aperture;
    },
    setSky(sample: ReturnType<typeof createSkySample>, sourceHour: number) {
      hour = sourceHour; night = sample.night; sourceSun = sample.sunIntensity; sourceAmbient = sample.ambientIntensity;
      direction.copy(sample.sunDirection);
      const pose=snappedShadowPose([0,1,0],direction.toArray(),p.span,p.mapSize,p.lightDistance);
      sun.position.fromArray(pose.position);sun.target.position.fromArray(pose.target);sun.shadow.camera.up.fromArray(pose.up);
      sun.color.copy(sample.sunColor); sun.intensity = sample.sunIntensity * .7;
      // The opaque shadow shell needs a broad approximation of sky scattered
      // through felt and bounced off the lining. It stays cool/dim at night and
      // follows the same weather sample; exposure and the direct sun stay shared.
      clothTint.copy(clothDay).lerp(clothNight, sample.night);
      groundTint.copy(groundDay).lerp(groundNight, sample.night);
      sky.color.copy(sample.skyColor).lerp(clothTint, .48);
      sky.groundColor.copy(sample.groundColor).lerp(groundTint, .68);
      sky.intensity = sample.ambientIntensity * 1.55 + .12;
      opening.color.copy(sample.skyColor).lerp(sample.sunColor, .24);
      openingStrength = sample.ambientIntensity * (.95 + sample.day * 3.25);
      opening.intensity = openingStrength * aperture;
      exposure = sample.recommendedExposure * 1.12;
    },
    stats: () => ({ profile: 'interior', rules: SHADOW_PROFILES.version, hour, skyNight: night,
      outdoorStrength: sourceSun, outdoorAmbient: sourceAmbient, sun: sun.intensity, sky: sky.intensity, opening: opening.intensity,
      skyColor: sky.color.toArray(), groundColor: sky.groundColor.toArray(),
      direction: direction.toArray(), shadowSize: p.mapSize, worldUnitsPerTexel: texel,
      solidSoftness: p.solidSoftness, exposure, shadowMaps: 1 }),
    dispose() { sun.shadow.dispose(); sky.removeFromParent(); sun.removeFromParent(); sun.target.removeFromParent(); opening.removeFromParent(); },
  };
}
