import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createExpeditionLayout, expeditionHeightAt} from '../src/world/forest-expedition.ts';
import {createExpeditionVegetation} from '../src/scene/expedition-vegetation.ts';
import {populateExpeditionProduce} from '../src/scene/expedition-produce.ts';
import {Resources} from '../src/scene/resources.ts';
import {createForestExpedition, restoreForestExpedition} from '../src/domain/forest-expedition.ts';

const maps = {
  upper: createExpeditionLayout('upper'),
  mixed: createExpeditionLayout('mixed'),
  lower: createExpeditionLayout('lower'),
};

test('real forest produce geometry is present on each host and cheap to draw', () => {
  const extents = new Map();
  for (const layout of Object.values(maps)) {
    const resources = new Resources(), vegetation = createExpeditionVegetation(resources);
    for (const site of layout.resourceSites) {
      const base = new THREE.Group(), harvest = new THREE.Group();
      base.position.set(site.x+1.6,expeditionHeightAt(layout.id,site.x+1.6,site.z-.7),site.z-.7);
      base.add(harvest);
      const host = layout.trees.find(tree => tree.id===site.hostTreeId);
      if (!populateExpeditionProduce(site,layout.id,base,harvest,host,vegetation,resources)) continue;
      const meshes = harvest.children.filter(object => object instanceof THREE.Mesh);
      assert.equal(meshes.length,1,site.id);
      const geometry = meshes[0].geometry;
      assert.ok(geometry.getAttribute('position').count < 5000,site.id);
      base.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(harvest);
      const center = bounds.getCenter(new THREE.Vector3());
      assert.ok(bounds.min.y >= expeditionHeightAt(layout.id,center.x,center.z)-.22,site.id);
      if (site.role === 'tree-fruit') assert.ok(host && bounds.min.y > host.y + 2.1,site.id);
      if (site.role === 'berry') assert.ok(host && bounds.max.y < host.y + 1.8,site.id);
      if (site.substrate === 'standing-trunk') assert.ok(host && bounds.min.y > host.y+.5,site.id);
      if (site.substrate) extents.set(site.role, bounds.getSize(new THREE.Vector3()));
    }
    vegetation.dispose(); resources.dispose();
    assert.equal(resources.stats().extras,0);
  }
  assert.ok(extents.get('wood-ear').y > extents.get('wood-fungus').y);
  assert.equal(extents.size,3);
});

test('adding a source to a v1 session preserves inventory and restores exhausted existing sources', () => {
  const context = {maps};
  const state = createForestExpedition(context,{time:10});
  const oldId = 'expedition.upper.nurse-log', newId = 'expedition.lower.bank-wood-ear';
  state.sources[oldId] = {remaining:0, version:3, nextReadyAt:220};
  const legacy = {...state,schemaVersion:1,sources:{...state.sources}};
  delete legacy.sources[newId];
  const restored = restoreForestExpedition(legacy,context);
  assert.deepEqual(restored,state);
  assert.throws(()=>restoreForestExpedition({...legacy,schemaVersion:2},context));
});
