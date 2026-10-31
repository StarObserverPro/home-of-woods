import type { GatheringRegistry } from './gathering-registry.ts';
import type { InventoryState, InventoryStack } from './inventory.ts';
import { recognizedStack, stackKey } from './inventory.ts';
export type WarehouseItemView = {
  key: string; itemId: string; qualityId: string; qualityName: string; recognized: boolean;
  name: string; icon: string; symbol: 'branch' | 'mushroom' | 'wood' | 'unknown'; category: string;
  typeName: string; materialName: string; uses: string[]; specification: string;
  quantity: number; description: string; source: string; tags: readonly string[];
  processing: { id: string; name: string; outputs: string[]; station: string; status: string; parametersReady: boolean }[];
};
export type WarehouseView = { categories: { id: string; name: string }[]; items: WarehouseItemView[]; total: number; occupiedKinds: number };
export function warehouseSnapshot(state: { inventory: InventoryState }, registry: GatheringRegistry): WarehouseView {
  const owned = new Set(state.inventory.stacks.map(stack => stack.itemId));
  const stacks: InventoryStack[] = [...state.inventory.stacks, ...[...registry.items.values()]
    .filter(item => item.status === 'active' && !owned.has(item.itemId))
    .map(item => ({ itemId: item.itemId, qualityId: item.defaultQualityId, quantity: 0 }))];
  const items: WarehouseItemView[] = stacks.map(stack => {
    const item = registry.items.get(stack.itemId), quality = registry.catalog.qualities.get(stack.qualityId);
    const recognized = recognizedStack(stack, registry.catalog);
    const type = item && registry.catalog.types.get(item.typeId);
    return {
    specification: item?.category !== 'wood' ? '' : stack.itemId === 'scrap-fuel' ? '燃料份数，不作单件规格用料' : stack.wood?.spec ? `${stack.wood.spec.lengthMm} mm 长 · ${stack.wood.spec.thicknessMm} mm 直径 · ${{straight:'顺直',curved:'弯曲',crooked:'曲折'}[stack.wood.spec.straightness]}` : '长度、粗细、顺直程度未测定',
    key: stackKey(stack), itemId: stack.itemId, qualityId: stack.qualityId,
    qualityName: quality?.name ?? '未知品质', recognized,
    name: item?.name ?? '未识别物品', icon: item?.icon ?? '？', symbol: item?.symbol ?? 'unknown',
    category: recognized ? item!.category : 'unknown',
    typeName: recognized ? type!.name : '待识别',
    materialName: recognized ? registry.catalog.materials.get(item!.materialId)!.name : '',
    uses: recognized ? type!.useGroupIds.map(id => registry.catalog.useGroups.get(id)!.name) : [],
    description: recognized ? item!.description : '暂时无法识别这份物品。原有数量已保留，当前不可用于加工或交易。',
    source: recognized ? item!.source : '保留的库存记录',
    tags: recognized ? [...item!.tags, ...(item!.status === 'retired' ? ['旧版物品'] : [])] : ['待识别', '暂不可用'],
    quantity: stack.quantity,
    processing: recognized ? registry.processing.forItem(stack.itemId).map(p => ({ id: p.processingId, name: p.name,
      outputs: p.outputs.map(o => registry.items.get(o.itemId)!.name), station: p.station,
      status: p.status === 'planned' ? '后续开放' : '已登记', parametersReady: p.durationSeconds !== null && [...p.inputs,...p.outputs].every(m=>m.quantity!==null),
    })) : [],
  }; });
  return { categories: [...registry.catalog.categories.values()].map(category => ({ id: category.categoryId, name: category.name })), items, total: items.reduce((sum,i)=>sum+i.quantity,0), occupiedKinds: new Set(items.filter(i=>i.quantity>0).map(i=>i.itemId)).size };
}
