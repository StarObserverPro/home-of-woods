import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Models} from '../src/scene/models.ts';
import {Resources} from '../src/scene/resources.ts';
import {createUnderstory} from '../src/scene/understory.js';
import {makeTrees} from '../src/world/layout.ts';
import {chunkKey} from '../src/world/regions.ts';
import {createState} from '../src/domain/state.ts';
import {treeScaleFactor} from '../src/domain/forestry.ts';
import {FORESTRY} from '../src/content/forestry.ts';

function fixture() {
  const resources=new Resources(),trees=makeTrees(),models=new Models(resources);
  const forest=models.createForest(trees),understory=createUnderstory(resources,trees,forest.selections);
  const state=createState(trees);
  const batches=understory.group.children.map(object=>{
    const mesh=object as THREE.InstancedMesh;
    const matrices=Float32Array.from(mesh.instanceMatrix.array),colors=Float32Array.from(mesh.instanceColor!.array);
    const chunks=Array.from({length:mesh.count},(_,i)=>chunkKey({x:matrices[i*16+12],z:matrices[i*16+14]}));
    return {mesh,matrices,colors,chunks,count:mesh.count};
  });
  return {resources,trees,understory,state,batches};
}

test('understory submits only active placements and preserves their matrix/color pairs through compaction and restoration',t=>{
  const {resources,understory,state,batches}=fixture();t.after(()=>resources.dispose());
  const allChunks=[...new Set(batches.flatMap(batch=>batch.chunks))];assert.ok(allChunks.length>2);
  const active=new Set([allChunks[allChunks.length-1]]);
  understory.update(state,active,1);
  const matrix=new THREE.Matrix4(),expectedBox=new THREE.Box3(),itemBox=new THREE.Box3(),sphere=new THREE.Sphere();
  let submitted=0,triangles=0;
  for(const batch of batches){
    const {mesh}=batch,expected=batch.chunks.flatMap((key,i)=>active.has(key)?[i]:[]);
    assert.equal(mesh.count,expected.length,mesh.name);submitted+=mesh.count;
    triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*mesh.count;
    expectedBox.makeEmpty();
    for(let index=0;index<expected.length;index++){
      const source=expected[index];
      assert.deepEqual(Array.from(mesh.instanceMatrix.array.slice(index*16,index*16+16)),Array.from(batch.matrices.slice(source*16,source*16+16)));
      assert.deepEqual(Array.from(mesh.instanceColor!.array.slice(index*3,index*3+3)),Array.from(batch.colors.slice(source*3,source*3+3)));
      matrix.fromArray(batch.matrices,source*16);assert.ok(matrix.determinant()>0,'no hidden zero-scale slots are submitted');
      expectedBox.union(itemBox.copy(mesh.geometry.boundingBox!).applyMatrix4(matrix));
      sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(matrix);
      assert.ok(mesh.boundingSphere!.center.distanceTo(sphere.center)+sphere.radius<=mesh.boundingSphere!.radius+1e-5);
    }
    assert.ok(mesh.boundingBox!.equals(expectedBox),'culling bounds follow only the submitted prefix');
    if(!expected.length)assert.ok(mesh.boundingSphere!.isEmpty());
  }
  assert.equal(understory.stats().instances,submitted);assert.equal(understory.stats().triangles,triangles);
  assert.ok(submitted>0&&submitted<Number(understory.stats().capacityInstances));
  assert.ok(triangles<Number(understory.stats().capacityTriangles));

  active.clear();understory.update(state,active,2);
  for(const {mesh} of batches){assert.equal(mesh.count,0);assert.ok(mesh.boundingBox!.isEmpty());assert.ok(mesh.boundingSphere!.isEmpty());}
  assert.equal(understory.stats().triangles,0);
  understory.update(state,undefined,3);
  for(const batch of batches){
    assert.equal(batch.mesh.count,batch.count);
    assert.deepEqual(Float32Array.from(batch.mesh.instanceMatrix.array),batch.matrices);
    assert.deepEqual(Float32Array.from(batch.mesh.instanceColor!.array),batch.colors);
  }
  assert.equal(understory.stats().triangles,understory.stats().capacityTriangles);

  // Callers without a revision may retain and mutate the same Set.
  active.add(allChunks[0]);understory.update(state,active);
  const firstCounts=batches.map(({mesh})=>mesh.count);active.clear();understory.update(state,active);
  assert.ok(firstCounts.some(count=>count>0));assert.ok(batches.every(({mesh})=>mesh.count===0));
});

test('idle understory does not upload and lifecycle changes take effect with an unchanged chunk revision',t=>{
  const {resources,trees,understory,state,batches}=fixture();t.after(()=>resources.dispose());
  class ChunkSet extends Set<string> {
    lookups=0;
    override has(key:string){this.lookups++;return super.has(key);}
  }
  const active=new ChunkSet(batches.flatMap(batch=>batch.chunks));
  understory.update(state,active,7);assert.ok(active.lookups>0);
  const lookups=active.lookups,versions=()=>batches.map(({mesh})=>[mesh.instanceMatrix.version,mesh.instanceColor!.version]);
  const initialVersions=versions();
  for(let frame=0;frame<20;frame++){state.time+=.016;understory.update(state,active,7);}
  assert.equal(active.lookups,lookups,'unchanged chunk revisions skip membership scanning');
  assert.deepEqual(versions(),initialVersions,'an idle frame does not dirty matrix or color attributes');
  const hosted=batches.filter(({mesh})=>['understory-fern','understory-stem','understory-litter'].includes(mesh.name));
  const unhosted=batches.filter(batch=>!hosted.includes(batch));
  assert.ok(hosted.every(({mesh})=>mesh.count>0));
  for(const life of Object.values(state.forestry.slots))life.status='falling';
  understory.update(state,active,7);
  assert.ok(hosted.every(({mesh})=>mesh.count===0),'falling hides hosted cover in the same update');
  assert.ok(unhosted.every(({mesh,count})=>mesh.count===count),'unhosted cover stays in place');
  for(const life of Object.values(state.forestry.slots)){life.status='sapling';life.bornAt=0;}
  state.time=(.75-.22)/.78*FORESTRY.saplingSeconds;
  assert.equal(treeScaleFactor(Object.values(state.forestry.slots)[0],state.time),.75);
  understory.update(state,active,7);assert.ok(hosted.every(({mesh})=>mesh.count===0));
  state.time+=.1;understory.update(state,active,7);
  assert.ok(hosted.every(({mesh,count})=>mesh.count===count),'the exact growth predicate is not hidden by a rounded signature');
  for(const life of Object.values(state.forestry.slots))life.status='stump';
  understory.update(state,active,7);assert.ok(hosted.every(({mesh})=>mesh.count===0));
  understory.update(createState(trees),active,7);
  assert.ok(batches.every(({mesh,count})=>mesh.count===count),'replacing the world at the same revision restores living hosts');
  const stable=versions();understory.update(createState(trees),active,7);assert.deepEqual(versions(),stable);
});
