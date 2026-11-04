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
  {
    definitionId: 'furniture.stump-seat', name: '整木坐墩', category: 'furniture',
    status: 'active', blueprintIds: ['blueprint.stump-cozy', 'blueprint.stump-sturdy'],
    mountKinds: [], presentationId: null,
  },
  // The travel review distinguishes a usable tool from an affix attached later.
  // All candidates below are planned, with no crafting recipe or equipped slot.
  { definitionId:'travel.umbrella', name:'旅行伞', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:[], presentationId:null },
  { definitionId:'travel.sun-hat', name:'旅行帽', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:[], presentationId:null },
  { definitionId:'travel.spyglass', name:'望远镜', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:[], presentationId:null },
  { definitionId:'travel.whistle', name:'口哨', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:[], presentationId:null },
  { definitionId:'travel.animal-blanket', name:'旅行毯', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:[], presentationId:null },
  { definitionId:'travel.backpack', name:'旅行背包', category:'travel-gear',
    status:'planned', blueprintIds:[], mountKinds:[], presentationId:null },
  // Candidate destinations for the "住" item taxonomy; not unlocked, craftable,
  // spawned, rendered or interpreted as approved trait effects in this patch.
  {
    definitionId: 'accessory.pinecone-doorbell', name: '松果门铃', category: 'residential-accessory',
    status: 'planned', blueprintIds: [], mountKinds: ['entrance-hanging'], presentationId: null,
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
