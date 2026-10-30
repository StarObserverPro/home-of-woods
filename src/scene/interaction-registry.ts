import type { Object3D } from 'three';
/** Stable identity belongs to the source, never the mesh name or child index. */
export class InteractionRegistry {
  private targets = new Map<Object3D, string>();
  register(object: Object3D, sourceId: string) {
    if (this.targets.has(object)) throw new Error('Hit object already registered');
    this.targets.set(object, sourceId);
    return () => { this.targets.delete(object); };
  }
  resolve(object: Object3D): string | null {
    for (let current: Object3D | null = object; current; current = current.parent) {
      const id = this.targets.get(current); if (id) return id;
    }
    return null;
  }
  objects() { return [...this.targets.keys()]; }
  get size() { return this.targets.size; }
  clear() { this.targets.clear(); }
}
