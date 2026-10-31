import { heightAt } from './surface.ts';
import {canStand} from '../domain/navigation.ts';
import { makeTrees, makeColliders } from './layout.ts';
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
      ['branches', [branch], 'trunk', '树上枝杈'],
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
  // A distinct ground pool; never convert existing branch stock or refill old pools.
  const blockers=makeColliders([...trees]);
  for (const source of [...sources].filter(s => s.definitionId === 'forage.branch-pile')) {
    let point: {x:number;z:number}|undefined;
    for(let i=0;i<32;i++){
      const angle=i*Math.PI/8,radius=3+Math.floor(i/16)*1.8,candidate={x:source.x+Math.cos(angle)*radius,z:source.z+Math.sin(angle)*radius};
      if(sources.some(s=>(s.patches??[s.targetAnchor]).some(p=>Math.hypot(p.x-candidate.x,p.z-candidate.z)<2.4)))continue;
      if(Array.from({length:12},(_,j)=>({x:source.x+(candidate.x-source.x)*(j+1)/12,z:source.z+(candidate.z-source.z)*(j+1)/12})).every(p=>canStand(p,blockers))){point=candidate;break;}
    }
    if(!point)throw new Error(`No clear scrap placement for ${source.sourceId}`);
    const {x,z}=point,y=heightAt(x,z);
    sources.push({ sourceId: source.sourceId.replace(/branches$/, 'scraps'), definitionId: 'forage.scrap-pile', region: source.region,
      x, z, targetAnchor: {x,y,z}, displayName: '地面碎柴', patches: [{x,y,z,scale:.65,rotation:0}] });
  }
  return sources;
}
