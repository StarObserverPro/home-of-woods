import test from "node:test";
import assert from "node:assert/strict";
import {
  START,
  WAYPOINTS,
  CABIN,
  WORLD,
  MOVEMENT,
} from "../src/content/world.ts";
import { makeTrees, makeColliders } from "../src/world/layout.ts";
import { heightAt, vertexHeight, inOpenArea, riverX } from "../src/world/surface.ts";
import { canStand, findPath, move } from "../src/domain/navigation.ts";
const trees = makeTrees(),
  colliders = makeColliders(trees);
test("fixed tree slots, generations and landmark identities survive reconstruction", () => {
  assert.deepEqual(makeTrees(), trees);
  assert.equal(new Set(trees.map((t) => t.id)).size, trees.length);
  assert.equal(trees.filter((t) => t.role === "landmark").length, 1);
  for (const tree of trees.filter((t) => t.role === "managed"))
    assert.equal(tree.individualId, `${tree.id}:g0`);
  assert.ok(trees.some((t) => t.role === "scenery"));
  assert.ok(trees.some((t) => t.kind === "pine"));
  assert.ok(trees.some((t) => t.kind === "broadleaf"));
});
test("triangle interpolation agrees with the actual rendered terrain vertices and diagonal", () => {
  for (let x = -60; x < 20; x += 2)
    for (let z = -54; z < 65; z += 2) {
      assert.ok(Math.abs(heightAt(x, z) - vertexHeight(x, z)) < 1e-10);
      const a = vertexHeight(x, z),
        b = vertexHeight(x + 2, z),
        c = vertexHeight(x, z + 2);
      assert.ok(
        Math.abs(
          heightAt(x + 0.5, z + 0.5) - (a + (b - a) * 0.25 + (c - a) * 0.25),
        ) < 1e-9,
      );
    }
});
test("spawn and all four scenic destinations are reachable with no collider corner cuts", () => {
  assert.ok(canStand(START, colliders));
  for (const target of WAYPOINTS) {
    const route = findPath(START, target, colliders);
    assert.ok(route.length > 0, target.id);
    let position = { ...START };
    for (const node of route) {
      const distance = Math.hypot(node.x - position.x, node.z - position.z);
      if (distance < 0.01) continue;
      const next = move(
        position,
        node.x - position.x,
        node.z - position.z,
        colliders,
      );
      assert.ok(
        Math.hypot(next.x - node.x, next.z - node.z) < 0.03,
        `${target.id}: path segment blocked`,
      );
      assert.ok(canStand(next, colliders));
      position = next;
    }
    assert.ok(Math.hypot(position.x - target.x, position.z - target.z) < 0.03);
  }
});
test("walking from home descends into the valley; rear route rises above the home", () => {
  const home = heightAt(START.x, START.z);
  assert.ok(heightAt(WAYPOINTS[3].x, WAYPOINTS[3].z) < home - 15);
  assert.ok(heightAt(WAYPOINTS[1].x, WAYPOINTS[1].z) > home + 15);
});
test("building, tree trunks, stream and unopened high mountain block movement", () => {
  assert.equal(canStand(CABIN, colliders), false);
  const tree = trees.find((t) => t.role === "managed")!;
  assert.equal(canStand(tree, colliders), false);
  assert.equal(inOpenArea(40, 40), false);
  assert.equal(inOpenArea(-50, -80), false);
  const cabinCollider=colliders.find(c=>c.id==='cabin')!;
  assert.ok('halfZ' in cabinCollider);
  const front=cabinCollider.z+cabinCollider.halfZ;
  const before = { x: CABIN.x, z: front+MOVEMENT.radius+2 };
  const after = move(before, 0, -12, colliders);
  assert.ok(after.z >= front + MOVEMENT.radius - 0.01);
  const shore=WAYPOINTS.find(p=>p.id==='creek')!;
  assert.ok(heightAt(shore.x, shore.z) > WORLD.waterY);
  assert.equal(canStand({x:riverX(shore.z),z:shore.z},colliders),false);
});
