import * as THREE from 'three';
import { getSurface, WORLD } from '../world/surface';
import type { Plot } from '../domain/types';
import { Resources } from './resources';

function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}

function islandShape(): THREE.Shape {
  const s = new THREE.Shape(); const r = WORLD.cornerRadius;
  const x = WORLD.maxX, z = WORLD.maxZ;
  s.moveTo(-x + r, -z); s.lineTo(x - r, -z); s.quadraticCurveTo(x, -z, x, -z + r);
  s.lineTo(x, z - r); s.quadraticCurveTo(x, z, x - r, z); s.lineTo(-x + r, z);
  s.quadraticCurveTo(-x, z, -x, z - r); s.lineTo(-x, -z + r); s.quadraticCurveTo(-x, -z, -x + r, -z);
  const pond = WORLD.pond;
  const hole = new THREE.Path(); hole.absellipse(pond.x, -pond.z, pond.radiusX, pond.radiusZ, 0, Math.PI * 2, true, 0);
  s.holes.push(hole); return s;
}

export function createTerrain(r: Resources, seed: number) {
  const group = new THREE.Group();
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 832;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const top = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, color: '#ffffff' });
  const shape = islandShape();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.85, bevelEnabled: false, steps: 1, curveSegments: 28 });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -0.85, 0);
  const p = geometry.attributes.position, uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - WORLD.minX) / WORLD.width, 1 - (p.getZ(i) - WORLD.minZ) / WORLD.depth);
  const ground = new THREE.Mesh(geometry, [top, r.material('#8d9b56', 0.8)]); ground.receiveShadow = true; group.add(ground);
  // This water is the canonical pond surface, inside the same authored ground cutout.
  const waterGeometry = new THREE.CircleGeometry(1, 48); waterGeometry.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeometry, r.material('#75b8b2', 0.22));
  water.scale.set(WORLD.pond.radiusX, 1, WORLD.pond.radiusZ); water.position.set(WORLD.pond.x, -0.12, WORLD.pond.z); water.receiveShadow = true; group.add(water);
  const base = r.mesh('round', '#ab9d6e', [32.05, 0.35, 26.05], [0, -1.02, 0], 0.8); base.castShadow = false; group.add(base);

  const scale = canvas.width / WORLD.width;
  const paint = (plots: Plot[]) => {
    const rng = random(seed);
    ctx.fillStyle = '#a4bf70'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 115; i++) {
      ctx.fillStyle = i % 2 ? '#9fba6b' : '#aac477';
      ctx.beginPath(); ctx.ellipse(rng() * canvas.width, rng() * canvas.height, 12 + rng() * 35, 8 + rng() * 22, rng() * 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#d6c792'; ctx.lineWidth = 1.8 * scale;
    ctx.beginPath(); ctx.moveTo(16 * scale, 23.5 * scale); ctx.lineTo(16 * scale, 12.15 * scale); ctx.lineTo(23.5 * scale, 12.15 * scale); ctx.stroke();
    ctx.strokeStyle = '#d9cd9a'; ctx.lineWidth = 1.25 * scale; ctx.stroke();
    for (const plot of plots) {
      const x = (plot.x - WORLD.minX - 0.48) * scale, y = (plot.z - WORLD.minZ - 0.48) * scale;
      ctx.fillStyle = plot.watered ? '#806447' : '#a38659';
      ctx.beginPath(); ctx.roundRect(x, y, 0.96 * scale, 0.96 * scale, 5); ctx.fill();
      ctx.strokeStyle = plot.watered ? '#6c553e' : '#8b714e'; ctx.lineWidth = 2.7;
      for (let row = 0; row < 3; row++) { ctx.beginPath(); ctx.moveTo(x + 6, y + 8 + row * 8); ctx.lineTo(x + 24, y + 8 + row * 8); ctx.stroke(); }
    }
    texture.needsUpdate = true;
  };
  paint([]);

  // Small scenery uses one deterministic seed and shared prototype assets.
  const rng = random(seed ^ 3187);
  const positions: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 300; i++) {
    const x = WORLD.minX + 1 + rng() * (WORLD.width - 2), z = WORLD.minZ + 1 + rng() * (WORLD.depth - 2);
    if (getSurface(x, z).kind !== 'grass' || (Math.abs(x) < 7 && Math.abs(z) < 7)) continue;
    positions.push([x, z, 0.12 + rng() * 0.16, rng() * 6.28]);
  }
  const grassGeo = r.geometry('grass-cone', () => new THREE.ConeGeometry(0.055, 0.22, 4));
  const grasses = new THREE.InstancedMesh(grassGeo, r.material('#94b65f'), positions.length * 3);
  const matrix = new THREE.Matrix4(); const q = new THREE.Quaternion(), axis = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
  let index = 0;
  for (const [x, z, size, angle] of positions) for (let j = 0; j < 3; j++) {
    q.setFromAxisAngle(axis, angle); v.set(x + (j - 1) * 0.065, size / 2, z); s.set(1, size / 0.22, 1); matrix.compose(v, q, s); grasses.setMatrixAt(index++, matrix);
  }
  grasses.computeBoundingSphere(); grasses.receiveShadow = true; group.add(grasses);
  for (const [x, z] of [[-6.7, 5], [-13.5, -6.5], [7.6, -7.4], [10.5, 10], [6.6, 5.8], [-5.7, -10.6]]) {
    const rock = r.mesh('ico', '#a6afa0', [0.7, 0.4, 0.56], [x, 0.13, z], 0.7); rock.rotation.y = rng() * 6; group.add(rock);
    group.add(r.mesh('ico', '#b8bda8', [0.32, 0.26, 0.32], [x + 0.4, 0.09, z + 0.2], 0.7));
  }
  for (const [x, z] of [[-5.9, 6.5], [7.9, 3.7], [-8.3, -5.4], [10, -2.1], [-2.5, 8.8]]) {
    for (let i = 0; i < 3; i++) {
      const xx = x + i * 0.18, zz = z + (i % 2) * 0.24;
      group.add(r.mesh('cylinder', '#f3deb6', [0.1, 0.21, 0.1], [xx, 0.1, zz]));
      group.add(r.mesh('ball', '#d98a59', [0.32, 0.16, 0.3], [xx, 0.23, zz], 0.36));
    }
  }
  // A tiny welcome sign and stacked timber give the clearing a lived-in scale.
  group.add(r.mesh('round', '#9f7449', [0.12, 1.1, 0.12], [1.6, 0.55, 6.5]));
  const board = r.mesh('round', '#e0bf7b', [1.08, 0.49, 0.15], [1.6, 1.0, 6.5]); board.rotation.y = 0.15; group.add(board);
  const arrow = r.mesh('round', '#7b8551', [0.43, 0.07, 0.03], [1.6, 1.0, 6.59]); group.add(arrow);
  for (const x of [-0.15, 0.15]) {
    const a = r.mesh('round', '#7b8551', [0.22, 0.07, 0.03], [1.75, 1 + x * 0.42, 6.6]); a.rotation.z = x < 0 ? 0.6 : -0.6; group.add(a);
  }
  for (const [x, z] of [[-10.8, 3.6], [-9, 4.8]]) {
    const lily = r.mesh('cylinder', '#87a85c', [0.6, 0.04, 0.52], [x, -0.09, z]); lily.castShadow = false; group.add(lily);
    group.add(r.mesh('ball', '#f0d7b0', [0.15, 0.1, 0.15], [x + 0.05, -0.02, z]));
  }
  return { group, paint, dispose: () => { geometry.dispose(); waterGeometry.dispose(); texture.dispose(); top.dispose(); grasses.dispose(); } };
}
