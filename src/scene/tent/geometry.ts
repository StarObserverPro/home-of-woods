import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TENT_SHAPE as S } from '../../content/tent.ts';

/** Sag is authored in the cloth, while the A-frame feet and ridge ends stay fixed. */
export function tentRoofPoint(side: -1 | 1, across: number, along: number) {
  const span = Math.sin(Math.PI * along), cross = Math.sin(Math.PI * across);
  // The corner ties hold the hem while its middle pulls gently inward/upward.
  // Restrict inset to the low outer band, keeping the headroom datum unchanged.
  const edge = THREE.MathUtils.smoothstep(across, .65, 1);
  return new THREE.Vector3(side * (S.halfWidth * across - S.eaveInset * span * edge),
    S.hemY + (S.ridgeY - S.hemY) * (1 - across) - S.roofSag * cross * (.45 + .55 * span)
      - S.ridgeSag * span * (1 - across) + S.eaveLift * span * across ** 3,
    -S.halfDepth + S.halfDepth * 2 * along);
}

export function tentRoofGeometry(side: -1 | 1) {
  const nx = S.widthSegments, nz = S.lengthSegments, count = (nx + 1) * (nz + 1);
  const p: number[] = [], uv: number[] = [], weights: number[] = [], index: number[] = [];
  const normal = new THREE.Vector3(side * (S.ridgeY - S.hemY), S.halfWidth, 0).normalize();
  for (let layer = 0; layer < 2; layer++) for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
    const u = x / nx, v = z / nz, point = tentRoofPoint(side, u, v).addScaledVector(normal, -S.thickness * layer);
    p.push(point.x, point.y, point.z); uv.push(v, u);
    weights.push(Math.sin(Math.PI * u) * Math.sin(Math.PI * v));
  }
  const face = (a: number, b: number, c: number, outward: boolean) => {
    if (outward) index.push(a, b, c); else index.push(a, c, b);
  };
  for (let layer = 0; layer < 2; layer++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
    const a = layer * count + z * (nx + 1) + x, b = a + 1, c = a + nx + 1, d = c + 1;
    const forward = side === -1 ? layer === 0 : layer !== 0;
    face(a, b, c, forward); face(b, d, c, forward);
  }
  const perimeter = [
    ...Array.from({ length: nx }, (_, x) => x),
    ...Array.from({ length: nz }, (_, z) => z * (nx + 1) + nx),
    ...Array.from({ length: nx }, (_, x) => nz * (nx + 1) + nx - x),
    ...Array.from({ length: nz }, (_, z) => (nz - z) * (nx + 1)),
  ];
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    face(a, a + count, b, side === -1); face(b, a + count, b + count, side === -1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('tentWindWeight', new THREE.Float32BufferAttribute(weights, 1));
  geometry.setIndex(index); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  // Static bounds include every bounded wind phase, so frustum culling is stable.
  geometry.boundingBox!.expandByScalar(.05); geometry.boundingSphere!.radius += .05;
  return geometry;
}

export function tentDoorOutline() {
  const shape = new THREE.Shape();
  shape.moveTo(-S.doorHalfWidth, S.hemY);
  shape.quadraticCurveTo(-1.13, 1.40, -.75, 2.65);
  shape.quadraticCurveTo(-.46, 2.91, 0, S.doorTopY);
  shape.quadraticCurveTo(.46, 2.91, .75, 2.65);
  shape.quadraticCurveTo(1.13, 1.40, S.doorHalfWidth, S.hemY);
  shape.lineTo(-S.doorHalfWidth, S.hemY);
  return shape;
}

export function tentEndGeometry(front: boolean) {
  const outline: THREE.Vector2[] = [];
  for (let i = S.widthSegments; i >= 0; i--) {
    const point = tentRoofPoint(-1, i / S.widthSegments, 1);
    outline.push(new THREE.Vector2(point.x, point.y));
  }
  for (let i = 1; i <= S.widthSegments; i++) {
    const point = tentRoofPoint(1, i / S.widthSegments, 1);
    outline.push(new THREE.Vector2(point.x, point.y));
  }
  if (front) {
    // This contour goes back along the door boundary, making a real open arch.
    const door = tentDoorOutline().getPoints(5);
    outline.push(...door.slice(0, -1).reverse());
  }
  const shape = new THREE.Shape(outline);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: S.thickness, bevelEnabled: false, curveSegments: 4, steps: 1 });
  geometry.translate(0, 0, front ? S.halfDepth - .015 : -S.halfDepth);
  mapEndUV(geometry); geometry.computeVertexNormals(); return geometry;
}

export function tentCurtainGeometry() {
  const geometry = new THREE.ExtrudeGeometry(tentDoorOutline(), { depth: .026, bevelEnabled: false, curveSegments: 6, steps: 1 });
  const p = geometry.getAttribute('position');
  // Pleats deepen toward the free hem; the top point remains at its attachment.
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), free = Math.max(0, 1 - (y - S.hemY) / (S.doorTopY - S.hemY));
    p.setZ(i, S.doorZ + p.getZ(i) + Math.cos(x * 8) * .035 * free);
  }
  mapEndUV(geometry); geometry.computeVertexNormals(); return geometry;
}

function mapEndUV(geometry: THREE.BufferGeometry) {
  const p = geometry.getAttribute('position'), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) / (S.halfWidth * 2) + .5);
    uv[i * 2 + 1] = 1 - (p.getY(i) - S.hemY) / (S.ridgeY - S.hemY);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

export function tentTube(points: readonly (readonly [number, number, number])[], radius: number, segments = 18) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  return new THREE.TubeGeometry(curve, segments, radius, 6, false);
}

export function tentRod(a: readonly [number, number, number], b: readonly [number, number, number], radius: number, sides = 8) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const geometry = new THREE.CylinderGeometry(radius * .91, radius, delta.length(), sides);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
  return geometry.translate(...start.add(end).multiplyScalar(.5).toArray());
}

/** Combine only parts sharing a material; temporary inputs are not GPU-owned. */
export function mergeTentParts(geometries: THREE.BufferGeometry[]) {
  const result = mergeGeometries(geometries, false)!;
  geometries.forEach(geometry => geometry.dispose()); return result;
}
