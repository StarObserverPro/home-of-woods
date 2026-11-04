/** A model-independent, visual-only wardrobe preview. Equipment ownership stays in inventory.instances.
 * IDs describe silhouettes and parts, not awarded items, rarity or affix effects.
 */
export const WARDROBE_OPTIONS = {
  hair: {
    original: '原发型', cropped: '短发', swept: '侧分', bun: '盘发', ponytail: '马尾',
  },
  top: {
    original: '原工作服', 'field-shirt': '田野衬衣', 'canvas-vest': '帆布背心', 'work-jacket': '劳动外套',
  },
  bottom: {
    original: '原长裤', 'field-trousers': '林地长裤', 'patched-trousers': '补丁工裤',
  },
  footwear: {
    original: '原鞋', shoes: '低帮鞋', boots: '高帮工作靴',
  },
  headwear: {
    none: '不戴帽', straw: '草帽', cap: '布帽', beanie: '毛线帽',
  },
  back: {
    none: '无背包', pack: '帆布背包',
  },
} as const;
export type WardrobeSlot = keyof typeof WARDROBE_OPTIONS;
export type WardrobeLook = { [K in WardrobeSlot]: keyof typeof WARDROBE_OPTIONS[K] };
export type WardrobeChoice<K extends WardrobeSlot> = WardrobeLook[K];
export const DEFAULT_WARDROBE: WardrobeLook = {
  hair: 'original', top:'original', bottom:'original',
  footwear:'original', headwear:'none', back:'none',
};
export const WARDROBE_SLOTS: readonly WardrobeSlot[] =
  ['hair','top','bottom','footwear','headwear','back'];
export const WARDROBE_SLOT_NAMES: Record<WardrobeSlot,string> = {
  hair:'发型',top:'上衣',bottom:'裤装',footwear:'鞋靴',headwear:'帽子',back:'背负',
};
export const WARDROBE_CAPABILITIES = {
  boneAnchors: 'active',
  hairstyleVariants: 'active',
  rigidAccessories: 'active',
  segmentedBoneFollowers: 'active',
  previewWithoutOwnership: 'active',
  mountedHatAndPackAppearance: 'active',
  realClothSimulation: 'unsupported',
  looseGarmentSkinning: 'planned',
  longHairPhysics: 'unsupported',
  proceduralEquipmentInteraction: 'planned',
  traitGameplayHandlers: 'planned',
} as const;
export function resolveWardrobe(patch: Partial<WardrobeLook> = {}, base:WardrobeLook=DEFAULT_WARDROBE): WardrobeLook {
  const result={...base};
  for(const slot of WARDROBE_SLOTS){
    const next=patch[slot];
    if(next===undefined)continue;
    if(!Object.hasOwn(WARDROBE_OPTIONS[slot],next))throw new Error('Unknown wardrobe '+slot+': '+next);
    // Assign through a validated, uniform string key to retain the mapped public type.
    (result as Record<WardrobeSlot,string>)[slot]=next;
  }
  return result;
}
export function wardrobeForMountedItems(look: WardrobeLook, instances:readonly {
  definitionId:string;
  location:{kind:string;hostId?:string;slotId?:string};
}[] = []): WardrobeLook {
  const next={...look};
  // A mount is one instance's location, not a duplicate equipment ledger.
  for(const item of instances) {
    if(item.location.kind!=='mounted'||item.location.hostId!=='player')continue;
    if(item.definitionId==='travel.sun-hat'&&item.location.slotId==='player:headwear')next.headwear='straw';
    if(item.definitionId==='travel.backpack'&&item.location.slotId==='player:back-gear')next.back='pack';
  }
  return next;
}
