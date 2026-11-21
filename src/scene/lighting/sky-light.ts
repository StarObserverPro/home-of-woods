import * as THREE from 'three';
import { ENVIRONMENT_STYLE } from '../../content/environment.ts';
import { daylightAt } from '../../domain/scene-props.ts';

const moon = new THREE.Vector3(.45, .7, .65).normalize();
const warmSun = new THREE.Color('#f4a46c'), moonSun = new THREE.Color('#9aafff');
const moonSky = new THREE.Color('#5d76ac'), moonGround = new THREE.Color('#17273e');
const cloudySky = new THREE.Color('#a0abb1'), cloudyMoon = new THREE.Color('#4a5a7a');

export function createSkySample() {
  return {
    solarDirection: new THREE.Vector3(), sunDirection: new THREE.Vector3(),
    sunColor: new THREE.Color(), skyColor: new THREE.Color(), groundColor: new THREE.Color(),
    sunIntensity: 0, ambientIntensity: 0, environmentIntensity: 0,
    recommendedExposure: ENVIRONMENT_STYLE.recommendedExposure,
    day: 0, night: 0, warm: 0,
  };
}

/** Samples the shared sky conditions without owning a scene, renderer or light. */
export function sampleSkyLight(light: ReturnType<typeof createSkySample>, hour: number, cloud: number, rain: number) {
  const { day, night, warm, altitude } = daylightAt(hour);
  const overcast = THREE.MathUtils.smoothstep(cloud, .18, .92);
  light.day = day;
  light.night = night;
  light.warm = warm;
  light.solarDirection.set(-.6, Math.max(.08, altitude), -.32).normalize();
  light.sunDirection.copy(light.solarDirection).lerp(moon, night).normalize();
  light.sunColor.set('#fff1d3').lerp(warmSun, warm * .75).lerp(moonSun, night);
  light.sunIntensity = (.65 * night + 2.1 * day) * (1 - overcast * .68);
  light.skyColor.set('#a3bfd5').lerp(moonSky, night);
  // The interpolated sky tint is distinct from the base color above.
  light.skyColor.lerp(cloudySky.clone().lerp(cloudyMoon, night), overcast * .45);
  light.groundColor.set('#71784f').lerp(moonGround, night);
  light.ambientIntensity = (.62 + day * .43) * (1 - overcast * .08 - rain * .04);
  light.environmentIntensity = (.15 + day * .15) * (1 - overcast * .12);
  return light;
}
