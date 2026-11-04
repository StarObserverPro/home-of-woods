/** First playable food loop; quantities are game portions, not real-world calories. */
export const FOOD_SACK_TRADE_ID = 'food-sack';
export const FOOD_GRAINS = ['food-oats','food-beans','food-rice'] as const;
export type FoodGrain = typeof FOOD_GRAINS[number];
export const FOOD_SOUP_ITEM_ID = 'forest-soup';
export const FOOD_DRYER_ID = 'camp-drying-rack';
export const FOOD_RULES = {foodSackCostMushrooms:2, mushroomDryInput:2, drySeconds:100, cookSeconds:8} as const;
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
