import {ITEMS} from '../content/items.ts';
/** UI presentation aliases only; item identity and availability stay in content/domain. */
export const ART_ICONS = {
  'scrap-fuel':true,branch:true,'wood-log':true,'small-wood':true,'canvas-roll':true,'hardware-kit':true,
  'copper-coins':true,'merchant-soap':true,'bath-salt':true,'paper-ink':true,
  mushroom:true,'dried-mushroom':true,'trail-rations':true,'black-bread':true,beans:true,oats:true,rice:true,'cooking-salt':true,spice:true,'forest-soup':true,
  'wooden-bowl':true,'soup-pot':true,'copper-kettle':true,grill:true,smoker:true,
  'work-shirt':true,'canvas-trousers':true,'trail-boots':true,'soft-cap':true,'small-pack':true,'work-gloves':true,'canvas-belt':true,'linen-scarf':true,
  'canvas-vest':true,'work-jacket':true,'patched-trousers':true,beanie:true,
  tent:true,cabin:true,workbench:true,'log-rack':true,campfire:true,'drying-rack':true,'stump-seat':true,'guest-bench':true,'prep-table':true,'pinecone-doorbell':true,'branch-broom':true,'note-box':true,altar:true,blueprint:true,'entry-canopy':true,'window-shutters':true,
  route:true,inventory:true,camera:true,settings:true,hourglass:true,pause:true,play:true,rest:true,craft:true,wardrobe:true,trade:true,read:true,axe:true,gather:true,repair:true,oracle:true,
  'blueprint-common':true,'blueprint-uncommon':true,'blueprint-rare':true,'blueprint-epic':true,'blueprint-legendary':true,
  'stump-common':true,'stump-uncommon':true,'stump-rare':true,'stump-epic':true,'stump-legendary':true,
} as const;
export type ArtIconName=keyof typeof ART_ICONS;
const ITEM_ICONS:Record<string,ArtIconName>={
  'scrap-fuel':'scrap-fuel',branch:'branch',wood:'wood-log','small-wood':'small-wood',mushroom:'mushroom','dried-mushroom':'dried-mushroom',
  'canvas-roll':'canvas-roll','hardware-kit':'hardware-kit','trail-rations':'trail-rations','merchant-soap':'merchant-soap','bath-salt':'bath-salt','paper-ink':'paper-ink',
  'food-beans':'beans','food-oats':'oats','food-rice':'rice','food-black-bread':'black-bread','food-salt':'cooking-salt','food-spice':'spice','forest-soup':'forest-soup','grain-porridge':'wooden-bowl',
  'apparel.starter-work-shirt':'work-shirt','apparel.starter-canvas-trousers':'canvas-trousers','apparel.starter-trail-boots':'trail-boots','apparel.starter-soft-cap':'soft-cap',
  'apparel.starter-small-pack':'small-pack','apparel.starter-work-gloves':'work-gloves','apparel.starter-canvas-belt':'canvas-belt','apparel.starter-linen-scarf':'linen-scarf',
  'apparel.field-shirt':'work-shirt','apparel.canvas-vest':'canvas-vest','apparel.work-jacket':'work-jacket','apparel.field-trousers':'canvas-trousers','apparel.patched-trousers':'patched-trousers',
  'apparel.shoes':'trail-boots','apparel.work-boots':'trail-boots','apparel.cloth-cap':'soft-cap','apparel.beanie':'beanie',
  'furniture.stump-seat':'stump-seat','furniture.guest-bench':'guest-bench','furniture.prep-side-table':'prep-table','accessory.pinecone-doorbell':'pinecone-doorbell','accessory.note-box':'note-box','tool.branch-broom':'branch-broom','vessel.wooden-bowl':'wooden-bowl','vessel.copper-kettle':'copper-kettle',
};
const KNOWN_STACK_IDS=new Set(ITEMS.map(item=>item.itemId));
export function itemIcon(id:string):ArtIconName|null{return ITEM_ICONS[id]??(KNOWN_STACK_IDS.has(id)?'inventory':null);}
const RARITY_IDS=new Set(['common','uncommon','rare','epic','legendary']);
export function rarityIcon(family:'stump'|'blueprint',rarity:string):ArtIconName {
  return `${family}-${RARITY_IDS.has(rarity)?rarity:'common'}` as ArtIconName;
}
export function ownedIcon(id:string,rarity='common'):ArtIconName|null{return id==='furniture.stump-seat'?rarityIcon('stump',rarity):id==='blueprint.sheet'?rarityIcon('blueprint',rarity):itemIcon(id);}
export function slotIcon(id:string):ArtIconName {
  return ({'player:top':'work-shirt','player:legs':'canvas-trousers','player:feet':'trail-boots','player:head':'soft-cap','player:back':'small-pack','player:hands':'work-gloves','player:waist':'canvas-belt','player:neck':'linen-scarf'} as Record<string,ArtIconName>)[id]??'wardrobe';
}
export function blueprintSubjectIcon(id:string):ArtIconName {
  if(id.includes('stump'))return 'stump-seat';
  if(id.includes('doorbell'))return 'pinecone-doorbell';
  if(id.includes('bench-guided')||id.includes('guest-bench'))return 'guest-bench';
  if(id.includes('side-table'))return 'prep-table';
  if(id.includes('broom'))return 'branch-broom';
  if(id.includes('wooden-bowl'))return 'wooden-bowl';
  if(id.includes('workbench'))return 'workbench';
  if(id.includes('drying'))return 'drying-rack';
  if(id.includes('cabin-windows'))return 'window-shutters';
  if(id.includes('cabin-entry'))return 'entry-canopy';
  if(id.includes('cabin'))return 'cabin';
  if(id.includes('tent-chimes'))return 'pinecone-doorbell';
  if(id.includes('tent-canvas'))return 'canvas-roll';
  if(id.includes('tent'))return 'tent';
  if(id.includes('fire-pot'))return 'soup-pot';
  if(id.includes('fire-grill'))return 'grill';
  if(id.includes('fire-smoker'))return 'smoker';
  if(id.includes('fire'))return 'campfire';
  return 'blueprint';
}
