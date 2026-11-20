import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPEDITIONS } from '../src/content/forest-expedition.ts';
import { createExpeditionLayout, expeditionCanStand, expeditionHeightAt, expeditionSegmentWalkable, expeditionTreeCollisionRadius, expeditionWaterAt, findExpeditionPath } from '../src/world/forest-expedition.ts';

const layouts = EXPEDITIONS.map(definition => createExpeditionLayout(definition.id));

test('three distinct woodlands preserve stable trees, resource identities and explicit world dimensions', () => {
  const identities = new Set<string>();
  for (const layout of layouts) {
    assert.equal(layout.habitats.length, 4);
    assert.equal(layout.routes.filter(route => route.loop).length, 1);
    assert.equal(layout.routes.filter(route => !route.loop).length, 2);
    assert.equal(layout.resourceSites.length, 12);
    assert.equal(layout.trees.length, layout.definition.treeCount);
    assert.equal(layout.bounds.maxX - layout.bounds.minX, 180);
    for (const object of [...layout.trees, ...layout.resourceSites]) {
      assert.ok(!identities.has(object.id), object.id); identities.add(object.id);
      assert.ok(Math.abs(object.y - expeditionHeightAt(layout.id,object.x,object.z)) < 1e-8);
    }
  }
  const again = createExpeditionLayout('upper');
  assert.deepEqual(again.trees, layouts[0].trees);
  assert.deepEqual(again.resourceSites, layouts[0].resourceSites);
  assert.ok(layouts[0].trees.some(tree => !tree.landmark && tree.height >= 30));
  assert.ok(layouts[0].trees.filter(tree => tree.landmark).every(tree => tree.height >= 40));
  assert.ok(layouts[2].trees.filter(tree => !tree.landmark && !['hazel','berry'].includes(tree.kind)).every(tree => tree.height >= 10 && tree.height <= 18));
});

test('terrain render triangles and walking heights agree across hills and carved creek banks', () => {
  for (const layout of layouts) {
    const { positions, indices } = layout.grid;
    for (let offset = 0; offset < indices.length; offset += 111) {
      const i = Math.floor(offset / 3) * 3, a = indices[i] * 3, b = indices[i+1] * 3, c = indices[i+2] * 3;
      const x = (positions[a] + positions[b] + positions[c]) / 3, z = (positions[a+2] + positions[b+2] + positions[c+2]) / 3;
      const y = (positions[a+1] + positions[b+1] + positions[c+1]) / 3;
      assert.ok(Math.abs(expeditionHeightAt(layout.id,x,z) - y) < 2e-6, `${layout.id}: terrain disagreement at ${x},${z}`);
    }
    for (const water of layout.water) for (const point of water.points.filter(point => Math.abs(point.z) < 84)) {
      assert.equal(expeditionCanStand(layout,point.x,point.z), false, `${layout.id}: deep water must block walking`);
      const actual = expeditionWaterAt(layout.id,point.z);
      assert.ok(Math.abs(actual.x-point.x) < 1e-8 && Math.abs(actual.y-point.y) < 1e-8);
    }
  }
});

test('all authored loops, branches, supply points and landmarks are walkable without crossing water or trunks', () => {
  for (const layout of layouts) {
    assert.ok(expeditionCanStand(layout,layout.spawn.x,layout.spawn.z), `${layout.id}: entrance`);
    assert.ok(expeditionCanStand(layout,layout.supply.x,layout.supply.z), `${layout.id}: supply`);
    for (const route of layout.routes) for (let i = 1; i < route.points.length; i++) assert.ok(expeditionSegmentWalkable(layout,route.points[i-1],route.points[i]), `${route.id}: segment ${i}`);
    for (const landmark of layout.landmarks) {
      assert.ok(findExpeditionPath(layout,layout.spawn,landmark.approach).length > 0, landmark.name);
      assert.equal(expeditionCanStand(layout,landmark.x,landmark.z), false, `${landmark.name}: solid tree trunk`);
    }
  }
});

test('every resource can be approached and returned from, with timber recovery excluding protected giant trees', () => {
  for (const layout of layouts) for (const source of layout.resourceSites) {
    assert.ok(expeditionCanStand(layout,source.x,source.z), source.id);
    for (const [from,to] of [[layout.spawn,source],[source,layout.supply]]) {
      const path = findExpeditionPath(layout,from,to); assert.ok(path.length > 0, `${source.id}: missing route`);
      let previous = from;
      for (const point of path) { assert.ok(expeditionSegmentWalkable(layout,previous,point), `${source.id}: route cuts a collider`); previous = point; }
      assert.ok(Math.hypot(previous.x-to.x,previous.z-to.z) < 1e-8, `${source.id}: incomplete route`);
    }
    if (source.role === 'long-timber') {
      const tree = layout.trees.find(tree => tree.id === source.hostTreeId);
      assert.ok(tree && !tree.landmark && !['hazel','berry'].includes(tree.kind), source.id);
    }
  }
});

test('large root ribs use the same expanded collision radius as route clearance', () => {
  for (const layout of layouts) for (const tree of layout.trees.filter(value => ['redwood', 'cedar'].includes(value.kind))) {
    assert.equal(expeditionTreeCollisionRadius(tree), tree.trunkRadius * 1.55);
    assert.equal(expeditionCanStand(layout, tree.x + expeditionTreeCollisionRadius(tree) * .94, tree.z), false, tree.id);
  }
});
