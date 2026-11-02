import {craftedRarity} from './item-creation.ts';
import {rarityDefinition} from '../content/rarities.ts';
import type {GameState} from './state.ts';
import type {Collider} from '../world/layout.ts';
import {random} from '../world/layout.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import {WORKBENCH,WORKSHOP_RULES,BLUEPRINTS,SEAT_DEFINITION,findBlueprint} from '../content/workshop.ts';
import {calendarAt} from './local-clock.ts';
import {ITEM_CATALOG,isStableId} from './item-catalog.ts';
import {inventoryTransaction,recognizedStack,isRecord,exactKeys} from './inventory.ts';
import type {InventoryStack} from './inventory.ts';
import {canonicalInstances} from './owned-items.ts';
import {findPath} from './navigation.ts';
import {gatheringBusy} from './gathering.ts';
import {ritualBusy} from './ritual.ts';

export type WorkshopJob={id:string;kind:'offering'|'craft';blueprintId:string|null;phase:'approaching'|'working';startedAt:number|null;durationSeconds:number};
export type WorkshopState={nextAction:number;nextInstance:number;prayerCount:number;blueprints:string[];job:WorkshopJob|null;lastResponse:string};
export const createWorkshop=():WorkshopState=>({nextAction:1,nextInstance:1,prayerCount:0,blueprints:[],job:null,lastResponse:''});
export const workshopBusy=(host:Pick<GameState,'workshop'>)=>host.workshop.job!==null;
export const workshopTarget=(kind:WorkshopJob['kind'])=>kind==='craft'?WORKBENCH.stand:{x:CAMP_PROPS.altar.x,z:CAMP_PROPS.altar.z+5};
export const workshopTargetId=(kind:WorkshopJob['kind'])=>kind==='craft'?WORKBENCH.id:CAMP_PROPS.altar.id;
const busy=(host:GameState)=>!!host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host)||workshopBusy(host);
export function workshopInput(host:GameState,kind:'offering'|'craft'|'trade'):InventoryStack|undefined{
  return host.inventory.stacks.find(s=>s.quantity>0&&recognizedStack(s)&&!s.wood?.reserved&&
    (kind==='offering'?ITEM_CATALOG.items.get(s.itemId)?.typeId==='fungus.fresh':['wood.log','wood.branch','wood.small-piece','wood.lumber'].includes(ITEM_CATALOG.items.get(s.itemId)?.typeId??'')));
}
export function merchantStock(host:Pick<GameState,'seed'|'time'>){
  const day=calendarAt(host.time).day;
  // The fixed plan is always offered. The second slot is stable for this local game day.
  return [BLUEPRINTS[0].id,...(random(host.seed+day*7919)()>.2?[BLUEPRINTS[1].id]:[])];
}
export function beginWorkshop(host:GameState,kind:WorkshopJob['kind'],blockers:Collider[],blueprintId:string|null=null){
  if(busy(host))return '先完成或取消当前动作。';
  if(kind==='craft'&&(!blueprintId||!findBlueprint(blueprintId)||!host.workshop.blueprints.includes(blueprintId)))return '先获得这张图纸。';
  if(!workshopInput(host,kind))return kind==='offering'?'需要一份蘑菇。':'需要一份未预留的木料。';
  const target=workshopTarget(kind),near=Math.hypot(host.player.x-target.x,host.player.z-target.z)<.65;
  const route=near?[]:findPath(host.player,target,blockers);
  if(!near&&!route.length)return '暂时无法到达操作位置。';
  if(!Number.isSafeInteger(host.workshop.nextAction+1))return '动作编号已用尽。';
  const job:WorkshopJob={id:`workshop-${host.workshop.nextAction}`,kind,blueprintId:kind==='craft'?blueprintId:null,phase:'approaching',startedAt:null,durationSeconds:kind==='craft'?WORKSHOP_RULES.craftSeconds:WORKSHOP_RULES.offeringSeconds};
  host.workshop={...host.workshop,nextAction:host.workshop.nextAction+1,job};host.selected=workshopTargetId(kind);host.route=route;
  return kind==='craft'?'走到帐篷前的工作台制作。':'带一份蘑菇到祭坛前，向森林之母祈求回应。';
}
export function cancelWorkshop(host:GameState){
  if(!workshopBusy(host))return false;
  host.workshop={...host.workshop,job:null};host.route=[];host.player.moving=false;return true;
}
/** The whole debit + reward is built before one synchronous root commit. Cancellation is free. */
export function advanceWorkshop(host:GameState):string|null{
  const job=host.workshop.job;if(!job)return null;
  if(host.selected!==workshopTargetId(job.kind)||host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host)){cancelWorkshop(host);return '木作或供奉已取消，材料未扣除。';}
  const target=workshopTarget(job.kind);
  if(job.phase==='approaching'){
    if(host.route.length)return null;
    if(Math.hypot(host.player.x-target.x,host.player.z-target.z)>.8){cancelWorkshop(host);return '未能到达操作位置，材料未扣除。';}
    host.workshop={...host.workshop,job:{...job,phase:'working',startedAt:host.time}};
    const face=job.kind==='craft'?WORKBENCH:CAMP_PROPS.altar;host.player.facing=Math.atan2(face.x-host.player.x,face.z-host.player.z);host.player.moving=false;return null;
  }
  if(Math.hypot(host.player.x-target.x,host.player.z-target.z)>.8){cancelWorkshop(host);return '离开了操作位置，材料未扣除。';}
  if(host.time-job.startedAt!<job.durationSeconds)return null;
  const input=workshopInput(host,job.kind);if(!input){cancelWorkshop(host);return '材料已不足，本次未扣料。';}
  const nextInventory=inventoryTransaction(host.inventory,[{...input,delta:-1}]);
  const nextWorkshop={...host.workshop,job:null,blueprints:[...host.workshop.blueprints]};let result:string;
  if(job.kind==='offering'){
    if(!Number.isSafeInteger(nextWorkshop.prayerCount+1)){cancelWorkshop(host);return '供奉计数已用尽，未扣料。';}
    const roll=random(host.seed+4051*(nextWorkshop.prayerCount+1))();nextWorkshop.prayerCount++;
    const plan=roll<.35?BLUEPRINTS[0]:roll<.7?BLUEPRINTS[1]:null;
    if(plan&&!nextWorkshop.blueprints.includes(plan.id)){nextWorkshop.blueprints.push(plan.id);result=`神谕带来了「${plan.name}」图纸。`;}
    else result=plan?'神谕再次提起熟悉的木作。图纸已经学会，没有新增图纸。':'树叶轻响，森林之母回应了祈愿；这次没有带来图纸。';
  }else{
    const plan=findBlueprint(job.blueprintId!);if(!plan||!nextWorkshop.blueprints.includes(plan.id)){cancelWorkshop(host);return '图纸不可用，未扣料。';}
    if(!Number.isSafeInteger(nextWorkshop.nextInstance+1)){cancelWorkshop(host);return '物品编号已用尽，未扣料。';}
    const instanceId=`crafted-${host.seed}-${nextWorkshop.nextInstance}`;
    const rarityId=craftedRarity(host.seed,nextWorkshop.nextInstance);
    nextInventory.instances=canonicalInstances([...(nextInventory.instances??[]),{instanceId,definitionId:SEAT_DEFINITION,blueprintId:plan.id,createdAt:host.time,rarityId,traits:[{id:plan.traitId,value:plan.value}],location:{kind:'inventory'}}]);
    nextWorkshop.nextInstance++;result=`做好了「${rarityDefinition(rarityId).name} · ${plan.name}」，已放入仓库。`;
  }
  nextWorkshop.lastResponse=result;Object.assign(host,{inventory:nextInventory,workshop:nextWorkshop});return result;
}
export function tradeBlueprint(host:GameState,blueprintId:string){
  if(busy(host))return '先完成或取消当前动作。';
  if(host.selected!==CAMP_VISITOR.id||Math.hypot(host.player.x-CAMP_VISITOR.x,host.player.z-CAMP_VISITOR.z)>3)return '先走到行商身边。';
  const plan=findBlueprint(blueprintId);if(!plan||!merchantStock(host).includes(plan.id))return '行商今天没有这张图纸。';
  if(host.workshop.blueprints.includes(plan.id))return '这张图纸已经学会了。';
  const input=workshopInput(host,'trade');if(!input)return '换图纸需要一份未预留的木料。';
  const inventory=inventoryTransaction(host.inventory,[{...input,delta:-1}]);
  const workshop={...host.workshop,blueprints:[...host.workshop.blueprints,plan.id],lastResponse:`已换得「${plan.name}」图纸。`};
  Object.assign(host,{inventory,workshop});return workshop.lastResponse;
}
export function validateWorkshop(raw:unknown,time:number):WorkshopState{
  if(!isRecord(raw))throw new Error('Invalid workshop');
  exactKeys(raw,['nextAction','nextInstance','prayerCount','blueprints','job','lastResponse']);
  for(const key of ['nextAction','nextInstance','prayerCount'])if(!Number.isSafeInteger(raw[key])||(raw[key] as number)<(key==='prayerCount'?0:1))throw new Error('Invalid workshop counter');
  if(!Array.isArray(raw.blueprints)||raw.blueprints.some(id=>!isStableId(id))||new Set(raw.blueprints).size!==raw.blueprints.length||typeof raw.lastResponse!=='string'||raw.lastResponse.length>500)throw new Error('Invalid blueprint knowledge');
  if(raw.job!==null){const j=raw.job;if(!isRecord(j))throw new Error('Invalid workshop job');exactKeys(j,['id','kind','blueprintId','phase','startedAt','durationSeconds']);
    if(!isStableId(j.id)||!['craft','offering'].includes(j.kind as string)||!['approaching','working'].includes(j.phase as string)||typeof j.durationSeconds!=='number'||!Number.isFinite(j.durationSeconds)||j.durationSeconds<=0||j.durationSeconds>86400)throw new Error('Invalid workshop action');
    if(j.phase==='approaching'?j.startedAt!==null:typeof j.startedAt!=='number'||!Number.isFinite(j.startedAt)||j.startedAt<0||j.startedAt>time)throw new Error('Invalid workshop timestamp');
    if(j.kind==='offering'?j.blueprintId!==null:!isStableId(j.blueprintId)||!raw.blueprints.includes(j.blueprintId))throw new Error('Invalid workshop recipe');
  }
  return structuredClone(raw) as WorkshopState;
}
export function workshopSnapshot(host:GameState){
  const job=host.workshop.job;
  return {blueprints:[...host.workshop.blueprints],offers:merchantStock(host),items:structuredClone(host.inventory.instances??[]),
    job:job?{...job,progress:job.phase==='working'?Math.min(1,(host.time-job.startedAt!)/job.durationSeconds):0}:null,
    lastResponse:host.workshop.lastResponse,calendar:calendarAt(host.time),speed:host.clock.speed};
}
export type WorkshopSnapshot=ReturnType<typeof workshopSnapshot>;
