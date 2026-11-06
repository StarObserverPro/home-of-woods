import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createState} from '../src/domain/state.ts';
import type {OwnedItem} from '../src/domain/owned-items.ts';
import {HOUSING} from '../src/content/housing.ts';
import {Resources} from '../src/scene/resources.ts';
import {createHousingPresentation} from '../src/scene/housing-presentation.ts';
import {createGeometrySpec} from '../src/domain/parametric-crafting.ts';

const bell=():OwnedItem=>({instanceId:'test-bell',definitionId:HOUSING.doorbell.definitionId,blueprintId:'blueprint.pinecone-doorbell',createdAt:0,rarityId:'common',traits:[],location:{kind:'mounted',hostId:'cabin',slotId:'cabin:entry-hanging'}});
const bench=():OwnedItem=>({instanceId:'test-bench',definitionId:HOUSING.guestBench.definitionId,blueprintId:'blueprint.guest-bench',createdAt:0,rarityId:'common',traits:[],geometry:createGeometrySpec('bench.supported',HOUSING.guestBench.geometry),location:{kind:'world',x:-34,z:14,rotation:0}});

test('rendered cabin attachment and placed bench use the original IDs and ownership without changing state',()=>{
  const state=createState([]);state.inventory.instances=[bell(),bench()];
  const before=structuredClone(state),r=new Resources(),cabin=new THREE.Group();
  cabin.position.set(-31,20,-16);cabin.scale.setScalar(1.6);
  const housing=createHousingPresentation(r,cabin);housing.update(state,.05);
  assert.deepEqual(housing.point('test-bell'),{x:-31+HOUSING.doorbell.anchor.x*1.6,z:-16+HOUSING.doorbell.anchor.z*1.6});
  assert.deepEqual(housing.point('test-bench'),{x:-34,z:14});
  assert.equal(housing.hits.size,2);
  const root=housing.object('test-bell')!;
  assert.equal(housing.hits.resolve(root.getObjectByName('doorbell-three-pinecones')!), 'test-bell','visible geometry carries the same item identity');
  assert.equal(housing.ring('test-bell'),true);housing.update(state,.08);
  const sway=root.getObjectByName('doorbell-swing')!;
  assert.notEqual(sway.rotation.z,0,'ordinary bell swings without a special trait');
  const pausedAngle=sway.rotation.z;housing.update(state,0);assert.equal(sway.rotation.z,pausedAngle,'zero presentation delta holds the exact pose');
  housing.update(state,.05,true);assert.equal(sway.rotation.z,0,'reduced motion retains its resting silhouette');
  assert.equal(housing.ring('test-bench'),false);
  assert.deepEqual(state,before,'presentation, including ringing, never writes resources or ownership');
  housing.dispose();r.dispose();
});

test('bench silhouette fits the shared footprint and reads its saved geometry',()=>{
  const state=createState([]);state.inventory.instances=[bench()];
  const r=new Resources(),housing=createHousingPresentation(r,new THREE.Group());housing.update(state);
  const root=housing.object('test-bench')!,box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x-HOUSING.guestBench.geometry.length)<.001);
  assert.ok(Math.abs(size.z-HOUSING.guestBench.geometry.width)<.001);
  assert.ok(size.y>1.2&&size.y<1.7,'low seat with readable backrest stays at character scale');
  assert.ok(Math.hypot(size.x/2,size.z/2)<=HOUSING.guestBench.radius,'visual footprint stays inside the authoritative collision circle');
  const stats=housing.stats();assert.equal(stats.meshes,3);assert.ok(stats.triangles<3500,'one bench remains a small, merged resource');
  const item=state.inventory.instances[0];
  if(item.location.kind!=='world')throw Error('Expected placed item');
  item.location={...item.location,x:-32,z:16,rotation:Math.PI/2};housing.update(state);
  assert.deepEqual(housing.point(item.instanceId),{x:-32,z:16});
  assert.equal(root.rotation.y,Math.PI/2);
  housing.dispose();r.dispose();
});

test('unmount/remount and packing release hits but keep shared geometry until its owner releases once',()=>{
  const state=createState([]);state.inventory.instances=[bell(),bench()];
  const r=new Resources(),cabin=new THREE.Group(),housing=createHousingPresentation(r,cabin);housing.update(state);
  const stats=r.stats(),geometry=(housing.object('test-bench')!.children[0] as THREE.Mesh).geometry;
  let releases=0;geometry.addEventListener('dispose',()=>releases++);
  for(let pass=0;pass<3;pass++){
    const inventoryLocations=state.inventory.instances.map(item=>({...item,location:{kind:'inventory' as const}}));
    state.inventory.instances=inventoryLocations;housing.update(state);
    assert.equal(housing.hits.size,0);assert.equal(housing.object('test-bell'),null);assert.equal(housing.ring('test-bell'),false);
    state.inventory.instances=[bell(),bench()];housing.update(state);
    assert.equal(housing.hits.size,2);assert.deepEqual(r.stats(),stats,'re-entering the same two items does not allocate more shared resources');
  }
  assert.equal(housing.stats().meshes,7);assert.ok(housing.stats().triangles<5000);
  housing.dispose();housing.dispose();assert.equal(housing.hits.size,0);assert.equal(cabin.children.length,0);assert.equal(releases,0);
  r.dispose();r.dispose();assert.equal(releases,1,'Resources is the single GPU owner');
});

test('placement preview displays only a bench and never creates a hit or item',()=>{
  const state=createState([]);const item=bench();item.location={kind:'inventory'};state.inventory.instances=[item,bell()];
  const r=new Resources(),housing=createHousingPresentation(r,new THREE.Group());
  const draft={instanceId:'test-bench',point:{x:-33,z:14},rotation:.4,reason:''};
  housing.setPreview(draft);housing.update(state);assert.equal(housing.stats().preview,true);assert.equal(housing.hits.size,1);
  housing.setPreview({...draft,instanceId:'test-bell'});housing.update(state);assert.equal(housing.stats().preview,false);assert.equal(state.inventory.instances.length,2);
  housing.dispose();r.dispose();
});
