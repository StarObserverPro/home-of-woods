import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS } from '../src/content/items.ts';
import { QUALITIES } from '../src/content/qualities.ts';
import { createItemCatalog } from '../src/domain/item-catalog.ts';
import { createInventory, inventoryCandidate, inventoryCount, inventoryTransaction, stackKey } from '../src/domain/inventory.ts';
import type { InventoryState } from '../src/domain/inventory.ts';
import { prepareInventoryPersistence, serializeInventory } from '../src/domain/inventory-persistence.ts';
import { createGatheringRegistry } from '../src/domain/gathering-registry.ts';
import { RUNTIME_MODELS } from '../src/content/assets.ts';
import { warehouseSnapshot } from '../src/domain/warehouse-view.ts';
import { createState } from '../src/domain/state.ts';
import { advanceForestry, chopRange, startChop } from '../src/domain/forestry.ts';
import { makeTrees } from '../src/world/layout.ts';
import { FORESTRY } from '../src/content/forestry.ts';

function load(raw: string): InventoryState {
  const result = prepareInventoryPersistence(raw);
  assert.notEqual(result.decision, 'protected');
  if (result.decision === 'protected') throw new Error(result.diagnostics.join(';'));
  return result.value;
}
const registry = createGatheringRegistry({ assetIds: RUNTIME_MODELS.map(asset => asset.assetId) });

test('ordinary, fine and legacy ungraded stacks merge only within the same identity', () => {
  let inventory = load(JSON.stringify({ schemaVersion: 4, stacks: [{itemId:'mushroom',qualityId:'ungraded',quantity:4}] }));
  inventory = inventoryTransaction(inventory, [
    { itemId: 'mushroom', qualityId: 'ordinary', delta: 3 },
    { itemId: 'mushroom', qualityId: 'fine', delta: 2 },
  ]);
  inventory = inventoryCandidate(inventory, 'mushroom', 1, 'ordinary');
  assert.equal(inventory.stacks.length, 3);
  assert.equal(inventoryCount(inventory, 'mushroom', 'ordinary'), 4);
  assert.equal(inventoryCount(inventory, 'mushroom', 'fine'), 2);
  assert.equal(inventoryCount(inventory, 'mushroom', 'ungraded'), 4);
  assert.equal(inventoryCount(inventory, 'mushroom'), 10);
  assert.deepEqual(load(serializeInventory(inventory)).stacks, inventory.stacks);
  const view = warehouseSnapshot({ inventory }, registry);
  assert.equal(view.occupiedKinds, 1);
  assert.equal(view.items.filter(item => item.itemId === 'mushroom').length, 3);
  assert.equal(new Set(view.items.map(item => item.key)).size, view.items.length);
});

test('multi-line debits are atomic, cannot use their own output to fund inputs, and reject stale revisions', () => {
  const state = inventoryCandidate(createInventory(), 'branch', 3, 'ordinary');
  const before = JSON.stringify(state);
  for (const lines of [
    [{ itemId: 'branch', qualityId: 'ordinary', delta: -2 }, { itemId: 'mushroom', qualityId: 'fine', delta: -1 }],
    [{ itemId: 'branch', qualityId: 'ordinary', delta: -2 }, { itemId: 'branch', qualityId: 'ordinary', delta: -2 }, { itemId: 'branch', qualityId: 'ordinary', delta: 1 }],
    [{ itemId: 'branch', qualityId: 'fine', delta: -1 }],
  ]) assert.throws(() => inventoryTransaction(state, lines), /Insufficient/);
  assert.throws(() => inventoryTransaction(state, [], undefined, state.revision - 1), /Stale/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(inventoryCount(inventoryCandidate(state, 'branch', -3, 'ordinary'), 'branch'), 0);
  assert.equal(state.stacks.length, 1);
});

test('catalog additions, reorder and display edits neither migrate nor rewrite owned identities', () => {
  const raw = serializeInventory(inventoryCandidate(createInventory(), 'mushroom', 6, 'fine'));
  const catalog = createItemCatalog([
    { ...ITEMS[0], itemId: 'future.material', name: '未来材料' },
    ...[...ITEMS].reverse().map(item => ({ ...item, name: '改名后的' + item.name })),
  ], [...QUALITIES].reverse());
  const loaded = prepareInventoryPersistence(raw);
  assert.equal(loaded.decision, 'restored');
  if (loaded.decision === 'protected') return;
  assert.equal(serializeInventory(loaded.value), raw);
  assert.equal(inventoryCount(loaded.value, 'future.material'), 0);
  assert.equal(catalog.items.get('mushroom')!.materialId, 'fungus.unspecified');
  assert.throws(() => createItemCatalog([...ITEMS, ITEMS[0]]), /Duplicate/);
  assert.throws(() => createItemCatalog(ITEMS, [...QUALITIES, QUALITIES[0]]), /Duplicate/);
});

test('unknown item and quality records survive normal transactions and JSON reload, but cannot be consumed', () => {
  const state = load(JSON.stringify({ schemaVersion: 4, stacks: [
    { itemId: 'future.material', qualityId: 'fine', quantity: 8 },
    { itemId: 'branch', qualityId: 'future-grade', quantity: 5 },
  ] }));
  const view = warehouseSnapshot({ inventory: state }, registry);
  assert.equal(view.items.filter(item => !item.recognized).length, 2);
  assert.ok(view.items.filter(item => !item.recognized).every(item => item.processing.length === 0 && item.category === 'unknown'));
  for (const stack of state.stacks) assert.throws(() => inventoryCandidate(state, stack.itemId, -1, stack.qualityId), /Unrecognized/);
  const next = inventoryCandidate(state, 'mushroom', 2, 'ordinary');
  const restored = load(serializeInventory(next));
  for (const stack of state.stacks) assert.deepEqual(restored.stacks.find(item => stackKey(item) === stackKey(stack)), stack);
  const expandedRegistry = createGatheringRegistry({
    assetIds: RUNTIME_MODELS.map(asset => asset.assetId),
    items: [...ITEMS, { ...ITEMS[0], itemId: 'future.material' }],
    qualities: [...QUALITIES, { qualityId: 'future-grade', name: '未来等级', rank: 2 }],
  });
  assert.ok(warehouseSnapshot({ inventory: restored }, expandedRegistry).items.every(item => item.recognized));
  assert.equal(serializeInventory(inventoryCandidate(restored, 'branch', -1, 'future-grade', expandedRegistry.catalog)).includes('future.material'), true);
});

test('retired definitions preserve owned stock, allow explicit consumption and cannot be newly awarded', () => {
  const state = inventoryCandidate(createInventory(), 'mushroom', 3, 'ordinary');
  const catalog = createItemCatalog(ITEMS.map(item => item.itemId === 'mushroom' ? { ...item, status: 'retired' } : item));
  assert.equal(inventoryCount(inventoryCandidate(state, 'mushroom', -1, 'ordinary', catalog), 'mushroom'), 2);
  assert.throws(() => inventoryCandidate(state, 'mushroom', 1, 'ordinary', catalog), /Inactive/);
  assert.equal(inventoryCount(load(serializeInventory(state)), 'mushroom'), 3);
});

test('felling awards only ordinary stock once; inventory failure cannot partially spend quota or fell a tree', () => {
  const trees = makeTrees(), tree = trees.find(item => item.role === 'managed')!, byId = new Map(trees.map(item => [item.id, item]));
  for (const overflow of [false, true]) {
    const state = createState(trees);
    state.player.x = tree.x + chopRange(tree) - .1; state.player.z = tree.z; state.selected = tree.id;
    if (overflow) state.inventory = inventoryCandidate(state.inventory, 'wood', Number.MAX_SAFE_INTEGER, 'ordinary');
    assert.ok(startChop(state, tree).ok);
    state.time = FORESTRY.chopSeconds;
    const before = JSON.stringify(state);
    if (overflow) {
      assert.throws(() => advanceForestry(state, byId), /quantity|overflow/);
      assert.equal(JSON.stringify(state), before);
    } else {
      advanceForestry(state, byId);
      const quantity = inventoryCount(state.inventory, 'wood', 'ordinary');
      assert.ok(quantity > 0);
      assert.equal(inventoryCount(state.inventory, 'wood', 'fine'), 0);
      advanceForestry(state, byId);
      assert.equal(inventoryCount(state.inventory, 'wood'), quantity);
      assert.equal(state.forestry.completedActions.length, 1);
    }
  }
});
