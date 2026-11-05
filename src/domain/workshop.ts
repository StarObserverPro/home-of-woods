import {travelAccess} from '../world/regions.ts';
import {isAvailableMaterial} from './transport-location.ts';
import {tradeFoodSack} from './food.ts';
import {craftProfile} from '../content/parametric-crafting.ts';
import {resolveCraftOutcome} from './crafting-result.ts';
import {rarityDefinition} from '../content/rarities.ts';
import type {GameState} from './state.ts';
import type {Collider} from '../world/layout.ts';
import {random} from '../world/layout.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import {WORKBENCH,WORKSHOP_RULES,CRAFT_BLUEPRINTS,CAMP_EXTERIOR_BLUEPRINTS,STARTER_BLUEPRINTS,SEAT_DEFINITION,findBlueprint,findCraftBlueprint} from '../content/workshop.ts';
import {findUpgradeProfile,findUpgradePath,upgradeHostId} from '../content/upgrades.ts';
import {advanceUpgrade,upgradeSnapshot,upgradeOptions,validateUpgrades,validateMounted} from './upgrades.ts';
import type {UpgradeLedger} from './upgrades.ts';
import {calendarAt} from './local-clock.ts';
import {ITEM_CATALOG,isStableId} from './item-catalog.ts';
import {inventoryTransaction,inventoryTypeCount,recognizedStack,isRecord,exactKeys,stackIdentity} from './inventory.ts';
import type {InventoryStack,InventoryDelta} from './inventory.ts';
import {canonicalInstances} from './owned-items.ts';
import {knowsBlueprint,consumeBlueprintUse,blueprintCopyUses} from './blueprint-copies.ts';
import type {InventoryState} from './inventory.ts';
import {findPath} from './navigation.ts';
import {gatheringBusy} from './gathering.ts';
import {ritualBusy} from './ritual.ts';

export type WorkshopJob={id:string;kind:'offering'|'craft'|'upgrade';blueprintId:string|null;phase:'approaching'|'working';startedAt:number|null;durationSeconds:number;targetId?:string;pathId?:string};
export type WorkshopState={nextAction:number;nextInstance:number;prayerCount:number;blueprints:string[];upgrades:UpgradeLedger;mounted:Record<string,string>;job:WorkshopJob|null;lastResponse:string};
export const createWorkshop=():WorkshopState=>({nextAction:1,nextInstance:1,prayerCount:0,blueprints:[...STARTER_BLUEPRINTS],upgrades:{},mounted:{},job:null,lastResponse:''});
export const workshopBusy=(host:Pick<GameState,'workshop'>)=>host.workshop.job!==null;
export const workshopTarget=(kind:WorkshopJob['kind'],targetId?:string)=>kind==='upgrade'?findUpgradeProfile(targetId??'')!.stand:kind==='craft'?WORKBENCH.stand:{x:CAMP_PROPS.altar.x,z:CAMP_PROPS.altar.z+5};
export const workshopTargetId=(kind:WorkshopJob['kind'],targetId?:string)=>kind==='upgrade'?upgradeHostId(targetId??''):kind==='craft'?WORKBENCH.id:CAMP_PROPS.altar.id;
const busy=(host:GameState)=>!!host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host)||workshopBusy(host);
export function workshopInput(host:GameState,kind:'offering'|'craft'|'trade'):InventoryStack|undefined{
  return host.inventory.stacks.find(s=>isAvailableMaterial(s)&&s.quantity>0&&recognizedStack(s)&&!s.wood?.reserved&&
    (kind==='offering'?ITEM_CATALOG.items.get(s.itemId)?.typeId==='fungus.fresh':['wood.log','wood.branch','wood.small-piece','wood.lumber'].includes(ITEM_CATALOG.items.get(s.itemId)?.typeId??'')));
}
export function merchantStock(host:Pick<GameState,'seed'|'time'>){
  const day=calendarAt(host.time).day;
  // The fixed plan is always offered. The second slot is stable for this local game day.
  return [CRAFT_BLUEPRINTS[0].id,...(random(host.seed+day*7919)()>.2?[CRAFT_BLUEPRINTS[1].id]:[]),
    ...CAMP_EXTERIOR_BLUEPRINTS.filter(plan=>!new Set<string>(STARTER_BLUEPRINTS).has(plan.id)).map(plan=>plan.id)];
}
export function beginWorkshop(host:GameState,kind:'craft'|'offering',blockers:Collider[],blueprintId:string|null=null){
  if(busy(host))return '先完成或取消当前动作。';
  if(kind==='craft'&&(!blueprintId||!findCraftBlueprint(blueprintId)||!knowsBlueprint(host.inventory,host.workshop.blueprints,blueprintId)))return '先获得可在工作台制作的图纸。';
  if(!workshopInput(host,kind))return kind==='offering'?'需要一份蘑菇。':'需要一份未预留的木料。';
  const target=workshopTarget(kind),near=Math.hypot(host.player.x-target.x,host.player.z-target.z)<.65;
  const route=near?[]:findPath(host.player,target,blockers,travelAccess(host));
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
  if(job.kind==='upgrade')return advanceUpgrade(host);
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
  let nextInventory=inventoryTransaction(host.inventory,[{...input,delta:-1}]);
  const nextWorkshop={...host.workshop,job:null,blueprints:[...host.workshop.blueprints]};let result:string;
  if(job.kind==='offering'){
    if(!Number.isSafeInteger(nextWorkshop.prayerCount+1)){cancelWorkshop(host);return '供奉计数已用尽，未扣料。';}
    const roll=random(host.seed+4051*(nextWorkshop.prayerCount+1))();nextWorkshop.prayerCount++;
    const plan=roll<.35?CRAFT_BLUEPRINTS[0]:roll<.7?CRAFT_BLUEPRINTS[1]:null;
    if(plan&&!nextWorkshop.blueprints.includes(plan.id)){nextWorkshop.blueprints.push(plan.id);result=`神谕带来了「${plan.name}」图纸。`;}
    else result=plan?'神谕再次提起熟悉的木作。图纸已经学会，没有新增图纸。':'树叶轻响，森林之母回应了祈愿；这次没有带来图纸。';
  }else{
    const plan=findCraftBlueprint(job.blueprintId!);if(!plan||!knowsBlueprint(nextInventory,nextWorkshop.blueprints,plan.id)){cancelWorkshop(host);return '图纸不可用，未扣料。';}
    if(!Number.isSafeInteger(nextWorkshop.nextInstance+1)){cancelWorkshop(host);return '物品编号已用尽，未扣料。';}
    const profile=craftProfile(plan.id);
    if(!profile||profile.status!=='active'||!profile.geometryTemplateId){cancelWorkshop(host);return '图纸对应的制作流程尚未开放，未扣材料。';}
    nextInventory=consumeBlueprintUse(nextInventory,nextWorkshop.blueprints,plan.id);
    const instanceId=`crafted-${host.seed}-${nextWorkshop.nextInstance}`;
    // The preset workbench currently supplies neutral quality. A later action module will submit guided fitting evidence.
    const {rarityId,geometry,crafting}=resolveCraftOutcome(plan.id,host.seed,nextWorkshop.nextInstance,{mode:'preset'});
    nextInventory.instances=canonicalInstances([...(nextInventory.instances??[]),{instanceId,definitionId:SEAT_DEFINITION,blueprintId:plan.id,createdAt:host.time,rarityId,traits:[{id:plan.traitId,value:plan.value}],geometry,crafting,location:{kind:'inventory'}}]);
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
/** The merchant transfers a real fabric/hardware stack; learning a plan does not mint materials. */
export function tradeSupply(host:GameState,itemId:string){
  if(itemId==='food-sack')return tradeFoodSack(host);
  const supplies={
    'canvas-roll':{inputType:'fungus.fresh',quantity:2,name:'耐雨帆布卷'},
    'hardware-kit':{inputType:'wood.log',quantity:1,name:'火塘五金包'},
  } as const;
  const spec=supplies[itemId as keyof typeof supplies];
  if(!spec)return '行商没有这件材料。';
  if(busy(host))return '先完成或取消当前动作。';
  if(host.selected!==CAMP_VISITOR.id||Math.hypot(host.player.x-CAMP_VISITOR.x,host.player.z-CAMP_VISITOR.z)>3)return '先走到行商身边。';
  let needed:number=spec.quantity;
  const deltas:InventoryDelta[]=[];
  for(const stack of host.inventory.stacks){
    if(!isAvailableMaterial(stack)||!recognizedStack(stack)||stack.wood?.reserved||ITEM_CATALOG.items.get(stack.itemId)?.typeId!==spec.inputType)continue;
    const used=Math.min(stack.quantity,needed);
    if(used){deltas.push({...stackIdentity(stack),delta:-used});needed-=used;}
    if(!needed)break;
  }
  if(needed)return spec.inputType==='fungus.fresh'?'需要 2 份鲜蘑菇交换帆布卷。':'需要 1 根未预留的原木交换五金包。';
  const inventory=inventoryTransaction(host.inventory,[...deltas,{itemId,qualityId:'ordinary',delta:1}]);
  const message=`已从行商处换得「${spec.name}」，收入仓库。制作外部部件时再消耗它。`;
  host.inventory=inventory;host.workshop={...host.workshop,lastResponse:message};return message;
}
export function validateWorkshop(raw:unknown,time:number,inventory?:InventoryState):WorkshopState{
  if(!isRecord(raw))throw new Error('Invalid workshop');
  const legacy=!Object.hasOwn(raw,'upgrades');
  const legacyMount=!Object.hasOwn(raw,'mounted');
  exactKeys(raw,['nextAction','nextInstance','prayerCount','blueprints','job','lastResponse',...(legacy?[]:['upgrades']),...(legacyMount?[]:['mounted'])]);
  for(const key of ['nextAction','nextInstance','prayerCount'])if(!Number.isSafeInteger(raw[key])||(raw[key] as number)<(key==='prayerCount'?0:1))throw new Error('Invalid workshop counter');
  if(!Array.isArray(raw.blueprints)||raw.blueprints.some(id=>!isStableId(id))||new Set(raw.blueprints).size!==raw.blueprints.length||typeof raw.lastResponse!=='string'||raw.lastResponse.length>500)throw new Error('Invalid blueprint knowledge');
  const upgrades=validateUpgrades(raw.upgrades,time),mounted=validateMounted(raw.mounted,upgrades);
  for(const targetId of Object.keys(upgrades)){
    const profile=findUpgradeProfile(targetId);
    if(profile?.requires?.some(id=>(upgrades[id]?.level??findUpgradeProfile(id)?.initialLevel??0)<1))throw new Error('Missing prerequisite for installed fitting');
  }
  if(raw.job!==null){const j=raw.job;if(!isRecord(j))throw new Error('Invalid workshop job');exactKeys(j,['id','kind','blueprintId','phase','startedAt','durationSeconds',...(j.kind==='upgrade'?['targetId','pathId']:[])]);
    if(!isStableId(j.id)||!['craft','offering','upgrade'].includes(j.kind as string)||!['approaching','working'].includes(j.phase as string)||typeof j.durationSeconds!=='number'||!Number.isFinite(j.durationSeconds)||j.durationSeconds<=0||j.durationSeconds>86400)throw new Error('Invalid workshop action');
    if(j.phase==='approaching'?j.startedAt!==null:typeof j.startedAt!=='number'||!Number.isFinite(j.startedAt)||j.startedAt<0||j.startedAt>time)throw new Error('Invalid workshop timestamp');
    if(j.kind==='offering'?j.blueprintId!==null:!isStableId(j.blueprintId)||!(raw.blueprints.includes(j.blueprintId)||inventory&&knowsBlueprint(inventory,raw.blueprints as string[],j.blueprintId as string)))throw new Error('Invalid workshop recipe');
    if(j.kind==='craft'&&findBlueprint(j.blueprintId as string)?.kind==='upgrade')throw new Error('Upgrade blueprint cannot craft a furniture item');
    if(j.kind==='upgrade'){
      if(!isStableId(j.targetId)||!isStableId(j.pathId)||j.phase!=='working')throw new Error('Invalid upgrade action');
      const profile=findUpgradeProfile(j.targetId),path=findUpgradePath(j.targetId,j.pathId);
      if(!profile||!path||path.blueprintId!==j.blueprintId||(upgrades[j.targetId]?.level??profile.initialLevel)!==path.fromLevel)throw new Error('Invalid upgrade path');
    }
  }
  return {...structuredClone(raw),upgrades,mounted,blueprints:legacy||legacyMount?[...new Set([...raw.blueprints,...STARTER_BLUEPRINTS])]:[...raw.blueprints]} as WorkshopState;
}
export function workshopSnapshot(host:GameState){
  const job=host.workshop.job;
  const copies=blueprintCopyUses(host.inventory);
  return {blueprints:[...host.workshop.blueprints],availableBlueprints:[...new Set([...host.workshop.blueprints,...Object.keys(copies)])],copyUses:copies,offers:merchantStock(host),items:structuredClone(host.inventory.instances??[]),upgrades:structuredClone(host.workshop.upgrades),mounted:structuredClone(host.workshop.mounted),upgrade:upgradeSnapshot(host,host.selected),upgradeOptions:upgradeOptions(host,host.selected),
    inputs:{craft:!!workshopInput(host,'craft'),offering:!!workshopInput(host,'offering'),trade:!!workshopInput(host,'trade'),
      foodSack:host.inventory.stacks.filter(s=>s.itemId==='mushroom'&&recognizedStack(s)&&isAvailableMaterial(s)).reduce((n,s)=>n+s.quantity,0)>=2,
      canvas:inventoryTypeCount(host.inventory,'fungus.fresh')>=2,hardware:host.inventory.stacks.some(s=>isAvailableMaterial(s)&&recognizedStack(s)&&!s.wood?.reserved&&ITEM_CATALOG.items.get(s.itemId)?.typeId==='wood.log')},
    job:job?{...job,progress:job.phase==='working'?Math.min(1,(host.time-job.startedAt!)/job.durationSeconds):0}:null,
    lastResponse:host.workshop.lastResponse,calendar:calendarAt(host.time),speed:host.clock.speed};
}
export type WorkshopSnapshot=ReturnType<typeof workshopSnapshot>;
