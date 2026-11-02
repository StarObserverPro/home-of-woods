import * as THREE from 'three';
import type { Resources } from './resources.ts';
import { itemRarity } from '../domain/item-properties.ts';
import type { RarityId } from '../content/rarities.ts';

/** Full-surface emission, not an outline/sprite. Originals remain shared and untouched. */
export function createItemSurface(resources: Resources) {
  const variants = new Map<string, THREE.MeshStandardMaterial>();
  const meshes = new WeakMap<THREE.Object3D, { mesh: THREE.Mesh; original: THREE.Material | THREE.Material[] }[]>();
  const grades = new WeakMap<THREE.Object3D, RarityId>();
  function apply(root: THREE.Object3D, item: unknown) {
    const rarity = itemRarity(item);
    if (grades.get(root) === rarity.id) return;
    let bindings = meshes.get(root);
    if (!bindings) {
      bindings = [];
      root.traverse(object => { if (object instanceof THREE.Mesh) bindings!.push({ mesh: object, original: object.material }); });
      meshes.set(root, bindings);
    }
    const material = (original: THREE.Material): THREE.Material => {
      if (!rarity.intensity || !(original instanceof THREE.MeshStandardMaterial)) return original;
      const key = `${original.uuid}:${rarity.id}`;
      let variant = variants.get(key);
      if (!variant) {
        variant = resources.own(original.clone());
        variant.name = `${original.name || 'item'}:${rarity.id}:surface`;
        // Keep authored emission. Add a broad, always-positive surface veil after its map.
        // Albedo luminance preserves endgrain/side contrast; world-space normal modulation
        // preserves low-poly facets at night without a camera-facing outline or halo.
        const tint = { value: new THREE.Color(rarity.emission).multiplyScalar(rarity.intensity) };
        const previousCompile = original.onBeforeCompile;
        const previousKey = original.customProgramCacheKey();
        variant.onBeforeCompile = (shader, renderer) => {
          previousCompile.call(variant!, shader, renderer);
          shader.uniforms.raritySurfaceTint = tint;
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
            '#include <common>\nuniform vec3 raritySurfaceTint;');
          shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
            #include <emissivemap_fragment>
            vec3 rarityNormal = inverseTransformDirection(normal, viewMatrix);
            float rarityFacet = 0.38 + 0.62 * max(dot(rarityNormal, normalize(vec3(0.35, 1.0, 0.55))), 0.0);
            float rarityAlbedo = 0.24 + 0.76 * dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            totalEmissiveRadiance += raritySurfaceTint * rarityFacet * rarityAlbedo;
          `);
        };
        variant.customProgramCacheKey = () => `${previousKey}:rarity-surface-v2`;
        variants.set(key, variant);
      }
      return variant;
    };
    for (const binding of bindings) binding.mesh.material = Array.isArray(binding.original)
      ? binding.original.map(material) : material(binding.original);
    grades.set(root, rarity.id);
  }
  return { apply, stats: () => ({ variants: variants.size }),
    // Resources owns disposal. No private geometry, postprocess targets or update loop.
    dispose() { variants.clear(); } };
}
