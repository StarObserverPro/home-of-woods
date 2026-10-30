export type ItemDefinition = {
  itemId: string; name: string; category: 'wood' | 'forest-produce'; icon: string;
  tags: readonly string[]; description: string; source: string;
  resourceLine: 'small-wood' | 'structure-wood' | 'forest-produce';
  materialId: string; formId: string;
  status: 'active' | 'planned' | 'retired';
  defaultQualityId: string;
  symbol: 'branch' | 'mushroom' | 'wood';
};
export const ITEMS: readonly ItemDefinition[] = [
  { itemId: 'branch', name: '枝杈', category: 'wood', icon: '枝', tags: ['轻修缮', '小木作'], description: '从树下拾起的小型枝料，和建筑原木分别保管。', source: '对应树木的树下落枝', resourceLine: 'small-wood', status: 'active', materialId: 'wood.unspecified', formId: 'branch', defaultQualityId: 'ordinary', symbol: 'branch' },
  { itemId: 'mushroom', name: '蘑菇', category: 'forest-produce', icon: '菇', tags: ['森林物产'], description: '从树种对应的树下蘑菇圈采得。', source: '松下、栎下的蘑菇圈', resourceLine: 'forest-produce', status: 'active', materialId: 'fungus.unspecified', formId: 'fresh', defaultQualityId: 'ordinary', symbol: 'mushroom' },
  { itemId: 'wood', name: '原木', category: 'wood', icon: '木', tags: ['建筑木材', '限额采伐'], description: '合法采伐所得的原木，受年度体量额度约束。', source: '获准采伐的成熟经营树', resourceLine: 'structure-wood', status: 'active', materialId: 'wood.unspecified', formId: 'log', defaultQualityId: 'ordinary', symbol: 'wood' },
  { itemId: 'small-wood', name: '小木料', category: 'wood', icon: '料', tags: ['加工材料'], description: '枝杈整理后的候选材料，加工方式尚待接入。', source: '枝杈加工', resourceLine: 'small-wood', status: 'planned', materialId: 'wood.unspecified', formId: 'small-piece', defaultQualityId: 'ordinary', symbol: 'wood' },
  { itemId: 'dried-mushroom', name: '干蘑菇', category: 'forest-produce', icon: '干', tags: ['加工物产'], description: '蘑菇晾制后的候选物产，加工方式尚待接入。', source: '蘑菇加工', resourceLine: 'forest-produce', status: 'planned', materialId: 'fungus.unspecified', formId: 'dried', defaultQualityId: 'ordinary', symbol: 'mushroom' },
];
