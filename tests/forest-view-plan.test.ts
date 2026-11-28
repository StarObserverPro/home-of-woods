import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createForestViewPlanner} from '../src/scene/forest-view-plan.ts';
import {createStreamedForest} from '../src/scene/streamed-forest.ts';
import {createFrameWorkQueue} from '../src/scene/frame-work-queue.ts';
import {createState} from '../src/domain/state.ts';
import {heightAt} from '../src/world/surface.ts';
import type {Tree} from '../src/world/layout.ts';

function tree(id:string,x:number,z:number,overrides:Partial<Tree>={}):Tree {
  return {id,individualId:`${id}:g0`,generation:0,x,z,kind:'pine',scale:1,variant:0,role:'scenery',...overrides};
}
function fixture(trees:Tree[],geometry=new THREE.SphereGeometry(1,8,6)) {
  const material=new THREE.MeshStandardMaterial(),group=new THREE.Group(),mesh=new THREE.InstancedMesh(geometry,material,trees.length);
  mesh.castShadow=true;group.add(mesh);
  const selections=new Map<string,THREE.Object3D>(),mappings=new Map<THREE.Object3D,string[]>();
  for(const item of trees)if(item.role!=='scenery'){
    const near=new THREE.Mesh(geometry,material);group.add(near);selections.set(item.id,near);mappings.set(near,[item.id]);
  }
  const forest={group,material,selections,mappings,sceneryBatches:[{mesh,members:trees}],canopyTrees:trees};
  return {forest,mesh,dispose(){mesh.dispose();geometry.dispose();material.dispose();}};
}
function camera(y=30) {
  const view=new THREE.PerspectiveCamera(90,1,.1,150);view.position.set(0,y,0);view.lookAt(0,y,-1);view.updateMatrixWorld();return view;
}
function drain(queue:ReturnType<typeof createFrameWorkQueue>) {
  for(let step=0;queue.stats().pending&&step<1000;step++)queue.run({budgetMs:3,maxSteps:1});
  assert.equal(queue.stats().pending,0);
}
function submitted(f:ReturnType<typeof fixture>) {
  const result=new Set<string>(),matrix=new THREE.Matrix4();
  for(let i=0;i<f.mesh.count;i++){
    f.mesh.getMatrixAt(i,matrix);
    const member=f.forest.sceneryBatches[0].members.find(tree=>Math.abs(tree.x-matrix.elements[12])<1e-5&&Math.abs(tree.z-matrix.elements[14])<1e-5);
    assert.ok(member);result.add(member.id);
  }
  return result;
}

test('forest view uses full scaled crown bounds, a world-space guard, and actual authored rotations',t=>{
  const f=fixture([tree('center',0,-10),tree('crown-edge',12,-10,{scale:3}),tree('outside',16,-10)]);t.after(()=>f.dispose());
  const planner=createForestViewPlanner(f.forest.sceneryBatches),view=camera();
  const exact=planner.plan({camera:view,guard:0});
  assert.ok(exact.currentIDs.has('center'));assert.ok(exact.currentIDs.has('crown-edge'),'a crown intersecting the frame stays even when its stem is outside');
  assert.ok(!exact.currentIDs.has('outside'));
  assert.ok(planner.plan({camera:view,guard:5}).currentIDs.has('outside'),'margin is measured around tree geometry in world units');
  f.mesh.position.x=100;
  assert.equal(planner.plan({camera:view,guard:0}).currentIDs.size,0,'batch/parent transforms participate in the world sphere');

  const offset=new THREE.SphereGeometry(1,8,6);offset.translate(5,0,0);
  const rotated=fixture([tree('turned-away',0,-5,{variant:.25,scale:2}),tree('turned-toward',0,-5,{variant:-.25,scale:2})],offset);t.after(()=>rotated.dispose());
  const plan=createForestViewPlanner(rotated.forest.sceneryBatches).plan({camera:view,guard:0});
  assert.ok(plan.currentIDs.has('turned-away'));assert.ok(!plan.currentIDs.has('turned-toward'),'local crown offset rotates around the tree origin');
});

test('current and forecast frusta retain their union and preserve offscreen solid shadow casters',t=>{
  const f=fixture([tree('front',0,-15),tree('back',0,20)]);t.after(()=>f.dispose());
  const planner=createForestViewPlanner(f.forest.sceneryBatches),front=camera(),back=camera();back.lookAt(0,30,1);back.updateMatrixWorld();
  const plan=planner.plan({camera:front,forecastCameras:[back],guard:0});
  assert.deepEqual(plan.currentIDs,new Set(['front']));assert.deepEqual(plan.wantedIDs,new Set(['front','back']));
  const reverse=planner.plan({camera:back,guard:0});assert.deepEqual(reverse.currentIDs,new Set(['back']));assert.deepEqual(reverse.wantedIDs,reverse.currentIDs);
  const shadow=new THREE.OrthographicCamera(-5,5,5,-5,.1,100);shadow.position.set(0,60,20);shadow.lookAt(0,0,20);shadow.updateMatrixWorld();
  const protectedPlan=planner.plan({camera:front,shadowCamera:shadow,guard:0});assert.ok(protectedPlan.currentIDs.has('back'));assert.equal(protectedPlan.stats.shadow,1);
  f.mesh.castShadow=false;assert.ok(!planner.plan({camera:front,shadowCamera:shadow,guard:0}).currentIDs.has('back'));
});

test('planar reflection keeps trees whose bodies are offscreen, including future reflected views',t=>{
  const f=fixture([tree('reflected-tree',0,-10)]);t.after(()=>f.dispose());
  const planner=createForestViewPlanner(f.forest.sceneryBatches),view=camera(0),mirrorView=camera(0);
  mirrorView.lookAt(0,-heightAt(0,-10),-10);mirrorView.updateMatrixWorld();
  assert.equal(planner.plan({camera:mirrorView,guard:0}).currentIDs.size,0,'the physical tree is outside this downward view');
  const reflected=planner.plan({camera:mirrorView,mirrorY:0,guard:0});assert.deepEqual(reflected.currentIDs,new Set(['reflected-tree']));assert.equal(reflected.stats.reflection,1);
  const future=planner.plan({camera:view,forecastCameras:[mirrorView],mirrorY:0,guard:0});
  assert.equal(future.currentIDs.size,0);assert.deepEqual(future.wantedIDs,new Set(['reflected-tree']));
});

test('far preparation progresses in eight-tree steps despite repeated requests and discards reversed intent',t=>{
  const trees=Array.from({length:32},(_,i)=>tree(`scenery-${i}`,i,-10)),f=fixture(trees);t.after(()=>f.dispose());
  const queue=createFrameWorkQueue(()=>0),stream=createStreamedForest(f.forest,trees,queue);t.after(()=>{stream.dispose();queue.dispose();});
  stream.update(createState(trees));stream.requestView(new Set());drain(queue);assert.equal(f.mesh.count,0);
  const all=new Set(trees.map(tree=>tree.id));stream.requestView(all);assert.equal(stream.isViewReady(all),false);
  queue.run({budgetMs:3,maxSteps:1});assert.equal(f.mesh.count,8);assert.equal(stream.isViewReady(all),false);
  for(let frame=0;frame<3;frame++){stream.requestView(new Set(all));queue.run({budgetMs:3,maxSteps:1});}
  assert.equal(stream.isViewReady(all),true);assert.deepEqual(submitted(f),all);assert.equal(queue.stats().replaced,0,'new frames do not restart an unfinished batch');
  assert.equal(stream.stats().maxViewStepTrees,8);

  stream.requestView(new Set());drain(queue);
  const firstHalf=new Set(trees.slice(0,16).map(tree=>tree.id)),secondHalf=new Set(trees.slice(16).map(tree=>tree.id));
  stream.requestView(firstHalf);queue.run({budgetMs:3,maxSteps:1});assert.equal(f.mesh.count,8);
  stream.requestView(secondHalf);
  for(let frame=0;frame<4;frame++){stream.requestView(new Set(secondHalf));queue.run({budgetMs:3,maxSteps:1});}
  drain(queue);assert.deepEqual(submitted(f),secondHalf);assert.equal(stream.isViewReady(secondHalf),true);
  assert.equal(stream.stats().pendingViewTrees,0);
});

test('turning back restores the required trees immediately and records that work outside the queue budget',t=>{
  const trees=[tree('front',0,-15),tree('back',0,20)],f=fixture(trees);t.after(()=>f.dispose());
  const queue=createFrameWorkQueue(()=>0),stream=createStreamedForest(f.forest,trees,queue),planner=createForestViewPlanner(f.forest.sceneryBatches);
  t.after(()=>{stream.dispose();queue.dispose();});stream.update(createState(trees));
  const view=camera();let plan=planner.plan({camera:view,guard:0});stream.requestView(plan.wantedIDs);drain(queue);assert.deepEqual(submitted(f),new Set(['front']));
  view.lookAt(0,30,1);view.updateMatrixWorld();plan=planner.plan({camera:view,guard:0});stream.requestView(plan.wantedIDs);
  assert.equal(stream.isViewReady(plan.currentIDs),false);const steps=queue.stats().totalSteps;
  assert.equal(stream.ensureCurrentView(plan.currentIDs),1);assert.equal(stream.isViewReady(plan.currentIDs),true);
  assert.equal(queue.stats().totalSteps,steps,'repair does not pretend to be queued work');
  assert.equal(stream.stats().immediateViewRepairs,1);assert.equal(stream.stats().immediateViewRepairCalls,1);
  drain(queue);assert.deepEqual(submitted(f),new Set(['back']));
  view.lookAt(0,30,-1);view.updateMatrixWorld();plan=planner.plan({camera:view,guard:0});stream.requestView(plan.wantedIDs);drain(queue);
  assert.deepEqual(submitted(f),new Set(['front']));
});

test('queued stale views never resurrect falling trees, and world replacement cancels obsolete work',t=>{
  const trees=[tree('managed',100,0,{role:'managed'})],f=fixture(trees);t.after(()=>f.dispose());
  const queue=createFrameWorkQueue(()=>0),stream=createStreamedForest(f.forest,trees,queue);t.after(()=>{stream.dispose();queue.dispose();});
  const state=createState(trees);state.player.x=state.player.z=0;stream.update(state);stream.requestView(new Set());drain(queue);
  assert.equal(stream.activeChunks.size,0);assert.equal(f.mesh.count,0);
  const wanted=new Set(['managed']);stream.requestView(wanted);assert.equal(stream.isViewReady(wanted),false);
  state.forestry.slots.managed.status='falling';drain(queue);assert.equal(f.mesh.count,0,'a step rechecks live state even before another update call');
  stream.update(state);stream.requestView(wanted);assert.equal(stream.ensureCurrentView(wanted),0);assert.equal(f.mesh.count,0);
  state.forestry.slots.managed.status='standing';stream.update(state);stream.requestView(wanted);drain(queue);assert.equal(f.mesh.count,1);
  state.forestry.slots.managed.status='stump';stream.update(state);assert.equal(f.mesh.count,0,'a hidden host is removed before speculative work runs');
  state.forestry.slots.managed.status='standing';stream.update(state);assert.ok(queue.stats().pending>0);
  const restored=createState(trees);restored.player.x=restored.player.z=0;restored.forestry.slots.managed.status='stump';
  stream.update(restored);stream.requestView(wanted);drain(queue);assert.equal(f.mesh.count,0);assert.ok(queue.stats().cancelled>0);
  const planner=createForestViewPlanner(f.forest.sceneryBatches),view=camera();view.position.set(100,40,30);view.lookAt(100,30,0);view.updateMatrixWorld();
  assert.equal(planner.plan({camera:view,state:restored,guard:0}).wantedIDs.size,0,'dead hosts also leave the visibility plan');
});
