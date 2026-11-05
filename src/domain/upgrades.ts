import {CREEK_BRIDGE} from '../content/regions.ts';
import {travelAccess} from '../world/regions.ts';
import {isAvailableMaterial} from './transport-location.ts';
import type {GameState} from './state.ts';
import type {Collider} from '../world/layout.ts';
import type {UpgradePath} from '../content/upgrades.ts';
import {UPGRADE_PROFILES,findUpgradeProfile,findUpgradePath,upgradeHostId,FIRE_TOP_SLOT} from '../content/upgrades.ts';
import {findBlueprint} from '../content/workshop.ts';
import {ITEM_CATALOG,isStableId} from './item-catalog.ts';
import {canonicalStacks,exactKeys,inventoryTransaction,isRecord,recognizedStack,stackIdentity,stackKey} from './inventory.ts';
import {knowsBlueprint,consumeBlueprintUse} from './blueprint-copies.ts';
import type {InventoryStack} from './inventory.ts';
import {gatheringBusy} from './gathering.ts';
import {ritualBusy} from './ritual.ts';
import {findPath} from './navigation.ts';

export type UpgradeProgress={level:number;completedPaths:string[];investments:InventoryStack[];updatedAt:number};
export type UpgradeLedger=Record<string,UpgradeProgress>;
const busy=(host:GameState)=>!!host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host)||host.workshop.job!==null;
const near=(host:GameState,point:{x:number;z:number})=>Math.hypot(host.player.x-point.x,host.player.z-point.z)<=.8;
const built=(host:GameState,id:string)=>{const profile=findUpgradeProfile(id);return !!profile&&(host.workshop.upgrades[id]?.level??profile.initialLevel)>=1;};

function materialCandidate(host:GameState,path:UpgradePath){
  const consumed:InventoryStack[]=[];
  const remaining=new Map<InventoryStack,number>();
  const materials=path.materials.map(requirement=>{
    const eligible=host.inventory.stacks.filter(s=>isAvailableMaterial(s)&&recognizedStack(s)&&!s.wood?.reserved&&ITEM_CATALOG.items.get(s.itemId)?.typeId===requirement.typeId);
    const available=eligible.reduce((n,s)=>n+(remaining.get(s)??s.quantity),0);
    let wanted=requirement.quantity;
    for(const stack of eligible){
      const left=remaining.get(stack)??stack.quantity,taken=Math.min(left,wanted);if(!taken)continue;
      consumed.push({...stackIdentity(stack),quantity:taken});remaining.set(stack,left-taken);wanted-=taken;
    }
    return {typeId:requirement.typeId,name:requirement.name,unit:requirement.unit??'份',required:requirement.quantity,available};
  });
  return {materials,consumed,enough:materials.every(m=>m.available>=m.required)};
}

export function upgradeSnapshot(host:GameState,targetId:string|null){
  if(!targetId)return null;
  const profile=findUpgradeProfile(targetId);
  if(!profile){
    const item=host.inventory.instances?.find(i=>i.instanceId===targetId);if(!item)return null;
    const stand=item.location.kind==='world'?{x:item.location.x,z:item.location.z+1.7}:null;
    return {targetId,hostId:targetId,title:findBlueprint(item.blueprintId)?.name??'物品',level:host.workshop.upgrades?.[targetId]?.level??1,status:'planned' as const,
      near:!!stand&&Math.hypot(host.player.x-stand.x,host.player.z-stand.z)<=2,canStart:false,reason:'改良图纸和升级路径尚未开放。',
      pathName:'家具改良',detail:'按图纸改善现有家具，保留原来的物品身份和投入记录。',requiredBlueprint:null,materials:[],stand,mountSlot:null,mounted:false};
  }
  const hostId=profile.hostId??targetId,mountSlot=profile.mountSlot??null;
  const mounted=!!mountSlot&&host.workshop.mounted?.[mountSlot]===targetId;
  const level=host.workshop.upgrades?.[targetId]?.level??profile.initialLevel;
  const path=profile.paths.find(p=>p.fromLevel===level),isNear=near(host,profile.stand);
  if(!path){
    const installed=(!!profile.hostId||profile.id===CREEK_BRIDGE.id)&&level>profile.initialLevel;
    return {targetId,hostId,title:profile.title,level,status:installed?'installed' as const:'planned' as const,near:isNear,canStart:false,reason:profile.future,
      pathName:installed?profile.title:'后续升级',detail:profile.future,requiredBlueprint:null,materials:[],stand:profile.stand,mountSlot,mounted};
  }
  const blueprint=findBlueprint(path.blueprintId),known=knowsBlueprint(host.inventory,host.workshop.blueprints,path.blueprintId);
  const candidate=materialCandidate(host,path);
  const missingPrerequisite=profile.requires?.find(id=>!built(host,id));
  const missing=candidate.materials.filter(m=>m.available<m.required).map(m=>`${m.name}还差 ${m.required-m.available} ${m.unit}`).join('，');
  const localReason=busy(host)?'先完成或取消当前动作。':missingPrerequisite?`先完成「${findUpgradeProfile(missingPrerequisite)?.title??missingPrerequisite}」。`:!known?'需要先获得对应图纸。':missing?`${missing}。`:'';
  return {targetId,hostId,title:profile.title,level,status:known&&!missingPrerequisite?'available' as const:'locked' as const,near:isNear,canStart:isNear&&!localReason,
    reason:!isNear?'先走近，再按图纸安装。':localReason,pathName:path.name,detail:path.description,
    requiredBlueprint:{id:path.blueprintId,name:blueprint?.name??path.blueprintId,known},materials:candidate.materials,stand:profile.stand,mountSlot,mounted};
}
export type UpgradeSnapshot=ReturnType<typeof upgradeSnapshot>;
/** Host panels enumerate each separately priced module without replacing the facility. */
export const upgradeOptions=(host:GameState,targetId:string|null)=>{
  if(!targetId)return [];
  return UPGRADE_PROFILES.filter(p=>p.id===targetId&&p.paths.length>0||p.hostId===targetId)
    .map(p=>upgradeSnapshot(host,p.id)).filter((x):x is NonNullable<typeof x>=>x!==null);
};

/** Inspecting and walking are separate from starting or reserving a fitting. */
export function approachUpgrade(host:GameState,targetId:string,blockers:Collider[]){
  if(busy(host))return '先完成或取消当前动作。';
  const view=upgradeSnapshot(host,targetId);if(!view?.stand)return '这件物品还没有可前往的升级位置。';
  const route=near(host,view.stand)?[]:findPath(host.player,view.stand,blockers,travelAccess(host));
  if(!near(host,view.stand)&&!route.length)return '暂时无法到达操作位置。';
  host.selected=view.hostId;host.route=route;
  return route.length?`走近${view.title}后，可以查看并执行已开放的操作。`:`已经来到${view.title}旁。`;
}
export function beginUpgrade(host:GameState,targetId:string){
  const view=upgradeSnapshot(host,targetId);if(!view)return '这个目标没有可用的升级路径。';
  if(!view.canStart)return view.reason;
  const profile=findUpgradeProfile(targetId)!,path=profile.paths.find(p=>p.fromLevel===view.level)!;
  if(!Number.isSafeInteger(host.workshop.nextAction+1))return '动作编号已用尽。';
  host.workshop={...host.workshop,nextAction:host.workshop.nextAction+1,job:{id:`workshop-${host.workshop.nextAction}`,kind:'upgrade',targetId,pathId:path.id,blueprintId:path.blueprintId,phase:'working',startedAt:host.time,durationSeconds:path.durationSeconds}};
  host.selected=upgradeHostId(targetId);host.route=[];host.player.moving=false;host.player.facing=Math.atan2(profile.position.x-host.player.x,profile.position.z-host.player.z);
  return `开始${path.name}。完成前取消不会扣除材料。`;
}
function cancel(host:GameState,message:string){host.workshop={...host.workshop,job:null};host.route=[];host.player.moving=false;return message;}

/** One root commit owns the entire debit, investment record and visual fitting. */
export function advanceUpgrade(host:GameState):string|null{
  const job=host.workshop.job;if(job?.kind!=='upgrade')return null;
  const profile=job.targetId?findUpgradeProfile(job.targetId):undefined,path=profile&&job.pathId?findUpgradePath(profile.id,job.pathId):undefined;
  if(!profile||!path||host.selected!==upgradeHostId(profile.id)||host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host)||!near(host,profile.stand))return cancel(host,'改装已取消，材料未扣除。');
  if(host.time-job.startedAt!<job.durationSeconds)return null;
  const level=host.workshop.upgrades?.[profile.id]?.level??profile.initialLevel;
  if(level!==path.fromLevel||job.blueprintId!==path.blueprintId||!knowsBlueprint(host.inventory,host.workshop.blueprints,path.blueprintId)||profile.requires?.some(id=>!built(host,id)))return cancel(host,'改装阶段、前置结构或图纸已变化，材料未扣除。');
  const candidate=materialCandidate(host,path);if(!candidate.enough)return cancel(host,'改装材料不足，本次未扣除材料。');
  const debited=candidate.consumed.length?inventoryTransaction(host.inventory,candidate.consumed.map(s=>({...stackIdentity(s),delta:-s.quantity}))):host.inventory;
  const inventory=consumeBlueprintUse(debited,host.workshop.blueprints,path.blueprintId);
  const previous=host.workshop.upgrades?.[profile.id];
  const invested=new Map<string,InventoryStack>();
  for(const stack of [...(previous?.investments??[]),...candidate.consumed]){
    const key=stackKey(stack);invested.set(key,{...stack,quantity:stack.quantity+(invested.get(key)?.quantity??0)});
  }
  const progress:UpgradeProgress={level:path.toLevel,completedPaths:[...(previous?.completedPaths??[]),path.id],investments:canonicalStacks([...invested.values()]),updatedAt:host.time};
  const workshop={...host.workshop,job:null,upgrades:{...host.workshop.upgrades,[profile.id]:progress},
    mounted:profile.mountSlot?{...host.workshop.mounted,[profile.mountSlot]:profile.id}:host.workshop.mounted,
    lastResponse:path.completionMessage};
  Object.assign(host,{inventory,workshop});return path.completionMessage;
}

export function mountFireTop(host:GameState,partId:string|null){
  const profile=partId?findUpgradeProfile(partId):null;
  if(host.selected!=='camp-fire'||!near(host,findUpgradeProfile('camp-fire')!.stand))return '请先走近篝火，再更换上部配件。';
  if(busy(host))return '先完成或取消当前动作。';
  if(partId&&(!profile||profile.mountSlot!==FIRE_TOP_SLOT||!built(host,partId)))return '还没有制作这个上部配件。';
  const mounted={...host.workshop.mounted};if(partId)mounted[FIRE_TOP_SLOT]=partId;else delete mounted[FIRE_TOP_SLOT];
  const label=partId?profile!.title:'全部上部配件';
  host.workshop={...host.workshop,mounted,lastResponse:partId?`已装上「${label}」。其他附件收起保存。`:'已收起全部上部配件，火塘和横梁保留。'};
  return host.workshop.lastResponse;
}
export function validateUpgrades(raw:unknown,time:number):UpgradeLedger{
  if(raw===undefined)return {};
  if(!isRecord(raw))throw new Error('Invalid upgrade ledger');
  const result:UpgradeLedger={};
  for(const [targetId,value] of Object.entries(raw)){
    if(!isStableId(targetId)||!isRecord(value))throw new Error('Invalid upgrade target');
    exactKeys(value,['level','completedPaths','investments','updatedAt']);
    if(!Number.isSafeInteger(value.level)||(value.level as number)<0||!Array.isArray(value.completedPaths)||!value.completedPaths.length||value.completedPaths.some(id=>!isStableId(id))||new Set(value.completedPaths).size!==value.completedPaths.length||typeof value.updatedAt!=='number'||!Number.isFinite(value.updatedAt)||value.updatedAt<0||value.updatedAt>time)throw new Error('Invalid upgrade progress');
    const investments=canonicalStacks(value.investments),completedPaths=value.completedPaths as string[];
    const profile=findUpgradeProfile(targetId);
    if(profile){
      let level=profile.initialLevel;
      for(const pathId of completedPaths){const path=findUpgradePath(targetId,pathId);if(!path||path.fromLevel!==level)throw new Error('Invalid completed upgrade path');level=path.toLevel;}
      if(level!==value.level)throw new Error('Upgrade level does not match its paths');
      // Zero-material restacking of existing hearth stones is a legitimate completed action.
      if(!investments.length&&completedPaths.some(id=>findUpgradePath(targetId,id)!.materials.length>0))throw new Error('Upgrade investment is missing');
    }
    Object.defineProperty(result,targetId,{value:{level:value.level as number,completedPaths:[...completedPaths],investments,updatedAt:value.updatedAt},enumerable:true,writable:true,configurable:true});
  }
  return result;
}
export function validateMounted(raw:unknown,upgrades:UpgradeLedger){
  if(raw===undefined)return {};
  if(!isRecord(raw))throw new Error('Invalid installed exterior fittings');
  const mounted:Record<string,string>={};
  for(const [slot,id] of Object.entries(raw)){
    const profile=typeof id==='string'?findUpgradeProfile(id):undefined;
    if(slot!==FIRE_TOP_SLOT||!profile||profile.mountSlot!==slot||!upgrades[id as string]||upgrades[id as string].level<1)throw new Error('Invalid mounted exterior fitting');
    Object.defineProperty(mounted,slot,{value:id,enumerable:true,writable:true,configurable:true});
  }
  return mounted;
}
