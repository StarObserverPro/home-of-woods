import { CAMP_REGENERATION_STRIPS, CAMP_TREE_SPECIES } from '../content/camp-woodland.ts';
import type { CampTreeSpecies, RegenerationStrip } from '../content/camp-woodland.ts';
import { CREEK_BRIDGE } from '../content/regions.ts';
import { START, WORLD, WAYPOINTS } from '../content/world.ts';
import type { Point } from '../content/world.ts';
import { canStand } from '../domain/navigation.ts';
import { bankDistance, bridgeClearance, distanceBetween, resourceHostClearance } from './camp-woodland.ts';
import type { Collider, Tree } from './layout.ts';
import { regionAt } from './regions.ts';
import { heightAt, pathDistance, slopeAt } from './surface.ts';
import { campTreeDimensions, treeFootRadius } from './tree-dimensions.ts';
import { fellingSpaceIsClear, fellingStandCandidates } from './tree-felling-space.ts';

const ACCESS = { openLinks: [CREEK_BRIDGE.id] };
const round = (n: number) => Math.round(n * 100) / 100;

function mixSeed(seed: number, id: string) {
  let value = seed;
  for (const ch of id) value = Math.imul(value ^ ch.charCodeAt(0), 16777619);
  return value >>> 0;
}

function sampleStrip(strip: RegenerationStrip, rng: () => number, attempt: number): Point {
  // Drop stretches of the spine from recruitment. This leaves light gaps between colonies.
  const segment = attempt % (strip.spine.length - 1);
  const a = strip.spine[segment], b = strip.spine[segment + 1], length = distanceBetween(a, b);
  const pocket = rng() < .5 ? .25 : .75;
  const t = pocket + (rng() - .5) * .43, offset = (rng() - rng()) * strip.halfWidth;
  return {
    x: round(a.x + (b.x - a.x) * t - (b.z - a.z) / length * offset),
    z: round(a.z + (b.z - a.z) * t + (b.x - a.x) / length * offset),
  };
}

function speciesIn(strip: RegenerationStrip, pick: number): CampTreeSpecies {
  let offset = pick * strip.mixture.reduce((total, [,weight]) => total + weight, 0);
  for (const [species, weight] of strip.mixture) {
    offset -= weight;
    if (offset < 0) return species;
  }
  return strip.mixture[0][0];
}

function hasWorkSpace(tree: Tree, obstacles: Collider[]) {
  return fellingStandCandidates(tree,0).some(stand =>
    canStand(stand,obstacles,undefined,ACCESS) && fellingSpaceIsClear(tree,stand,obstacles,ACCESS));
}

export function registerCampRegeneration(standing: Tree[], blockers: Collider[], seed: number, random: (seed: number) => () => number) {
  const replacements = new Map<string,Tree>(), planted: Tree[] = [];
  const byStrip = new Map<string,Tree[]>();
  const awayFromResources = resourceHostClearance(standing);
  const canopy = standing.flatMap(t => !t.woodland ? [] : [{ tree:t, radius:campTreeDimensions(t.woodland).crown * t.scale }]);

  for (const strip of CAMP_REGENERATION_STRIPS) {
    const members: Tree[] = [];
    byStrip.set(strip.id, members);
    for (const anchor of strip.existing ?? []) {
      const old = standing.find(t => t.id === anchor.id);
      if (!old || old.role !== 'managed') continue;
      const tree: Tree = { ...old, regeneration: strip.id, woodland: {species:anchor.species,layer:'pole'} };
      replacements.set(tree.id,tree);
      members.push(tree);
    }
    for (let attempt = 0; attempt < strip.trees * 29 && members.length < strip.trees; attempt++) {
      const id = `camp-regeneration:${strip.id}:${attempt}`, rng = random(mixSeed(seed,id));
      const point = sampleStrip(strip,rng,attempt), {x,z} = point;
      const regionId = regionAt(x,z), y = heightAt(x,z), slope = slopeAt(x,z);
      if (!regionId || (strip.id === 'east-terrace') !== (regionId === 'east-woodland')) continue;
      if (slope > .71 || y < WORLD.waterY + .70 || bankDistance(x,z) < WORLD.riverHalfWidth + 3 ||
          pathDistance(x,z) < 4.2 || distanceBetween(point,START) < 16 ||
          bridgeClearance(x,z) || WAYPOINTS.some(w => distanceBetween(point,w) < 4.3)) continue;
      const relativeCanopyDistance = canopy.reduce((best, c) => Math.min(best, distanceBetween(c.tree,point) / c.radius), Infinity);
      if (strip.habitat === 'under-canopy' ? relativeCanopyDistance > 1.35 : relativeCanopyDistance < .61) continue;
      if (strip.habitat === 'moist-terrace' && (bankDistance(x,z) > 39 || y > 18.5)) continue;
      if (standing.some(t => distanceBetween(t,point) < (t.role === 'landmark' ? 6.3 : 2.95)) ||
          planted.some(t => distanceBetween(t,point) < 2.9) || !awayFromResources(point,.27)) continue;
      if (blockers.some(c => 'radius' in c
        ? distanceBetween(c,point) < c.radius + 1.55
        : Math.abs(x - c.x) < c.halfX + 3.1 && Math.abs(z - c.z) < c.halfZ + 3.1)) continue;
      const species = speciesIn(strip,rng());
      const tree: Tree = { id, individualId: `${id}:g0`, generation: 0, ...point, regionId,
        scale: .86 + rng() * .32, variant: rng(), role: 'scenery', retained: true, kind: CAMP_TREE_SPECIES[species].kind,
        regeneration: strip.id, woodland: {species,layer:rng() < .25 ? 'young' : 'pole'} };
      planted.push(tree);
      members.push(tree);
    }
  }

  // Count eligibility after all placement. A later neighbour cannot leave an earlier quota with a blocked approach.
  const obstacles = [
    ...blockers.filter(c => !replacements.has(c.id)),
    ...[...replacements.values(),...planted].map(t => ({id:t.id,x:t.x,z:t.z,radius:treeFootRadius(t)})),
  ];
  for (const strip of CAMP_REGENERATION_STRIPS) {
    const members = byStrip.get(strip.id)!;
    let left = Math.min(strip.permits,Math.ceil(members.length * .48));
    for (const t of members) {
      if (left > 0 && t.woodland!.layer === 'pole' && slopeAt(t.x,t.z) < .63 && hasWorkSpace(t,obstacles)) {
        t.role = 'managed';
        t.retained = false;
        left--;
      }
    }
  }
  return [...standing.map(t => replacements.get(t.id) ?? t), ...planted];
}
