import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** One scene owns the cache. Entity removal never disposes a shared asset. */
export class Resources {
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private disposed = false;

  geometry(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geometry = this.geometries.get(key);
    if (!geometry) { geometry = make(); this.geometries.set(key, geometry); }
    return geometry;
  }
  material(color: string, roughness = 0.48): THREE.MeshStandardMaterial {
    const key = `${color}:${roughness}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: true });
      this.materials.set(key, material);
    }
    return material;
  }
  mesh(shape: 'box' | 'round' | 'ball' | 'ico' | 'cylinder' | 'cone', color: string,
    scale: [number, number, number], position: [number, number, number], roughness = 0.48): THREE.Mesh {
    const geometry = this.geometry(shape, () => {
      switch (shape) {
        case 'box': return new THREE.BoxGeometry(1, 1, 1);
        case 'round': return new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
        case 'ball': return new THREE.SphereGeometry(0.5, 12, 8);
        case 'ico': return new THREE.IcosahedronGeometry(0.5, 1);
        case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.55, 1, 9);
        case 'cone': return new THREE.ConeGeometry(0.6, 1, 8);
      }
    });
    const mesh = new THREE.Mesh(geometry, this.material(color, roughness));
    mesh.scale.set(...scale); mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.geometries.clear(); this.materials.clear();
  }
  get counts() { return { geometries: this.geometries.size, materials: this.materials.size }; }
}
