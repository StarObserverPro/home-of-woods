import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/content/items.ts';
import { ITEM_TAXONOMY } from '../src/content/item-types.ts';
import { createItemCatalog } from '../src/domain/item-catalog.ts';
import { createGatheringRegistry } from '../src/domain/gathering-registry.ts';
import { RUNTIME_MODELS } from '../src/content/assets.ts';
import { createState } from '../src/domain/state.ts';
import { inventoryCandidate } from '../src/domain/inventory.ts';
import { warehouseSnapshot } from '../src/domain/warehouse-view.ts';
import { createSaveContext } from '../src/domain/save-context.ts';
import { serializeWorldSave, prepareWorldSave } from '../src/domain/world-save.ts';
import { forestrySnapshot } from '../src/domain/forestry.ts';

test('new items inherit their type uses without enumerating item IDs or changing a world save', async () => {
  const wood = ITEMS.find(item => item.itemId === 'wood')!;
  const items = [...ITEMS, { ...wood, itemId: 'compat.sample-log', materialId: 'wood.sample' }];
  const taxonomy = { ...ITEM_TAXONOMY, materials: [...ITEM_TAXONOMY.materials, { materialId: 'wood.sample', name: '测试材质', categoryIds: ['wood'] }] };
  const registry = createGatheringRegistry({ assetIds: RUNTIME_MODELS.map(asset => asset.assetId), items, taxonomy });
  const state = createState(); state.inventory = inventoryCandidate(state.inventory, 'compat.sample-log', 4, 'fine', registry.catalog);
  const view = warehouseSnapshot(state, registry), sample = view.items.find(item => item.itemId === 'compat.sample-log')!;
  assert.equal(sample.typeName, '原木'); assert.deepEqual(sample.uses, ['结构木作']); assert.equal(sample.materialName, '测试材质');
  assert.equal(forestrySnapshot(state, createSaveContext().trees, registry.catalog).wood, 4, 'HUD counts the log type rather than one hardcoded item ID');
  const context = createSaveContext(), raw = await serializeWorldSave(createState(), context, { sequence: 1, savedAt: 0 });
  assert.equal((await prepareWorldSave(raw, createSaveContext(undefined, registry))).decision, 'restored');
  assert.equal(await serializeWorldSave(createState(), createSaveContext(undefined, registry), { sequence: 1, savedAt: 0 }), raw);
});

test('category, type, form, material and common-use references reject mismatches and structural-wood leakage', () => {
  const branch = ITEMS[0];
  for (const patch of [{ typeId: 'missing' }, { category: 'forest-produce' }, { formId: 'log' }, { materialId: 'missing' }]) {
    assert.throws(() => createItemCatalog([{ ...branch, ...patch }]), /type\/category\/form\/material/);
  }
  assert.throws(() => createItemCatalog(ITEMS, undefined, { ...ITEM_TAXONOMY, types: ITEM_TAXONOMY.types.map(type => type.typeId === branch.typeId ? { ...type, useGroupIds: ['structure-woodwork'] } : type) }), /use-group/);
  assert.throws(() => createItemCatalog(ITEMS, undefined, { ...ITEM_TAXONOMY, types: ITEM_TAXONOMY.types.map(type => ({ ...type, useGroupIds: ['missing'] })) }), /use-group/);
});

test('warehouse category navigation comes from the registry, not a fixed UI enum', () => {
  const taxonomy = { ...ITEM_TAXONOMY, categories: [...ITEM_TAXONOMY.categories, { categoryId: 'compat-material', name: '测试材料' }],
    materials: [...ITEM_TAXONOMY.materials, { materialId: 'compat.material', name: '测试材质', categoryIds: ['compat-material'] }],
    types: [...ITEM_TAXONOMY.types, { ...ITEM_TAXONOMY.types[0], typeId: 'compat.type', categoryId: 'compat-material' }] };
  const registry = createGatheringRegistry({ assetIds: RUNTIME_MODELS.map(asset => asset.assetId), taxonomy,
    items: [...ITEMS, { ...ITEMS[0], itemId: 'compat.item', materialId: 'compat.material', category: 'compat-material', typeId: 'compat.type' }] });
  const view = warehouseSnapshot(createState(), registry);
  assert.ok(view.categories.some(category => category.id === 'compat-material'));
  assert.equal(view.items.find(item => item.itemId === 'compat.item')!.category, 'compat-material');
});
