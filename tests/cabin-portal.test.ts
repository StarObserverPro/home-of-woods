import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CABIN_ENTRY, CABIN_EXTERIOR, CABIN_PORTAL, CABIN_ROOM, CABIN_WINDOW, cabinPortal } from '../src/content/cabin.ts';
import { CABIN, MOVEMENT, START } from '../src/content/world.ts';
import { atCabinEntrance, cabinApproachRoute, cabinFloorPoint, makeCabinVisit, nearCabinAction, stepCabinVisit } from '../src/domain/cabin.ts';
import { createCabinRoom } from '../src/scene/cabin/room.ts';
import { CABIN_ROOM_PLAN } from '../src/scene/cabin/shell.ts';
import { createSkySample, sampleSkyLight } from '../src/scene/lighting/sky-light.ts';
import { canStand, move } from '../src/domain/navigation.ts';
import { CLOSED_ACCESS } from '../src/world/regions.ts';
import { makeColliders, makeTrees } from '../src/world/layout.ts';

const glb = readFileSync(new URL('../public/assets/m0/cabin.glb', import.meta.url));
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-5, `${a} differs from ${b}`);

test('both sides use the actual off-centre doorway, front window and outward normal', () => {
  const { nodes } = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  const jambs = nodes.filter((node: { name: string }) => node.name.startsWith('door_frame'));
  assert.equal(jambs.length, 2);
  close((jambs[0].translation[0] + jambs[1].translation[0]) / 2, CABIN_EXTERIOR.threshold.x);
  close(jambs[0].translation[2], CABIN_EXTERIOR.threshold.z);
  close(CABIN_PORTAL.threshold.x, CABIN.x + CABIN_ENTRY.x);
  close(CABIN_PORTAL.landing.x, CABIN_PORTAL.threshold.x);
  assert.ok(CABIN_PORTAL.landing.z > CABIN_PORTAL.threshold.z);
  const south = CABIN_ROOM_PLAN.find(wall => wall.id === 'south')!;
  const window = south.openings.find(opening => opening.kind === 'window')!;
  const windowModel = nodes.find((node: { name: string }) => node.name === 'window_recess');
  close(window.left + window.width / 2 - CABIN_ROOM.width / 2, windowModel.translation[0] * CABIN_EXTERIOR.scale);
  close(window.bottom + window.height / 2, CABIN_WINDOW.bottom + CABIN_WINDOW.height / 2);
  const turned = cabinPortal({ x: 10, z: 5 }, Math.PI / 2);
  close(turned.outward.x, 1);
  close(turned.landing.x - turned.threshold.x, CABIN_EXTERIOR.landingDistance);
  close(turned.landing.z, turned.threshold.z);
  assert.equal(makeCabinVisit().player.facing, Math.PI);
});

test('outdoor approach follows walkable camp ground and rejects a blocked landing', () => {
  const blockers = makeColliders(makeTrees());
  const route = cabinApproachRoute(START, blockers, CLOSED_ACCESS);
  assert.ok(route.length > 1);
  let point = START;
  for (const next of route) {
    assert.ok(canStand(next, blockers, MOVEMENT.radius, CLOSED_ACCESS));
    const reached = move(point, next.x - point.x, next.z - point.z, blockers, CLOSED_ACCESS);
    close(reached.x, next.x);
    close(reached.z, next.z);
    point = next;
  }
  assert.deepEqual(point, CABIN_PORTAL.landing);
  assert.ok(atCabinEntrance(point));
  assert.ok(!atCabinEntrance(CABIN_PORTAL.threshold));
  assert.deepEqual(cabinApproachRoute(START, [...blockers, { id: 'blocker', ...point, radius: 1 }], CLOSED_ACCESS), []);
});

test('indoors the same walking input stops at walls and interrupts an approach to the door', () => {
  const visit = makeCabinVisit();
  assert.ok(nearCabinAction(visit.player, 'exit'));
  for (let i = 0; i < 160; i++) stepCabinVisit(visit, { x: 1, z: -1 }, MOVEMENT.fixedStep, 1, false);
  assert.deepEqual({ x: visit.player.x, z: visit.player.z }, cabinFloorPoint({ x: 100, z: -100 }));
  assert.ok(!nearCabinAction(visit.player, 'exit'));
  visit.destination = CABIN_ENTRY;
  visit.action = 'exit';
  stepCabinVisit(visit, { x: -1, z: 0 }, MOVEMENT.fixedStep, 1, false);
  assert.equal(visit.destination, null);
  assert.equal(visit.action, null);
  visit.destination = CABIN_ENTRY;
  for (let i = 0; i < 160; i++) stepCabinVisit(visit, { x: 0, z: 0 }, MOVEMENT.fixedStep, 1, false);
  assert.ok(nearCabinAction(visit.player, 'exit'));
  assert.ok(!visit.player.moving);
});

test('the cutaway keeps its physical daylight casters and the wall lamp is independent', async () => {
  const source = await new GLTFLoader().parseAsync(new Uint8Array(glb).buffer, '');
  const room = createCabinRoom(source.scene);
  try {
    const sample = createSkySample();
    room.setLighting(sampleSkyLight(sample, 14, .12, 0), 14);
    room.update(0);
    const day = room.stats();
    assert.equal(day.shell.apertures, 2);
    assert.ok(day.shell.topology.every(wall => wall.ok));
    assert.ok(day.shell.cutWalls.length > 0);
    const envelope = room.scene.getObjectByName('cabin-shadow-envelope')!;
    const north = envelope.getObjectByName('north:solid-upper:shadow') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    assert.ok(north.visible && north.castShadow);
    assert.equal(north.material.colorWrite, false);
    assert.equal(north.material.depthWrite, false);
    room.orbit(2.4, 0);
    room.update(1);
    const repaired = room.stats();
    assert.notDeepEqual(repaired.shell.cutWalls, day.shell.cutWalls);
    assert.ok(north.visible && north.castShadow);
    assert.deepEqual(repaired.light, day.light);
    assert.equal(repaired.roofPatches, 2);
    room.setLighting(sampleSkyLight(sample, 14, 1, .8), 14);
    assert.ok(room.stats().light.sun < day.light.sun / 2);
    room.setLighting(sampleSkyLight(sample, 1, .12, 0), 1);
    const night = room.stats().light;
    assert.ok(night.sun < day.light.sun && night.window < day.light.window);
    room.setLamp(true);
    assert.deepEqual(room.stats().light, { ...night, lamp: 17 });
    room.setLamp(false);
    assert.deepEqual(room.stats().light, night);
  } finally {
    room.dispose();
  }
  assert.ok(room.stats().resources.disposed);
});
