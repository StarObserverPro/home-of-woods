import type {InventoryState} from './inventory.ts';
import {inventoryTransaction} from './inventory.ts';
import {canonicalInstances} from './owned-items.ts';
import type {OwnedItem} from './owned-items.ts';

export const BLUEPRINT_SHEET = 'blueprint.sheet';
export type BlueprintSheet = OwnedItem & { definitionId:typeof BLUEPRINT_SHEET; usesRemaining:number; usesTotal:number };

/** Permanent learned methods and physical editions share access but never ownership. */
export function blueprintCopies(inventory:InventoryState,blueprintId:string):BlueprintSheet[] {
  return (inventory.instances??[]).filter((item):item is BlueprintSheet=>
    item.definitionId===BLUEPRINT_SHEET && item.blueprintId===blueprintId &&
    item.location.kind==='inventory' && typeof item.usesRemaining==='number' && Number.isSafeInteger(item.usesRemaining) &&
    item.usesRemaining>0 && typeof item.usesTotal==='number' && Number.isSafeInteger(item.usesTotal) && item.usesTotal>=item.usesRemaining);
}
export function knowsBlueprint(inventory:InventoryState,known:readonly string[],id:string):boolean {
  return known.includes(id) || blueprintCopies(inventory,id).length>0;
}
export function blueprintCopyUses(inventory:InventoryState):Record<string,number[]> {
  const result:Record<string,number[]>={};
  for(const item of inventory.instances??[]){
    if(item.definitionId!==BLUEPRINT_SHEET||item.location.kind!=='inventory'||typeof item.usesRemaining!=='number'||item.usesRemaining<=0)continue;
    (result[item.blueprintId]??=[]).push(item.usesRemaining);
  }
  return result;
}
export function createBlueprintSheet(seed:number,serial:number,blueprintId:string,uses:number,time:number):BlueprintSheet {
  if(!Number.isSafeInteger(serial)||serial<1||!Number.isSafeInteger(uses)||uses<1)throw new Error('Invalid blueprint copy');
  return {
    instanceId:'merchant-sheet-'+seed+'-'+serial,definitionId:BLUEPRINT_SHEET,
    blueprintId,createdAt:time,rarityId:'common',traits:[],
    usesRemaining:uses,usesTotal:uses,location:{kind:'inventory'},
  };
}
/** Charge one use only after a successful craft or upgrade commit is ready. */
export function consumeBlueprintUse(inventory:InventoryState,known:readonly string[],id:string):InventoryState {
  if(known.includes(id))return inventory;
  const first=blueprintCopies(inventory,id).sort((a,b)=>a.usesRemaining-b.usesRemaining||a.instanceId.localeCompare(b.instanceId))[0];
  if(!first)throw new Error('Blueprint copy unavailable');
  const next=inventoryTransaction(inventory,[]);
  next.instances=canonicalInstances((next.instances??[]).flatMap(item=>
    item.instanceId!==first.instanceId?[item]:first.usesRemaining===1?[]:[{...item,usesRemaining:first.usesRemaining-1}]));
  return next;
}
