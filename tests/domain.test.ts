import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME } from '../src/content/config';
import { createGameState, dispatch, getContextAction, tick, validatePlacement } from '../src/domain/game-state';
import { footprint, isPositionWalkable } from '../src/domain/occupancy';
import { deserializeGame, serializeGame } from '../src/domain/save';
import type { GameState, Selection } from '../src/domain/types';
import { getSurface, surfaceSupportsRectangle } from '../src/world/surface';

const axe: Selection = { tool: 'axe', plant: 'tree', building: 'cabin', rotation: 0 };
const treeSeed: Selection = { ...axe, tool: 'plant' };
const carrotSeed: Selection = { ...treeSeed, plant: 'carrot' };
const water: Selection = { ...axe, tool: 'water' };
const hoe: Selection = { ...axe, tool: 'hoe' };
const advance = (state: GameState, seconds: number) => { for (let i = 0; i < seconds * 4; i++) tick(state, 0.25); };

test('seed and authored entity IDs are deterministic; initial save validates and round-trips', () => {
  const state = createGameState();
  assert.deepEqual(createGameState(), state);
  const loaded = deserializeGame(serializeGame(state));
  assert.equal(loaded.ok, true, loaded.ok ? '' : loaded.error);
  if (loaded.ok) assert.deepEqual(loaded.state, state);
  assert.equal(state.trees.length, 31);
  assert.equal(new Set([...state.trees, ...state.plots].map(e => e.id)).size, 37);
});

test('three hits fell a tree exactly once; a new sapling has a new persistent ID and grows by game time', () => {
  const state = createGameState();
  state.player.x = -1.4; state.player.z = 1;
  const target = { x: -3, z: 1 };
  const oldId = state.trees[0].id;
  assert.equal(dispatch(state, { type: 'interact', selection: axe, target }).events[0]?.type, 'chop');
  assert.equal(state.inventory.wood, 0);
  assert.equal(dispatch(state, { type: 'interact', selection: axe, target }).events[0]?.type, 'chop');
  assert.equal(dispatch(state, { type: 'interact', selection: axe, target }).events[0]?.type, 'fell');
  assert.equal(state.inventory.wood, 4);
  assert.equal(state.inventory.saplings, 4);
  assert.equal(dispatch(state, { type: 'interact', selection: axe, target }).ok, false);
  assert.equal(state.inventory.wood, 4);
  assert.equal(dispatch(state, { type: 'interact', selection: treeSeed, target }).ok, true);
  const sapling = state.trees.find(t => t.x === -3 && t.z === 1)!;
  assert.notEqual(sapling.id, oldId);
  assert.equal(sapling.stage, 'sapling');
  assert.equal(dispatch(state, { type: 'interact', selection: treeSeed, target }).ok, false);
  assert.equal(state.inventory.saplings, 3);
  advance(state, 35); assert.equal(sapling.stage, 'young');
  advance(state, 55); assert.equal(sapling.stage, 'mature');
  const loaded = deserializeGame(serializeGame(state));
  assert.equal(loaded.ok, true, loaded.ok ? '' : loaded.error);
});

test('till, plant, water and harvest are atomic; dry crops do not grow and harvest cannot repeat', () => {
  const state = createGameState();
  state.player.x = 2; state.player.z = 5;
  const target = { x: 3, z: 5 };
  assert.equal(dispatch(state, { type: 'interact', selection: hoe, target }).ok, true);
  assert.equal(dispatch(state, { type: 'interact', selection: hoe, target }).ok, false);
  assert.equal(dispatch(state, { type: 'interact', selection: carrotSeed, target }).ok, true);
  const plot = state.plots.find(p => p.x === 3 && p.z === 5)!;
  assert.equal(state.inventory.seeds, 7);
  assert.equal(dispatch(state, { type: 'interact', selection: carrotSeed, target }).ok, false);
  advance(state, 40); assert.equal(plot.growth, 0);
  assert.equal(dispatch(state, { type: 'interact', selection: water, target }).ok, true);
  assert.equal(dispatch(state, { type: 'interact', selection: water, target }).ok, false);
  advance(state, GAME.cropSeconds);
  assert.equal(getContextAction(state, water, target).label, '收获胡萝卜');
  assert.equal(dispatch(state, { type: 'interact', selection: water, target }).events[0]?.type, 'harvest');
  assert.equal(state.inventory.carrots, 3);
  assert.equal(state.inventory.seeds, 9);
  assert.equal(dispatch(state, { type: 'interact', selection: water, target }).ok, false);
  assert.equal(state.inventory.carrots, 3);
  assert.equal(plot.crop, null);
});

test('out-of-range, invalid points, occupied ground and resource shortage never mutate resources', () => {
  const state = createGameState();
  const before = serializeGame(state);
  assert.equal(dispatch(state, { type: 'interact', selection: axe, target: { x: -11, z: -7 } }).ok, false);
  assert.equal(dispatch(state, { type: 'interact', selection: hoe, target: { x: NaN, z: 2 } }).ok, false);
  assert.equal(dispatch(state, { type: 'interact', selection: treeSeed, target: { x: 0, z: 3 } }).ok, false);
  assert.equal(serializeGame(state), before);
  state.player.x = 2; state.player.z = 4; state.inventory.seeds = 0;
  assert.equal(dispatch(state, { type: 'interact', selection: carrotSeed, target: { x: 3, z: 4 } }).ok, false);
  assert.equal(state.inventory.seeds, 0);
});

test('build preview and rotation are pure; confirmation revalidates and deducts cost once', () => {
  const state = createGameState();
  state.player.x = 2; state.player.z = -4; state.inventory.wood = 12;
  const target = { x: 5, z: -4 };
  const before = serializeGame(state);
  assert.equal(validatePlacement(state, 'cabin', target, 0).valid, true);
  assert.equal(validatePlacement(state, 'cabin', target, 1).valid, true);
  assert.equal(getContextAction(state, { ...axe, tool: 'build' }, target).enabled, true);
  assert.equal(dispatch(state, { type: 'interact', selection: { ...axe, tool: 'build' }, target }).ok, false);
  assert.equal(serializeGame(state), before);
  assert.equal(dispatch(state, { type: 'build', kind: 'cabin', position: target, rotation: 0 }).ok, true);
  assert.equal(state.inventory.wood, 0);
  assert.equal(state.buildings.length, 1);
  assert.equal(dispatch(state, { type: 'build', kind: 'cabin', position: target, rotation: 0 }).ok, false);
  assert.equal(state.inventory.wood, 0);
  assert.equal(state.buildings.length, 1);
  assert.deepEqual(footprint('fence', 0), { width: 2, depth: 1 });
  assert.deepEqual(footprint('fence', 1), { width: 1, depth: 2 });
  const loaded = deserializeGame(serializeGame(state));
  assert.equal(loaded.ok, true, loaded.ok ? '' : loaded.error);
});

test('build placement rejects pond, world edge, standing inside, overlap, distance, insufficient wood', () => {
  const state = createGameState();
  state.inventory.wood = 50;
  assert.equal(validatePlacement(state, 'cabin', { x: -10, z: 4 }, 0).valid, false);
  assert.equal(validatePlacement(state, 'cabin', { x: 15, z: 12 }, 0).valid, false);
  assert.equal(validatePlacement(state, 'cabin', state.player, 0).valid, false);
  assert.equal(validatePlacement(state, 'cabin', { x: 4, z: 3 }, 0).valid, false);
  assert.equal(validatePlacement(state, 'cabin', { x: 5, z: -4 }, 0).valid, false);
  state.player.x = 2; state.player.z = -4; state.inventory.wood = 11;
  assert.match(validatePlacement(state, 'cabin', { x: 5, z: -4 }, 0).reason!, /还差 1/);
});

test('movement respects trees, water, buildings and world boundary with bounded steps', () => {
  const state = createGameState();
  state.player.x = -1; state.player.z = 1;
  for (let i = 0; i < 20; i++) dispatch(state, { type: 'move', x: -1, z: 0, dt: 0.1 });
  assert.ok(state.player.x > -3 + 0.7);
  state.player.x = -6; state.player.z = 4;
  for (let i = 0; i < 30; i++) dispatch(state, { type: 'move', x: -1, z: 0, dt: 0.1 });
  assert.ok(state.player.x > -7);
  assert.equal(isPositionWalkable(state, state.player.x, state.player.z), true);
  state.player.x = 14; state.player.z = 0;
  for (let i = 0; i < 30; i++) dispatch(state, { type: 'move', x: 1, z: 0, dt: 5 });
  assert.ok(state.player.x < 15.7);
  assert.equal(isPositionWalkable(state, state.player.x, state.player.z), true);
  const diagonal = createGameState(); diagonal.player.x = 4; diagonal.player.z = -4;
  const start = { x: diagonal.player.x, z: diagonal.player.z };
  dispatch(diagonal, { type: 'move', x: 1, z: 1, dt: 0.1 });
  assert.ok(Math.hypot(diagonal.player.x - start.x, diagonal.player.z - start.z) <= GAME.movementSpeed * 0.1 + 1e-8);
});

test('tick ignores invalid or negative dt and caps catch-up; idle domain has no independent clock', () => {
  const state = createGameState();
  tick(state, NaN); tick(state, Infinity); tick(state, -1); tick(state, 0);
  assert.equal(state.time, 0);
  tick(state, 1000); assert.equal(state.time, 0.25);
  const time = state.time;
  getContextAction(state, axe);
  assert.equal(state.time, time);
});

test('save validation rejects corruption, future schemas, bad counts, duplicate IDs, invalid stages and overlap', () => {
  assert.equal(deserializeGame('{').ok, false);
  const mutate = (change: (state: GameState) => void) => { const state = createGameState(); change(state); return deserializeGame(JSON.stringify(state)); };
  assert.equal(deserializeGame('{"schemaVersion":2}').ok, false);
  assert.equal(mutate(s => { s.inventory.wood = -1; }).ok, false);
  assert.equal(mutate(s => { s.player.x = Infinity; }).ok, false);
  assert.equal(mutate(s => { s.trees[1].id = s.trees[0].id; }).ok, false);
  assert.equal(mutate(s => { s.trees[0].stage = 'sapling'; }).ok, false);
  assert.equal(mutate(s => { s.trees[1].x = s.trees[0].x; s.trees[1].z = s.trees[0].z; }).ok, false);
  assert.equal(mutate(s => { s.plots[0].watered = false; }).ok, false);
  assert.equal(mutate(s => { s.player.x = -10; s.player.z = 4; }).ok, false);
  assert.equal(mutate(s => { s.trees[0].id = 'tree-2'; s.nextId = 2; }).ok, false);
  assert.equal(mutate(s => { (s.buildings as unknown[]).push({ id: 'building-1', kind: 'unknown', x: 5, z: -4, rotation: 0 }); s.nextId = 2; }).ok, false);
});

test('canonical surface rejects a footprint spanning water even when corners are on land', () => {
  assert.equal(getSurface(-10, 4).kind, 'water');
  assert.equal(getSurface(0, 3).kind, 'path');
  assert.equal(getSurface(16, 0).kind, 'outside');
  assert.equal(getSurface(15.9, 12.9).kind, 'outside');
  assert.equal(surfaceSupportsRectangle(-10, 4, 8, 6), false);
});
