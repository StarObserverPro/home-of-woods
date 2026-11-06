import {BROOM,BROOM_BLUEPRINTS,CAMP_LEAF_PATCHES,campLeafPatch,leafPilePoint} from '../content/broom.ts';
import type {CampLeafPatch} from '../content/broom.ts';
import {WORKBENCH} from '../content/workshop.ts';
import type {GameState} from './state.ts';
import type {OwnedItem} from './owned-items.ts';
import type {Collider} from '../world/layout.ts';
import {beginWorkshop} from './workshop.ts';
import {craftMaterialCosts,craftMaterialDebits} from './craft-inputs.ts';
import {knowsBlueprint} from './blueprint-copies.ts';
import {isRecord,inventoryTransaction} from './inventory.ts';
import {canonicalInstances} from './owned-items.ts';
import {itemProperties} from './item-properties.ts';
import {gatheringBusy} from './gathering.ts';
import {ritualBusy} from './ritual.ts';
import {canStand,findPath,navigationGridPoint} from './navigation.ts';
import {leafPatchSnapshot,validateSweptLeaves} from './leaf-patches.ts';
import {lifeDayAt} from './local-clock.ts';

export type BroomUseEvent={
  useId:string;instanceId:string;patchId:string;kind:'sweep'|'willful';durationSeconds:number;
  from:'scattered'|'left'|'right';to:'left'|'right';
  patch:{id:string;center:{x:number;z:number};pilePoint:{x:number;z:number}};
  stand:{x:number;z:number;facing:number};
};
export type BroomUsage={sweeps:number;mischiefPlays:number;lastMischiefDay:number|null;lastMischiefSweep:number;[key:string]:unknown};
export const broomHasMark=(item:OwnedItem)=>itemProperties(item).traits.some(trait=>trait.id===BROOM.markTraitId&&trait.markId==='leaf');
export const broomHasWillful=(item:OwnedItem)=>itemProperties(item).traits.some(trait=>trait.id===BROOM.willfulTraitId&&trait.value>0);
export function broomUsage(item:OwnedItem):BroomUsage|null{
  const raw=item.broomUsage;if(raw===undefined)return {sweeps:0,mischiefPlays:0,lastMischiefDay:null,lastMischiefSweep:0};
  if(!isRecord(raw)||!Number.isSafeInteger(raw.sweeps)||(raw.sweeps as number)<0||!Number.isSafeInteger(raw.mischiefPlays)||(raw.mischiefPlays as number)<0||(raw.mischiefPlays as number)>(raw.sweeps as number))return null;
  const lastMischiefDay=raw.lastMischiefDay??null,lastMischiefSweep=raw.lastMischiefSweep??(raw.mischiefPlays?raw.sweeps:0);
  if(lastMischiefDay!==null&&(!Number.isSafeInteger(lastMischiefDay)||(lastMischiefDay as number)<1)||!Number.isSafeInteger(lastMischiefSweep)||(lastMischiefSweep as number)<0||(lastMischiefSweep as number)>(raw.sweeps as number))return null;
  return {...structuredClone(raw),lastMischiefDay,lastMischiefSweep} as BroomUsage;
}
const busy=(host:GameState)=>!!host.workshop.job||!!host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host);
const atBench=(host:GameState)=>Math.hypot(host.player.x-WORKBENCH.stand.x,host.player.z-WORKBENCH.stand.z)<=.8;
export function learnBroomBlueprint(host:GameState):string{
  if(busy(host))return '先完成或取消当前动作。';
  if(!atBench(host))return '先走近工作台，再展开枝扫帚图纸。';
  if(knowsBlueprint(host.inventory,host.workshop.blueprints,BROOM.blueprintId))return '枝扫帚图纸已经学会了。';
  host.workshop={...host.workshop,blueprints:[...host.workshop.blueprints,BROOM.blueprintId]};
  return '已学会枝扫帚图纸。把枝料修成木柄与刷头，就能扫拢营地落叶。';
}
export function beginBroomCraft(host:GameState,options:{mark:'leaf'|null}={mark:null}):string{
  if(busy(host))return '先完成或取消当前动作。';
  if(options.mark!==null&&options.mark!=='leaf')return '暂时只会刻叶形手作印记。';
  if(!atBench(host))return '先走近工作台，再制作扫帚。';
  const message=beginWorkshop(host,'craft',[],BROOM.blueprintId);
  if(host.workshop.job?.kind==='craft'&&host.workshop.job.blueprintId===BROOM.blueprintId){
    host.workshop={...host.workshop,job:{...host.workshop.job,broomCraft:{mark:options.mark}}};
  }
  return message;
}
export type BroomSiteAccess={code:'ready'|'approach'|'blocked'|'unavailable';requiresApproach:boolean;reason:string;stand:CampLeafPatch['stand']|null};
function siteAccess(host:GameState,patch:CampLeafPatch|undefined,blockers:Collider[]):BroomSiteAccess{
  const response=(code:BroomSiteAccess['code'],reason:string):BroomSiteAccess=>({code,requiresApproach:code==='approach',reason,stand:patch?.stand??null});
  if(!patch)return response('unavailable','这里没有可扫拢的营地落叶。');
  if(busy(host))return response('unavailable','先完成或取消当前动作。');
  if(!canStand(host.player,blockers))return response('blocked','你现在的站位被挡住了，请先走到空地。');
  if(!canStand(patch.stand,blockers,BROOM.actionClearance)||!canStand(patch.center,blockers,BROOM.actionClearance))return response('blocked','落叶旁没有足够的挥扫空间，请先挪开旁边的家具。');
  if(Math.hypot(host.player.x-patch.stand.x,host.player.z-patch.stand.z)>BROOM.siteReach)return response('approach','先走到落叶旁的空位，再拿出扫帚。');
  return response('ready','');
}
export function broomAccess(host:GameState,instanceId:string,patchId:string,blockers:Collider[]):BroomSiteAccess{
  const item=host.inventory.instances?.find(item=>item.instanceId===instanceId);
  if(!item||item.definitionId!==BROOM.definitionId)return {code:'unavailable',requiresApproach:false,reason:'先在工作台做一把枝扫帚。',stand:null};
  if(item.location.kind!=='inventory')return {code:'unavailable',requiresApproach:false,reason:'先把这把扫帚收回仓库，再带去扫落叶。',stand:null};
  const usage=broomUsage(item);
  if(!usage)return {code:'unavailable',requiresApproach:false,reason:'这把扫帚的使用记录暂时无法识别，原物会保留。',stand:null};
  if(!Number.isSafeInteger(usage.sweeps+1))return {code:'unavailable',requiresApproach:false,reason:'这把扫帚的使用记录已满，原物与落叶保留。',stand:null};
  return siteAccess(host,campLeafPatch(patchId),blockers);
}
/** Uses the same real target as the sweep preflight and the actor's held-tool presentation. */
export function approachBroomPatch(host:GameState,patchId:string,blockers:Collider[]):string{
  const patch=campLeafPatch(patchId),access=siteAccess(host,patch,blockers);
  if(access.code!=='approach')return access.code==='ready'?'已经来到落叶旁的挥扫位置。':access.reason;
  const distance=Math.hypot(host.player.x-patch!.stand.x,host.player.z-patch!.stand.z),steps=Math.max(1,Math.ceil(distance/.15));
  let direct=true;
  for(let index=0;index<=steps;index++)if(!canStand({x:host.player.x+(patch!.stand.x-host.player.x)*index/steps,z:host.player.z+(patch!.stand.z-host.player.z)*index/steps},blockers)){direct=false;break;}
  const route=direct?[{x:patch!.stand.x,z:patch!.stand.z}]:canStand(navigationGridPoint(patch!.stand),blockers)?findPath(host.player,patch!.stand,blockers):[];
  if(!route.length)return '暂时走不到这片落叶前，请先留出通路。';
  host.route=route;return '正在走到落叶前的空位。到达后再明确扫叶。';
}
/** Synchronous truth first, finite presentation second. No leaf is an inventory reward. */
export function useBroom(host:GameState,instanceId:string,patchId:string,blockers:Collider[]):{ok:boolean;message:string;event:BroomUseEvent|null}{
  const access=broomAccess(host,instanceId,patchId,blockers);
  const failed=(message:string)=>({ok:false,message,event:null});
  if(access.code!=='ready')return failed(access.reason);
  const item=host.inventory.instances!.find(item=>item.instanceId===instanceId)!,usage=broomUsage(item)!;
  if(!Number.isSafeInteger(usage.sweeps+1))return failed('这把扫帚的使用记录已满，原物与落叶保留。');
  let records;try{records=validateSweptLeaves(host.workshop.sweptLeaves,host.time);}catch{return failed('这片落叶的记录暂时无法识别，原来的叶堆保留。');}
  const previous=leafPatchSnapshot(host,patchId)!,patch=previous.patch;
  const pileSide:0|1=previous.record?(previous.record.pileSide===0?1:0):0;
  const nextSweep=usage.sweeps+1;
  const day=lifeDayAt(host.time);
  if(usage.lastMischiefDay!==null&&usage.lastMischiefDay>day)return failed('这把扫帚的使用日期暂时无法识别，原物与叶堆保留。');
  const willful=broomHasWillful(item)&&usage.lastMischiefDay!==day&&(usage.mischiefPlays===0||nextSweep-usage.lastMischiefSweep>=BROOM.mischiefEverySweeps);
  if(willful&&!Number.isSafeInteger(usage.mischiefPlays+1))return failed('扫帚的趣味记录已满，原物与叶堆保留。');
  const useId=`${instanceId}:sweep:${nextSweep}`;
  const inventory=inventoryTransaction(host.inventory,[]);
  inventory.instances=canonicalInstances((inventory.instances??[]).map(original=>original.instanceId===instanceId?{...original,broomUsage:{...usage,sweeps:nextSweep,mischiefPlays:usage.mischiefPlays+(willful?1:0),lastMischiefDay:willful?day:usage.lastMischiefDay,lastMischiefSweep:willful?nextSweep:usage.lastMischiefSweep}}:original));
  const sweptLeaves={...records,[patchId]:{at:host.time,instanceId,useId,pileSide}};
  Object.assign(host,{inventory,workshop:{...host.workshop,sweptLeaves}});host.route=[];host.player.moving=false;host.player.facing=patch.stand.facing;
  const event:BroomUseEvent={useId,instanceId,patchId,kind:willful?'willful':'sweep',durationSeconds:BROOM.useSeconds,from:previous.currentSide,to:pileSide===0?'left':'right',
    patch:{id:patchId,center:{...patch.center},pilePoint:leafPilePoint(patch,pileSide)},stand:{...patch.stand}};
  return {ok:true,message:previous.swept?'同一堆落叶已经拨到另一侧。':'这片落叶已经扫拢到一旁。',event};
}
export function broomSnapshot(host:GameState,blockers:Collider[],instanceId?:string){
  const items=(host.inventory.instances??[]).filter(item=>item.definitionId===BROOM.definitionId);
  const selected=items.find(item=>item.instanceId===(instanceId??host.selected))??items.find(item=>item.location.kind==='inventory')??items.at(0)??null;
  const learned=knowsBlueprint(host.inventory,host.workshop.blueprints,BROOM.blueprintId);
  const reason=busy(host)?'先完成或取消当前动作。':!atBench(host)?'先走近工作台。':!learned?'先学会枝扫帚图纸。':!craftMaterialDebits(host,BROOM.blueprintId)?'需要两份可用枝杈。':'';
  return {blueprint:{id:BROOM.blueprintId,name:BROOM_BLUEPRINTS[0].name,learned,canCraft:!reason,reason,costs:craftMaterialCosts(host,BROOM.blueprintId)},workbenchNear:atBench(host),
    items:structuredClone(items),selectedItemId:selected?.instanceId??null,
    patches:CAMP_LEAF_PATCHES.map(patch=>{
      const state=leafPatchSnapshot(host,patch.id)!,access=selected?broomAccess(host,selected.instanceId,patch.id,blockers):{code:'unavailable',requiresApproach:false,reason:'先做一把枝扫帚。',stand:patch.stand};
      return {id:patch.id,name:patch.name,center:patch.center,stand:patch.stand,swept:state.swept,currentSide:state.currentSide,pilePoint:state.pilePoint,
        canUse:access.code==='ready',requiresApproach:access.requiresApproach,reason:access.reason};
    })};
}
export type BroomSnapshot=ReturnType<typeof broomSnapshot>;
