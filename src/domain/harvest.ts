import {REGIONS} from '../content/regions.ts';
import type {RegionId} from '../content/regions.ts';
import type {InventoryState} from './inventory.ts';

export type HarvestOrigin={batchId:string;regionId:RegionId;treeId:string};
export function validateHarvest(raw:unknown):HarvestOrigin {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid harvest origin');
  const value=raw as Record<string,unknown>;
  if(Object.keys(value).length!==3||typeof value.batchId!=='string'||!value.batchId.startsWith('chop-')||typeof value.treeId!=='string'||!REGIONS.some(r=>r.id===value.regionId))throw new Error('Invalid harvest origin');
  return {...value} as HarvestOrigin;
}
/** Only undelivered forestry output has this tag. Ordinary stored/withdrawn logs never do. */
export function pendingHarvest(inventory:InventoryState,regionId:RegionId){
  return inventory.stacks.reduce((sum,stack)=>sum+(stack.harvest&&validateHarvest(stack.harvest).regionId===regionId?stack.quantity:0),0);
}
