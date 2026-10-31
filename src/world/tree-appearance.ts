import type {Tree} from './layout.ts';
import {heightAt,riverX} from './surface.ts';
export const TREE_SHAPE_NAMES=['松','云杉','冷杉','栎','桦','杨','榆','鹅掌楸'] as const;
export function treeVisual(tree:Tree){
 let hash=2166136261;for(const c of tree.id)hash=Math.imul(hash^c.charCodeAt(0),16777619);hash>>>=0;
 const n=(hash%10000)/10000,high=Math.max(0,Math.min(1,heightAt(tree.x,tree.z)/35)),bank=Math.max(0,1-Math.abs(tree.x-riverX(tree.z))/45);
 const weights=tree.kind==='pine'?[1.1,.4+high,.3+high]:[1,.65,.25+bank*1.6,.35+bank,.35];
 let v=n*weights.reduce((a,b)=>a+b,0),index=0;for(;index<weights.length-1;index++){v-=weights[index];if(v<=0)break;}
 const species=tree.kind==='pine'?index:index+3,variant=(hash>>>16)%3;
 return {species,variant,key:`${species}-${variant}`,seed:1000+species*31+variant*117,name:TREE_SHAPE_NAMES[species]};
}
