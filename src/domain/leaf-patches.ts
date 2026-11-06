import {CAMP_LEAF_PATCHES,campLeafPatch,leafPilePoint} from '../content/broom.ts';
import {isRecord,exactKeys} from './inventory.ts';
import {isStableId} from './item-catalog.ts';
import type {GameState} from './state.ts';

export type SweptLeafRecord={at:number;instanceId:string;useId:string;pileSide:0|1};
export type SweptLeaves=Record<string,SweptLeafRecord>;
export function validateSweptLeaves(raw:unknown,time:number):SweptLeaves{
  if(raw===undefined)return {};
  if(!isRecord(raw))throw new Error('Invalid swept leaf record');
  const result:SweptLeaves={};
  for(const [patchId,value] of Object.entries(raw)){
    if(!campLeafPatch(patchId)||!isRecord(value))throw new Error('Unknown camp leaf patch');
    exactKeys(value,['at','instanceId','useId','pileSide']);
    if(typeof value.at!=='number'||!Number.isFinite(value.at)||value.at<0||value.at>time||!isStableId(value.instanceId)||!isStableId(value.useId)||![0,1].includes(value.pileSide as number))throw new Error('Invalid leaf sweeping receipt');
    result[patchId]={at:value.at,instanceId:value.instanceId,useId:value.useId,pileSide:value.pileSide as 0|1};
  }
  return result;
}
export function leafPatchSnapshot(host:GameState,patchId:string){
  const patch=campLeafPatch(patchId);if(!patch)return null;
  const record=host.workshop.sweptLeaves?.[patchId]??null;
  return {patch,record,swept:record!==null,currentSide:record?(record.pileSide===0?'left' as const:'right' as const):'scattered' as const,
    pilePoint:record?leafPilePoint(patch,record.pileSide):null};
}
export const leafPatchesSnapshot=(host:GameState)=>CAMP_LEAF_PATCHES.map(patch=>leafPatchSnapshot(host,patch.id)!);
