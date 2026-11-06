import {ITEM_ORACLE_RITES,itemOracleRite,HOUSEHOLD_AFFIX_DEFINITIONS} from '../content/household-affixes.ts';
import {validateAffixComposition} from '../content/affix-vfx-library.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {ALTAR_LAYOUT} from '../content/altar.ts';
import type {GameState} from './state.ts';
import {inventoryTransaction,recognizedStack,stackIdentity} from './inventory.ts';
import {ITEM_CATALOG} from './item-catalog.ts';
import {isAvailableMaterial} from './transport-location.ts';
import {canonicalInstances} from './owned-items.ts';
import type {OwnedItem} from './owned-items.ts';
import {itemProperties,itemPropertyDiagnostics} from './item-properties.ts';
import type {ItemTrait} from './item-properties.ts';
import {gatheringBusy} from './gathering.ts';
import {ritualBusy} from './ritual.ts';

export type ItemOracleJob={riteId:string;instanceId:string};
const stand={x:CAMP_PROPS.altar.x,z:CAMP_PROPS.altar.z+5};
const near=(host:GameState)=>Math.hypot(host.player.x-stand.x,host.player.z-stand.z)<=.8;
const input=(host:GameState)=>host.inventory.stacks.find(stack=>stack.quantity>0&&recognizedStack(stack)&&isAvailableMaterial(stack)&&ITEM_CATALOG.items.get(stack.itemId)?.typeId==='fungus.fresh');
export function householdTraitAdditionReason(item:OwnedItem,traitId:string):string{
  if(itemPropertyDiagnostics(item).some(message=>message.startsWith('traits:')))return '这件物品的词条暂时无法识别，原来的记录会保留。';
  const traits=itemProperties(item).traits;
  if(traits.some(trait=>trait.id===traitId))return '这件物品已经得到过这份回应。';
  try{validateAffixComposition([...traits.map(trait=>trait.id),traitId],HOUSEHOLD_AFFIX_DEFINITIONS);}catch{return '无法确认这份回应与原有词条相容，原物和供品都保留。';}
  return '';
}
function eligibility(host:GameState,instanceId:string,riteId:string,inProgress=false):string{
  const rite=itemOracleRite(riteId),item=host.inventory.instances?.find(item=>item.instanceId===instanceId);
  if(!rite||!item||item.definitionId!==rite.ownerDefinitionId||ITEM_CATALOG.ownedItems.get(item.definitionId)?.status!=='active')return '神谕暂时不能回应这件物品。';
  if(item.location.kind!=='inventory')return '先把原物收回仓库，带到祭坛前。';
  if((host.workshop.job&&!inProgress)||host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host))return '先完成或取消当前动作。';
  if(!near(host)||![CAMP_PROPS.altar.id,ALTAR_LAYOUT.oracle.id].includes(host.selected as typeof CAMP_PROPS.altar.id))return '先走到祭坛前，再请神谕回应。';
  const composition=householdTraitAdditionReason(item,rite.traitId);if(composition)return composition;
  if(!input(host))return '需要一份随身或营地库存里的鲜菌作为供品。';
  return '';
}
export const itemOracleReason=(host:GameState,instanceId:string,riteId:string)=>eligibility(host,instanceId,riteId);
export function beginItemOracle(host:GameState,instanceId:string,riteId:string):string{
  const reason=eligibility(host,instanceId,riteId);if(reason)return reason;
  if(!Number.isSafeInteger(host.workshop.nextAction+1)||!Number.isSafeInteger(host.workshop.prayerCount+1))return '神谕记录已满，未使用供品。';
  const rite=itemOracleRite(riteId)!;
  host.workshop={...host.workshop,nextAction:host.workshop.nextAction+1,job:{id:`workshop-${host.workshop.nextAction}`,kind:'offering',blueprintId:null,phase:'working',startedAt:host.time,durationSeconds:rite.durationSeconds,oracle:{instanceId,riteId}}};
  host.selected=CAMP_PROPS.altar.id;host.route=[];host.player.moving=false;host.player.facing=Math.atan2(CAMP_PROPS.altar.x-host.player.x,CAMP_PROPS.altar.z-host.player.z);
  return '把原物与鲜菌带到神谕前。回应完成时才会收取这一份供品。';
}
function cancel(host:GameState,message:string){host.workshop={...host.workshop,job:null};host.route=[];host.player.moving=false;return message;}
/** The same workshop updater commits the offered fungus and changed original item once. */
export function advanceItemOracle(host:GameState):string|null{
  const job=host.workshop.job;if(job?.kind!=='offering'||!job.oracle)return null;
  const {instanceId,riteId}=job.oracle,reason=eligibility(host,instanceId,riteId,true);
  if(reason)return cancel(host,reason+'这次供品没有扣除。');
  if(host.time-job.startedAt!<job.durationSeconds)return null;
  if(!Number.isSafeInteger(host.workshop.prayerCount+1))return cancel(host,'神谕记录已满，供品没有扣除。');
  const rite=itemOracleRite(riteId)!,item=host.inventory.instances!.find(item=>item.instanceId===instanceId)!,fungus=input(host)!;
  const inventory=inventoryTransaction(host.inventory,[{...stackIdentity(fungus),delta:-1}]);
  const originalTraits=structuredClone((item.traits??[]) as ItemTrait[]);
  const traits=[...originalTraits,{id:rite.traitId,value:1,source:{kind:'oracle',riteId,altarId:CAMP_PROPS.altar.id,jobId:job.id,at:host.time}}];
  inventory.instances=canonicalInstances((inventory.instances??[]).map(original=>original.instanceId===instanceId?{...original,traits}:original));
  const message='神谕回应了原来的物件，新的趣味仍留在它自己身上。';
  Object.assign(host,{inventory,workshop:{...host.workshop,job:null,prayerCount:host.workshop.prayerCount+1,lastResponse:message}});
  return message;
}
export function itemOracleSnapshot(host:GameState){
  return {near:near(host),stand,targets:(host.inventory.instances??[]).flatMap(item=>{
    const rite=ITEM_ORACLE_RITES.find(rite=>rite.ownerDefinitionId===item.definitionId);if(!rite)return [];
    const reason=eligibility(host,item.instanceId,rite.id);
    return [{instanceId:item.instanceId,definitionId:item.definitionId,name:ITEM_CATALOG.ownedItems.get(item.definitionId)?.name??'原物',riteId:rite.id,riteName:rite.name,traitId:rite.traitId,
      grade:HOUSEHOLD_AFFIX_DEFINITIONS.get(rite.traitId)!.grade,hasTrait:itemProperties(item).traits.some(trait=>trait.id===rite.traitId),canStart:!reason,reason,cost:{name:'鲜菌',quantity:1}}];
  })};
}
export type ItemOracleSnapshot=ReturnType<typeof itemOracleSnapshot>;
