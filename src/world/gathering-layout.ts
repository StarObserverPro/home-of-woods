import {regionAt} from './regions.ts';
import {CREEK_BRIDGE,REGIONS} from '../content/regions.ts';
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
export function gatheringHostTrees(trees:readonly Tree[]){
  const extra:Tree[]=[];
  for(const region of REGIONS.filter(r=>!r.initiallyOpen)){
    const hosts:Tree[]=[],bounds=region.resourceArea??region.bounds;
    for(const tree of trees.filter(t=>t.role==='managed'&&t.regionId===region.id&&t.x>bounds.minX&&t.x<bounds.maxX&&t.z>bounds.minZ&&t.z<bounds.maxZ).sort((a,b)=>a.id<b.id?-1:1)){
      if(hosts.every(t=>Math.hypot(t.x-tree.x,t.z-tree.z)>8))hosts.push(tree);
      if(hosts.length===3)break;
    }
    extra.push(...hosts);
  }
  return [...TREE_RESOURCE_HOSTS.map(id=>trees.find(t=>t.id===id)).filter((t):t is Tree=>!!t&&t.role!=='scenery'),...extra];
}
export function makeGatheringSources(trees: readonly Tree[] = makeTrees()): GatheringSource[] {
  const sources: GatheringSource[] = [];
  const blockers=makeColliders([...trees]),access={openLinks:[CREEK_BRIDGE.id]};
  for (const tree of gatheringHostTrees(trees)) {
    const profile = TREE_RESOURCE_PROFILES[tree.kind];
    let angle = Math.atan2(START.z - tree.z, START.x - tree.x);
    if(tree.regionId==='east-woodland'){
      const good=Array.from({length:32},(_,i)=>i*Math.PI/16).find(a=>[
        {radius:Math.max(tree.scale*.9+1.25,0),direction:a+profile.branchAngle},
        {radius:tree.scale*profile.radiusPerScale+profile.radiusBase,direction:a},
      ].every(p=>canStand({x:tree.x+Math.cos(p.direction)*p.radius,z:tree.z+Math.sin(p.direction)*p.radius},blockers,undefined,access)));
      if(good===undefined)throw new Error(`No reachable resource anchors for ${tree.id}`);
      angle=good;
    }
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
        region: regionAt(tree.x,tree.z)??'home-woodland', x: anchor.x, z: anchor.z, targetAnchor: { x: anchor.x, y: anchor.y, z: anchor.z },
        hostRef: { kind: tree.role === 'landmark' ? 'landmark' : 'tree-individual', id: tree.individualId, slotId: tree.id },
        hostKind: tree.kind, hostLabel: tree.role === 'landmark' ? '守林巨木' : profile.label, displayName, placement, patches: [...patches],
      });
    }
  }
  // A distinct ground pool; never convert existing branch stock or refill old pools.
  for (const source of [...sources].filter(s => s.definitionId === 'forage.branch-pile')) {
    let point: {x:number;z:number}|undefined;
    for(let i=0;i<128;i++){
      const angle=i*Math.PI/8,radius=3+Math.floor(i/16)*1.8,candidate={x:source.x+Math.cos(angle)*radius,z:source.z+Math.sin(angle)*radius};
      if(regionAt(candidate.x,candidate.z)!==source.region)continue;
      if(sources.some(s=>(s.patches??[s.targetAnchor]).some(p=>Math.hypot(p.x-candidate.x,p.z-candidate.z)<2.4)))continue;
      if(Array.from({length:12},(_,j)=>({x:source.x+(candidate.x-source.x)*(j+1)/12,z:source.z+(candidate.z-source.z)*(j+1)/12})).every(p=>canStand(p,blockers,undefined,{openLinks:[CREEK_BRIDGE.id]}))){point=candidate;break;}
    }
    if(!point)throw new Error(`No clear scrap placement for ${source.sourceId}`);
    const {x,z}=point,y=heightAt(x,z);
    sources.push({ sourceId: source.sourceId.replace(/branches$/, 'scraps'), definitionId: 'forage.scrap-pile', region: source.region,
      x, z, targetAnchor: {x,y,z}, displayName: '地面碎柴', patches: [{x,y,z,scale:.65,rotation:0}] });
  }
  return sources;
}
