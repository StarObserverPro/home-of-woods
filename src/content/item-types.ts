import type { ItemDefinition } from './items.ts';
export type ItemCategory = { categoryId: string; name: string };
export type ItemMaterial = { materialId: string; name: string; categoryIds: readonly string[] };
export type ItemUseGroup = { useGroupId: string; name: string; resourceLines: readonly ItemDefinition['resourceLine'][]; status: 'planned' };
export type ItemType = {
  typeId: string; categoryId: string; name: string; formId: string;
  resourceLine: ItemDefinition['resourceLine']; useGroupIds: readonly string[];
};
export type ItemTaxonomy = { categories: readonly ItemCategory[]; materials: readonly ItemMaterial[]; types: readonly ItemType[]; useGroups: readonly ItemUseGroup[] };
export const ITEM_TAXONOMY: ItemTaxonomy = {
  categories: [{ categoryId: 'wood', name: '木料' }, { categoryId: 'forest-produce', name: '林产' }, { categoryId:'camp-supplies',name:'营地配件' }],
  materials: [
    { materialId: 'wood.unspecified', name: '未细分木材', categoryIds: ['wood'] },
    { materialId: 'fungus.unspecified', name: '未细分菌类', categoryIds: ['forest-produce'] },
    { materialId:'supplier.fabric',name:'商人布料',categoryIds:['camp-supplies'] },
    { materialId:'supplier.metal',name:'商人五金',categoryIds:['camp-supplies'] },
  ],
  useGroups: [
    { useGroupId: 'fuel', name: '生火燃料', resourceLines: ['small-wood'], status: 'planned' },
    { useGroupId: 'light-repair', name: '轻型修缮', resourceLines: ['small-wood'], status: 'planned' },
    { useGroupId: 'small-woodwork', name: '小木作', resourceLines: ['small-wood'], status: 'planned' },
    { useGroupId: 'structure-woodwork', name: '结构木作', resourceLines: ['structure-wood'], status: 'planned' },
    { useGroupId: 'forest-preservation', name: '林产保存', resourceLines: ['forest-produce'], status: 'planned' },
    { useGroupId: 'forest-goods', name: '林产交换', resourceLines: ['forest-produce'], status: 'planned' },
    { useGroupId:'camp-fitting',name:'营地外部改造',resourceLines:['trade-good'],status:'planned' },
  ],
  types: [
    { typeId: 'wood.scrap', categoryId: 'wood', name: '碎柴', formId: 'scrap', resourceLine: 'small-wood', useGroupIds: ['fuel'] },
    { typeId: 'wood.branch', categoryId: 'wood', name: '枝料', formId: 'branch', resourceLine: 'small-wood', useGroupIds: ['light-repair', 'small-woodwork'] },
    { typeId: 'wood.log', categoryId: 'wood', name: '原木', formId: 'log', resourceLine: 'structure-wood', useGroupIds: ['structure-woodwork'] },
    { typeId: 'wood.small-piece', categoryId: 'wood', name: '小木料', formId: 'small-piece', resourceLine: 'small-wood', useGroupIds: ['light-repair', 'small-woodwork'] },
    { typeId: 'fungus.fresh', categoryId: 'forest-produce', name: '鲜菌类', formId: 'fresh', resourceLine: 'forest-produce', useGroupIds: ['forest-preservation', 'forest-goods'] },
    { typeId: 'fungus.dried', categoryId: 'forest-produce', name: '干菌类', formId: 'dried', resourceLine: 'forest-produce', useGroupIds: ['forest-goods'] },
    { typeId:'supply.canvas',categoryId:'camp-supplies',name:'帐篷帆布',formId:'roll',resourceLine:'trade-good',useGroupIds:['camp-fitting'] },
    { typeId:'supply.hardware',categoryId:'camp-supplies',name:'火塘五金',formId:'kit',resourceLine:'trade-good',useGroupIds:['camp-fitting'] },
  ],
};
