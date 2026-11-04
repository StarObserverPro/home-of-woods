import type {GameState} from './state.ts';
import type {Collider} from '../world/layout.ts';
import type {UpgradePath} from '../content/upgrades.ts';
import {findUpgradeProfile,findUpgradePath} from '../content/upgrades.ts';
import {findBlueprint} from '../content/workshop.ts';
import {ITEM_CATALOG,isStableId} from './item-catalog.ts';
import {canonicalStacks,exactKeys,inventoryTransaction,isRecord,recognizedStack,stackIdentity,stackKey} from './inventory.ts';
import type {InventoryStack} from './inventory.ts';
import {gatheringBusy} from './gathering.ts';
import {ritualBusy} from './ritual.ts';
import {findPath} from './navigation.ts';

export type UpgradeProgress={level:number;completedPaths:string[];investments:InventoryStack[];updatedAt:number};
export type UpgradeLedger=Record<string,UpgradeProgress>;
const busy=(host:GameState)=>!!host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host)||host.workshop.job!==null;
const near=(host:GameState,point:{x:number;z:number})=>Math.hypot(host.player.x-point.x,host.player.z-point.z)<=.8;

function materialCandidate(host:GameState,path:UpgradePath){
  const consumed:InventoryStack[]=[];
  const remaining=new Map<InventoryStack,number>();
  const materials=path.materials.map(requirement=>{
    const eligible=host.inventory.stacks.filter(s=>recognizedStack(s)&&!s.wood?.reserved&&ITEM_CATALOG.items.get(s.itemId)?.typeId===requirement.typeId);
    const available=eligible.reduce((n,s)=>n+(remaining.get(s)??s.quantity),0);
    let wanted=requirement.quantity;
    for(const stack of eligible){
      const left=remaining.get(stack)??stack.quantity,taken=Math.min(left,wanted);if(!taken)continue;
      consumed.push({...stackIdentity(stack),quantity:taken});remaining.set(stack,left-taken);wanted-=taken;
    }
    return {typeId:requirement.typeId,name:requirement.name,required:requirement.quantity,available};
  });
  return {materials,consumed,enough:materials.every(m=>m.available>=m.required)};
}

export function upgradeSnapshot(host:GameState,targetId:string|null){
  if(!targetId)return null;
  const profile=findUpgradeProfile(targetId);
  if(!profile){
    const item=host.inventory.instances?.find(i=>i.instanceId===targetId);if(!item)return null;
    const stand=item.location.kind==='world'?{x:item.location.x,z:item.location.z+1.7}:null;
    return {targetId,title:findBlueprint(item.blueprintId)?.name??'物品',level:host.workshop.upgrades?.[targetId]?.level??1,status:'planned' as const,
      near:!!stand&&Math.hypot(host.player.x-stand.x,host.player.z-stand.z)<=2,canStart:false,reason:'改良图纸和升级路径尚未开放。',
      pathName:'家具改良',detail:'按图纸改善现有家具，保留原来的物品身份和投入记录。',requiredBlueprint:null,materials:[],stand};
  }
  const level=host.workshop.upgrades?.[targetId]?.level??profile.initialLevel;
  const path=profile.paths.find(p=>p.fromLevel===level),isNear=near(host,profile.stand);
  if(!path)return {targetId,title:profile.title,level,status:'planned' as const,near:isNear,canStart:false,reason:profile.future,
    pathName:'后续升级',detail:profile.future,requiredBlueprint:null,materials:[],stand:profile.stand};
  const blueprint=findBlueprint(path.blueprintId),known=host.workshop.blueprints.includes(path.blueprintId);
  const candidate=materialCandidate(host,path);
  const missing=candidate.materials.filter(m=>m.available<m.required).map(m=>`${m.name}还差 ${m.required-m.available} ${m.typeId==='wood.log'?'根':'份'}`).join('，');
  const localReason=busy(host)?'先完成或取消当前动作。':!known?'需要先获得修缮图纸。':missing?`${missing}。`:'';
  return {targetId,title:profile.title,level,status:known?'available' as const:'locked' as const,near:isNear,canStart:isNear&&!localReason,
    reason:!isNear?'先走近，再按图纸修缮。':localReason,pathName:path.name,detail:path.description,
    requiredBlueprint:{id:path.blueprintId,name:blueprint?.name??path.blueprintId,known},materials:candidate.materials,stand:profile.stand};
}
export type UpgradeSnapshot=ReturnType<typeof upgradeSnapshot>;

/** Inspecting and walking are separate from starting or reserving a repair. */
export function approachUpgrade(host:GameState,targetId:string,blockers:Collider[]){
  if(busy(host))return '先完成或取消当前动作。';
  const view=upgradeSnapshot(host,targetId);if(!view?.stand)return '这件物品还没有可前往的升级位置。';
  const route=near(host,view.stand)?[]:findPath(host.player,view.stand,blockers);
  if(!near(host,view.stand)&&!route.length)return '暂时无法到达操作位置。';
  host.selected=targetId;host.route=route;
  return route.length?`走近${view.title}后，可以查看并执行已开放的操作。`:`已经来到${view.title}旁。`;
}
export function beginUpgrade(host:GameState,targetId:string){
  const view=upgradeSnapshot(host,targetId);if(!view)return '这个目标没有可用的升级路径。';
  if(!view.canStart)return view.reason;
  const profile=findUpgradeProfile(targetId)!,path=profile.paths.find(p=>p.fromLevel===view.level)!;
  if(!Number.isSafeInteger(host.workshop.nextAction+1))return '动作编号已用尽。';
  host.workshop={...host.workshop,nextAction:host.workshop.nextAction+1,job:{id:`workshop-${host.workshop.nextAction}`,kind:'upgrade',targetId,pathId:path.id,blueprintId:path.blueprintId,phase:'working',startedAt:host.time,durationSeconds:path.durationSeconds}};
  host.selected=targetId;host.route=[];host.player.moving=false;host.player.facing=Math.atan2(profile.position.x-host.player.x,profile.position.z-host.player.z);
  return `开始${path.name}。完成前取消不会扣除材料。`;
}
function cancel(host:GameState,message:string){host.workshop={...host.workshop,job:null};host.route=[];host.player.moving=false;return message;}

/** One root commit owns the entire debit, investment record and visible stage. */
export function advanceUpgrade(host:GameState):string|null{
  const job=host.workshop.job;if(job?.kind!=='upgrade')return null;
  const profile=job.targetId?findUpgradeProfile(job.targetId):undefined,path=profile&&job.pathId?findUpgradePath(profile.id,job.pathId):undefined;
  if(!profile||!path||host.selected!==profile.id||host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host)||!near(host,profile.stand))return cancel(host,'修缮已取消，材料未扣除。');
  if(host.time-job.startedAt!<job.durationSeconds)return null;
  const level=host.workshop.upgrades?.[profile.id]?.level??profile.initialLevel;
  if(level!==path.fromLevel||job.blueprintId!==path.blueprintId||!host.workshop.blueprints.includes(path.blueprintId))return cancel(host,'修缮阶段或图纸已变化，材料未扣除。');
  const candidate=materialCandidate(host,path);if(!candidate.enough)return cancel(host,'修缮材料不足，本次未扣除材料。');
  const inventory=inventoryTransaction(host.inventory,candidate.consumed.map(s=>({...stackIdentity(s),delta:-s.quantity})));
  const previous=host.workshop.upgrades?.[profile.id];
  // Combine repeated material identities without discarding wood specs or future attributes.
  const invested=new Map<string,InventoryStack>();
  for(const stack of [...(previous?.investments??[]),...candidate.consumed]){
    const key=stackKey(stack);invested.set(key,{...stack,quantity:stack.quantity+(invested.get(key)?.quantity??0)});
  }
  const progress:UpgradeProgress={level:path.toLevel,completedPaths:[...(previous?.completedPaths??[]),path.id],investments:canonicalStacks([...invested.values()]),updatedAt:host.time};
  const message=path.completionMessage;
  const workshop={...host.workshop,job:null,upgrades:{...host.workshop.upgrades,[profile.id]:progress},lastResponse:message};
  Object.assign(host,{inventory,workshop});return message;
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
      // Receipts are historical facts. Later recipe tuning must not rewrite or reject paid materials.
      if(!investments.length)throw new Error('Upgrade investment is missing');
    }
    Object.defineProperty(result,targetId,{value:{level:value.level as number,completedPaths:[...completedPaths],investments,updatedAt:value.updatedAt},enumerable:true,writable:true,configurable:true});
  }
  return result;
}
