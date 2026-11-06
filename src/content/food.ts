/** First playable food loop; quantities are game portions, not real-world calories. */
export const FOOD_SACK_TRADE_ID = 'food-sack';
export const FOOD_GRAINS = ['food-oats','food-beans','food-rice'] as const;
export type FoodGrain = typeof FOOD_GRAINS[number];
export const FOOD_SOUP_ITEM_ID = 'forest-soup';
export const FOOD_PORRIDGE_ITEM_ID = 'grain-porridge';
export const POT_MEAL_SERIES = ['mushroom-grain-soup','grain-porridge'] as const;
export type PotMealSeries=typeof POT_MEAL_SERIES[number];
export const FOOD_GRAIN_NAMES:Record<FoodGrain,string>={'food-oats':'燕麦','food-beans':'杂豆','food-rice':'米'};
export const potMealName=(series:PotMealSeries,grain:FoodGrain)=>series==='grain-porridge'?`${FOOD_GRAIN_NAMES[grain]}粥`:`菌菇${FOOD_GRAIN_NAMES[grain]}汤`;
export function preparedFoodLabel(itemId:string,metadata:unknown):{name:string;ingredients:string}|null{
  if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return null;
  const food=metadata as Record<string,unknown>,grain=food.grain as FoodGrain;
  if(!FOOD_GRAINS.includes(grain))return null;
  if(itemId===FOOD_PORRIDGE_ITEM_ID&&food.series==='grain-porridge')return {name:potMealName('grain-porridge',grain),ingredients:FOOD_GRAIN_NAMES[grain]};
  if(itemId===FOOD_SOUP_ITEM_ID&&food.series==='mushroom-grain-soup'&&['mushroom','dried-mushroom'].includes(food.fungus as string))
    return {name:potMealName('mushroom-grain-soup',grain),ingredients:`${food.fungus==='mushroom'?'鲜蘑菇':'干蘑菇'} · ${FOOD_GRAIN_NAMES[grain]}`};
  return null;
}
export const FOOD_DRYER_ID = 'camp-drying-rack';
export const FOOD_RULES = {foodSackCostMushrooms:2, cookSeconds:8} as const;
/** Existing ordinary fittings can be studied locally; learning never supplies their materials. */
export const POT_FOUNDATION_TARGETS=['camp-fire:support','camp-fire:hook','camp-fire:pot'] as const;
/** A single merchant trade yields a varied but useful assortment. */
export function foodSackContents(seed:number,ordinal:number):{itemId:string;quantity:number}[]{
  if(!Number.isSafeInteger(ordinal)||ordinal<1)throw new Error('Invalid bag serial');
  const roll=(salt:number)=>{let n=(seed^Math.imul(ordinal,0x9e3779b1)^Math.imul(salt,0x85ebca6b))>>>0;
    n^=n>>>16;n=Math.imul(n,0x7feb352d);n^=n>>>15;return (n>>>0)%3;};
  return [
    {itemId:'food-beans',quantity:1+roll(11)},
    {itemId:'food-oats',quantity:1+roll(23)},
    {itemId:'food-rice',quantity:1+roll(37)},
    {itemId:'food-black-bread',quantity:1+(roll(41)%2)},
    {itemId:'food-salt',quantity:1},
    {itemId:'food-spice',quantity:roll(53)>0?1:0},
  ].filter(entry=>entry.quantity>0);
}
