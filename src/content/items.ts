export type ItemDefinition = {
  itemId: string; name: string; category: string; typeId: string; icon: string;
  tags: readonly string[
  {itemId:'trail-rations',typeId:'supply.rations',name:'常备粮袋',category:'provisions',icon:'粮',tags:['行商常备','基础补给'],description:'扎紧口的干粮袋。食品使用与营养规则以后再开放。',source:'林间行商',resourceLine:'trade-good',status:'active',materialId:'supplier.food',formId:'sack',defaultQualityId:'ordinary',symbol:'bundle'},
  {itemId:'merchant-soap',typeId:'supply.soap',name:'手工皂',category:'daily-consumables',icon:'皂',tags:['生活耗材'],description:'可为以后澡堂互动提供消耗品，当前只是入库物资。',source:'林间行商',resourceLine:'trade-good',status:'active',materialId:'supplier.personal',formId:'bar',defaultQualityId:'ordinary',symbol:'bundle'},
  {itemId:'bath-salt',typeId:'supply.bath-salt',name:'浴盐',category:'daily-consumables',icon:'盐',tags:['生活耗材'],description:'洗浴用的香盐，使用效果待接线。',source:'林间行商',resourceLine:'trade-good',status:'active',materialId:'supplier.personal',formId:'jar',defaultQualityId:'ordinary',symbol:'bundle'},
  {itemId:'paper-ink',typeId:'supply.paper-ink',name:'纸墨包',category:'daily-consumables',icon:'墨',tags:['生活耗材'],description:'小本纸张和墨水，后续可连接便条、图纸工坊。',source:'林间行商',resourceLine:'trade-good',status:'active',materialId:'supplier.personal',formId:'pack',defaultQualityId:'ordinary',symbol:'bundle'},
  {itemId:'festival-spark',typeId:'supply.festival-spark',name:'小烟花',category:'daily-consumables',icon:'火',tags:['节庆装饰'],description:'尚未添加放烟花的场景效果，只作为收藏耗材。',source:'林间行商',resourceLine:'trade-good',status:'active',materialId:'supplier.personal',formId:'bundle',defaultQualityId:'ordinary',symbol:'bundle'},
]; description: string; source: string;
  resourceLine: 'small-wood' | 'structure-wood' | 'forest-produce' | 'trade-good';
  materialId: string; formId: string;
  status: 'active' | 'planned' | 'retired';
  defaultQualityId: string;
  symbol: 'branch' | 'mushroom' | 'wood' | 'bundle';
};
export const ITEMS: readonly ItemDefinition[] = [
  { itemId: 'scrap-fuel', typeId: 'wood.scrap', name: '碎柴', category: 'wood', icon: '柴', tags: ['仅燃料'], description: '地面拾起的零碎枯柴，只能生火，不能用于制造或整理成木料。', source: '地面碎柴堆', resourceLine: 'small-wood', status: 'active', materialId: 'wood.unspecified', formId: 'scrap', defaultQualityId: 'ordinary', symbol: 'branch' },
  { itemId: 'branch', typeId: 'wood.branch', name: '枝杈', category: 'wood', icon: '枝', tags: ['轻修缮', '小木作'], description: '上树采得的小型枝料，按长度、粗细和顺直程度分别保管。', source: '对应树木的树冠枝杈', resourceLine: 'small-wood', status: 'active', materialId: 'wood.unspecified', formId: 'branch', defaultQualityId: 'ordinary', symbol: 'branch' },
  { itemId: 'mushroom', typeId: 'fungus.fresh', name: '蘑菇', category: 'forest-produce', icon: '菇', tags: ['森林物产'], description: '从树种对应的树下蘑菇圈采得。', source: '松下、栎下的蘑菇圈', resourceLine: 'forest-produce', status: 'active', materialId: 'fungus.unspecified', formId: 'fresh', defaultQualityId: 'ordinary', symbol: 'mushroom' },
  { itemId: 'wood', typeId: 'wood.log', name: '原木', category: 'wood', icon: '木', tags: ['建筑木材', '限额采伐'], description: '合法采伐所得的原木，受年度体量额度约束。', source: '获准采伐的成熟经营树', resourceLine: 'structure-wood', status: 'active', materialId: 'wood.unspecified', formId: 'log', defaultQualityId: 'ordinary', symbol: 'wood' },
  { itemId: 'small-wood', typeId: 'wood.small-piece', name: '小木料', category: 'wood', icon: '料', tags: ['加工材料'], description: '枝杈整理后的候选材料，加工方式尚待接入。', source: '枝杈加工', resourceLine: 'small-wood', status: 'planned', materialId: 'wood.unspecified', formId: 'small-piece', defaultQualityId: 'ordinary', symbol: 'wood' },
  { itemId: 'dried-mushroom', typeId: 'fungus.dried', name: '干蘑菇', category: 'forest-produce', icon: '干', tags: ['加工物产'], description: '蘑菇晾制后的候选物产，加工方式尚待接入。', source: '蘑菇加工', resourceLine: 'forest-produce', status: 'planned', materialId: 'fungus.unspecified', formId: 'dried', defaultQualityId: 'ordinary', symbol: 'mushroom' },
  { itemId:'canvas-roll',typeId:'supply.canvas',name:'耐雨帆布卷',category:'camp-supplies',icon:'布',tags:['行商货物','帐篷外装'],description:'行商带来的苔绿帆布及包边，能替换原来的帐面。不是从蘑菇直接制作的。',source:'在林间行商处用 2 份鲜蘑菇交换',resourceLine:'trade-good',status:'active',materialId:'supplier.fabric',formId:'roll',defaultQualityId:'ordinary',symbol:'bundle' },
  { itemId:'hardware-kit',typeId:'supply.hardware',name:'火塘五金包',category:'camp-supplies',icon:'铁',tags:['行商货物','篝火附件'],description:'包含烤网或焖烤罩所需的金属零件；木制支架和上部附件分开制作。',source:'在林间行商处用 1 根原木交换',resourceLine:'trade-good',status:'active',materialId:'supplier.metal',formId:'kit',defaultQualityId:'ordinary',symbol:'bundle' },
];
