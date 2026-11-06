import {CAMP_PROPS} from '../content/scene-props.ts';
import {MUSHROOM_DRYING} from '../content/processing.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import {FOOD_DRYER_ID,FOOD_GRAINS,FOOD_RULES,FOOD_SOUP_ITEM_ID,FOOD_PORRIDGE_ITEM_ID,POT_MEAL_SERIES,potMealName,foodSackContents} from '../content/food.ts';
import type {FoodGrain,PotMealSeries} from '../content/food.ts';
import {calendarAt,lifeDayAt} from './local-clock.ts';
import {inventoryTransaction,recognizedStack,stackIdentity,isRecord} from './inventory.ts';
import type {InventoryDelta,InventoryStack,InventoryState} from './inventory.ts';
import {isAvailableMaterial} from './transport-location.ts';
import type {GameState} from './state.ts';
import {diningBowlReason,bowlMealCandidate} from './meal-vessels.ts';

export type FoodJob = { startedAt:number; durationSeconds:number };
export type CookingJob = FoodJob & {grain:FoodGrain} & (
  {series?:'mushroom-grain-soup';fungus:'mushroom'|'dried-mushroom'}|
  {series:'grain-porridge';fungus:null}
);
export type FoodState = {
  /** Sunrise-based life days; late dinner still prepares the coming sunrise. */
  lastMealDay:number|null;
  /** Keep yesterday's meal when eating again today: today's permission must not disappear. */
  previousMealDay?:number|null;
  mealsEaten:number; sacksBought:number; drying:FoodJob|null; cooking:CookingJob|null;
};
export type MealCommitted={
  id:string;mealSequence:number;at:number;day:number;itemId:string;kind:'soup'|'bread';bowlId:string|null;
  curtain:null|{ownerId:string;potId:'camp-fire:pot';hookId:'camp-fire:hook';spoonTableId:string|null;durationSeconds:1.4};
};
export type MealConsumption={ok:boolean;message:string;committed?:MealCommitted};
export const createFoodState=():FoodState=>({lastMealDay:null,previousMealDay:null,mealsEaten:0,sacksBought:0,drying:null,cooking:null});
export function validateFoodState(raw:unknown,time:number):FoodState {
  if(!isRecord(raw))throw new Error('Invalid food state');
  if(Object.keys(raw).sort().join(',')!==['lastMealDay','mealsEaten','sacksBought','drying','cooking',...(Object.hasOwn(raw,'previousMealDay')?['previousMealDay']:[])].sort().join(','))throw new Error('Unknown food state fields');
  const day=calendarAt(time).day;
  if(raw.lastMealDay!==null&&(!Number.isSafeInteger(raw.lastMealDay)||(raw.lastMealDay as number)<1||(raw.lastMealDay as number)>day))throw new Error('Invalid food meal day');
  if(raw.previousMealDay!==undefined&&raw.previousMealDay!==null&&(
    !Number.isSafeInteger(raw.previousMealDay)||(raw.previousMealDay as number)<1||
    raw.lastMealDay===null||(raw.previousMealDay as number)>=(raw.lastMealDay as number)))throw new Error('Invalid previous meal day');
  if(!Number.isSafeInteger(raw.mealsEaten)||(raw.mealsEaten as number)<0||!Number.isSafeInteger(raw.sacksBought)||(raw.sacksBought as number)<0)throw new Error('Invalid food counters');
  const validateJob=(value:unknown,cooking=false)=>{
    if(value===null)return;
    if(!isRecord(value)||typeof value.startedAt!=='number'||!Number.isFinite(value.startedAt)||value.startedAt<0||value.startedAt>time||
       typeof value.durationSeconds!=='number'||!Number.isFinite(value.durationSeconds)||value.durationSeconds<=0)throw new Error('Invalid food job');
    if(cooking){
      const series=value.series??'mushroom-grain-soup';
      if(!FOOD_GRAINS.includes(value.grain as FoodGrain)||!POT_MEAL_SERIES.includes(series as PotMealSeries)||
        (series==='grain-porridge'?value.fungus!==null:!['mushroom','dried-mushroom'].includes(value.fungus as string)))throw new Error('Invalid cooking ingredients');
    }
  };
  validateJob(raw.drying);validateJob(raw.cooking,true);
  return {...structuredClone(raw),previousMealDay:raw.previousMealDay??null} as FoodState;
}
export const heavyLaborAllowed=(food:FoodState,time:number)=>{
  const day=lifeDayAt(time);
  return day===1||food.lastMealDay===day-1||food.previousMealDay===day-1;
};
function recordMeal(food:FoodState,time:number):FoodState{
  const today=lifeDayAt(time);
  return {...food,
    previousMealDay:food.lastMealDay===today?(food.previousMealDay??null):food.lastMealDay,
    lastMealDay:today,mealsEaten:food.mealsEaten+1};
}
const available=(inv:InventoryState,id:string)=>inv.stacks.filter(s=>s.itemId===id&&s.quantity>0&&recognizedStack(s)&&isAvailableMaterial(s)&&!s.wood?.reserved);
const take=(inv:InventoryState,id:string,required:number):InventoryDelta[]|null=>{
  let left=required;const lines:InventoryDelta[]=[];
  for(const s of available(inv,id)){const count=Math.min(left,s.quantity);if(count){lines.push({...stackIdentity(s),delta:-count});left-=count;}if(!left)break;}
  return left?null:lines;
};
const near=(host:GameState,x:number,z:number,reach:number)=>Math.hypot(host.player.x-x,host.player.z-z)<=reach;
const busy=(h:GameState)=>!!h.workshop.job||!!h.forestry.active||
  (!!h.gathering.action&&['approaching','performing'].includes(h.gathering.action.phase))||
  (!!h.ritual&&['approaching','performing'].includes(h.ritual.phase));
export function tradeFoodSack(host:GameState):string{
  if(busy(host))return '先完成当前动作。';
  if(host.selected!==CAMP_VISITOR.id||!near(host,CAMP_VISITOR.x,CAMP_VISITOR.z,3))return '先走到行商身边。';
  if(!Number.isSafeInteger(host.food.sacksBought+1))return '粮袋编号已用尽。';
  const debit=take(host.inventory,'mushroom',FOOD_RULES.foodSackCostMushrooms);
  if(!debit)return '需要 2 份鲜蘑菇换一袋混合干粮。';
  const contents=foodSackContents(host.seed,host.food.sacksBought+1);
  const inventory=inventoryTransaction(host.inventory,[...debit,...contents.map(i=>({itemId:i.itemId,qualityId:'ordinary',delta:i.quantity}))]);
  host.inventory=inventory;host.food={...host.food,sacksBought:host.food.sacksBought+1};
  const labels:Record<string,string>={'food-beans':'豆','food-oats':'燕麦','food-rice':'米','food-black-bread':'黑面包','food-salt':'盐','food-spice':'香料'};
  return '换得一麻袋混合干粮，一次拆包入库：'+contents.map(i=>labels[i.itemId]+' '+i.quantity).join(' · ')+'。';
}
/** Open an actual merchant ration bag through the existing inventory transaction. */
export function unpackFoodSack(host:GameState):string{
  if(busy(host))return '先完成当前动作。';
  const debit=take(host.inventory,'trail-rations',1);
  if(!debit)return '没有待拆的粮袋。';
  if(!Number.isSafeInteger(host.food.sacksBought+1))return '粮袋编号已用尽。';
  const contents=foodSackContents(host.seed,host.food.sacksBought+1);
  const inventory=inventoryTransaction(host.inventory,[...debit,...contents.map(i=>({itemId:i.itemId,qualityId:'ordinary',delta:i.quantity}))]);
  host.inventory=inventory;host.food={...host.food,sacksBought:host.food.sacksBought+1};
  return '粮袋已拆开，谷物、黑面包和调味品收入营地库存。';
}
export function startDryMushrooms(host:GameState):string{
  if(host.selected!==FOOD_DRYER_ID||!near(host,CAMP_PROPS.dryer.x,CAMP_PROPS.dryer.z,3.2))return '先走近晾晒架。';
  if(busy(host))return '先完成当前动作。';
  if((host.workshop.upgrades[FOOD_DRYER_ID]?.level??0)<1)return '先使用基础图纸搭好蘑菇晾晒架。';
  if(host.food.drying)return '晾晒架上已有蘑菇。';
  const debit=take(host.inventory,MUSHROOM_DRYING.inputs[0].itemId,MUSHROOM_DRYING.inputs[0].quantity);if(!debit)return '晾晒需要 2 份鲜蘑菇。';
  const inventory=inventoryTransaction(host.inventory,debit);
  host.inventory=inventory;host.food={...host.food,drying:{startedAt:host.time,durationSeconds:MUSHROOM_DRYING.durationSeconds}};
  return '已把两份鲜蘑菇挂上晾晒架。';
}
export function potCookingReason(host:GameState,series:PotMealSeries,grain:FoodGrain):string{
  if(!POT_MEAL_SERIES.includes(series))return '暂不支持这种正餐。';
  if(!FOOD_GRAINS.includes(grain))return '暂不支持这种主食。';
  if(host.selected!==CAMP_PROPS.fire.id||!near(host,CAMP_PROPS.fire.x,CAMP_PROPS.fire.z,3.9))return '先走近火塘。';
  if(busy(host))return '先完成当前动作。';
  if(host.food.cooking)return '汤锅正在煮上一份食物。';
  if(!(host.workshop.upgrades['camp-fire:pot']?.level>=1)||host.workshop.mounted['camp-fire:top']!=='camp-fire:hook')return '先装好悬锅吊钩和基础汤锅。';
  if(series==='mushroom-grain-soup'&&!take(host.inventory,'mushroom',1)&&!take(host.inventory,'dried-mushroom',1))return '需要一份鲜蘑菇或干蘑菇。';
  if(!take(host.inventory,grain,1))return '还缺少相应的行商主食。';
  return '';
}
/** Every pot recipe shares one preflight, input transaction, job and completion service. */
function startPotMeal(host:GameState,series:PotMealSeries,grain:FoodGrain):string{
  const reason=potCookingReason(host,series,grain);if(reason)return reason;
  const fungus=take(host.inventory,'mushroom',1)?'mushroom':take(host.inventory,'dried-mushroom',1)?'dried-mushroom':null;
  const deltas=[...take(host.inventory,grain,1)!,...(series==='mushroom-grain-soup'?take(host.inventory,fungus!,1)!:[])];
  const inventory=inventoryTransaction(host.inventory,deltas);
  const common={startedAt:host.time,durationSeconds:FOOD_RULES.cookSeconds,grain};
  const cooking:CookingJob=series==='grain-porridge'?{...common,series,fungus:null}:{...common,series,fungus:fungus!};
  host.inventory=inventory;host.food={...host.food,cooking};
  return `${series==='grain-porridge'?'粥':'汤'}已下锅，过一会儿就可以盛出来。`;
}
export const startMushroomSoup=(host:GameState,grain:FoodGrain)=>startPotMeal(host,'mushroom-grain-soup',grain);
export const startGrainPorridge=(host:GameState,grain:FoodGrain)=>startPotMeal(host,'grain-porridge',grain);
export function advanceFood(host:GameState):string|null{
  const {drying,cooking}=host.food;
  const dryDone=!!drying&&host.time>=drying.startedAt+drying.durationSeconds;
  const cookDone=!!cooking&&host.time>=cooking.startedAt+cooking.durationSeconds;
  if(!dryDone&&!cookDone)return null;
  const deltas:InventoryDelta[]=[];
  if(dryDone)deltas.push({itemId:MUSHROOM_DRYING.outputs[0].itemId,qualityId:'ordinary',delta:MUSHROOM_DRYING.outputs[0].quantity});
  if(cookDone&&cooking)deltas.push(cooking.series==='grain-porridge'
    ?{itemId:FOOD_PORRIDGE_ITEM_ID,qualityId:'ordinary',food:{series:'grain-porridge',grain:cooking.grain},delta:1}
    :{itemId:FOOD_SOUP_ITEM_ID,qualityId:'ordinary',food:{series:'mushroom-grain-soup',grain:cooking.grain,fungus:cooking.fungus},delta:1});
  const inventory=inventoryTransaction(host.inventory,deltas);
  host.inventory=inventory;host.food={...host.food,drying:dryDone?null:drying,cooking:cookDone?null:cooking};
  const meal=cooking?potMealName(cooking.series??'mushroom-grain-soup',cooking.grain):'正餐';
  return dryDone&&cookDone?`干蘑菇收好了，${meal}也煮好了。`:dryDone?'蘑菇晒成干货，已经收入仓库。':`${meal}煮好了，可以在火塘旁享用。`;
}
/** Food, chosen vessel history and a one-shot scene pulse share one successful commit. */
export function consumeMeal(host:GameState,itemId:string,bowlId?:string):MealConsumption{
  const fail=(message:string):MealConsumption=>({ok:false,message});
  if(![FOOD_SOUP_ITEM_ID,FOOD_PORRIDGE_ITEM_ID,'food-black-bread'].includes(itemId))return fail('这件物品不能作为正餐。');
  if(host.selected!==CAMP_PROPS.fire.id||!near(host,CAMP_PROPS.fire.x,CAMP_PROPS.fire.z,3.9))return fail('先回到火塘旁用餐。');
  if(busy(host))return fail('先完成当前动作。');
  if(bowlId!==undefined){const reason=diningBowlReason(host,bowlId,itemId);if(reason)return fail(reason);}
  const item:InventoryStack|undefined=available(host.inventory,itemId)[0];
  if(!item)return fail(itemId==='food-black-bread'?'没有可以吃的黑面包。':'还没有做好的正餐。');
  const mealSequence=host.food.mealsEaten+1;
  if(!Number.isSafeInteger(mealSequence))return fail('用餐计数已用尽。');
  let inventory=inventoryTransaction(host.inventory,[{...stackIdentity(item),delta:-1}]);
  let curtain:MealCommitted['curtain']=null;
  if(bowlId!==undefined){const candidate=bowlMealCandidate(host,inventory,bowlId,mealSequence);inventory=candidate.inventory;curtain=candidate.curtain;}
  const food=recordMeal(host.food,host.time);
  Object.assign(host,{inventory,food});
  const committed:MealCommitted={id:`meal-${host.seed}-${mealSequence}`,mealSequence,at:host.time,day:lifeDayAt(host.time),
    itemId,kind:itemId==='food-black-bread'?'bread':'soup',bowlId:bowlId??null,curtain};
  const message=itemId==='food-black-bread'?'吃了一份扎实的黑面包，下次日出后可以正常干重体力活。':
    `${itemId===FOOD_PORRIDGE_ITEM_ID?'吃完了一碗热粥':'喝完了热汤'}，下次日出后可以从容地做重体力活。`;
  return {ok:true,message,committed};
}
export const eatMushroomSoup=(host:GameState)=>consumeMeal(host,FOOD_SOUP_ITEM_ID).message;
export const eatGrainPorridge=(host:GameState)=>consumeMeal(host,FOOD_PORRIDGE_ITEM_ID).message;
/** Emergency staple meal remains available without any new vessel requirement. */
export const eatBlackBread=(host:GameState)=>consumeMeal(host,'food-black-bread').message;
export function foodSnapshot(host:GameState){
  const count=(id:string)=>available(host.inventory,id).reduce((n,s)=>n+s.quantity,0);
  const today=lifeDayAt(host.time);
  const progress=(j:FoodJob|null)=>j?Math.min(1,Math.max(0,(host.time-j.startedAt)/j.durationSeconds)):null;
  return {today,heavyWork:heavyLaborAllowed(host.food,host.time),nextDayReady:host.food.lastMealDay===today,
    counts:Object.fromEntries(['trail-rations','mushroom','dried-mushroom','food-beans','food-oats','food-rice','food-black-bread','food-salt','food-spice',FOOD_SOUP_ITEM_ID,FOOD_PORRIDGE_ITEM_ID].map(id=>[id,count(id)])) as Record<string,number>,
    cookingOptions:POT_MEAL_SERIES.flatMap(series=>FOOD_GRAINS.map(grain=>{const reason=potCookingReason(host,series,grain);return {series,grain,name:potMealName(series,grain),canStart:!reason,reason};})),
    cookingName:host.food.cooking?potMealName(host.food.cooking.series??'mushroom-grain-soup',host.food.cooking.grain):null,
    dryingProgress:progress(host.food.drying),cookingProgress:progress(host.food.cooking),sacksBought:host.food.sacksBought,mealsEaten:host.food.mealsEaten};
}
