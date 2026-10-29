import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/domain/game-state';
import { findPath } from '../src/domain/navigation';
import { isPositionWalkable } from '../src/domain/occupancy';
import type { GameState, Vec2 } from '../src/domain/types';

function assertClearRoute(state: GameState, path: Vec2[]): void {
  assert.ok(path.length > 0, 'a reachable path is returned');
  let previous: Vec2 = state.player;
  for (const point of path) {
    const samples = Math.ceil(Math.hypot(point.x - previous.x, point.z - previous.z) / 0.05);
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      assert.equal(isPositionWalkable(state, previous.x + (point.x - previous.x) * t, previous.z + (point.z - previous.z) * t), true, 'every segment clears player collision radius');
    }
    previous = point;
  }
}

test('click walking routes around the pond, keeps exact destination, and never mutates the world', () => {
  const state = createGameState(); state.player.x = -5; state.player.z = 4;
  const before = JSON.stringify(state);
  const target = { x: -14, z: 4 };
  const path = findPath(state, target);
  assertClearRoute(state, path);
  assert.deepEqual(path.at(-1), target);
  assert.ok(path.some(p => Math.abs(p.z - 4) >= 3), 'the route goes around the water');
  assert.equal(JSON.stringify(state), before);
  assert.deepEqual(findPath(state, target), path, 'tie breaks are deterministic');
});

test('a cabin and a tree block a straight line; bounded waypoints safely pass around both', () => {
  const state = createGameState(); state.player.x = 1; state.player.z = -4;
  state.buildings.push({ id: 'building-1', kind: 'cabin', x: 5, z: -4, rotation: 0 });
  const path = findPath(state, { x: 10, z: -6 });
  assertClearRoute(state, path);
  assert.deepEqual(path.at(-1), { x: 10, z: -6 });
  assert.ok(path.length < 1000);
});

test('an obstructed tree tap approaches a reachable edge; invalid and unavailable endpoints return empty', () => {
  const state = createGameState();
  const target = { x: -3, z: 1 };
  const path = findPath(state, target);
  assertClearRoute(state, path);
  const endpoint = path.at(-1)!;
  assert.ok(Math.hypot(endpoint.x - target.x, endpoint.z - target.z) <= 1.1);
  assert.notDeepEqual(endpoint, target);
  assert.deepEqual(findPath(state, { x: Infinity, z: 2 }), []);
  assert.deepEqual(findPath(state, { x: 100, z: 2 }), []);
  assert.deepEqual(findPath(state, { x: -10, z: 4 }), [], 'pond center has no grid endpoint within tolerance');
});

test('diagonal moves cannot squeeze between adjacent fence footprints', () => {
  const state = createGameState(); state.trees = []; state.plots = [];
  state.player.x = 4; state.player.z = -4;
  state.buildings = [
    { id: 'building-1', kind: 'fence', x: 5, z: -4, rotation: 0 },
    { id: 'building-2', kind: 'fence', x: 4, z: -3, rotation: 1 },
  ];
  // Start outside both inflated footprints; their touching corner blocks the direct diagonal.
  state.player.x = 3; state.player.z = -5;
  const path = findPath(state, { x: 6, z: -2 });
  assertClearRoute(state, path);
  assert.deepEqual(path.at(-1), { x: 6, z: -2 });
});
