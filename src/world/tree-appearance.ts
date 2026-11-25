import type {Tree} from './layout.ts';
import {heightAt,riverX} from './surface.ts';
import {chooseRainierTreeKind} from '../content/rainier-ecology.ts';
import {TREE_SLOT_CORRECTIONS} from '../content/tree-slot-corrections.ts';
import {CREEK_BRIDGE} from '../content/regions.ts';
import {CAMP_TREE_SPECIES} from '../content/camp-woodland.ts';
export const TREE_SHAPE_NAMES=['松','云杉','冷杉','栎','桦','杨','榆','鹅掌楸'] as const;
export function treeVisual(tree:Tree){
 let hash=2166136261;for(const c of tree.id)hash=Math.imul(hash^c.charCodeAt(0),16777619);hash>>>=0;
 if(tree.woodland){
  const {species,layer}=tree.woodland,variant=(hash>>>16)%2;
  return {species:tree.kind==='pine'?0:3,variant,key:`camp-${species}-${layer}-${variant}`,seed:1200+variant*317,name:CAMP_TREE_SPECIES[species].name};
 }
 const n=(hash%10000)/10000,high=Math.max(0,Math.min(1,heightAt(tree.x,tree.z)/35)),bank=Math.max(0,1-Math.abs(tree.x-riverX(tree.z))/45);
 const weights=tree.kind==='pine'?[1.1,.4+high,.3+high]:[1,.65,.25+bank*1.6,.35+bank,.35];
 let v=n*weights.reduce((a,b)=>a+b,0),index=0;for(;index<weights.length-1;index++){v-=weights[index];if(v<=0)break;}
 let species=tree.kind==='pine'?index:index+3;
 // Scenery consumes the regional mix while resource-bearing trees retain their
 // authored shapes, contact geometry and economic identities.
 const bridgeCorridor=tree.x>CREEK_BRIDGE.west.x-8&&tree.x<CREEK_BRIDGE.east.x+16&&Math.abs(tree.z-CREEK_BRIDGE.west.z)<14;
 if(tree.role==='scenery'&&!TREE_SLOT_CORRECTIONS[tree.id]&&!bridgeCorridor){
  const kind=chooseRainierTreeKind(heightAt(tree.x,tree.z),Math.abs(tree.x-riverX(tree.z)),n);
  species={pine:0,spruce:1,fir:2,oak:3,poplar:5}[kind];
 }
 const variant=(hash>>>16)%3;
 return {species,variant,key:`${species}-${variant}`,seed:1000+species*31+variant*117,name:TREE_SHAPE_NAMES[species]};
}
