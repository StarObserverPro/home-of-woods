import * as THREE from 'three';
import {distantTreeGeometry} from '../../src/scene/outer-forest.js';

/** Reuses the game's own geometry; no downloaded model or lighting is embedded. */
export function coniferClusterSource() {
  const group = new THREE.Group(); group.name = 'rainier-conifer-cluster';
  const material = new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 1, metalness: 0});
  const geometries: THREE.BufferGeometry[] = [];
  for (const [kind, x, z, scale, yaw] of [
    ['spruce', -2.3, -.6, 1.15, .12],
    ['fir', 2.1, -.4, .95, 1.3],
    ['spruce', .2, 2.2, .72, 2.6],
  ] as const) {
    const geometry = distantTreeGeometry(kind); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, 0, z); mesh.scale.setScalar(scale); mesh.rotation.y = yaw; group.add(mesh);
  }
  return {group, dispose() {for (const geometry of geometries) geometry.dispose(); material.dispose(); group.clear();}};
}
