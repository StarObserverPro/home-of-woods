import { CARRY_ITEMS } from './carrying.ts';
import { ITEM_TAXONOMY } from './item-types.ts';
import type { ItemTaxonomy } from './item-types.ts';
import type { ItemDefinition } from './items.ts';
import type { ExpeditionMapId, ExpeditionResourceRole } from './forest-expedition.ts';

/** Sample-woodland content. Items use the ordinary inventory, never a second balance. */
const produce = (itemId: string, name: string, typeId: string, materialId: string, formId: string, description: string, symbol: ItemDefinition['symbol'] = 'bundle'): ItemDefinition => ({
  itemId, name, typeId, category: 'forest-produce', materialId, formId, description,
  icon: name.slice(0, 1), tags: ['林地产物'], source: '林地样区', resourceLine: 'forest-produce',
  status: 'active', defaultQualityId: 'ordinary', symbol,
});

export const EXPEDITION_ITEMS: readonly ItemDefinition[] = [
  produce('conifer-mushroom', '针林鲜菌', 'fungus.fresh', 'fungus.unspecified', 'fresh', '针叶活树林地上的菌类；可在样区补给架晾干。', 'mushroom'),
  produce('hardwood-mushroom', '阔林鲜菌', 'fungus.fresh', 'fungus.unspecified', 'fresh', '阔叶林地上的菌类；与朽木上的菌簇分开辨认。', 'mushroom'),
  produce('wood-mushroom', '平菇', 'fungus.fresh', 'fungus.unspecified', 'fresh', '长在朽木上的扇形鲜菌，可在补给架晾干。', 'mushroom'),
  produce('shelf-mushroom', '硫磺菌', 'fungus.fresh', 'fungus.unspecified', 'fresh', '层层叠起的鲜菌，可在补给架晾干。', 'mushroom'),
  produce('wood-ear', '木耳', 'fungus.fresh', 'fungus.unspecified', 'fresh', '朽木上薄而卷曲的菌类，可在补给架晾干。', 'mushroom'),
  produce('serviceberry', '六月莓', 'forest.fruit', 'forest.fruit', 'fresh', '挂在唐棣细枝上的小果，可带回补给架晾干。'),
  produce('forest-berry', '林缘红莓', 'forest.fruit', 'forest.fruit', 'fresh', '来自明亮林缘的果丛，可晾成果干。'),
  produce('blue-forest-berry', '溪甸蓝果', 'forest.fruit', 'forest.fruit', 'fresh', '下坡亮林边的果子，可晾成果干。'),
  produce('red-forest-berry', '高林红果', 'forest.fruit', 'forest.fruit', 'fresh', '针叶林也有果灌木，光照适合的林窗可形成果源。'),
  produce('forest-nut', '林间坚果', 'forest.nut', 'forest.nut', 'in-shell', '不同宿主的坚果统一以需处理的带壳原料保管，补给架可加工成储粮。'),
  produce('tree-resin', '树脂', 'forest.resin', 'forest.resin', 'raw', '缓慢积累的树脂，作为修补与木作材料保留。'),
  produce('forest-seed', '林木种源', 'forest.seed', 'forest.seed', 'seed', '记录来源林地的种源；可带回寄存，后续定植须接入允许的树位。'),
  produce('dried-forest-fruit', '林果干', 'forest.preserved', 'forest.fruit', 'dried', '果子晾干后占用更小，适合随身携带。'),
  produce('nut-rations', '坚果储粮', 'forest.preserved', 'forest.nut', 'dried', '完成去壳与处理的坚果储粮。'),
  produce('sap-filled-can', '装满树液的收液罐', 'forest.sap', 'forest.sap', 'filled-can', '树液与收液罐作为一个实物搬运，熬制后返还空罐。'),
  produce('forest-syrup', '树液糖浆', 'forest.syrup', 'forest.sap', 'syrup', '在补给架使用柴火浓缩的树液，体积比原液小。'),
  { itemId: 'sap-can', name: '空收液罐', typeId: 'supply.sap-can', category: 'camp-supplies', materialId: 'supplier.metal', formId: 'can',
    description: '样区补给架可领取一次的工具。采液会装满，熬制会返还空罐。', icon: '罐', tags: ['容器', '样区工具'],
    source: '林地样区补给架', resourceLine: 'trade-good', status: 'active', defaultQualityId: 'ordinary', symbol: 'bundle' },
];

export const EXPEDITION_TAXONOMY: ItemTaxonomy = {
  ...ITEM_TAXONOMY,
  materials: [...ITEM_TAXONOMY.materials, ...['fruit', 'nut', 'resin', 'seed', 'sap'].map(key => ({ materialId: `forest.${key}`, name: ({ fruit: '森林果实', nut: '森林坚果', resin: '树脂', seed: '林木种源', sap: '树液' } as Record<string, string>)[key], categoryIds: ['forest-produce'] }))],
  types: [...ITEM_TAXONOMY.types,
    ...([
      ['forest.fruit', '鲜果', 'fresh'], ['forest.nut', '带壳坚果', 'in-shell'], ['forest.resin', '树脂', 'raw'],
      ['forest.seed', '种源', 'seed'], ['forest.preserved', '林产储粮', 'dried'], ['forest.sap', '树液罐', 'filled-can'], ['forest.syrup', '树液糖浆', 'syrup'],
    ] as const).map(([typeId, name, formId]) => ({ typeId, name, formId, categoryId: 'forest-produce', resourceLine: 'forest-produce' as const, useGroupIds: ['forest-preservation', 'forest-goods'] })),
    { typeId: 'supply.sap-can', name: '收液罐', formId: 'can', categoryId: 'camp-supplies', resourceLine: 'trade-good', useGroupIds: ['camp-fitting'] },
  ],
};

/** Same game weight/space units and same carrying formula as the main game. */
export const EXPEDITION_CARRY_ITEMS = CARRY_ITEMS;

export type ExpeditionResourceDefinition = {
  role: ExpeditionResourceRole; name: string; hint: string; capacity: number; durationSeconds: number;
  recoverSeconds: number | null; itemId: string; itemByMap?: Partial<Record<ExpeditionMapId, string>>;
  destination: 'carried' | 'ground'; range: number; timberCost: number;
};
const resource = (role: ExpeditionResourceRole, name: string, itemId: string, capacity: number, durationSeconds: number, recoverSeconds: number | null, hint: string, extra: Partial<ExpeditionResourceDefinition> = {}): ExpeditionResourceDefinition => ({
  role, name, itemId, capacity, durationSeconds, recoverSeconds, hint, destination: 'carried', range: 2.4, timberCost: 0, ...extra,
});
/** Recovery is sample-session time, not frozen season/day balancing. No load-time refill. */
export const EXPEDITION_RESOURCES: Readonly<Record<ExpeditionResourceRole, ExpeditionResourceDefinition>> = {
  'soil-fungus': resource('soil-fungus', '林地菌圈', 'mushroom', 4, 1.8, 240, '活树林地上的菌圈，采下后按同一游戏时钟恢复。', { itemByMap: { upper: 'conifer-mushroom', lower: 'hardwood-mushroom' } }),
  'wood-fungus': resource('wood-fungus', '朽木平菇', 'wood-mushroom', 3, 1.8, 300, '从朽木上长出一簇浅色扇形菌盖。'),
  'shelf-fungus': resource('shelf-fungus', '树干上的硫磺菌', 'shelf-mushroom', 3, 1.8, 340, '阔叶树干上的破损处长出橙黄色菌架。'),
  'wood-ear': resource('wood-ear', '朽木上的木耳', 'wood-ear', 3, 1.8, 300, '潮湿的朽木侧面长出卷边的小耳片。'),
  'tree-fruit': resource('tree-fruit', '唐棣果枝', 'serviceberry', 4, 1.6, 330, '六月莓成串挂在唐棣外侧的细枝上。'),
  berry: resource('berry', '林缘果丛', 'forest-berry', 4, 1.4, 300, '较有光的林窗结果；可带回补给架晾成果干。', { itemByMap: { upper: 'red-forest-berry', lower: 'blue-forest-berry' } }),
  nut: resource('nut', '成熟坚果', 'forest-nut', 3, 1.6, 420, '带壳原料要回补给架处理，成熟供应有上限。'),
  resin: resource('resin', '树脂挂点', 'tree-resin', 2, 2.2, 480, '缓慢积累的小份材料，逐树保留采集状态。'),
  branch: resource('branch', '可取枝料', 'branch', 3, 1.5, 300, '普通小枝料可携带、打捆，或回补给架劈成引火柴。'),
  'long-timber': resource('long-timber', '定额长材回收点', 'wood', 1, 5, null, '回收一根长材消耗共享额度，原地落料；交付前只阻止本来源林区继续回收。', { destination: 'ground', timberCost: 1 }),
  'curved-branch': resource('curved-branch', '弯曲枝料', 'branch', 2, 2, 420, '保留弯曲规格的小木作材料，打捆只减少空间，不减少重量。'),
  seed: resource('seed', '林木种源', 'forest-seed', 2, 1.6, 480, '采集并寄存种源；本样区尚未开放定植树位。'),
  sap: resource('sap', '树液收取点', 'sap-filled-can', 2, 2.4, 420, '先在补给架领取空收液罐；收取会装满罐，熬制会返还空罐。'),
};
export const EXPEDITION_RESOURCE_DEFINITIONS = EXPEDITION_RESOURCES;
export function expeditionResourceItem(role: ExpeditionResourceRole, mapId: ExpeditionMapId): string {
  const definition = EXPEDITION_RESOURCES[role];
  return definition.itemByMap?.[mapId] ?? definition.itemId;
}

export type ExpeditionRecipe = {
  id: string; name: string; durationSeconds: number; description: string;
  inputs: readonly { itemIds: readonly string[]; quantity: number; label: string }[];
  outputs: readonly { itemId: string; quantity: number }[];
};
export const EXPEDITION_RECIPES: readonly ExpeditionRecipe[] = [
  { id: 'dry-mushrooms', name: '晾制菌干', durationSeconds: 8, description: '三份鲜菌制成两份轻便菌干。', inputs: [{ itemIds: ['mushroom', 'conifer-mushroom', 'hardwood-mushroom', 'wood-mushroom', 'shelf-mushroom', 'wood-ear'], quantity: 3, label: '鲜菌' }], outputs: [{ itemId: 'dried-mushroom', quantity: 2 }] },
  { id: 'dry-fruit', name: '晾制果干', durationSeconds: 8, description: '三份林果制成两份果干，减轻返程的体积负担。', inputs: [{ itemIds: ['forest-berry', 'blue-forest-berry', 'red-forest-berry', 'serviceberry'], quantity: 3, label: '林果' }], outputs: [{ itemId: 'dried-forest-fruit', quantity: 2 }] },
  { id: 'prepare-nuts', name: '处理坚果储粮', durationSeconds: 7, description: '去壳并完成所需处理，三份原料制成两份储粮。', inputs: [{ itemIds: ['forest-nut'], quantity: 3, label: '坚果' }], outputs: [{ itemId: 'nut-rations', quantity: 2 }] },
  { id: 'split-kindling', name: '劈制引火柴', durationSeconds: 4, description: '一份枝料向下加工成三份燃料；燃料不能变回结构木。', inputs: [{ itemIds: ['branch'], quantity: 1, label: '枝料' }], outputs: [{ itemId: 'scrap-fuel', quantity: 3 }] },
  { id: 'boil-sap', name: '熬制树液糖浆', durationSeconds: 10, description: '消耗一罐树液与两份柴，收好糖浆并取回空罐。', inputs: [{ itemIds: ['sap-filled-can'], quantity: 1, label: '树液罐' }, { itemIds: ['scrap-fuel'], quantity: 2, label: '引火柴' }], outputs: [{ itemId: 'forest-syrup', quantity: 1 }, { itemId: 'sap-can', quantity: 1 }] },
];

export const EXPEDITION_RULES = {
  schemaVersion: 2 as const, storageRange: 4.2, sourceRange: 2.4, timberAllowance: 3,
  /** All three sample plots share one allowance; finite timber sources never recover. */
  mapIds: ['upper', 'mixed', 'lower'] as const,
};
