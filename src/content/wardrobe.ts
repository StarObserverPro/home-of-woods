import type { OwnedItem } from '../domain/owned-items.ts';

/**
 * The player is a fixture host in the existing independent-item ownership ledger.
 * These are clothing slots, not affix slots or extra inventories.
 */
export const WARDROBE_SLOTS = [
  { slotId:'player:top', label:'上衣', kind:'wear-top', anchorId:'player.top', contexts:['worn','character-action'] },
  { slotId:'player:legs', label:'裤装', kind:'wear-legs', anchorId:'player.legs', contexts:['worn','character-action'] },
  { slotId:'player:feet', label:'鞋靴', kind:'wear-feet', anchorId:'player.feet', contexts:['worn','character-action'] },
  { slotId:'player:head', label:'帽子', kind:'wear-head', anchorId:'player.head', contexts:['worn','character-action'] },
  { slotId:'player:back', label:'背负', kind:'wear-back', anchorId:'player.back', contexts:['worn','character-action'] },
  { slotId:'player:hands', label:'手套', kind:'wear-hands', anchorId:'player.hands', contexts:['worn','character-action'] },
  { slotId:'player:waist', label:'腰带', kind:'wear-waist', anchorId:'player.waist', contexts:['worn','character-action'] },
  { slotId:'player:neck', label:'领巾', kind:'wear-neck', anchorId:'player.neck', contexts:['worn','character-action'] },
] as const;
export type WardrobeSlotId = (typeof WARDROBE_SLOTS)[number]['slotId'];

export const STARTER_WEAR = [
  { slotId:'player:top', definitionId:'apparel.starter-work-shirt', name:'粗布工作衫', rendering:'embedded' },
  { slotId:'player:legs', definitionId:'apparel.starter-canvas-trousers', name:'帆布长裤', rendering:'embedded' },
  { slotId:'player:feet', definitionId:'apparel.starter-trail-boots', name:'林地短靴', rendering:'embedded' },
  { slotId:'player:head', definitionId:'apparel.starter-soft-cap', name:'软檐布帽', rendering:'overlay' },
  { slotId:'player:back', definitionId:'apparel.starter-small-pack', name:'小帆布背包', rendering:'overlay' },
  { slotId:'player:hands', definitionId:'apparel.starter-work-gloves', name:'粗布手套', rendering:'overlay' },
  { slotId:'player:waist', definitionId:'apparel.starter-canvas-belt', name:'帆布腰带', rendering:'embedded' },
  { slotId:'player:neck', definitionId:'apparel.starter-linen-scarf', name:'亚麻领巾', rendering:'overlay' },
] as const;

/**
 * Design backlog, NOT downloaded GLBs or game-ready mesh variants.
 * Count silhouettes, not palette swaps; all candidates require an asset/rig review.
 * Separate the source-license ledger from the design library.
 */
const DESIGN_FORMS = {
  top: ['短袖棉衫', '亨利领衫', '无领麻布衬衣', '挽袖工作衫', '长袖布衫', '小翻领衬衣', '林间坎肩', '轻皮革背心', '织纹套头衫', '羊毛短套衫', '短款劳动夹克', '帆布工作夹克', '口袋猎装', '束腰外衣', '短兜帽上衣', '立领旅行服', '轻薄雨披', '交叠衣襟衫', '前襟围裙罩衣', '旅行短斗篷'],
  legs: ['直筒布裤', '束口麻布裤', '宽松抽绳裤', '膝盖补丁裤', '双侧工装裤', '窄腿旅行裤', '短款马裤', '灯芯绒裤', '防雨罩裤', '硬挺牛仔裤', '宽腿工作裤', '厚呢冬裤', '齐膝短裤', '膝上短裤', '侧袋工具裤', '贴身毛线裤', '卷边裤', '护腿系带裤', '轻便骑行裤', '短裤加绑腿'],
  feet: ['布面便鞋', '低帮皮靴', '高帮徒步靴', '轻量雨靴', '草编凉鞋', '羊毛毡鞋', '软底林地鞋', '冬季雪地靴'],
  head: ['草编宽檐帽', '帆布鸭舌帽', '毛线便帽', '软呢圆帽', '布制兜帽', '渔夫帽', '窄檐探险帽', '包头巾', '护耳冬帽'],
  back: ['卷口帆布包', '藤筐背架', '单肩皮包', '小型登山包', '织物斜挎包', '木材背负架'],
  hands: ['粗布劳作手套', '露指手套', '棉质薄手套', '厚羊毛手套', '短皮革工作手套'],
  waist: ['麻绳腰带', '帆布腰带', '素皮腰带', '工具挂带', '小袋腰带'],
  neck: ['亚麻方巾', '窄围巾', '冬日围脖', '短领巾', '编织护颈'],
} as const;
export const WARDROBE_DESIGN_LIBRARY = Object.entries(DESIGN_FORMS).flatMap(([group, names]) =>
  names.map((name, i) => ({
    designId: `apparel.design.${group}.${String(i+1).padStart(2,'0')}`,
    slotId: `player:${group}`,
    name, status: 'design-only' as const,
    // No implicit compatibility with the existing KayKit rig.
    meshAssetId: null,
  }))
);

export function starterWardrobeItems(): OwnedItem[] {
  return STARTER_WEAR.map((entry) => ({
    instanceId: `starter-wear-${entry.definitionId.split('.').at(-1)}`,
    definitionId: entry.definitionId,
    blueprintId: 'blueprint.starter-outfit',
    createdAt: 0,
    rarityId: 'common',
    traits: [],
    location: { kind:'mounted', hostId:'player', slotId:entry.slotId },
  }));
}
