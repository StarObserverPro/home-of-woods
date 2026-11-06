import { STARTER_WEAR, WARDROBE_SLOTS } from './wardrobe.ts';
import {BROOM} from './broom.ts';
import {MEAL_VESSEL_DEFINITIONS} from './meal-vessels.ts';
/**
 * Unique, durable items share the existing inventory.instances ownership ledger.
 * A fixture fitting is not automatically a durable item: only explicitly
 * registered independent objects may be carried, mounted and detached.
 */
export type OwnedItemDefinition = {
  definitionId: string;
  name: string;
  /** Content category; adding future object families does not change the instance schema. */
  category: string;
  status: 'active' | 'planned' | 'retired';
  /** Not a recipe itself. The blueprint/recipe system owns production. */
  blueprintIds: readonly string[];
  /** Slot compatibility is a capability, not a copy of a host's attributes. */
  mountKinds: readonly string[];
  /** Asset references are optional while an item remains planned. */
  presentationId: string | null;
};

export const OWNED_ITEM_DEFINITIONS: readonly OwnedItemDefinition[] = [
  ...MEAL_VESSEL_DEFINITIONS,
  {definitionId:BROOM.definitionId,name:'枝扫帚',category:'household-tool',status:'active',blueprintIds:[BROOM.blueprintId],mountKinds:[],presentationId:BROOM.presentationId},
  {definitionId:'blueprint.sheet',name:'图纸副本',category:'blueprint',status:'active',blueprintIds:[],mountKinds:[],presentationId:null},
  ...STARTER_WEAR.map(item => ({
    definitionId:item.definitionId,name:item.name,category:'apparel',status:'active' as const,
    blueprintIds:['blueprint.starter-outfit'],
    mountKinds:[WARDROBE_SLOTS.find(slot=>slot.slotId===item.slotId)!.kind],
    presentationId:item.rendering==='embedded'?'wardrobe.kaykit-underlayer':'wardrobe.starter-overlay',
  })),
  {
    definitionId: 'furniture.stump-seat', name: '整木坐墩', category: 'furniture',
    status: 'active', blueprintIds: ['blueprint.stump-cozy', 'blueprint.stump-sturdy'],
    mountKinds: [], presentationId: null,
  },
  {
    definitionId:'furniture.guest-bench',name:'会客长凳',category:'furniture',status:'active',
    blueprintIds:['blueprint.guest-bench','blueprint.bench-guided'],mountKinds:[],presentationId:'housing.guest-bench',
  },
  {
    definitionId:'furniture.prep-side-table',name:'备餐边桌',category:'furniture',status:'active',
    blueprintIds:['blueprint.prep-side-table'],mountKinds:[],presentationId:'housing.prep-side-table',
  },
  // The travel review distinguishes a usable tool from an affix attached later.
  // All candidates below are planned, with no crafting recipe or equipped slot.
  { definitionId:'travel.umbrella', name:'旅行伞', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:[], presentationId:null },
  { definitionId:'travel.sun-hat', name:'旅行帽', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:['headwear'], presentationId:null },
  { definitionId:'travel.spyglass', name:'望远镜', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:[], presentationId:null },
  { definitionId:'travel.whistle', name:'口哨', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:[], presentationId:null },
  { definitionId:'travel.animal-blanket', name:'旅行毯', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:[], presentationId:null },
  { definitionId:'travel.backpack', name:'旅行背包', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:['back-gear'], presentationId:null },
  // Real wardrobe pieces are durable items, unlike cosmetic hair choices.
  // The visual variants already exist for QA; all of these remain non-craftable plans.
  { definitionId:'apparel.field-shirt', name:'田野衬衣', category:'apparel',
    status:'planned', blueprintIds:[], mountKinds:['upper-body'], presentationId:'wardrobe.top.field-shirt' },
  { definitionId:'apparel.canvas-vest', name:'帆布背心', category:'apparel',
    status:'planned', blueprintIds:[], mountKinds:['upper-body'], presentationId:'wardrobe.top.canvas-vest' },
  { definitionId:'apparel.work-jacket', name:'劳动外套', category:'apparel',
    status:'planned', blueprintIds:[], mountKinds:['upper-body'], presentationId:'wardrobe.top.work-jacket' },
  { definitionId:'apparel.field-trousers', name:'林地长裤', category:'apparel',
    status:'planned', blueprintIds:[], mountKinds:['lower-body'], presentationId:'wardrobe.bottom.field-trousers' },
  { definitionId:'apparel.patched-trousers', name:'补丁工裤', category:'apparel',
    status:'planned', blueprintIds:[], mountKinds:['lower-body'], presentationId:'wardrobe.bottom.patched-trousers' },
  { definitionId:'apparel.shoes', name:'低帮鞋', category:'apparel',
    status:'planned', blueprintIds:[], mountKinds:['footwear'], presentationId:'wardrobe.footwear.shoes' },
  { definitionId:'apparel.work-boots', name:'高帮工作靴', category:'apparel',
    status:'planned', blueprintIds:[], mountKinds:['footwear'], presentationId:'wardrobe.footwear.boots' },
  { definitionId:'apparel.cloth-cap', name:'布帽', category:'apparel',
    status:'planned', blueprintIds:[], mountKinds:['headwear'], presentationId:'wardrobe.headwear.cap' },
  { definitionId:'apparel.beanie', name:'毛线帽', category:'apparel',
    status:'planned', blueprintIds:[], mountKinds:['headwear'], presentationId:'wardrobe.headwear.beanie' },
  // Candidate destinations for the "住" item taxonomy; not unlocked, craftable,
  // spawned, rendered or interpreted as approved trait effects in this patch.
  {
    definitionId: 'accessory.pinecone-doorbell', name: '松果门铃', category: 'residential-accessory',
    status: 'active', blueprintIds: ['blueprint.pinecone-doorbell'], mountKinds: ['entrance-hanging'], presentationId: 'housing.pinecone-doorbell',
  },
  {
    definitionId: 'accessory.note-box', name: '纸条箱', category: 'residential-accessory',
    status: 'planned', blueprintIds: [], mountKinds: ['message-hanging'], presentationId: null,
  },
  {
    definitionId: 'vessel.copper-kettle', name: '铜壶', category: 'vessel',
    status: 'planned', blueprintIds: [], mountKinds: ['pot-hanging'], presentationId: null,
  },
];
