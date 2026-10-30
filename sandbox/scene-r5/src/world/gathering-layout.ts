import { heightAt } from './surface.ts';
import { makeTrees } from './layout.ts';
import type { Tree } from './layout.ts';
import { START } from '../content/world.ts';
import { TREE_RESOURCE_HOSTS, TREE_RESOURCE_PROFILES } from '../content/tree-resources.ts';
export type ResourcePatch = { x: number; y: number; z: number; scale: number; rotation: number };
export type GatheringSource = {
  sourceId: string; definitionId: string; region: string; x: number; z: number;
  targetAnchor: { x: number; y: number; z: number };
  hostRef?: { kind: 'tree-individual' | 'landmark'; id: string; slotId: string };
  hostKind?: Tree['kind']; hostLabel?: string; displayName?: string;
  placement?: 'under-canopy' | 'mushroom-circle' | 'trunk';
  patches?: ResourcePatch[];
};
export function makeGatheringSources(trees: readonly Tree[] = makeTrees()): GatheringSource[] {
  const sources: GatheringSource[] = [];
  for (const id of TREE_RESOURCE_HOSTS) {
    const tree = trees.find(t => t.id === id);
    if (!tree || tree.role === 'scenery') continue;
    const profile = TREE_RESOURCE_PROFILES[tree.kind];
    const angle = Math.atan2(START.z - tree.z, START.x - tree.x);
    const point = (radius: number, direction: number, scale: number): ResourcePatch => {
      const x = tree.x + Math.cos(direction) * radius, z = tree.z + Math.sin(direction) * radius;
      return { x, y: heightAt(x, z), z, scale, rotation: direction + tree.variant };
    };
    const branch = point(Math.max(tree.scale * .9 + 1.25, tree.role === 'landmark' ? tree.scale * 1.2 + 1.25 : 0), angle + profile.branchAngle, 1);
    const ring = Array.from({ length: profile.patches }, (_, i) => point(tree.scale * profile.radiusPerScale + profile.radiusBase, angle + i * Math.PI * 2 / profile.patches, profile.mushroomScale));
    for (const [kind, patches, placement, displayName] of [
      ['branches', [branch], 'under-canopy', '树下落枝'],
      ['mushrooms', ring, 'mushroom-circle', profile.circleName],
    ] as const) {
      const anchor = patches[0];
      sources.push({ sourceId: `gather.${tree.id}.${kind}`, definitionId: kind === 'branches' ? 'forage.branch-pile' : 'forage.mushroom-cluster',
        region: 'home-woodland', x: anchor.x, z: anchor.z, targetAnchor: { x: anchor.x, y: anchor.y, z: anchor.z },
        hostRef: { kind: tree.role === 'landmark' ? 'landmark' : 'tree-individual', id: tree.individualId, slotId: tree.id },
        hostKind: tree.kind, hostLabel: tree.role === 'landmark' ? '守林巨木' : profile.label, displayName, placement, patches: [...patches],
      });
    }
  }
  return sources;
}
