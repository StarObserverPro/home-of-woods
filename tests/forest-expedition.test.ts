import test from 'node:test';
import assert from 'node:assert/strict';
import { CARRY_PROFILES } from '../src/content/carrying.ts';
import { EXPEDITION_CARRY_ITEMS, EXPEDITION_ITEMS, EXPEDITION_RESOURCES, EXPEDITION_RULES } from '../src/content/expedition-resources.ts';
import type { ExpeditionMapId, ExpeditionResourceRole, ExpeditionResourceSite } from '../src/content/forest-expedition.ts';
import { carryingLoad } from '../src/domain/carrying.ts';
import {
  EXPEDITION_ITEM_CATALOG, advanceExpedition, beginExpeditionGather, beginExpeditionProcess,
  changeExpeditionCarrying, claimExpeditionContainer, createForestExpedition, expeditionLoad,
  expeditionSnapshot, expeditionSourceView, exportForestExpedition, moveExpeditionPlayer,
  pendingExpeditionTimber, restoreForestExpedition, serializeForestExpedition, switchExpeditionMap,
} from '../src/domain/forest-expedition.ts';
import type { ExpeditionContext, ExpeditionResult, ForestExpeditionState } from '../src/domain/forest-expedition.ts';
import { inventoryCount, inventoryTransaction, stackKey } from '../src/domain/inventory.ts';
import { isCarried, isStored, transportLocation } from '../src/domain/transport-location.ts';

const roles: ExpeditionResourceRole[] = ['soil-fungus', 'wood-fungus', 'berry', 'nut', 'resin', 'branch', 'long-timber', 'curved-branch', 'seed', 'sap'];
const maps = Object.fromEntries(EXPEDITION_RULES.mapIds.map(mapId => [mapId, {
  id: mapId, spawn: { x: 0, z: 0 }, supply: { x: 1, z: 0 },
  resourceSites: [...roles, 'long-timber' as const].map((role, i): ExpeditionResourceSite => ({ id: `${mapId}.${role}.${i}`, role, habitatId: `${mapId}.habitat`, x: 10 + i * 4, y: 0, z: 5 })),
}])) as ExpeditionContext['maps'];
const context: ExpeditionContext = { maps, canStand: (_id, p) => Math.abs(p.x) < 100 && Math.abs(p.z) < 100, canInteract: () => true };
const accept = (r: ExpeditionResult): ForestExpeditionState => { assert.equal(r.ok, true, r.message); return r.state; };
const source = (mapId: ExpeditionMapId, role: ExpeditionResourceRole, index = 0) => maps[mapId].resourceSites.filter(site => site.role === role)[index];
function nearSource(state: ForestExpeditionState, mapId: ExpeditionMapId, role: ExpeditionResourceRole, index = 0) {
  state = accept(switchExpeditionMap(state, mapId, context));
  return accept(moveExpeditionPlayer(state, source(mapId, role, index), context));
}
function collect(state: ForestExpeditionState, mapId: ExpeditionMapId, role: ExpeditionResourceRole, count = 1, index = 0) {
  state = nearSource(state, mapId, role, index);
  for (let i = 0; i < count; i++) {
    state = accept(beginExpeditionGather(state, source(mapId, role, index).id, context));
    state = accept(advanceExpedition(state, state.action!.finishAt, context));
  }
  return state;
}
function atSupply(state: ForestExpeditionState) { return accept(moveExpeditionPlayer(state, maps[state.activeMapId].supply, context)); }
function deposit(state: ForestExpeditionState) { return accept(changeExpeditionCarrying(atSupply(state), { kind: 'store' }, context)); }
function process(state: ForestExpeditionState, recipeId: string) {
  state = accept(beginExpeditionProcess(atSupply(state), recipeId, context));
  return accept(advanceExpedition(state, state.action!.finishAt, context));
}

test('the three plots share one real inventory, finite source capacities and the established carrying formula', () => {
  const state = createForestExpedition(context);
  assert.equal(Object.keys(state.sources).length, 33);
  assert.equal(state.inventory.stacks.length, 0);
  assert.equal(state.timber.limit, 3);
  for (const item of EXPEDITION_ITEMS) {
    assert.ok(EXPEDITION_CARRY_ITEMS[item.itemId], item.itemId);
    const load = carryingLoad([{ itemId: item.itemId, qualityId: 'ordinary', quantity: 1 }], CARRY_PROFILES.hands, 1, { sizes: EXPEDITION_CARRY_ITEMS, catalog: EXPEDITION_ITEM_CATALOG });
    assert.equal(load.reason, '', item.itemId); assert.ok(load.weight > 0 && load.bulk > 0);
  }
  const baseline = carryingLoad([{ itemId: 'mushroom', qualityId: 'ordinary', quantity: 10 }]);
  assert.equal(baseline.bulk, 10); assert.equal(baseline.speed, 1 / 3);
});

test('far targets offer walking first; timed gathering awards once and consumes the source once', () => {
  let state = createForestExpedition(context);
  const site = source('upper', 'soil-fungus'), untouched = structuredClone(state);
  const far = beginExpeditionGather(state, site.id, context);
  assert.equal(far.ok, false); assert.deepEqual(far.approach, { x: site.x, z: site.z }); assert.deepEqual(state, untouched);
  state = nearSource(state, 'upper', 'soil-fungus');
  state = accept(beginExpeditionGather(state, site.id, context));
  const started = state.time, finish = state.action!.finishAt;
  state = accept(advanceExpedition(state, started + .5, context));
  assert.equal(inventoryCount(state.inventory, 'conifer-mushroom'), 0);
  assert.ok(expeditionSnapshot(state, context).action!.progress > 0);
  state = accept(advanceExpedition(state, finish, context));
  assert.equal(inventoryCount(state.inventory, 'conifer-mushroom'), 1);
  assert.equal(state.sources[site.id].remaining, EXPEDITION_RESOURCES['soil-fungus'].capacity - 1);
  const inventory = structuredClone(state.inventory);
  state = accept(advanceExpedition(state, finish, context));
  assert.deepEqual(state.inventory, inventory); assert.equal(state.action, null);
});

test('full hands reject collection atomically, including the new catalogue materials', () => {
  let state = createForestExpedition(context);
  state.inventory = inventoryTransaction(state.inventory, [{ itemId: 'mushroom', qualityId: 'ordinary', transport: { kind: 'carried' }, delta: 10 }]);
  state = nearSource(state, 'upper', 'resin');
  const before = structuredClone(state), attempted = beginExpeditionGather(state, source('upper', 'resin').id, context);
  assert.equal(attempted.ok, false); assert.match(attempted.message, /放不下/); assert.deepEqual(attempted.state, before);
  assert.equal(expeditionLoad(state).speed, 1 / 3);
});

test('drops retain their map, pickup is capacity checked and stale pickup cannot duplicate goods', () => {
  let state = collect(createForestExpedition(context), 'upper', 'soil-fungus', 2);
  const held = state.inventory.stacks.find(isCarried)!;
  state = accept(changeExpeditionCarrying(state, { kind: 'drop', key: stackKey(held), quantity: 'max' }, context));
  const ground = state.inventory.stacks.find(stack => transportLocation(stack)?.kind === 'ground')!, key = stackKey(ground);
  assert.equal(ground.expeditionMapId, 'upper'); assert.equal(expeditionLoad(state).weight, 0);
  const returnPoint = { ...state.player };
  state = accept(switchExpeditionMap(state, 'mixed', context));
  state = accept(moveExpeditionPlayer(state, returnPoint, context));
  const foreign = changeExpeditionCarrying(state, { kind: 'take', key, quantity: 'max' }, context);
  assert.equal(foreign.ok, false); assert.match(foreign.message, /当前林地/);
  assert.equal(expeditionSnapshot(state, context).ground.length, 0);
  state = accept(switchExpeditionMap(state, 'upper', context));
  assert.deepEqual(state.player, returnPoint);
  state = accept(changeExpeditionCarrying(state, { kind: 'take', key, quantity: 'max' }, context));
  assert.equal(inventoryCount(state.inventory, 'conifer-mushroom'), 2);
  const after = structuredClone(state);
  assert.equal(changeExpeditionCarrying(state, { kind: 'take', key }, context).ok, false);
  assert.deepEqual(state, after);
  state = deposit(state);
  assert.equal(expeditionLoad(state).weight, 0); assert.equal(state.inventory.stacks.filter(isStored)[0].quantity, 2);
});

test('pending timber blocks only its origin plot; all plots spend the same non-renewable allowance', () => {
  let state = collect(createForestExpedition(context), 'upper', 'long-timber');
  assert.equal(state.timber.used, 1); assert.equal(pendingExpeditionTimber(state, 'upper'), 1);
  state = nearSource(state, 'upper', 'long-timber', 1);
  const blocked = beginExpeditionGather(state, source('upper', 'long-timber', 1).id, context);
  assert.equal(blocked.ok, false); assert.match(blocked.message, /本林区尚未收运/);
  state = collect(state, 'mixed', 'long-timber');
  assert.equal(state.timber.used, 2); assert.equal(pendingExpeditionTimber(state, 'upper'), 1); assert.equal(pendingExpeditionTimber(state, 'mixed'), 1);
  state = collect(state, 'lower', 'long-timber');
  assert.equal(state.timber.used, 3); assert.equal(pendingExpeditionTimber(state, 'lower'), 1);
  state = nearSource(state, 'upper', 'long-timber');
  const upperLog = state.inventory.stacks.find(stack => stack.expeditionMapId === 'upper')!;
  state = accept(changeExpeditionCarrying(state, { kind: 'take', key: stackKey(upperLog) }, context));
  assert.equal(expeditionLoad(state).weight, 30); assert.equal(expeditionLoad(state).speed, 1 / 3);
  state = accept(switchExpeditionMap(state, 'mixed', context));
  state = accept(changeExpeditionCarrying(state, { kind: 'drop', key: stackKey(state.inventory.stacks.find(isCarried)!) }, context));
  assert.equal(pendingExpeditionTimber(state, 'upper'), 1, 'changing physical map must not change origin');
  const dropped = state.inventory.stacks.find(stack => stack.expeditionMapId === 'mixed' && (stack.expeditionHarvest as { mapId: string }).mapId === 'upper')!;
  state = accept(changeExpeditionCarrying(state, { kind: 'take', key: stackKey(dropped) }, context));
  state = deposit(state);
  assert.equal(pendingExpeditionTimber(state, 'upper'), 0); assert.equal(pendingExpeditionTimber(state, 'mixed'), 1);
  state = nearSource(state, 'upper', 'long-timber', 1);
  const noQuota = beginExpeditionGather(state, source('upper', 'long-timber', 1).id, context);
  assert.equal(noQuota.ok, false); assert.match(noQuota.message, /额度已用完/);
  const spentSource = source('upper', 'long-timber').id;
  state = accept(advanceExpedition(state, state.time + 100000, context));
  assert.equal(state.sources[spentSource].remaining, 0); assert.equal(state.sources[spentSource].nextReadyAt, null); assert.equal(state.timber.used, 3);
});

test('inactive plot recovery is capped once, while map switching and snapshot restore never refill sources', () => {
  let state = collect(createForestExpedition(context), 'upper', 'soil-fungus', 3);
  const id = source('upper', 'soil-fungus').id, due = state.sources[id].nextReadyAt!;
  state = accept(switchExpeditionMap(state, 'lower', context));
  for (let i = 0; i < 3; i++) state = restoreForestExpedition(serializeForestExpedition(state), context);
  assert.equal(state.sources[id].remaining, 1);
  state = accept(advanceExpedition(state, due + 10000, context));
  assert.equal(state.sources[id].remaining, 4); assert.equal(state.sources[id].nextReadyAt, null);
  assert.equal(inventoryCount(state.inventory, 'conifer-mushroom'), 3, 'recovery never mails items into inventory');
  const version = state.sources[id].version;
  state = accept(advanceExpedition(state, state.time + 100000, context));
  assert.equal(state.sources[id].version, version); assert.equal(state.sources[id].remaining, 4);
});

test('movement, map changes and stale inventory revisions cancel uncommitted work without rewards', () => {
  let state = nearSource(createForestExpedition(context), 'upper', 'soil-fungus');
  const id = source('upper', 'soil-fungus').id;
  state = accept(beginExpeditionGather(state, id, context));
  state = accept(moveExpeditionPlayer(state, { x: state.player.x + .2, z: state.player.z }, context));
  assert.equal(state.action, null);
  state = accept(advanceExpedition(state, state.time + 10, context));
  assert.equal(state.inventory.stacks.length, 0); assert.equal(state.sources[id].remaining, 4);
  state = accept(beginExpeditionGather(state, id, context));
  state = accept(switchExpeditionMap(state, 'mixed', context));
  assert.equal(state.action, null); assert.equal(state.sources[id].remaining, 4);
  state = nearSource(state, 'upper', 'soil-fungus'); state = accept(beginExpeditionGather(state, id, context));
  state.inventory = inventoryTransaction(state.inventory, [{ itemId: 'mushroom', qualityId: 'ordinary', delta: 1 }]);
  const cancelled = advanceExpedition(state, state.action!.finishAt, context);
  assert.match(cancelled.message, /库存已经变化/); assert.equal(cancelled.state.action, null); assert.equal(cancelled.state.sources[id].remaining, 4);
});

test('processing consumes only deposited ingredients at completion, and gives lighter products that can be withdrawn', () => {
  let state = atSupply(collect(createForestExpedition(context), 'upper', 'soil-fungus', 3));
  const carriedOnly = beginExpeditionProcess(state, 'dry-mushrooms', context);
  assert.equal(carriedOnly.ok, false); assert.match(carriedOnly.message, /入样区补给架/);
  state = deposit(state); state = accept(beginExpeditionProcess(state, 'dry-mushrooms', context));
  const finish = state.action!.finishAt;
  assert.equal(inventoryCount(state.inventory, 'conifer-mushroom'), 3);
  state = accept(advanceExpedition(state, finish - 1, context));
  assert.equal(inventoryCount(state.inventory, 'conifer-mushroom'), 3); assert.equal(inventoryCount(state.inventory, 'dried-mushroom'), 0);
  state = accept(advanceExpedition(state, finish, context));
  assert.equal(inventoryCount(state.inventory, 'conifer-mushroom'), 0); assert.equal(inventoryCount(state.inventory, 'dried-mushroom'), 2);
  const after = structuredClone(state.inventory); state = accept(advanceExpedition(state, finish, context)); assert.deepEqual(state.inventory, after);
  const dry = state.inventory.stacks.find(stack => stack.itemId === 'dried-mushroom')!;
  state = accept(changeExpeditionCarrying(state, { kind: 'withdraw', key: stackKey(dry), quantity: 'max' }, context));
  assert.equal(expeditionLoad(state).bulk, 1); assert.equal(expeditionLoad(state).weight, .2);
});

test('fruit and nuts close the collect/store/process loop; undeclared recipes cannot consume timber', () => {
  let state = deposit(collect(createForestExpedition(context), 'lower', 'berry', 3));
  state = process(state, 'dry-fruit'); assert.equal(inventoryCount(state.inventory, 'dried-forest-fruit'), 2);
  state = deposit(collect(state, 'lower', 'nut', 3));
  state = process(state, 'prepare-nuts'); assert.equal(inventoryCount(state.inventory, 'nut-rations'), 2);
  const before = structuredClone(state);
  assert.equal(beginExpeditionProcess(state, 'turn-sticks-into-timber', context).ok, false); assert.deepEqual(state, before);
  state.inventory = inventoryTransaction(state.inventory, [{ itemId: 'branch', qualityId: 'ordinary', expeditionHarvest: { mapId: 'upper', sourceId: 'upper.pending' }, delta: 1 }]);
  const pending = beginExpeditionProcess(state, 'split-kindling', context);
  assert.equal(pending.ok, false); assert.match(pending.message, /枝料还差/);
});

test('the one issued can is required for sap, travels filled and returns empty after fuel-backed processing', () => {
  let state = nearSource(createForestExpedition(context, { initialMapId: 'lower' }), 'lower', 'sap');
  assert.match(beginExpeditionGather(state, source('lower', 'sap').id, context).message, /空收液罐/);
  state = atSupply(state); state = accept(claimExpeditionContainer(state, context));
  assert.equal(claimExpeditionContainer(state, context).ok, false); assert.equal(inventoryCount(state.inventory, 'sap-can'), 1);
  state = collect(state, 'lower', 'sap');
  assert.equal(inventoryCount(state.inventory, 'sap-can'), 0); assert.equal(inventoryCount(state.inventory, 'sap-filled-can'), 1);
  assert.equal(expeditionLoad(state).weight, 4.8);
  state = deposit(state); state = deposit(collect(state, 'lower', 'branch'));
  state = process(state, 'split-kindling'); assert.equal(inventoryCount(state.inventory, 'scrap-fuel'), 3);
  state = process(state, 'boil-sap');
  assert.equal(inventoryCount(state.inventory, 'sap-filled-can'), 0); assert.equal(inventoryCount(state.inventory, 'sap-can'), 1);
  assert.equal(inventoryCount(state.inventory, 'forest-syrup'), 1); assert.equal(inventoryCount(state.inventory, 'scrap-fuel'), 1);
  state = restoreForestExpedition(serializeForestExpedition(state), context);
  assert.equal(claimExpeditionContainer(state, context).ok, false);
  const empty = state.inventory.stacks.find(stack => stack.itemId === 'sap-can')!;
  state = accept(changeExpeditionCarrying(state, { kind: 'withdraw', key: stackKey(empty) }, context));
  state = collect(state, 'lower', 'sap'); assert.equal(inventoryCount(state.inventory, 'sap-filled-can'), 1);
});

test('a saved in-progress action resumes on the same clock and its settled snapshot cannot award again', () => {
  let state = nearSource(createForestExpedition(context, { time: 120 }), 'upper', 'soil-fungus');
  state = accept(beginExpeditionGather(state, source('upper', 'soil-fungus').id, context));
  const finish = state.action!.finishAt;
  state = restoreForestExpedition(exportForestExpedition(state), context);
  assert.equal(state.time, 120); assert.equal(inventoryCount(state.inventory, 'conifer-mushroom'), 0);
  state = accept(advanceExpedition(state, finish, context));
  const stable = serializeForestExpedition(state);
  state = restoreForestExpedition(stable, context); state = accept(advanceExpedition(state, finish, context));
  assert.equal(inventoryCount(state.inventory, 'conifer-mushroom'), 1); assert.equal(state.sources[source('upper', 'soil-fungus').id].remaining, 3);
  assert.equal(advanceExpedition(state, finish - 1, context).ok, false);
  const bad = exportForestExpedition(state); bad.sources[source('upper', 'soil-fungus').id].remaining = 999;
  assert.throws(() => restoreForestExpedition(bad, context));
});

test('blocked approach paths and bundled branch loads use the shared world and carrying checks', () => {
  const blocked: ExpeditionContext = { ...context, canInteract: () => false };
  let state = nearSource(createForestExpedition(context), 'upper', 'soil-fungus');
  const view = expeditionSourceView(state, source('upper', 'soil-fungus').id, blocked)!;
  assert.equal(view.near, false); assert.equal(beginExpeditionGather(state, view.id, blocked).ok, false);
  state = collect(state, 'upper', 'branch', 3);
  state = accept(changeExpeditionCarrying(state, { kind: 'method', method: 'bundle' }, context));
  assert.equal(expeditionLoad(state).weight, 12); assert.equal(expeditionLoad(state).bulk, 3 * 3 * .55);
  const noWalk = moveExpeditionPlayer(state, { x: 101, z: 0 }, context); assert.equal(noWalk.ok, false);
});
