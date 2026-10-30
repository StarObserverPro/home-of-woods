import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/domain/state.ts';
import type { GameState } from '../src/domain/state.ts';
import { createSaveContext } from '../src/domain/save-context.ts';
import { prepareWorldSave, serializeWorldSave } from '../src/domain/world-save.ts';
import { saveDigest } from '../src/domain/save-digest.ts';
import { createSaveController } from '../src/app/save-controller.ts';
import { MemorySaveStore } from './memory-save-store.ts';
import { inventoryCandidate, inventoryCount } from '../src/domain/inventory.ts';
import { createGatheringRegistry } from '../src/domain/gathering-registry.ts';
import { beginGather, synchronizeGatheringHosts } from '../src/domain/gathering.ts';
import { advancePlayerGather } from '../src/app/player-actions.ts';
import { startChop, advanceForestry, chopRange } from '../src/domain/forestry.ts';
import { makeTrees, makeColliders } from '../src/world/layout.ts';
import { RUNTIME_MODELS } from '../src/content/assets.ts';
import { GATHERABLES } from '../src/content/gatherables.ts';
import { FORESTRY } from '../src/content/forestry.ts';
import { upgradeWorldSession } from '../src/app/session-upgrade.ts';

const context = createSaveContext(), trees = makeTrees(), blockers = makeColliders(trees);
const meta = { sequence: 1, savedAt: 123.5 };
async function roundtrip(state: GameState, ctx = context) {
  const raw = await serializeWorldSave(state, ctx, meta), loaded = await prepareWorldSave(raw, ctx);
  assert.equal(loaded.decision, 'restored');
  if (loaded.decision !== 'restored' && loaded.decision !== 'migrated') throw new Error(loaded.diagnostics.join(';'));
  return loaded.value;
}
async function changed(raw: string, change: (saved: any) => void) {
  const saved = JSON.parse(raw); change(saved); const { checksum: ignored, ...core } = saved;
  return JSON.stringify({ ...core, checksum: await saveDigest(core) });
}
function nearTree() {
  const state = createState(), tree = trees.find(t => t.role === 'managed')!;
  state.player.x = tree.x + chopRange(tree) - .1; state.player.z = tree.z; state.selected = tree.id;
  return { state, tree };
}

test('whole world roundtrip preserves paths, time, grades, quota and source identities', async () => {
  const state = createState(); state.time = 18.125; state.player.facing = -.8;
  state.route = [{ x: -35, z: 3 }, { x: -34, z: 3 }];
  state.inventory = inventoryCandidate(state.inventory, 'mushroom', 3, 'fine');
  state.inventory.stacks.unshift({ itemId: 'future.material', qualityId: 'future-quality', quantity: 4 });
  const loaded = await roundtrip(state);
  assert.equal(loaded.inventory.revision, 0);
  assert.deepEqual(loaded, { ...state, inventory: { ...state.inventory, revision: 0 } });
  const raw = await serializeWorldSave(loaded, context, meta);
  assert.equal((await prepareWorldSave(JSON.stringify(JSON.parse(raw), null, 2), context)).decision, 'restored');
});

test('world serialization captures before asynchronous hashing, never mixes two resource states', async () => {
  const state = createState(), encoding = serializeWorldSave(state, context, meta);
  state.inventory = inventoryCandidate(state.inventory, 'branch', 3, 'ordinary'); state.time = 50;
  const loaded = await prepareWorldSave(await encoding, context);
  assert.equal(loaded.decision, 'restored');
  if ('value' in loaded) { assert.equal(loaded.value.time, 0); assert.equal(inventoryCount(loaded.value.inventory, 'branch'), 0); }
});

test('a pending collection resumes its frozen result and settles once through repeated reloads', async () => {
  const registry = createGatheringRegistry({ assetIds: RUNTIME_MODELS.map(a => a.assetId), definitions: GATHERABLES.map(d => ({ ...d, durationSeconds: 2 })) });
  const ctx = createSaveContext(trees, registry), state = createState(), source = [...registry.sources.values()][0];
  state.player = { ...state.player, x: source.x - 1, z: source.z }; state.selected = source.sourceId;
  assert.ok(beginGather(state, source.sourceId, registry, blockers).ok);
  advancePlayerGather(state, registry, blockers); state.time = 1; advancePlayerGather(state, registry, blockers);
  const loaded = await roundtrip(state, ctx);
  assert.equal(loaded.gathering.action!.phase, 'performing'); assert.equal(loaded.gathering.action!.progress, .5);
  assert.equal(inventoryCount(loaded.inventory, 'branch'), 0);
  // Later catalog tuning does not change the already-started duration or reward.
  const newer = createGatheringRegistry({ assetIds: RUNTIME_MODELS.map(a => a.assetId), definitions: GATHERABLES.map(d => ({ ...d, durationSeconds: 9, yieldPerUnit: 99 })) });
  loaded.time = 2; assert.match(advancePlayerGather(loaded, newer, blockers)!, /3/);
  const again = await roundtrip(loaded, createSaveContext(trees, newer));
  assert.equal(inventoryCount(again.inventory, 'branch'), 3);
  assert.equal(again.gathering.sources[source.sourceId].remaining, 0);
  assert.equal(advancePlayerGather(again, newer, blockers), null);
  assert.equal(beginGather(again, source.sourceId, newer, blockers).ok, false);
  assert.equal(inventoryCount(again.inventory, 'branch'), 3);
});

test('approaching actions and routes resume without replenishing their resource pool', async () => {
  const state = createState(), source = [...context.registry.sources.values()][0]; state.selected = source.sourceId;
  assert.ok(beginGather(state, source.sourceId, context.registry, blockers).ok);
  assert.ok(state.route.length > 0);
  const loaded = await roundtrip(state);
  assert.deepEqual(loaded.route, state.route); assert.equal(loaded.gathering.action!.phase, 'approaching');
  assert.deepEqual(loaded.gathering.sources, state.gathering.sources);
});

test('reserved chopping, committed falling, stump and new generation restore without another wood award', async () => {
  const { state, tree } = nearTree(); assert.ok(startChop(state, tree).ok);
  state.time = FORESTRY.chopSeconds / 2;
  let loaded = await roundtrip(state); const cost = loaded.forestry.active!.cost;
  assert.equal(loaded.forestry.ledger.reserved, cost); assert.equal(inventoryCount(loaded.inventory, 'wood'), 0);
  loaded.time = FORESTRY.chopSeconds; advanceForestry(loaded, context.trees); synchronizeGatheringHosts(loaded, context.registry);
  loaded = await roundtrip(loaded);
  assert.equal(loaded.forestry.active!.phase, 'falling'); assert.equal(inventoryCount(loaded.inventory, 'wood'), cost);
  assert.equal(loaded.forestry.ledger.reserved, 0); assert.equal(loaded.forestry.ledger.used, cost);
  loaded.time += FORESTRY.fallSeconds + .01; advanceForestry(loaded, context.trees); synchronizeGatheringHosts(loaded, context.registry);
  loaded = await roundtrip(loaded); assert.equal(loaded.forestry.slots[tree.id].status, 'stump');
  loaded.time = loaded.forestry.slots[tree.id].regrowAt!; advanceForestry(loaded, context.trees); synchronizeGatheringHosts(loaded, context.registry);
  const sapling = await roundtrip(loaded);
  assert.equal(sapling.forestry.slots[tree.id].generation, 1); assert.equal(sapling.forestry.slots[tree.id].status, 'sapling');
  assert.equal(inventoryCount(sapling.inventory, 'wood'), cost);
  for (const source of context.registry.sources.values()) if (source.hostRef?.slotId === tree.id) {
    assert.equal(sapling.gathering.sources[source.sourceId].remaining, 0); assert.equal(sapling.gathering.sources[source.sourceId].hostAvailable, false);
  }
  advanceForestry(sapling, context.trees); assert.equal(inventoryCount(sapling.inventory, 'wood'), cost);
});

test('invalid structures, checksums and cross-slice contradictions protect the exact raw data', async () => {
  const original = await serializeWorldSave(createState(), context, meta), treeId = context.trees.keys().next().value!, sourceId = context.registry.sources.keys().next().value!;
  const changes: ((saved: any) => void)[] = [
    saved => { saved.schemaVersion = 2; }, saved => { saved.layoutVersion = 'future'; },
    saved => { saved.world.future = 1; }, saved => { delete saved.world.gathering; },
    saved => { saved.world.time = -1; }, saved => { saved.world.seed++; },
    saved => { saved.world.forestry.ledger.reserved = 1; }, saved => { saved.world.forestry.ledger.used = 99; },
    saved => { saved.world.forestry.slots[treeId].individualId = 'wrong:g3'; },
    saved => { saved.world.gathering.sources[sourceId].remaining = 9; },
    saved => { saved.world.gathering.sources[sourceId].hostIndividualId = 'wrong:g0'; },
    saved => { saved.world.gathering.settled['gather-1'] = true; },
    saved => { saved.world.player.x = 9999; }, saved => { saved.world.route.push({ x: 1, z: 1, future: true }); },
    saved => { saved.world.selected = 'missing-target'; }, saved => { saved.world.inventory.stacks.push({ itemId: 'branch', qualityId: 'ordinary', quantity: .5 }); },
  ];
  const unsigned = JSON.parse(original); unsigned.world.time = 4;
  for (const raw of ['{bad JSON', JSON.stringify(unsigned), ...await Promise.all(changes.map(change => changed(original, change)))]) {
    const result = await prepareWorldSave(raw, context); assert.equal(result.decision, 'protected');
    if (result.decision === 'protected') assert.equal(result.raw, raw);
    assert.equal('value' in result, false);
  }
});

test('committed and uncommitted action markers cannot be interchanged to replay rewards', async () => {
  const { state, tree } = nearTree(); startChop(state, tree);
  const chopping = await serializeWorldSave(state, context, meta);
  const invalid = await changed(chopping, saved => { saved.world.forestry.completedActions.push(saved.world.forestry.active.id); });
  assert.equal((await prepareWorldSave(invalid, context)).decision, 'protected');
  state.time = FORESTRY.chopSeconds; advanceForestry(state, context.trees); synchronizeGatheringHosts(state, context.registry);
  const falling = await serializeWorldSave(state, context, meta);
  for (const change of [
    (s: any) => { s.world.forestry.completedActions = []; },
    (s: any) => { s.world.forestry.active.phase = 'chopping'; },
    (s: any) => { s.world.forestry.nextAction = 1; },
    (s: any) => { s.world.forestry.ledger.reserved = s.world.forestry.active.cost; },
  ]) assert.equal((await prepareWorldSave(await changed(falling, change), context)).decision, 'protected');
});

test('safe inventory migration stays writable in the whole-world envelope', async () => {
  const original = await serializeWorldSave(createState(), context, meta);
  const raw = await changed(original, saved => { saved.world.inventory = { version: 5, quantities: { mushroom: 4, branch: 0 } }; });
  const first = await prepareWorldSave(raw, context); assert.equal(first.decision, 'migrated');
  if ('value' in first) {
    assert.equal(inventoryCount(first.value.inventory, 'mushroom', 'ungraded'), 4);
    assert.equal((await prepareWorldSave(await serializeWorldSave(first.value, context, meta), context)).decision, 'restored');
  }
});

test('legacy in-memory session upgrades inventory and frozen actions in one root commit', () => {
  const { state, tree } = nearTree(); startChop(state, tree);
  delete (state.forestry.active as any).reward;
  (state as any).inventory = { version: 2, quantities: { mushroom: 3 } }; (state.forestry as any).wood = 5;
  upgradeWorldSession(state, context);
  assert.equal(inventoryCount(state.inventory, 'wood', 'ungraded'), 5);
  assert.deepEqual(state.forestry.active!.reward, { itemId: 'wood', qualityId: 'ordinary' });
  const invalid = structuredClone(state); (invalid as any).future = true;
  const before = JSON.stringify(invalid); assert.throws(() => upgradeWorldSession(invalid, context)); assert.equal(JSON.stringify(invalid), before);
});

test('automatic and manual saving preserve corrupt primary or backup until explicit valid-copy recovery', async () => {
  const raw = await serializeWorldSave(createState(), context, meta);
  for (const records of [{ primary: '{damaged', backup: raw }, { primary: raw, backup: '{damaged-backup' }]) {
    const store = new MemorySaveStore(); store.records = { ...records };
    const controller = createSaveController(store, context), loaded = await controller.load();
    assert.equal(controller.status().state, 'protected'); assert.equal(controller.status().canSave, false);
    const state = loaded ?? createState(); state.inventory = inventoryCandidate(state.inventory, 'branch', 99, 'ordinary');
    controller.observe(state); assert.equal(await controller.saveNow(state), false);
    assert.deepEqual(store.records, records); assert.equal(await controller.exportRaw('primary'), records.primary);
    const recovered = await controller.restoreValidCopy(); assert.ok(recovered); assert.equal(inventoryCount(recovered.inventory, 'branch'), 0);
    assert.equal(controller.status().state, 'saved');
    assert.equal((await prepareWorldSave(store.records.primary, context)).decision, 'restored');
  }
});

test('two writers compare both records atomically; the loser cannot overwrite the winner or its backup', async () => {
  const store = new MemorySaveStore(), a = createSaveController(store, context), b = createSaveController(store, context);
  await Promise.all([a.load(), b.load()]);
  const left = createState(), right = createState(); left.time = 3; right.time = 7;
  const results = await Promise.all([a.saveNow(left), b.saveNow(right)]); assert.equal(results.filter(Boolean).length, 1);
  const loser = results[0] ? b : a; assert.equal(loser.status().state, 'conflict');
  const before = { ...store.records }; assert.equal(await loser.saveNow(createState()), false); assert.deepEqual(store.records, before);
  assert.ok(await loser.reload()); assert.equal(loser.status().canSave, true);
});

test('storage failure preserves both records and read failure never becomes a writable new game', async () => {
  const store = new MemorySaveStore(), controller = createSaveController(store, context); await controller.load();
  const state = createState(); assert.equal(await controller.saveNow(state), true);
  const before = { ...store.records }; store.failWrite = true; state.time = 2;
  assert.equal(await controller.saveNow(state), false); assert.deepEqual(store.records, before); assert.equal(controller.status().state, 'failed');
  store.failWrite = false; assert.equal(await controller.saveNow(state), true); assert.equal(store.records.backup, before.primary);
  const reader = new MemorySaveStore(); reader.failRead = true; const bad = createSaveController(reader, context);
  assert.equal(await bad.load(), null); assert.equal(bad.status().canSave, false); assert.equal(await bad.saveNow(createState()), false); assert.equal(reader.writes, 0);
  reader.failRead = false; await bad.reload(); assert.equal(await bad.saveNow(createState()), true);
});

test('invalid live state cannot overwrite a valid checkpoint and backups are immutable snapshots', async () => {
  const store = new MemorySaveStore(), controller = createSaveController(store, context); await controller.load();
  const state = createState(); await controller.saveNow(state); const before = { ...store.records };
  (state as any).future = 42; assert.equal(await controller.saveNow(state), false); assert.equal(controller.status().state, 'protected'); assert.deepEqual(store.records, before);
  const restored = await controller.restoreValidCopy(); assert.ok(restored); assert.equal(Object.hasOwn(restored, 'future'), false);
});

test('sparse arrays and non-finite runtime values cannot serialize into a corrupt new checkpoint', async () => {
  for (const change of [
    (state: GameState) => { state.visited.length = 2; },
    (state: GameState) => { state.route.length = 1; },
    (state: GameState) => { state.time = Infinity; },
    (state: GameState) => { state.forestry.slots[context.trees.keys().next().value!].bornAt = NaN; },
  ]) {
    const state = createState(); change(state);
    await assert.rejects(serializeWorldSave(state, context, meta));
  }
});

test('subsequent loads return independent copies of the latest committed checkpoint, including after a new world first saves', async () => {
  const store = new MemorySaveStore(), controller = createSaveController(store, context);
  assert.equal(await controller.load(), null);
  const state = createState(); state.time = 10; state.inventory = inventoryCandidate(state.inventory, 'branch', 3, 'ordinary');
  assert.equal(await controller.saveNow(state), true);
  const first = await controller.load(); assert.ok(first); assert.equal(first.time, 10); assert.equal(inventoryCount(first.inventory, 'branch'), 3);
  first.time = 999; first.inventory = inventoryCandidate(first.inventory, 'branch', 20, 'ordinary');
  const second = await controller.load(); assert.ok(second); assert.equal(second.time, 10); assert.equal(inventoryCount(second.inventory, 'branch'), 3);
  const reloaded = await controller.reload(); assert.ok(reloaded); reloaded.time = 500;
  assert.equal((await controller.load())!.time, 10);
  state.time = 11; await controller.saveNow(state); assert.equal((await controller.load())!.time, 11);
});
