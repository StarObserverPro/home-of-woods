import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createStreamedForest} from '../src/scene/streamed-forest.ts';
import {createFrameWorkQueue} from '../src/scene/frame-work-queue.ts';
import {createState} from '../src/domain/state.ts';
import type {Tree} from '../src/world/layout.ts';

test('forest residency invalidates only on atomic chunk commits, independently of far instance changes',t=>{
  const trees:Tree[]=[['managed-a',100,'managed'],['managed-b',101,'managed'],['scenery',550,'scenery']].map(([id,x,role])=>({
    id:id as string,individualId:`${id}:g0`,generation:0,x:x as number,z:0,kind:'pine',scale:1,variant:0,role:role as Tree['role'],
  }));
  const geometry=new THREE.BoxGeometry(2,6,2),material=new THREE.MeshStandardMaterial(),group=new THREE.Group();
  const mesh=new THREE.InstancedMesh(geometry,material,trees.length);group.add(mesh);
  const selections=new Map<string,THREE.Object3D>(),mappings=new Map<THREE.Object3D,string[]>();
  for(const tree of trees.filter(tree=>tree.role==='managed')){
    const near=new THREE.Mesh(geometry,material);selections.set(tree.id,near);mappings.set(near,[tree.id]);group.add(near);
  }
  const queue=createFrameWorkQueue(()=>0),stream=createStreamedForest({group,material,selections,mappings,
    sceneryBatches:[{mesh,members:trees}],canopyTrees:trees},trees,queue);
  t.after(()=>{stream.dispose();queue.dispose();mesh.dispose();geometry.dispose();material.dispose();});
  const state=createState(trees);state.player.x=state.player.z=0;
  const step=()=>queue.run({budgetMs:3,maxSteps:1});
  const assertResidency=(expected:number)=>{assert.equal(stream.residencyRevision,expected);assert.equal(stream.stats().residencyRevision,expected);};

  assert.ok(stream.revision>0,'initial scenery submissions change the general presentation revision');assertResidency(0);
  stream.update(state);assert.equal(stream.stats().pendingChunks,1);assertResidency(0);
  step();assert.equal(stream.activeChunks.size,0);assert.equal(mesh.count,3);assertResidency(1);
  const membership=new Set(stream.activeChunks);

  let revision=stream.revision;
  state.forestry.slots['managed-a'].status='falling';stream.update(state);
  assert.equal(mesh.count,2);assert.ok(stream.revision>revision);assertResidency(1);
  state.forestry.slots['managed-a'].status='sapling';state.forestry.slots['managed-a'].bornAt=0;
  stream.update(state);assert.equal(mesh.count,3);assertResidency(1);
  revision=stream.revision;state.time=40;stream.update(state);
  assert.ok(stream.revision>revision,'rescaling a distant sapling updates its instance');assertResidency(1);
  revision=stream.revision;state.player.x=-20;stream.update(state);
  assert.equal(mesh.count,2);assert.ok(stream.revision>revision,'crossing scenery draw distance changes only far submission');assertResidency(1);
  assert.deepEqual(stream.activeChunks,membership);

  state.player.x=100;stream.update(state);step();step();
  assert.equal(stream.stats().pendingChunks,1);assert.equal(selections.size,0);assertResidency(1);
  state.player.x=0;stream.update(state);
  assert.equal(stream.stats().pendingChunks,0);assert.equal(queue.stats().pending,0);assertResidency(1);
  assert.equal(selections.size,0,'cancelled preparation does not partially commit membership');

  state.player.x=100;stream.update(state);step();assertResidency(1);step();assertResidency(1);
  step();assert.equal(stream.activeChunks.size,1);assert.equal(selections.size,2);assertResidency(2);
  assert.equal(stream.stats().commits,2,'both members become resident in one atomic commit');
  stream.reset();stream.update(state);assertResidency(2);
});
