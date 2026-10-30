import * as THREE from "three";
export class Resources {
  private geometries = new Map<string, THREE.BufferGeometry>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private extra = new Set<{ dispose(): void }>();
  private released = new WeakSet<{ dispose(): void }>();
  disposed = false;
  geometry(key: string, make: () => THREE.BufferGeometry) {
    if (this.disposed) throw new Error("Resource owner destroyed");
    if (!this.geometries.has(key)) this.geometries.set(key, make());
    return this.geometries.get(key)!;
  }
  material(color: string, roughness = 0.66, fade = false) {
    if (this.disposed) throw new Error("Resource owner destroyed");
    const key = `${color}:${roughness}:${fade}`;
    if (!this.materials.has(key))
      this.materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness: 0,
          transparent: fade,
          opacity: fade ? 0.22 : 1,
          depthWrite: !fade,
        }),
      );
    return this.materials.get(key)!;
  }
  own<T extends { dispose(): void }>(resource: T): T {
    // Async loaders can finish after a sibling request has already failed and torn down.
    // Keep traversal alive so every late geometry/material is returned to its owner.
    if (this.disposed) this.release(resource);
    else this.extra.add(resource);
    return resource;
  }
  private release(resource: { dispose(): void }) {
    if (this.released.has(resource)) return;
    this.released.add(resource);
    resource.dispose();
  }
  stats() {
    return {
      geometries: this.geometries.size,
      materials: this.materials.size,
      extras: this.extra.size,
      disposed: this.disposed,
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.geometries.forEach((g) => this.release(g));
    this.materials.forEach((m) => this.release(m));
    this.extra.forEach((x) => this.release(x));
    this.geometries.clear();
    this.materials.clear();
    this.extra.clear();
  }
}
