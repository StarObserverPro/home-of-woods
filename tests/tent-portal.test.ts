import test from 'node:test';
import assert from 'node:assert/strict';
import { TENT_ENTRY, TENT_PORTAL, TENT_ROOM, TENT_ROOM_BLOCKERS } from '../src/content/tent-room.ts';
import { TENT_SCALE, TENT_SHAPE } from '../src/content/tent.ts';
import { MOVEMENT, START, TENT } from '../src/content/world.ts';
import { atTentEntrance, makeTentVisit, nearTentExit, setTentDestination, stepTentVisit, tentApproachRoute, tentCanStand, tentRoute } from '../src/domain/tent.ts';
import { canStand, move } from '../src/domain/navigation.ts';
import { makeColliders, makeTrees } from '../src/world/layout.ts';
import { CLOSED_ACCESS } from '../src/world/regions.ts';

test('tent doorway approach reaches a clear grid connection and rejects a blocked landing', () => {
  const blockers = makeColliders(makeTrees());
  assert.equal(TENT_PORTAL.threshold.x, TENT.x);
  assert.equal(TENT_PORTAL.threshold.z, TENT.z + TENT_SHAPE.doorZ * TENT_SCALE);
  assert.ok(TENT_PORTAL.landing.z > TENT_PORTAL.threshold.z);
  const route = tentApproachRoute(START, blockers, CLOSED_ACCESS);
  assert.ok(route.length > 1);
  let point = START;
  for (const next of route) {
    assert.ok(canStand(next, blockers, MOVEMENT.radius, CLOSED_ACCESS));
    const reached = move(point, next.x - point.x, next.z - point.z, blockers, CLOSED_ACCESS);
    assert.ok(Math.hypot(reached.x - next.x, reached.z - next.z) < .01);
    point = next;
  }
  assert.deepEqual(point, TENT_PORTAL.landing);
  assert.ok(atTentEntrance(point));
  assert.ok(!atTentEntrance(TENT_PORTAL.threshold));
  assert.deepEqual(tentApproachRoute(START, [...blockers, { id: 'placed-bench', ...point, radius: 1 }], CLOSED_ACCESS), []);
});

test('local walking stays off the furnishings and below the low side hems', () => {
  const visit = makeTentVisit();
  assert.ok(nearTentExit(visit.player));
  for (const input of [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }]) {
    for (let i = 0; i < 150; i++) {
      stepTentVisit(visit, input, MOVEMENT.fixedStep, 1, true);
      assert.ok(tentCanStand(visit.player));
      assert.ok(Math.abs(visit.player.x) <= TENT_ROOM.walkHalfX);
      assert.ok(Math.abs(visit.player.z) <= TENT_ROOM.depth / 2 - TENT_ROOM.actorRadius);
    }
  }
  assert.ok(TENT_ROOM_BLOCKERS.every(prop => !tentCanStand(prop)));
  const before = { ...visit.player };
  assert.equal(setTentDestination(visit, { x: NaN, z: 0 }), false);
  assert.deepEqual(visit.player, before);
});

test('click routes get around the sleeping bag, drum and bowl and can return through the same entrance', () => {
  const visit = makeTentVisit();
  const stops = [{ x: 0, z: -3.25 }, { x: 2.4, z: -2 }, { x: -2.5, z: 3.2 }, TENT_ENTRY];
  for (const destination of stops) {
    let previous = { ...visit.player };
    const route = tentRoute(previous, destination);
    assert.ok(route.length > 0);
    for (const point of route) {
      for (let i = 0; i <= 100; i++) assert.ok(tentCanStand({
        x: previous.x + (point.x - previous.x) * i / 100,
        z: previous.z + (point.z - previous.z) * i / 100,
      }));
      previous = { ...visit.player, ...point };
    }
    assert.ok(setTentDestination(visit, destination));
    for (let i = 0; i < 600; i++) {
      stepTentVisit(visit, { x: 0, z: 0 }, MOVEMENT.fixedStep, 1, false);
      assert.ok(tentCanStand(visit.player));
    }
    assert.ok(Math.hypot(visit.player.x - destination.x, visit.player.z - destination.z) < .02);
    assert.equal(visit.route.length, 0);
    assert.equal(visit.player.moving, false);
  }
  assert.ok(nearTentExit(visit.player));
});

test('manual movement interrupts a pending exit rather than transporting the player later', () => {
  const visit = makeTentVisit();
  Object.assign(visit.player, { x: 0, z: -3.25 });
  assert.ok(setTentDestination(visit, TENT_ENTRY, 'exit'));
  assert.equal(visit.action, 'exit');
  stepTentVisit(visit, { x: 1, z: 0 }, MOVEMENT.fixedStep, 1, false);
  assert.equal(visit.action, null);
  assert.equal(visit.destination, null);
  assert.deepEqual(visit.route, []);
  assert.ok(!nearTentExit(visit.player));
});
