import {CAMP_PROPS} from '../content/scene-props.ts';
import {WORKBENCH} from '../content/workshop.ts';
import {MEAL_VESSEL_BLUEPRINTS,WOODEN_BOWL_ID,MEAL_CURTAIN_TRAIT_ID,MEAL_CURTAIN_RULES} from '../content/meal-vessels.ts';
import type {GameState} from './state.ts';
import type {InventoryState} from './inventory.ts';
import {isRecord,recognizedStack} from './inventory.ts';
import {canonicalInstances} from './owned-items.ts';
import {itemProperties,itemRarity} from './item-properties.ts';
import {isAvailableMaterial} from './transport-location.ts';
import {ITEM_CATALOG} from './item-catalog.ts';
import {gatheringBusy} from './gathering.ts';
import {ritualBusy} from './ritual.ts';
import {knowsBlueprint} from './blueprint-copies.ts';
import {beginWorkshop,craftMaterialDebits} from './workshop.ts';
import type {Collider} from '../world/layout.ts';
import {lifeDayAt} from './local-clock.ts';
import type {MealCommitted} from './food.ts';

const near=(host:GameState)=>Math.hypot(host.player.x-WORKBENCH.stand.x,host.player.z-WORKBENCH.stand.z)<=.8;
const busy=(host:GameState)=>!!host.workshop.job||!!host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host);
export function learnMealVessel(host:GameState,blueprintId:string):string{
  const plan=MEAL_VESSEL_BLUEPRINTS.find(plan=>plan.id===blueprintId);
  if(!plan)return '这里没有这张日用器具图纸。';
  if(busy(host))return '先完成或取消当前动作。';
  if(!near(host))return '先走近工作台，再展开木碗图纸。';
  if(host.workshop.blueprints.includes(blueprintId))return '这张图纸已经学会了。';
  const message='已学会手作木碗，备好一根原木即可刻制。';
  host.workshop={...host.workshop,blueprints:[...host.workshop.blueprints,blueprintId],lastResponse:message};
  return message;
}
export function beginMealVesselCraft(host:GameState,blueprintId:string,blockers:Collider[]):string{
  if(!MEAL_VESSEL_BLUEPRINTS.some(plan=>plan.id===blueprintId))return '这里没有这张日用器具图纸。';
  if(!near(host))return '先走近工作台，再刻制木碗。';
  return beginWorkshop(host,'craft',blockers,blueprintId);
}
export type BowlMealUse={
  schemaVersion:1;uses:number;lastMealSequence:number;lastUsedAt:number;
  qualifiedMeals:number;lastCurtainQualifiedMeal:number;lastCurtainDay:number|null;lastCurtainSequence:number|null;
  [key:string]:unknown;
};
const emptyUse=():BowlMealUse=>({schemaVersion:1,uses:0,lastMealSequence:0,lastUsedAt:0,qualifiedMeals:0,lastCurtainQualifiedMeal:0,lastCurtainDay:null,lastCurtainSequence:null});
function useRecord(raw:unknown):BowlMealUse|null{
  if(raw===undefined)return emptyUse();
  if(!isRecord(raw)||raw.schemaVersion!==1)return null;
  const counts=['uses','lastMealSequence','qualifiedMeals','lastCurtainQualifiedMeal'];
  if(counts.some(key=>!Number.isSafeInteger(raw[key])||(raw[key] as number)<0)||
    typeof raw.lastUsedAt!=='number'||!Number.isFinite(raw.lastUsedAt)||raw.lastUsedAt<0||
    raw.lastCurtainDay!==null&&(!Number.isSafeInteger(raw.lastCurtainDay)||(raw.lastCurtainDay as number)<1)||
    raw.lastCurtainSequence!==null&&(!Number.isSafeInteger(raw.lastCurtainSequence)||(raw.lastCurtainSequence as number)<1)||
    (raw.qualifiedMeals as number)>(raw.uses as number)||(raw.lastCurtainQualifiedMeal as number)>(raw.qualifiedMeals as number))return null;
  return {...raw} as BowlMealUse;
}
export function diningBowlReason(host:GameState,bowlId:string,itemId:string):string{
  if(itemId!=='forest-soup'&&itemId!=='grain-porridge')return '这份面包可以直接吃，木碗留作盛汤或粥。';
  const bowl=host.inventory.instances?.find(item=>item.instanceId===bowlId);
  if(bowl?.definitionId!==WOODEN_BOWL_ID||bowl.location.kind!=='inventory')return '先把自己的木碗收回库存，再用它盛饭。';
  const use=useRecord(bowl.mealUse);
  if(!use||use.lastMealSequence>host.food.mealsEaten||use.lastUsedAt>host.time||
    !Number.isSafeInteger(use.uses+1)||!Number.isSafeInteger(use.qualifiedMeals+1))return '这只木碗的使用记录暂时无法读取，请先使用营地的碗。';
  return '';
}
/** Read-only event context is staged on the same candidate inventory as the food debit. */
export function bowlMealCandidate(host:GameState,inventory:InventoryState,bowlId:string,mealSequence:number){
  const bowl=inventory.instances!.find(item=>item.instanceId===bowlId)!;
  const use=useRecord(bowl.mealUse)!,day=lifeDayAt(host.time);
  const potReady=['camp-fire:support','camp-fire:hook','camp-fire:pot'].every(id=>(host.workshop.upgrades[id]?.level??0)>=1)&&host.workshop.mounted['camp-fire:top']==='camp-fire:hook';
  const qualified=potReady&&itemProperties(bowl).traits.some(trait=>trait.id===MEAL_CURTAIN_TRAIT_ID&&trait.value>0);
  const qualifiedMeals=use.qualifiedMeals+(qualified?1:0);
  const perform=qualified&&use.lastCurtainDay!==day&&(use.lastCurtainSequence===null||qualifiedMeals-use.lastCurtainQualifiedMeal>=MEAL_CURTAIN_RULES.qualifiedMealsBetween);
  const nextUse:BowlMealUse={...use,uses:use.uses+1,lastMealSequence:mealSequence,lastUsedAt:host.time,qualifiedMeals,
    lastCurtainDay:perform?day:use.lastCurtainDay,lastCurtainSequence:perform?mealSequence:use.lastCurtainSequence,
    lastCurtainQualifiedMeal:perform?qualifiedMeals:use.lastCurtainQualifiedMeal};
  inventory.instances=canonicalInstances(inventory.instances!.map(item=>item.instanceId===bowlId?{...item,mealUse:nextUse}:item));
  const table=(host.inventory.instances??[]).flatMap(item=>{
    if(item.definitionId!=='furniture.prep-side-table'||item.location.kind!=='world')return [];
    const distance=Math.hypot(item.location.x-CAMP_PROPS.fire.x,item.location.z-CAMP_PROPS.fire.z);
    return distance<=MEAL_CURTAIN_RULES.presenceRadius?[{id:item.instanceId,distance}]:[];
  }).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id))[0];
  const curtain:MealCommitted['curtain']=perform?{ownerId:bowlId,potId:'camp-fire:pot',hookId:'camp-fire:hook',spoonTableId:table?.id??null,durationSeconds:MEAL_CURTAIN_RULES.durationSeconds}:null;
  return {inventory,curtain};
}
export function mealVesselsSnapshot(host:GameState){
  return {nearWorkbench:near(host),plans:MEAL_VESSEL_BLUEPRINTS.map(plan=>{
    const known=knowsBlueprint(host.inventory,host.workshop.blueprints,plan.id);
    const reason=busy(host)?'先完成或取消当前动作。':!near(host)?'先走近工作台。':!known?'先展开并学会图纸。':!craftMaterialDebits(host,plan.id)?'需要一根可用的原木。':'';
    return {id:plan.id,name:plan.name,known,canLearn:near(host)&&!busy(host)&&!host.workshop.blueprints.includes(plan.id),canCraft:!reason,reason,
      logs:host.inventory.stacks.filter(stack=>recognizedStack(stack)&&isAvailableMaterial(stack)&&!stack.wood?.reserved&&ITEM_CATALOG.items.get(stack.itemId)?.typeId==='wood.log').reduce((total,stack)=>total+stack.quantity,0)};
  }),bowls:(host.inventory.instances??[]).filter(item=>item.definitionId===WOODEN_BOWL_ID).map(item=>({
    instanceId:item.instanceId,name:'手作木碗',rarityName:itemRarity(item).name,available:item.location.kind==='inventory',
    curtainCall:itemProperties(item).traits.some(trait=>trait.id===MEAL_CURTAIN_TRAIT_ID&&trait.value>0),
  }))};
}
export type MealVesselsSnapshot=ReturnType<typeof mealVesselsSnapshot>;
