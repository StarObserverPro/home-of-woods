import {CAMP_PROPS} from '../content/scene-props.ts';
import {MUSHROOM_DRYING} from '../content/processing.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import {FOOD_DRYER_ID,FOOD_GRAINS,FOOD_RULES,FOOD_SOUP_ITEM_ID,foodSackContents} from '../content/food.ts';
import type {FoodGrain} from '../content/food.ts';
import {calendarAt} from './local-clock.ts';
import {inventoryTransaction,recognizedStack,stackIdentity,isRecord} from './inventory.ts';
import type {InventoryDelta,InventoryStack,InventoryState} from './inventory.ts';
import {isAvailableMaterial} from './transport-location.ts';
import type {GameState} from './state.ts';

export type FoodJob = { startedAt:number; durationSeconds:number };
export type CookingJob = FoodJob & { grain:FoodGrain; fungus:'mushroom'|'dried-mushroom' };
export type FoodState = { lastMealDay:number|null; mealsEaten:number; sacksBought:number; drying:FoodJob|null; cooking:CookingJob|null };
export const createFoodState=():FoodState=>({lastMealDay:null,mealsEaten:0,sacksBought:0,drying:null,cooking:null});
export function validateFoodState(raw:unknown,time:number):FoodState {
  if(!isRecord(raw))throw new Error('Invalid food state');
  if(Object.keys(raw).sort().join(',')!==['lastMealDay','mealsEaten','sacksBought','drying','cooking'].sort().join(','))throw new Error('Unknown food state fields');
  const day=calendarAt(time).day;
  if(raw.lastMealDay!==null&&(!Number.isSafeInteger(raw.lastMealDay)||(raw.lastMealDay as number)<1||(raw.lastMealDay as number)>day))throw new Error('Invalid food meal day');
  if(!Number.isSafeInteger(raw.mealsEaten)||(raw.mealsEaten as number)<0||!Number.isSafeInteger(raw.sacksBought)||(raw.sacksBought as number)<0)throw new Error('Invalid food counters');
  const validateJob=(value:unknown,cooking=false)=>{
    if(value===null)return;
    if(!isRecord(value)||typeof value.startedAt!=='number'||!Number.isFinite(value.startedAt)||value.startedAt<0||value.startedAt>time||
       typeof value.durationSeconds!=='number'||!Number.isFinite(value.durationSeconds)||value.durationSeconds<=0)throw new Error('Invalid food job');
    if(cooking&&(!FOOD_GRAINS.includes(value.grain as FoodGrain)||!['mushroom','dried-mushroom'].includes(value.fungus as string)))throw new Error('Invalid cooking ingredients');
  };
  validateJob(raw.drying);validateJob(raw.cooking,true);
  return structuredClone(raw) as FoodState;
}
export const heavyLaborAllowed=(food:FoodState,time:number)=>{const day=calendarAt(time).day;return day===1||food.lastMealDay===day-1;};
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
export function startDryMushrooms(host:GameState):string{
  if(host.selected!==FOOD_DRYER_ID||!near(host,CAMP_PROPS.dryer.x,CAMP_PROPS.dryer.z,3.2))return '先走近晾晒架。';
  if(busy(host))return '先完成当前动作。';
  if(host.food.drying)return '晾晒架上已有蘑菇。';
  const debit=take(host.inventory,MUSHROOM_DRYING.inputs[0].itemId,MUSHROOM_DRYING.inputs[0].quantity);if(!debit)return '晾晒需要 2 份鲜蘑菇。';
  const inventory=inventoryTransaction(host.inventory,debit);
  host.inventory=inventory;host.food={...host.food,drying:{startedAt:host.time,durationSeconds:MUSHROOM_DRYING.durationSeconds}};
  return '已把两份鲜蘑菇挂上晾晒架。';
}
export function startMushroomSoup(host:GameState,grain:FoodGrain):string{
  if(!FOOD_GRAINS.includes(grain))return '暂不支持这种主食。';
  if(host.selected!==CAMP_PROPS.fire.id||!near(host,CAMP_PROPS.fire.x,CAMP_PROPS.fire.z,3.9))return '先走近火塘。';
  if(busy(host))return '先完成当前动作。';
  if(host.food.cooking)return '汤锅正在煮上一份食物。';
  if(!(host.workshop.upgrades['camp-fire:pot']?.level>=1)||host.workshop.mounted['camp-fire:top']!=='camp-fire:hook')return '先装好悬锅吊钩和基础汤锅。';
  const fungus=take(host.inventory,'mushroom',1)?'mushroom':take(host.inventory,'dried-mushroom',1)?'dried-mushroom':null;
  if(!fungus)return '需要一份鲜蘑菇或干蘑菇。';
  const grainDebit=take(host.inventory,grain,1);if(!grainDebit)return '还缺少相应的行商主食。';
  const inventory=inventoryTransaction(host.inventory,[...take(host.inventory,fungus,1)!,...grainDebit]);
  host.inventory=inventory;host.food={...host.food,cooking:{startedAt:host.time,durationSeconds:FOOD_RULES.cookSeconds,grain,fungus}};
  return '汤已下锅，过一会儿就可以盛出来。';
}
export function advanceFood(host:GameState):string|null{
  const {drying,cooking}=host.food;
  const dryDone=!!drying&&host.time>=drying.startedAt+drying.durationSeconds;
  const cookDone=!!cooking&&host.time>=cooking.startedAt+cooking.durationSeconds;
  if(!dryDone&&!cookDone)return null;
  const deltas:InventoryDelta[]=[];
  if(dryDone)deltas.push({itemId:MUSHROOM_DRYING.outputs[0].itemId,qualityId:'ordinary',delta:MUSHROOM_DRYING.outputs[0].quantity});
  if(cookDone&&cooking)deltas.push({itemId:FOOD_SOUP_ITEM_ID,qualityId:'ordinary',food:{series:'mushroom-grain-soup',grain:cooking.grain,fungus:cooking.fungus},delta:1});
  const inventory=inventoryTransaction(host.inventory,deltas);
  host.inventory=inventory;host.food={...host.food,drying:dryDone?null:drying,cooking:cookDone?null:cooking};
  return dryDone&&cookDone?'干蘑菇收好了，菌菇汤也煮好了。':dryDone?'蘑菇晒成干货，已经收入仓库。':'菌菇杂粮汤煮好了，可以在火塘旁享用。';
}
export function eatMushroomSoup(host:GameState):string{
  if(host.selected!==CAMP_PROPS.fire.id||!near(host,CAMP_PROPS.fire.x,CAMP_PROPS.fire.z,3.9))return '先回到火塘旁用餐。';
  if(busy(host))return '先完成当前动作。';
  const item:InventoryStack|undefined=available(host.inventory,FOOD_SOUP_ITEM_ID)[0];if(!item)return '还没有做好的正餐。';
  if(!Number.isSafeInteger(host.food.mealsEaten+1))return '用餐计数已用尽。';
  const inventory=inventoryTransaction(host.inventory,[{...stackIdentity(item),delta:-1}]);
  host.inventory=inventory;host.food={...host.food,lastMealDay:calendarAt(host.time).day,mealsEaten:host.food.mealsEaten+1};
  return '喝完了热汤，明天可以从容地做重体力活。';
}
/** Emergency staple meal: merchant bread prevents a day-two no-axe/no-pot softlock. */
export function eatBlackBread(host:GameState):string{
  if(host.selected!==CAMP_PROPS.fire.id||!near(host,CAMP_PROPS.fire.x,CAMP_PROPS.fire.z,3.9))return '先回到火塘旁用餐。';
  if(busy(host))return '先完成当前动作。';
  const bread=available(host.inventory,'food-black-bread')[0];
  if(!bread)return '没有可以吃的黑面包。';
  if(!Number.isSafeInteger(host.food.mealsEaten+1))return '用餐计数已用尽。';
  const inventory=inventoryTransaction(host.inventory,[{...stackIdentity(bread),delta:-1}]);
  host.inventory=inventory;host.food={...host.food,lastMealDay:calendarAt(host.time).day,mealsEaten:host.food.mealsEaten+1};
  return '吃了一份扎实的黑面包，明天可以正常干重体力活。';
}
export function foodSnapshot(host:GameState){
  const count=(id:string)=>available(host.inventory,id).reduce((n,s)=>n+s.quantity,0);
  const today=calendarAt(host.time).day;
  const progress=(j:FoodJob|null)=>j?Math.min(1,Math.max(0,(host.time-j.startedAt)/j.durationSeconds)):null;
  return {today,heavyWork:heavyLaborAllowed(host.food,host.time),nextDayReady:host.food.lastMealDay===today,
    counts:Object.fromEntries(['mushroom','dried-mushroom','food-beans','food-oats','food-rice','food-black-bread','food-salt','food-spice',FOOD_SOUP_ITEM_ID].map(id=>[id,count(id)])) as Record<string,number>,
    dryingProgress:progress(host.food.drying),cookingProgress:progress(host.food.cooking),sacksBought:host.food.sacksBought,mealsEaten:host.food.mealsEaten};
}
