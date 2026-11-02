import {WORLD} from '../content/world.ts';
import {isStableId} from './item-catalog.ts';
export type OwnedItem = {
  instanceId:string;definitionId:string;blueprintId:string;createdAt:number;
  traits:{id:string;value:number}[];
  location:{kind:'inventory'}|{kind:'world';x:number;z:number;rotation:number};
};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,names:string[])=>Object.keys(v).length===names.length&&names.every(k=>Object.hasOwn(v,k));
/** Unknown definitions/traits survive a round trip, but cannot be used by the live catalog. */
export function canonicalInstances(value:unknown):OwnedItem[]{
  if(!Array.isArray(value))throw new Error('Invalid owned instances');
  const seen=new Set<string>();
  for(const v of value){
    if(!record(v)||!keys(v,['instanceId','definitionId','blueprintId','createdAt','traits','location'])||
      !isStableId(v.instanceId)||!isStableId(v.definitionId)||!isStableId(v.blueprintId)||seen.has(v.instanceId)||
      typeof v.createdAt!=='number'||!Number.isFinite(v.createdAt)||v.createdAt<0||!Array.isArray(v.traits))throw new Error('Invalid instance identity');
    seen.add(v.instanceId);const traits=new Set<string>();
    for(const t of v.traits){if(!record(t)||!keys(t,['id','value'])||!isStableId(t.id)||traits.has(t.id)||typeof t.value!=='number'||!Number.isFinite(t.value))throw new Error('Invalid instance trait');traits.add(t.id);}
    const p=v.location;if(!record(p))throw new Error('Invalid instance location');
    if(p.kind==='inventory'){if(!keys(p,['kind']))throw new Error('Invalid stored instance');}
    else if(p.kind==='world'){
      if(!keys(p,['kind','x','z','rotation'])||![p.x,p.z,p.rotation].every(n=>typeof n==='number'&&Number.isFinite(n))||
        (p.x as number)<WORLD.minX||(p.x as number)>WORLD.maxX||(p.z as number)<WORLD.minZ||(p.z as number)>WORLD.maxZ)throw new Error('Invalid placed instance');
    }else throw new Error('Unknown instance location');
  }
  return structuredClone(value as OwnedItem[]).sort((a,b)=>a.instanceId.localeCompare(b.instanceId));
}
