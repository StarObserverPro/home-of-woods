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
  categories: [{ categoryId: 'wood', name: '木料' }, { categoryId: 'forest-produce', name: '林产' }, { categoryId:'camp-supplies',name:'营地配件' }, { categoryId:'food',name:'食物' }, { categoryId:'provisions',name:'食品补给' }, { categoryId:'daily-consumables',name:'生活耗材' }],
  materials: [
    { materialId: 'wood.unspecified', name: '未细分木材', categoryIds: ['wood'] },
    { materialId: 'fungus.unspecified', name: '未细分菌类', categoryIds: ['forest-produce'] },
    { materialId:'supplier.fabric',name:'商人布料',categoryIds:['camp-supplies'] },
    { materialId:'supplier.metal',name:'商人五金',categoryIds:['camp-supplies'] },
    { materialId:'supplier.food',name:'商人干粮',categoryIds:['provisions','food'] },
    { materialId:'supplier.personal',name:'日用杂货',categoryIds:['daily-consumables'] },
    { materialId:'food.prepared',name:'熟食',categoryIds:['food'] },
  ],
  useGroups: [
    { useGroupId: 'fuel', name: '生火燃料', resourceLines: ['small-wood'], status: 'planned' },
    { useGroupId: 'light-repair', name: '轻型修缮', resourceLines: ['small-wood'], status: 'planned' },
    { useGroupId: 'small-woodwork', name: '小木作', resourceLines: ['small-wood'], status: 'planned' },
    { useGroupId: 'structure-woodwork', name: '结构木作', resourceLines: ['structure-wood'], status: 'planned' },
    { useGroupId: 'forest-preservation', name: '林产保存', resourceLines: ['forest-produce'], status: 'planned' },
    { useGroupId: 'forest-goods', name: '林产交换', resourceLines: ['forest-produce'], status: 'planned' },
    { useGroupId:'camp-fitting',name:'营地外部改造',resourceLines:['trade-good'],status:'planned' },
    { useGroupId:'food-staple',name:'野炊主食',resourceLines:['trade-good'],status:'planned' },
    { useGroupId:'food-meal',name:'享用正餐',resourceLines:['forest-produce','trade-good'],status:'planned' },
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
    { typeId:'supply.rations',categoryId:'provisions',name:'旅粮',formId:'sack',resourceLine:'trade-good',useGroupIds:[] },
    { typeId:'supply.soap',categoryId:'daily-consumables',name:'手工皂',formId:'bar',resourceLine:'trade-good',useGroupIds:[] },
    { typeId:'supply.bath-salt',categoryId:'daily-consumables',name:'浴盐',formId:'jar',resourceLine:'trade-good',useGroupIds:[] },
    { typeId:'supply.paper-ink',categoryId:'daily-consumables',name:'纸墨',formId:'pack',resourceLine:'trade-good',useGroupIds:[] },
    { typeId:'supply.festival-spark',categoryId:'daily-consumables',name:'烟花',formId:'bundle',resourceLine:'trade-good',useGroupIds:[] },
    {typeId:'food.beans',categoryId:'food',name:'干豆',formId:'beans',resourceLine:'trade-good',useGroupIds:['food-staple']},
    {typeId:'food.oats',categoryId:'food',name:'燕麦',formId:'oats',resourceLine:'trade-good',useGroupIds:['food-staple']},
    {typeId:'food.rice',categoryId:'food',name:'米',formId:'rice',resourceLine:'trade-good',useGroupIds:['food-staple']},
    {typeId:'food.black-bread',categoryId:'food',name:'黑面包',formId:'black-bread',resourceLine:'trade-good',useGroupIds:['food-staple']},
    {typeId:'food.salt',categoryId:'food',name:'盐',formId:'salt',resourceLine:'trade-good',useGroupIds:['food-staple']},
    {typeId:'food.spice',categoryId:'food',name:'香料',formId:'spice',resourceLine:'trade-good',useGroupIds:['food-staple']},
    {typeId:'food.mushroom-soup',categoryId:'food',name:'菌菇杂粮汤',formId:'soup',resourceLine:'forest-produce',useGroupIds:['food-meal']},
    {typeId:'food.grain-porridge',categoryId:'food',name:'谷物粥',formId:'soup',resourceLine:'trade-good',useGroupIds:['food-meal']},
  ],
};
