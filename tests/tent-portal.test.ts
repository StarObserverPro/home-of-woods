import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TENT_ENTRY, TENT_PORTAL, TENT_ROOM, TENT_ROOM_BLOCKERS } from '../src/content/tent-room.ts';
import { TENT_CLOTH, TENT_SCALE, TENT_SHAPE } from '../src/content/tent.ts';
import { MOVEMENT, START, TENT } from '../src/content/world.ts';
import { atTentEntrance, makeTentVisit, nearTentExit, setTentDestination, stepTentVisit, tentApproachRoute, tentCanStand, tentRoute } from '../src/domain/tent.ts';
import { canStand, move } from '../src/domain/navigation.ts';
import { makeColliders, makeTrees } from '../src/world/layout.ts';
import { CLOSED_ACCESS } from '../src/world/regions.ts';
import { characterModels } from './glb-fixtures.ts';
import { createCharacters } from '../src/scene/characters.ts';
import { createState, createStarterState } from '../src/domain/state.ts';
import { tentRoofPoint } from '../src/scene/tent/geometry.ts';
import { CAMP_PROPS } from '../src/content/scene-props.ts';
import { WOODCRAFT } from '../src/content/woodcraft.ts';
import { forestryColliders } from '../src/domain/forestry.ts';
import { furnitureColliders, workstationColliders } from '../src/domain/furniture-placement.ts';
import { seatingColliders } from '../src/domain/housing.ts';

test('tent doorway approach clears the live camp workstations and rejects blocked connectors', () => {
  const trees = makeTrees(), state = createStarterState(trees);
  const treeById = new Map(trees.map(tree => [tree.id, tree]));
  // Match runtime activeColliders, including the workbench in front of the door.
  const blockers = [
    ...((state.workshop.upgrades[CAMP_PROPS.dryer.id]?.level ?? 0) > 0
      ? [{ id: CAMP_PROPS.dryer.id, x: CAMP_PROPS.dryer.x, z: CAMP_PROPS.dryer.z, radius: .95 }] : []),
    { id: WOODCRAFT.id, x: WOODCRAFT.x, z: WOODCRAFT.z, halfX: WOODCRAFT.halfX + .2, halfZ: WOODCRAFT.halfZ + .2 },
    ...forestryColliders(makeColliders(trees), treeById, state.forestry, state.time),
    ...workstationColliders(), ...furnitureColliders(state), ...seatingColliders(),
  ];
  assert.equal(TENT_PORTAL.threshold.x, TENT.x);
  assert.equal(TENT_PORTAL.threshold.z, TENT.z + TENT_SHAPE.doorZ * TENT_SCALE);
  assert.ok(TENT_PORTAL.landing.z > TENT_PORTAL.threshold.z);
  assert.ok(!canStand({ x: TENT.x, z: TENT.z + 5.5 }, blockers), 'the old landing overlaps the workbench');
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
  const halfway = { x: (TENT_PORTAL.approach.x + point.x) / 2, z: point.z };
  assert.deepEqual(tentApproachRoute(START, [...blockers, { id: 'blocked-porch', ...halfway, radius: .3 }], CLOSED_ACCESS), []);
  assert.deepEqual(tentApproachRoute(halfway, blockers, CLOSED_ACCESS), [TENT_PORTAL.landing],
    'an interrupted walk in the narrow strip can resume without snapping back into the tent');
});

test('local walking stays off the furnishings and below the low side hems', () => {
  const visit = makeTentVisit();
  assert.ok(nearTentExit(visit.player));
  for (const input of [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }]) {
    for (let i = 0; i < 150; i++) {
      stepTentVisit(visit, input, MOVEMENT.fixedStep, 1, true);
      assert.ok(tentCanStand(visit.player));
      assert.ok(Math.abs(visit.player.x) <= TENT_ROOM.walkHalfX);
      assert.ok(Math.abs(visit.player.z) <= TENT_ROOM.depth / 2 - TENT_ROOM.wallClearance);
    }
  }
  assert.ok(TENT_ROOM_BLOCKERS.every(prop => !tentCanStand(prop)));
  assert.ok(!tentCanStand({ x: 2.65, z: -2 }), 'the standing player cannot enter the low canvas edge');
  assert.ok(!tentCanStand({ x: 0, z: -3.36 }), 'the head and hat remain inside the back wall');
  const before = { ...visit.player };
  assert.equal(setTentDestination(visit, { x: NaN, z: 0 }), false);
  assert.deepEqual(visit.player, before);
});

test('click routes get around the sleeping bag, drum and bowl and can return through the same entrance', () => {
  const visit = makeTentVisit();
  const stops = [{ x: 0, z: -3.02 }, { x: 1.4, z: -2 }, { x: -1.4, z: 3.02 }, TENT_ENTRY];
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
  Object.assign(visit.player, { x: 0, z: -3.02 });
  assert.ok(setTentDestination(visit, TENT_ENTRY, 'exit'));
  assert.equal(visit.action, 'exit');
  stepTentVisit(visit, { x: 1, z: 0 }, MOVEMENT.fixedStep, 1, false);
  assert.equal(visit.action, null);
  assert.equal(visit.destination, null);
  assert.deepEqual(visit.route, []);
  assert.ok(!nearTentExit(visit.player));
});

test('the actual turned ranger clears the inner canvas and front/back walls at the walking limits', async () => {
  const { resources, models } = await characterModels();
  const characters = createCharacters(resources, models, [], new Map()), state = createState();
  const vertex = new THREE.Vector3();
  const maxZ = TENT_ROOM.depth / 2 - TENT_ROOM.wallClearance;
  const poses = [
    { x: 0, z: -maxZ }, { x: 0, z: maxZ },
    { x: TENT_ROOM.walkHalfX, z: -2 },
    { x: TENT_ROOM.walkHalfX, z: maxZ },
    { x: -TENT_ROOM.walkHalfX, z: maxZ },
  ];
  try {
    for (const point of poses) for (const facing of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      assert.ok(tentCanStand(point));
      characters.updateInCabin(state, { ...point, facing, moving: false }, TENT_ROOM.floorY, false, .8);
      characters.player.updateMatrixWorld(true);
      characters.player.traverseVisible(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          object.getVertexPosition(i, vertex); vertex.applyMatrix4(object.matrixWorld);
          // The rear panel's inner surface is 0.035 local units in front of its base.
          assert.ok(vertex.z > -TENT_ROOM.depth / 2 + TENT_SHAPE.thickness * TENT_SCALE);
          assert.ok(vertex.z < TENT_ROOM.depth / 2 - .015 * TENT_SCALE);
          const across = Math.abs(vertex.x) / TENT_SCALE / TENT_SHAPE.halfWidth;
          const along = (vertex.z / TENT_SCALE + TENT_SHAPE.halfDepth) / (2 * TENT_SHAPE.halfDepth);
          const innerRoof = tentRoofPoint(vertex.x < 0 ? -1 : 1, across, along).y * TENT_SCALE
            - TENT_SHAPE.thickness * TENT_SCALE;
          // Include the entire configured displacement, not only the room's lighter wind.
          assert.ok(innerRoof - vertex.y > TENT_CLOTH.maxWindDisplacement * TENT_SCALE,
            `${object.name} at ${point.x},${point.z} intersects the moving canvas`);
        }
      });
    }
  } finally { characters.dispose(); resources.dispose(); }
});
