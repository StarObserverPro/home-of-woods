import test from 'node:test';
import assert from 'node:assert/strict';
import { WILDLIFE, WILDLIFE_DEFINITIONS } from '../src/content/wildlife.ts';
import { RUNTIME_MODELS } from '../src/content/assets.ts';
import { START, WORLD_SEED } from '../src/content/world.ts';
import { WILDLIFE_ANCHORS } from '../src/world/wildlife-layout.ts';
import { makeTrees, makeColliders } from '../src/world/layout.ts';
import { canStand } from '../src/domain/navigation.ts';
import { createWildlife, advanceWildlife, wildlifeViews, wildlifeHasCapacity, wildlifeCapabilities, validateWildlifeRegistry } from '../src/domain/wildlife.ts';
import { heightAt } from '../src/world/surface.ts';
import { createState } from '../src/domain/state.ts';
import { createSaveContext } from '../src/domain/save-context.ts';
import { serializeWorldSave, prepareWorldSave } from '../src/domain/world-save.ts';
import { saveDigest } from '../src/domain/save-digest.ts';

const colliders = makeColliders(makeTrees()), available = WILDLIFE_DEFINITIONS.map(d => d.id);
function initial(time = 0) {
  const state = createWildlife(time); advanceWildlife(state, time, WORLD_SEED, START, colliders, available); return state;
}
test('wildlife registry uses admitted assets and all fixed anchors have legal shared-surface placement', () => {
  validateWildlifeRegistry(RUNTIME_MODELS.map(a => a.assetId));
  assert.throws(() => validateWildlifeRegistry([]), /definition/);
  for (const a of WILDLIFE_ANCHORS) assert.ok(canStand(a, colliders), a.id);
});
test('first window has matching common pair, typed stable identities and no fake interactions', () => {
  const state = initial(); assert.equal(state.encounters.length, 2);
  assert.deepEqual(state, initial());
  for (const e of state.encounters) {
    assert.equal(wildlifeHasCapacity(state, e.definitionId), false);
    assert.deepEqual(wildlifeCapabilities(state, e.id)?.capabilities, []);
    assert.ok(e.id.startsWith('wildlife:v1:')); assert.equal(e.expiresAt, 94);
  }
  assert.equal(wildlifeCapabilities(state, 'stale'), null);
  for (const v of wildlifeViews(state, 2)) { assert.equal(v.y, heightAt(v.x, v.z)); assert.equal(v.opacity, 1); }
});
test('global capacity counts exiting encounters, never per-region or render-instance allocations', () => {
  const state = initial(); state.encounters[0].exitAt = 0;
  state.encounters.push({ ...state.encounters[0], id: 'fixture:third', definitionId: 'wildlife.hare' });
  assert.equal(state.encounters.length, WILDLIFE.maxMammals);
  for (const id of available) assert.equal(wildlifeHasCapacity(state, id), false);
});
test('long walk stays grounded, finite and within shared collision boundaries with bounded populations', () => {
  const state = initial(); const ids = new Set<string>();
  for (let step = 1; step <= 7200; step++) {
    const time = step / 30; advanceWildlife(state, time, WORLD_SEED, START, colliders, available);
    assert.ok(state.encounters.length <= 2);
    assert.equal(new Set(state.encounters.map(e => e.definitionId)).size, state.encounters.length);
    for (const e of state.encounters) { assert.ok(canStand(e, colliders)); assert.ok(Number.isFinite(e.x + e.z + e.facing)); ids.add(e.id); }
  }
  assert.ok(ids.size >= 4, 'different windows use different stable encounter identities');
});
test('player approach watches then retreats without consuming inventory or requiring a click target', () => {
  const state = initial(), e = state.encounters[0];
  const player = { x: e.x + 1, z: e.z }, startDistance = Math.hypot(e.x - player.x, e.z - player.z);
  const states = new Set<string>();
  for (let step = 1; step <= 60; step++) {
    advanceWildlife(state, step / 30, WORLD_SEED, player, colliders, available); states.add(e.behavior);
  }
  assert.ok(states.has('alert')); assert.ok(states.has('flee'));
  assert.ok(Math.hypot(e.x - player.x, e.z - player.z) > startDistance + .5);
});
test('zero-time pause and same-session reentry do not advance motion, reroll identities or add animals', () => {
  const state = initial(); advanceWildlife(state, .1, WORLD_SEED, START, colliders, available);
  const copy = structuredClone(state);
  for (let i = 0; i < 12; i++) advanceWildlife(state, .1, WORLD_SEED, START, colliders, available);
  assert.deepEqual(state, copy);
});
test('unavailable/blocked candidates do not queue or retry in the same window; night and large skips are bounded', () => {
  const state = createWildlife(0); advanceWildlife(state, 0, WORLD_SEED, START, colliders, []);
  advanceWildlife(state, .1, WORLD_SEED, START, colliders, available); assert.equal(state.encounters.length, 0);
  advanceWildlife(state, 120, WORLD_SEED, START, colliders, available); assert.equal(state.encounters.length, 2);
  advanceWildlife(state, 500, WORLD_SEED, START, colliders, available); assert.equal(state.encounters.length, 0);
  advanceWildlife(state, 1200, WORLD_SEED, START, colliders, available); assert.equal(state.encounters.length, 2);
  assert.ok(state.encounters.every(e => e.window === 10));
});
test('exit fade retains its budget before recycling and leaves an intentional empty interval', () => {
  const state = initial(93.8);
  for (let step = 1; step <= 6; step++) advanceWildlife(state, 93.8 + step * .1, WORLD_SEED, START, colliders, available);
  assert.equal(state.encounters.length, 2); assert.ok(state.encounters.every(e => e.exitAt !== null));
  for (let step = 7; step <= 20; step++) advanceWildlife(state, 93.8 + step * .1, WORLD_SEED, START, colliders, available);
  assert.equal(state.encounters.length, 0); assert.equal(initial(100).encounters.length, 0);
});
test('common wildlife roundtrip keeps the saved scheduling window without adding a new persistent schema', async () => {
  const world = createState(); world.time = 40; world.wildlife = initial(40);
  const raw = await serializeWorldSave(world, createSaveContext(), { sequence: 1, savedAt: 5 });
  const payload = JSON.parse(raw); assert.equal(payload.schemaVersion, 1); assert.equal(payload.rulesetVersion, 2);
  assert.equal('wildlife' in payload.world, false);
  const loaded = await prepareWorldSave(raw, createSaveContext()); assert.equal(loaded.decision, 'restored');
  assert.ok('value' in loaded);
  const rebuilt = initial(loaded.value.time);
  assert.deepEqual(rebuilt.encounters.map(e => [e.id, e.expiresAt]), world.wildlife.encounters.map(e => [e.id, e.expiresAt]));
  payload.world.wildlife = { unsupportedPersistentPet: true };
  const { checksum, ...core } = payload; void checksum;
  assert.equal((await prepareWorldSave(JSON.stringify({ ...core, checksum: await saveDigest(core) }), createSaveContext())).decision, 'protected');
});
