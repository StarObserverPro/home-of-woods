import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Models} from '../src/scene/models.ts';
import {Resources} from '../src/scene/resources.ts';
import {createFrameWorkQueue} from '../src/scene/frame-work-queue.ts';
import {createStreamedForest} from '../src/scene/streamed-forest.ts';
import {createState} from '../src/domain/state.ts';
import {treeScaleFactor} from '../src/domain/forestry.ts';
import {chunkKey} from '../src/world/regions.ts';
import type {Tree} from '../src/world/layout.ts';

const WEST = {x:-60,z:12}, EAST = {x:64,z:12};
const tree = (id:string,x:number,z:number,role:Tree['role']='managed'):Tree => ({
  id,individualId:`${id}:g0`,generation:0,x,z,kind:'pine',scale:1.1,variant:.2,role,
});

/** Real tree geometry and instances, with three members on either side of a stream boundary. */
function fixture() {
  const trees = [tree('budget-west-a',-64,12),tree('budget-west-b',-60,13),tree('budget-west-c',-56,14),
    tree('budget-east-a',60,12),tree('budget-east-b',64,13),tree('budget-east-c',68,14),
    tree('budget-scenery-a',-8,90,'scenery'),tree('budget-scenery-b',8,90,'scenery'),
    tree('budget-landmark',120,-60,'landmark')];
  const resources=new Resources(),models=new Models(resources),forest=models.createForest(trees,true);
  const queue=createFrameWorkQueue(()=>0),stream=createStreamedForest(forest,trees,queue),state=createState(trees);
  Object.assign(state.player,WEST);
  const matrix=new THREE.Matrix4(),byPosition=new Map(trees.map(t=>[`${t.x}:${t.z}`,t.id]));
  const farIds=()=>forest.sceneryBatches.flatMap(batch=>{
    const ids:string[]=[];
    for(let i=0;i<batch.mesh.count;i++){
      batch.mesh.getMatrixAt(i,matrix);
      const id=byPosition.get(`${Math.round(matrix.elements[12])}:${Math.round(matrix.elements[14])}`);
      assert.ok(id,'every submitted instance has an authored world position');ids.push(id);
    }
    assert.equal(batch.mesh.visible,batch.mesh.count>0);
    return ids;
  });
  const conserved=(absent:readonly string[]=[])=>{
    const ids=[...forest.selections.keys(),...farIds()];
    assert.equal(ids.length,new Set(ids).size,'a tree never has both detailed and far representations');
    assert.deepEqual([...ids].sort(),trees.map(t=>t.id).filter(id=>!absent.includes(id)).sort(),'no tree disappears during a yielded load');
    assert.equal(forest.mappings.size,forest.selections.size);
    for(const [id,mesh] of forest.selections){assert.equal(mesh.parent,forest.group);assert.deepEqual(forest.mappings.get(mesh),[id]);}
    for(const key of new Set(trees.filter(t=>t.role!=='scenery').map(chunkKey))){
      const members=trees.filter(t=>t.role!=='scenery'&&chunkKey(t)===key);
      const present=members.filter(t=>forest.selections.has(t.id)).length;
      assert.ok(present===0||present===members.length,'a chunk is committed as a complete selection set');
      assert.equal(stream.activeChunks.has(key),present===members.length);
    }
  };
  const step=()=>queue.run({budgetMs:1,maxSteps:1});
  const drain=(check:()=>void=conserved)=>{
    let steps=0;
    while(queue.stats().pending){assert.ok(steps++<100,'bounded fixture work must converge');step();check();}
    return steps;
  };
  const settleWest=()=>{stream.update(state);drain();};
  const dispose=()=>{stream.dispose();queue.dispose();forest.group.clear();models.clear();resources.dispose();};
  return {trees,resources,models,forest,queue,stream,state,matrix,farIds,conserved,step,drain,settleWest,dispose};
}

test('every yielded forest slice preserves identities and commits complete chunks',t=>{
  const f=fixture();t.after(f.dispose);
  f.conserved(); // Construction itself must remove the old duplicated near/far copies.
  f.settleWest();
  assert.equal(f.forest.selections.has('budget-east-a'),false);
  assert.ok(f.forest.selections.has('budget-landmark'),'protected landmark remains resident');
  Object.assign(f.state.player,EAST);const before=JSON.stringify(f.state);
  f.stream.update(f.state);f.conserved();
  f.step();f.conserved();
  assert.equal(f.forest.selections.has('budget-east-a'),false,'preparing the first member cannot publish a partial chunk');
  assert.ok(f.queue.stats().pending>0,'a real shared queue yields instead of synchronously draining');
  const steps=f.drain();assert.ok(steps>=3,'remaining members and commit require separate work units');
  assert.ok(f.forest.selections.has('budget-east-a'));assert.equal(f.forest.selections.has('budget-west-a'),false);
  assert.equal(JSON.stringify(f.state),before,'visual preparation never advances or mutates the world');
});

test('turning back during a load cancels unpublished meshes without holes or cache churn',t=>{
  const f=fixture();t.after(f.dispose);f.settleWest();
  const allocation=f.resources.stats(),west=f.forest.selections.get('budget-west-a'),loads=f.stream.stats().loads;
  Object.assign(f.state.player,EAST);f.stream.update(f.state);f.step();f.conserved();
  const prepared=f.stream.stats().preparedTrees;assert.equal(prepared,1);
  Object.assign(f.state.player,WEST);f.stream.update(f.state);f.conserved();f.drain();
  assert.equal(f.stream.stats().loads,loads,'cancelled preparation never becomes a visible load');
  assert.equal(f.forest.selections.get('budget-west-a'),west);
  assert.equal(f.forest.selections.has('budget-east-a'),false);
  assert.ok(f.queue.stats().cancelled>=1);
  assert.deepEqual(f.resources.stats(),allocation,'cancelled Mesh wrappers borrow, rather than recreate, geometry caches');
});

test('replacing forestry slots invalidates pending work even when the GameState object is retained',t=>{
  const f=fixture();t.after(f.dispose);f.settleWest();
  const originalState=f.state,oldSlots=f.state.forestry.slots,allocation=f.resources.stats();
  Object.assign(f.state.player,EAST);f.stream.update(f.state);f.step();
  const oldEpoch=f.stream.stats().epoch,oldPrepared=f.stream.stats().preparedTrees;
  f.state.forestry.slots=structuredClone(oldSlots);
  const life=f.state.forestry.slots['budget-east-a'];
  Object.assign(life,{generation:1,individualId:`${life.slotId}:g1`,status:'sapling',bornAt:0,maturesAt:1000});
  f.state.time=1;const before=JSON.stringify(f.state);
  f.stream.update(f.state);f.conserved();
  assert.equal(f.state,originalState);assert.notEqual(f.state.forestry.slots,oldSlots);
  assert.ok(f.stream.stats().epoch>oldEpoch);assert.ok(f.queue.stats().cancelled>0);
  f.step();f.conserved();
  assert.equal(f.stream.stats().preparedTrees,oldPrepared+1,'replacement starts a new preparation rather than publishing the old partial chunk');
  f.drain();assert.equal(JSON.stringify(f.state),before);assert.deepEqual(f.resources.stats(),allocation);
});

test('falling and stump changes remove far copies immediately and compact the actual instance count',t=>{
  const f=fixture();t.after(f.dispose);f.settleWest();
  const first=f.trees.find(t=>t.id==='budget-east-a')!,second=f.trees.find(t=>t.id==='budget-east-b')!;
  const beforeCount=f.farIds().length;
  // Pending cosmetic work must not delay authoritative lifecycle visibility.
  f.queue.enqueue({key:'fixture:background',priority:10000,step:()=>false});
  Object.assign(f.state.forestry.slots[first.id],{status:'falling',felledAt:f.state.time});
  Object.assign(f.state.forestry.slots[second.id],{status:'stump',felledAt:0,regrowAt:1000});
  const steps=f.queue.stats().totalSteps;f.stream.update(f.state);
  assert.equal(f.queue.stats().totalSteps,steps,'immediate visibility fixes do not need a queued step');
  assert.equal(f.farIds().length,beforeCount-2);f.conserved([first.id,second.id]);
  assert.ok(!f.farIds().includes(first.id)&&!f.farIds().includes(second.id));
  Object.assign(f.state.forestry.slots[first.id],{status:'sapling',bornAt:0,maturesAt:1000});
  f.state.time=1;f.stream.update(f.state);f.conserved([second.id]);
  const batch=f.forest.sceneryBatches.find(b=>b.members.some(t=>t.id===first.id))!;
  let found=false;
  for(let i=0;i<batch.mesh.count;i++){
    batch.mesh.getMatrixAt(i,f.matrix);
    if(Math.abs(f.matrix.elements[12]-first.x)<.001){
      const scale=new THREE.Vector3().setFromMatrixScale(f.matrix).x;
      assert.ok(Math.abs(scale-first.scale*treeScaleFactor(f.state.forestry.slots[first.id],f.state.time))<1e-5);
      found=true;
    }
  }
  assert.ok(found,'a new generation is appended with its current growth scale');
  f.queue.cancel('fixture:background');
});

test('disposing a pending forest cancels only its jobs and leaves shared resources to their owner',t=>{
  const f=fixture();t.after(f.dispose);f.settleWest();
  const owned=new Set<THREE.BufferGeometry|THREE.Material|THREE.Texture>([f.forest.material,f.models.barkSurface.map,f.models.barkSurface.normalMap]);
  f.forest.group.traverse(object=>{if(object instanceof THREE.Mesh){owned.add(object.geometry);for(const m of Array.isArray(object.material)?object.material:[object.material])owned.add(m);}});
  let released=0;for(const resource of owned)resource.addEventListener('dispose',()=>released++);
  const allocation=f.resources.stats();
  Object.assign(f.state.player,EAST);f.stream.update(f.state);f.step();
  let unrelated=0;f.queue.enqueue({key:'fixture:other-owner',priority:1,step:()=>{unrelated++;return true;}});
  f.stream.dispose();f.stream.dispose();
  const children=f.forest.group.children.length;
  assert.equal(f.queue.stats().pending,1,'other scene owners retain their scheduled work');
  f.step();assert.equal(unrelated,1);assert.equal(f.queue.stats().pending,0);
  f.stream.update(f.state);assert.equal(f.forest.group.children.length,children,'disposed work cannot reattach a prepared tree');
  assert.equal(released,0);assert.deepEqual(f.resources.stats(),allocation);
  f.models.clear();f.resources.dispose();assert.equal(released,owned.size,'only the shared Resources owner disposes each borrowed resource');
});
