import { WARDROBE_SLOTS } from '../content/wardrobe.ts';
import { ITEM_CATALOG } from './item-catalog.ts';
import type { InventoryState } from './inventory.ts';
import { createInventory } from './inventory.ts';
import { mountIndependentItem, unmountIndependentItem } from './item-attachments.ts';
import { canonicalInstances } from './owned-items.ts';
import { itemProperties } from './item-properties.ts';

export type WardrobeIntent =
  | { kind:'equip'; instanceId:string; slotId:string }
  | { kind:'unequip'; slotId:string };
export type WardrobeItemView = { instanceId:string; definitionId:string; name:string; rarityId:string };
export type WardrobeSlotView = { slotId:string; label:string; equipped:WardrobeItemView|null; available:WardrobeItemView[] };
export type WardrobeView = { slots:WardrobeSlotView[]; carriedCount:number };

const brief=(item:ReturnType<typeof canonicalInstances>[number]):WardrobeItemView=>({
  instanceId:item.instanceId,
  definitionId:item.definitionId,
  name:ITEM_CATALOG.ownedItems.get(item.definitionId)?.name??'未知服装',
  rarityId:itemProperties(item).rarityId,
});
export function wardrobeSnapshot(inventory:InventoryState):WardrobeView {
  const items=canonicalInstances(inventory.instances??[]);
  const clothes=items.filter(item=>ITEM_CATALOG.ownedItems.get(item.definitionId)?.category==='apparel');
  const slots=WARDROBE_SLOTS.map(slot=>({
    slotId:slot.slotId, label:slot.label,
    equipped:clothes.find(item=>item.location.kind==='mounted'&&item.location.hostId==='player'&&item.location.slotId===slot.slotId)??null,
    available:clothes.filter(item=>item.location.kind==='inventory'&&ITEM_CATALOG.ownedItems.get(item.definitionId)?.mountKinds.includes(slot.kind)).map(brief),
  })).map(slot=>({...slot,equipped:slot.equipped?brief(slot.equipped):null}));
  return {slots,carriedCount:clothes.filter(item=>item.location.kind==='inventory').length};
}
export const EMPTY_WARDROBE_VIEW:WardrobeView=wardrobeSnapshot(createInventory());

/** Atomic from caller perspective. Reuse mounted ownership; no separate player.equipment object. */
export function changeWardrobe(inventory:InventoryState, intent:WardrobeIntent):{inventory:InventoryState;message:string} {
  const slot=WARDROBE_SLOTS.find(s=>s.slotId===intent.slotId);
  if(!slot)throw new Error('未知的穿戴位置');
  const current=(inventory.instances??[]).find(item=>item.location.kind==='mounted'&&item.location.hostId==='player'&&item.location.slotId===slot.slotId);
  if(intent.kind==='unequip'){
    if(!current)return {inventory,message:'这里还没有穿戴物品。'};
    return {inventory:unmountIndependentItem(inventory,current.instanceId),message:`已脱下${ITEM_CATALOG.ownedItems.get(current.definitionId)?.name??'服装'}，放入随身衣物。`};
  }
  const item=(inventory.instances??[]).find(v=>v.instanceId===intent.instanceId);
  const definition=item&&ITEM_CATALOG.ownedItems.get(item.definitionId);
  if(!item||item.location.kind!=='inventory'||definition?.status!=='active'||!definition.mountKinds.includes(slot.kind))
    throw new Error('这件物品不能穿在这里。');
  if(current?.instanceId===item.instanceId)return {inventory,message:'这件物品已经穿戴。'};
  const cleared=current?unmountIndependentItem(inventory,current.instanceId):inventory;
  const mounted=mountIndependentItem(cleared,item.instanceId,'player',slot.slotId);
  return {inventory:mounted,message:`已穿上${definition.name}。`};
}
