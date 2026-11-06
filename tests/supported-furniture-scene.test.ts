import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createGeometrySpec,geometryParts} from '../src/domain/parametric-crafting.ts';
import {createState} from '../src/domain/state.ts';
import type {OwnedItem} from '../src/domain/owned-items.ts';
import {Resources} from '../src/scene/resources.ts';
import {createSupportedSurfaceFactory} from '../src/scene/supported-surface-presentation.ts';
import {createHousingPresentation} from '../src/scene/housing-presentation.ts';

const geometry=(length=1.6,width=.6,height=.7)=>createGeometrySpec('bench.supported',{length,width,height,seatThickness:.15,supportCount:2,supportInset:.2});
const furniture=(definitionId='furniture.guest-bench'):OwnedItem=>({instanceId:'furniture-one',definitionId,blueprintId:'blueprint.bench-guided',createdAt:0,rarityId:'common',traits:[],geometry:geometry(),location:{kind:'world',x:-34,z:14,rotation:0}});

test('bench and prep table share model-derived surface and support batches while the table has empty utensils',()=>{
  const r=new Resources(),factory=createSupportedSurfaceFactory(r),spec=geometry(),bench=factory.create(spec,'bench'),table=factory.create(spec,'table');
  const surface=bench.getObjectByName('supported-surface') as THREE.Mesh,tableSurface=table.getObjectByName('supported-surface') as THREE.Mesh;
  const frame=bench.getObjectByName('supported-frame') as THREE.Mesh,tableFrame=table.getObjectByName('supported-frame') as THREE.Mesh;
  assert.equal(surface.geometry,tableSurface.geometry);assert.equal(frame.geometry,tableFrame.geometry);assert.equal(surface.material,tableSurface.material);
  const parts=geometryParts(spec),top=parts.find(part=>part.id==='surface')!;
  surface.geometry.computeBoundingBox();const bounds=surface.geometry.boundingBox!;
  assert.ok(Math.abs(bounds.max.x-bounds.min.x-top.dimensions.x)<1e-6);assert.ok(Math.abs(bounds.max.z-bounds.min.z-top.dimensions.z)<1e-6);
  assert.ok(Math.abs(bounds.max.y-(spec.parameters.height as number))<1e-6,'the visible tabletop is generated at its saved height');
  assert.ok(bench.getObjectByName('bench-backrest'));assert.equal(table.getObjectByName('bench-backrest'),undefined);
  assert.ok(table.getObjectByName('prep-board-and-empty-bowl'));assert.ok(table.getObjectByName('prep-wooden-spoon'));
  assert.equal(table.userData.prepKit,'fixed-empty-utensils','the tabletop displays ordinary fixed tools, without spawning food');
  let disposed=0;surface.geometry.addEventListener('dispose',()=>disposed++);
  bench.clear();table.clear();assert.equal(disposed,0);r.dispose();r.dispose();assert.equal(disposed,1);
});

test('changing one saved geometry rebuilds its mesh and hit once, and revisiting a size reuses the owner cache',()=>{
  const r=new Resources(),housing=createHousingPresentation(r,new THREE.Group()),state=createState([]),item=furniture();state.inventory.instances=[item];housing.update(state);
  const small=housing.object(item.instanceId)!;assert.equal(housing.hits.size,1);
  item.geometry=geometry(2.4,.9,.95);housing.update(state);
  const large=housing.object(item.instanceId)!;assert.notEqual(large,small);assert.equal(housing.hits.resolve(small),null);assert.equal(housing.hits.resolve(large),item.instanceId);assert.equal(housing.hits.size,1);
  const top=large.getObjectByName('supported-surface') as THREE.Mesh;top.geometry.computeBoundingBox();
  assert.ok(Math.abs(top.geometry.boundingBox!.max.x-top.geometry.boundingBox!.min.x-2.4)<1e-6);
  assert.ok(Math.abs(top.geometry.boundingBox!.max.y-.95)<1e-6);
  const warmCache=r.stats();item.geometry=geometry();housing.update(state);item.geometry=geometry(2.4,.9,.95);housing.update(state);
  assert.deepEqual(r.stats(),warmCache,'a dimension change reuses the finite geometry cache when returning to known sizes');
  assert.equal(housing.stats().surfaces.activeRoots,1);housing.dispose();assert.equal(housing.hits.size,0);r.dispose();
});

test('table placement ghost uses its own geometry and unsupported future shapes remain unrendered',()=>{
  const r=new Resources(),housing=createHousingPresentation(r,new THREE.Group()),state=createState([]),item=furniture('furniture.prep-side-table');
  item.geometry=geometry(1.2,.5,1.2);item.location={kind:'inventory'};state.inventory.instances=[item];
  housing.setPreview({instanceId:item.instanceId,point:{x:-34,z:14},rotation:.5,reason:''});housing.update(state);
  assert.equal(housing.stats().preview,true);assert.equal(housing.hits.size,0);
  const ghost=housing.group.getObjectByName('supported-furniture-placement')!,surface=ghost.getObjectByName('supported-surface') as THREE.Mesh;
  surface.geometry.computeBoundingBox();assert.ok(Math.abs(surface.geometry.boundingBox!.max.y-1.2)<1e-6);assert.ok(ghost.getObjectByName('prep-board-and-empty-bowl'));
  item.geometry={...geometry(),version:999};const before=structuredClone(state);housing.update(state);
  assert.equal(housing.stats().preview,false);assert.equal(housing.object(item.instanceId),null);assert.deepEqual(state,before,'unknown geometry stays in the original item instead of being guessed or rewritten');
  housing.dispose();r.dispose();
});
