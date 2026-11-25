import { CAMP_TREE_SPECIES, CAMP_WOODLAND_GROVES } from '../content/camp-woodland.ts';
import type { CampTreeForm, CampTreeSpecies } from '../content/camp-woodland.ts';
import { CREEK_BRIDGE } from '../content/regions.ts';
import { HOME, GIANT, START, WAYPOINTS, WORLD } from '../content/world.ts';
import { CAMP_PROPS } from '../content/scene-props.ts';
import { TREE_RESOURCE_HOSTS } from '../content/tree-resources.ts';
import type { Collider, Tree } from './layout.ts';
import { heightAt, pathDistance, riverX, slopeAt, smooth } from './surface.ts';
import { campTreeDimensions } from './tree-dimensions.ts';

const resourceHostIds = new Set<string>(TREE_RESOURCE_HOSTS);
export const distanceBetween = (a: {x:number;z:number}, b: {x:number;z:number}) => Math.hypot(a.x - b.x, a.z - b.z);

export function bankDistance(x: number, z: number) {
  return Math.abs(x - riverX(z));
}

function woodlandHabitat(x: number, z: number) {
  const y = heightAt(x, z);
  const moisture = (1 - smooth(12, 48, bankDistance(x, z))) * (1 - smooth(4, 22, y - WORLD.waterY));
  if (moisture > .35) return 'stream-terrace';
  return y > 24 || x < HOME.x - 27 ? 'slope' : 'sheltered-edge';
}

export function matureCampForm(tree: Tree): CampTreeForm | undefined {
  if (tree.role === 'landmark') return { species: 'bigleaf-maple', layer: 'elder' };
  if (tree.role !== 'managed') return;
  const distance = Math.hypot(tree.x - HOME.x, (tree.z - HOME.z) * .77);
  if (tree.variant < smooth(39, 66, distance)) return;
  const habitat = woodlandHabitat(tree.x, tree.z);
  const pick = (tree.variant * 11.37) % 1;
  let species: CampTreeSpecies;
  if (tree.kind === 'broadleaf') species = habitat === 'stream-terrace' && pick < .64 ? 'red-alder' : 'bigleaf-maple';
  else if (habitat === 'stream-terrace') species = pick < .61 ? 'redcedar' : 'hemlock';
  else if (habitat === 'slope') species = pick < .49 ? 'douglas-fir' : 'hemlock';
  else species = pick < .31 ? 'douglas-fir' : pick < .72 ? 'hemlock' : 'redcedar';
  // Keep the tallest forms concentrated in the authored groups. Their neighbours form the lower canopy.
  return { species, layer: pick < .48 ? 'midstory' : 'canopy' };
}

function groveSpecies(habitat: ReturnType<typeof woodlandHabitat>, pick: number, midstory: boolean): CampTreeSpecies {
  if (habitat === 'stream-terrace') return pick < .57 ? 'red-alder' : pick < .88 ? 'bigleaf-maple' : 'redcedar';
  if (habitat === 'slope') return pick < (midstory ? .13 : .63) ? 'douglas-fir' : 'hemlock';
  if (midstory) return pick < .50 ? 'hemlock' : pick < .82 ? 'bigleaf-maple' : 'redcedar';
  return pick < .32 ? 'douglas-fir' : pick < .61 ? 'redcedar' : pick < .82 ? 'bigleaf-maple' : 'hemlock';
}

export function bridgeClearance(x: number, z: number) {
  return Math.abs(z - CREEK_BRIDGE.west.z) < 7 && x > CREEK_BRIDGE.west.x - 5 && x < CREEK_BRIDGE.east.x + 6;
}

export function resourceHostClearance(trees: readonly Tree[]) {
  const hosts = trees.filter(t => resourceHostIds.has(t.id) || t.regionId === 'east-woodland' &&
    t.x >= 38 && t.x <= 64 && t.z >= 43 && t.z <= 64 && t.role === 'managed');
  return (point: {x:number;z:number}, radius: number) => hosts.every(t =>
    distanceBetween(t, point) >= (resourceHostIds.has(t.id) ? t.scale * 1.2 + 4.7 : 3.1) + radius);
}

export function growCampCanopies(trees: readonly Tree[], blockers: readonly Collider[], rng: () => number): Tree[] {
  const additions: Tree[] = [];
  const awayFromResources = resourceHostClearance(trees);
  for (const grove of CAMP_WOODLAND_GROVES) {
    for (const layer of ['old-growth', 'midstory'] as const) {
      const limit = layer === 'old-growth' ? grove.canopy : grove.midstory;
      let placed = 0;
      for (let attempt = 0; attempt < 120 && placed < limit; attempt++) {
        const angle = rng() * 2 * Math.PI;
        const distance = attempt === 0 && layer === 'old-growth' ? 0 : Math.sqrt(rng());
        const x = Math.round((grove.x + grove.rx * distance * Math.cos(angle)) * 100) / 100;
        const z = Math.round((grove.z + grove.rz * distance * Math.sin(angle)) * 100) / 100;
        const scale = .86 + rng() * .28, pick = rng(), variant = rng();
        const habitat = woodlandHabitat(x, z);
        const species = attempt === 0 && layer === 'old-growth' ? grove.lead : groveSpecies(habitat, pick, layer === 'midstory');
        const woodland = { species, layer }, dimensions = campTreeDimensions(woodland);
        const radius = dimensions.radius * scale, point = { x, z };
        if (heightAt(x, z) < WORLD.waterY + .85 || bankDistance(x, z) < WORLD.riverHalfWidth + 3 ||
            pathDistance(x, z) < 5.5 + radius || slopeAt(x, z) > (habitat === 'stream-terrace' ? .8 : .73)) continue;
        if (bridgeClearance(x, z) || !awayFromResources(point, radius)) continue;
        if (distanceBetween(point, START) < 14 + radius || distanceBetween(point, GIANT) < 11.5 ||
            distanceBetween(point, CAMP_PROPS.fire) < 10 || WAYPOINTS.some(w => distanceBetween(point, w) < 4)) continue;
        if (blockers.some(c => 'radius' in c
          ? distanceBetween(point, c) < c.radius + radius + (c.id.startsWith('tree-slot') ? 3.8 : 2.1)
          : Math.abs(x - c.x) < c.halfX + radius + 3.5 && Math.abs(z - c.z) < c.halfZ + radius + 3.5)) continue;
        if (trees.some(t => distanceBetween(point,t) < 3.8 + radius)) continue;
        if (additions.some(t => {
          const prior = campTreeDimensions(t.woodland!);
          const spacing = t.woodland!.layer === 'old-growth' && layer === 'old-growth'
            ? .84 * (dimensions.crown * scale + prior.crown * t.scale)
            : 2.5 + radius + prior.radius * t.scale;
          return distanceBetween(point,t) < spacing;
        })) continue;
        const id = `camp-woodland:${grove.id}:${layer}:${attempt}`;
        additions.push({ id, individualId: id, generation: 0, x, z, scale, variant, role: 'scenery',
          kind: CAMP_TREE_SPECIES[species].kind, woodland });
        placed++;
      }
    }
  }
  return additions;
}
