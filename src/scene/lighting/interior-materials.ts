import * as THREE from 'three';
import type { Resources } from '../resources.ts';

/** Keep the actor's outdoor shader layout and uniform owners intact while a
 * room renders the same rig. Three caches programs per material but retains
 * only its latest custom uniform map, so removing and restoring sampler hooks
 * on one material can revive a cached program with the wrong uniform layout.
 * Room variants share geometry/textures; only their material is room-owned. */
export function createInteriorMaterials(resources: Resources) {
  const variants = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  const sources = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const borrowers = new Set<THREE.Mesh>();
  let disposed = false;

  function interior(material: THREE.Material) {
    const source = sources.get(material) ?? material;
    if (!(source instanceof THREE.MeshStandardMaterial)) return material;
    let variant = variants.get(source);
    if (!variant) {
      // Material.clone deliberately excludes onBeforeCompile/cache-key hooks:
      // outdoor weather, canopy, AO and air belong to their original scene.
      variant = resources.own(source.clone());
      variant.name = `${source.name || 'actor'}:interior`;
      variants.set(source, variant); sources.set(variant, source);
    }
    // J01's blink controller owns the source map. Carry its current frame over
    // after character update without replacing the room's AO compile hook.
    if (!!variant.map !== !!source.map || variant.map?.channel !== source.map?.channel) variant.needsUpdate = true;
    variant.map = source.map;
    return variant;
  }

  function restore() {
    for (const mesh of borrowers) {
      if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(material => sources.get(material) ?? material);
      else mesh.material = sources.get(mesh.material) ?? mesh.material;
    }
    borrowers.clear();
  }

  return {
    bind(root: THREE.Object3D) {
      if (disposed) return;
      root.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const current = object.material;
        if (Array.isArray(current)) {
          const next = current.map(interior);
          if (next.some((material, index) => material !== current[index])) {
            object.material = next; borrowers.add(object);
          }
        } else {
          const next = interior(object.material);
          if (next !== object.material) { object.material = next; borrowers.add(object); }
        }
      });
    },
    restore,
    stats() { return { variants: variants.size, borrowers: borrowers.size }; },
    dispose() {
      if (disposed) return;
      restore(); disposed = true;
      for (const material of variants.values()) resources.releaseOwned(material);
      variants.clear(); sources.clear();
    },
  };
}
