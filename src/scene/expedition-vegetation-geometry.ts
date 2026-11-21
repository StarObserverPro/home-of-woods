import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Small, deterministic construction helpers. No renderer, clock or global GPU owner. */
export type VegetationQuality = 'near' | 'mid' | 'far';
export const qualitySegments = (quality: VegetationQuality) => quality === 'near' ? 8 : quality === 'mid' ? 6 : 5;
export function vegetationNoise(seed: number) {
  let n = (seed + 0x6d2b79f5) | 0;
  n = Math.imul(n ^ n >>> 15, n | 1);
  n ^= n + Math.imul(n ^ n >>> 7, n | 61);
  return ((n ^ n >>> 14) >>> 0) / 4294967296;
}
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export function colourGeometry(geometry: THREE.BufferGeometry, colour: THREE.ColorRepresentation, bark = 0) {
  const count = geometry.getAttribute('position').count;
  const color = new THREE.Color(colour);
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colours, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setAttribute('barkWeight', new THREE.BufferAttribute(new Float32Array(count).fill(bark), 1));
  if (!geometry.hasAttribute('uv')) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  geometry.clearGroups();
  return geometry;
}

/** All intermediate geometries are consumed exactly once by finish(). */
export class VegetationBuilder {
  private readonly pieces: THREE.BufferGeometry[] = [];
  readonly quality: VegetationQuality;
  constructor(quality: VegetationQuality) { this.quality = quality; }

  add(geometry: THREE.BufferGeometry, colour: THREE.ColorRepresentation, bark = 0) {
    let piece = geometry;
    if (piece.index) { piece = geometry.toNonIndexed(); geometry.dispose(); }
    for (const attribute of Object.keys(piece.attributes)) {
      if (!['position', 'normal', 'uv'].includes(attribute)) piece.deleteAttribute(attribute);
    }
    if (!piece.hasAttribute('normal')) piece.computeVertexNormals();
    this.pieces.push(colourGeometry(piece, colour, bark));
  }

  /** Oriented section rings, with distance-scaled UVs and a real taper. */
  branch(points: THREE.Vector3[], radii: number[], colour: THREE.ColorRepresentation, bark = 1, radialSegments = qualitySegments(this.quality)) {
    if (points.length < 2 || points.length !== radii.length) return;
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    let distance = 0;
    const circumferenceRepeats = Math.max(1, radii[0] * Math.PI * 2 / 1.8);
    for (let ring = 0; ring < points.length; ring++) {
      if (ring) distance += points[ring].distanceTo(points[ring - 1]);
      const previous = points[Math.max(0, ring - 1)], next = points[Math.min(points.length - 1, ring + 1)];
      const tangent = next.clone().sub(previous).normalize();
      const orientation = new THREE.Quaternion().setFromUnitVectors(UP, tangent);
      for (let radial = 0; radial <= radialSegments; radial++) {
        const angle = radial / radialSegments * Math.PI * 2;
        const point = V(Math.cos(angle) * radii[ring], 0, Math.sin(angle) * radii[ring]).applyQuaternion(orientation).add(points[ring]);
        positions.push(point.x, point.y, point.z);
        uv.push(radial / radialSegments * circumferenceRepeats, distance / 2);
      }
    }
    const ringSize = radialSegments + 1;
    for (let ring = 0; ring < points.length - 1; ring++) for (let radial = 0; radial < radialSegments; radial++) {
      const a = ring * ringSize + radial, b = a + 1, c = a + ringSize, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    // Close both ends. End wood is an explicit cap on fallen logs, not a bark-coloured open tube.
    for (let radial = 1; radial < radialSegments - 1; radial++) {
      indices.push(0, radial + 1, radial);
      const start = (points.length - 1) * ringSize;
      indices.push(start, start + radial, start + radial + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.add(geometry, colour, bark);
  }

  cluster(position: THREE.Vector3, size: THREE.Vector3, colour: THREE.ColorRepresentation, seed: number, detail?: number) {
    const level = detail ?? (this.quality === 'far' ? 0 : 1);
    const geometry = new THREE.IcosahedronGeometry(1, level);
    const vertices = geometry.getAttribute('position');
    const phase = vegetationNoise(seed) * Math.PI * 2;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      const scale = 1 + .1 * Math.sin(x * 3.6 + z * 2.5 + phase) * Math.cos(y * 2.7 - phase);
      vertices.setXYZ(i, x * scale * size.x + position.x, y * scale * size.y + position.y, z * scale * size.z + position.z);
    }
    geometry.computeVertexNormals();
    this.add(geometry, colour);
  }

  cone(position: THREE.Vector3, radius: number, height: number, colour: THREE.ColorRepresentation, tilt = 0) {
    const geometry = new THREE.ConeGeometry(radius, height, qualitySegments(this.quality));
    geometry.rotateZ(tilt); geometry.translate(position.x, position.y, position.z);
    this.add(geometry, colour);
  }

  /** A thick, tapered moss pendant attached at its upper end, never a transparent foliage card. */
  pendant(top: THREE.Vector3, length: number, width: number, colour: THREE.ColorRepresentation, seed: number) {
    const sway = (vegetationNoise(seed) - .5) * width;
    this.branch([top, top.clone().add(V(sway * .3, -length * .4, 0)), top.clone().add(V(sway, -length, width * .12))],
      [width * .48, width * .62, width * .06], colour, 0, this.quality === 'near' ? 5 : 4);
  }

  finish() {
    if (!this.pieces.length) return null;
    const merged = mergeGeometries(this.pieces, false);
    this.pieces.forEach(piece => piece.dispose()); this.pieces.length = 0;
    if (!merged) throw new Error('Expedition vegetation geometry merge failed');
    merged.computeBoundingBox(); merged.computeBoundingSphere();
    return merged;
  }
}

export function mergeVegetation(parts: (THREE.BufferGeometry | null)[]) {
  const present = parts.filter((part): part is THREE.BufferGeometry => !!part);
  if (!present.length) return null;
  const geometry = mergeGeometries(present, false);
  if (!geometry) throw new Error('Expedition vegetation part merge failed');
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
