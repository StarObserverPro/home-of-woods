import { inventoryCount } from '../src/domain/inventory.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/domain/state.ts';
import { createGatheringRegistry } from '../src/domain/gathering-registry.ts';
import { ITEMS } from '../src/content/items.ts';
import { GATHERABLES } from '../src/content/gatherables.ts';
import { RUNTIME_MODELS } from '../src/content/assets.ts';
import { makeGatheringSources } from '../src/world/gathering-layout.ts';
import { makeTrees, makeColliders } from '../src/world/layout.ts';
import { beginGather, advanceGather, commitGather, regenerationCandidate, canInteract, interactionRoute, cancelGather, gatheringBusy } from '../src/domain/gathering.ts';
import { gatheringSnapshot } from '../src/domain/gathering-view.ts';
import { startPlayerChop, cancelPlayerAction, advancePlayerGather } from '../src/app/player-actions.ts';
import { move } from '../src/domain/navigation.ts';
const assets=RUNTIME_MODELS.map(a=>a.assetId), trees=makeTrees(), blockers=makeColliders(trees);
const registry=createGatheringRegistry({assetIds:assets});
const branch=makeGatheringSources()[0], mushroom=makeGatheringSources()[1];
function ready(source=branch,customRegistry=registry){
  const state=createState();state.selected=source.sourceId;state.player={x:source.x-1,z:source.z,facing:0,moving:false};
  assert.ok(beginGather(state,source.sourceId,customRegistry,blockers).ok);return state;
}
function due(state:ReturnType<typeof createState>,r=registry){advanceGather(state,r,blockers);state.time=state.gathering.action!.startedAt!+state.gathering.action!.durationSeconds;return advanceGather(state,r,blockers);}
function collect(state:ReturnType<typeof createState>,r=registry){const candidate=due(state,r);assert.ok(candidate);assert.ok(commitGather(state,candidate,r,blockers));return candidate;}

test('registry rejects duplicate identities, bad references/strategies/numbers/anchors and unreachable sources',()=>{
  assert.throws(()=>createGatheringRegistry({assetIds:assets,items:[...ITEMS,ITEMS[0]]}),/Duplicate/);
  assert.throws(()=>createGatheringRegistry({assetIds:[],}),/reference/);
  assert.throws(()=>createGatheringRegistry({assetIds:assets,definitions:[{...GATHERABLES[0],itemId:'missing'}]}),/reference/);
  assert.throws(()=>createGatheringRegistry({assetIds:assets,definitions:[{...GATHERABLES[0],regeneration:{kind:'unknown',configKey:'x'}}] as never}),/regeneration/);
  assert.throws(()=>createGatheringRegistry({assetIds:assets,definitions:[{...GATHERABLES[0],capacity:NaN}]}),/configuration/);
  assert.throws(()=>createGatheringRegistry({assetIds:assets,sources:[{...branch,targetAnchor:{x:NaN,y:0,z:0}}]}),/source/);
  assert.throws(()=>createGatheringRegistry({assetIds:assets,isReachable:()=>false}),/Unreachable/);
});
test('both kinds use the same reachable route, action, inventory candidate and atomic commit',()=>{
  for(const source of registry.sources.values()){
    const state=createState();state.selected=source.sourceId;
    assert.ok(beginGather(state,source.sourceId,registry,blockers).ok);
    for(let i=0;i<3000 && gatheringBusy(state.gathering);i++){
      state.time+=1/60;
      const p=state.route[0];
      if(p){const d=Math.hypot(p.x-state.player.x,p.z-state.player.z);if(d<.18)state.route.shift();else state.player={...state.player,...move(state.player,(p.x-state.player.x)/d*5.2/60,(p.z-state.player.z)/d*5.2/60,blockers)};}
      advancePlayerGather(state,registry,blockers);
    }
    assert.equal(state.gathering.action?.phase,'completed');
    const d=registry.definitions.get(source.definitionId)!;
    assert.equal(inventoryCount(state.inventory,d.itemId,d.qualityId),d.yieldPerUnit);assert.equal(state.gathering.sources[source.sourceId].remaining,0);
    assert.equal(inventoryCount(state.inventory,'wood'),0);assert.equal(state.forestry.ledger.used,0);
  }
});
test('candidate creation does not mutate balances, stale inventory/source/action and replay are rejected',()=>{
  const state=ready(),candidate=due(state)!;
  assert.equal(state.inventory.revision,0);assert.equal(state.gathering.sources[branch.sourceId].remaining,1);
  const original=structuredClone(state);state.inventory.revision++;
  assert.equal(commitGather(state,candidate,registry,blockers),false);assert.equal(state.gathering.sources[branch.sourceId].remaining,1);
  Object.assign(state,structuredClone(original));state.gathering.sources[branch.sourceId].version++;
  assert.equal(commitGather(state,candidate,registry,blockers),false);assert.equal(inventoryCount(state.inventory,'branch'),0);
  Object.assign(state,structuredClone(original));assert.ok(commitGather(state,candidate,registry,blockers));
  assert.equal(commitGather(state,candidate,registry,blockers),false);assert.equal(inventoryCount(state.inventory,'branch'),3);
  assert.equal(beginGather(state,branch.sourceId,registry,blockers).ok,false);
  for(let i=0;i<5;i++) {assert.equal(advanceGather(state,registry,blockers),null);gatheringSnapshot(state,registry,blockers);}
  assert.equal(inventoryCount(state.inventory,'branch'),3);
});
test('movement, target change, cancellation, changed source and obstacles before completion do not award inventory',()=>{
  for(const change of [
    (s:ReturnType<typeof createState>)=>cancelPlayerAction(s),
    (s:ReturnType<typeof createState>)=>{s.selected=mushroom.sourceId;},
    (s:ReturnType<typeof createState>)=>{s.player.x-=20;},
    (s:ReturnType<typeof createState>)=>{s.gathering.sources[branch.sourceId].version++;},
  ]){const state=ready();change(state);assert.equal(advancePlayerGather(state,registry,blockers),null);assert.deepEqual(state.inventory.stacks,[]);}
  const barrier={id:'test-wall',x:branch.x-.5,z:branch.z,halfX:.1,halfZ:1};
  assert.equal(canInteract({x:branch.x-1,z:branch.z},branch,[barrier]),false);
  const state=ready(),candidate=due(state)!;
  assert.equal(commitGather(state,candidate,registry,[...blockers,barrier]),false);assert.deepEqual(state.inventory.stacks,[]);
});
test('one player action owner prevents simultaneous chopping/gathering',()=>{
  const state=ready();assert.equal(startPlayerChop(state,trees.find(t=>t.role==='managed')).ok,false);
  assert.equal(beginGather(state,mushroom.sourceId,registry,blockers).ok,false);
  cancelPlayerAction(state);assert.equal(gatheringBusy(state.gathering),false);
  state.forestry.active={id:'busy'} as never;state.selected=branch.sourceId;
  assert.equal(beginGather(state,branch.sourceId,registry,blockers).ok,false);
});
test('action receiver can observe approaching, performing/progress, completed and cancelled without writing rewards',()=>{
  const delayed=createGatheringRegistry({assetIds:assets,definitions:GATHERABLES.map(d=>({...d,durationSeconds:2}))});
  const state=ready(branch,delayed),observed=[];
  observed.push(gatheringSnapshot(state,delayed,blockers).action!);
  assert.equal(advanceGather(state,delayed,blockers),null);state.time=1;
  assert.equal(advanceGather(state,delayed,blockers),null);observed.push(gatheringSnapshot(state,delayed,blockers).action!);
  assert.equal(observed[1].phase,'performing');assert.equal(observed[1].progress,.5);
  assert.deepEqual(state.inventory.stacks,[]);state.time=2;collect(state,delayed);
  observed.push(gatheringSnapshot(state,delayed,blockers).action!);
  assert.deepEqual(observed.map(a=>a.phase),['approaching','performing','completed']);
  assert.ok(observed.every(a=>a.actionId===observed[0].actionId&&a.motionTag==='gather.climb'&&Number.isFinite(a.targetAnchor.y)));
  const cancelled=ready(mushroom);cancelGather(cancelled);
  assert.equal(gatheringSnapshot(cancelled,registry,blockers).action?.phase,'cancelled');
  assert.equal(gatheringSnapshot(cancelled,registry,blockers).action?.motionTag,'gather.pluck');
});
test('unconfigured recovery, serialization and representation rebuild never replenish sources',()=>{
  const state=ready();collect(state);
  assert.equal(regenerationCandidate(state.gathering,registry,{now:999999,period:100}),state.gathering);
  const saved=JSON.stringify(state),loaded=JSON.parse(saved);
  createGatheringRegistry({assetIds:assets});gatheringSnapshot(loaded,registry,blockers);
  assert.equal(JSON.stringify(loaded),saved);assert.equal(loaded.gathering.sources[branch.sourceId].remaining,0);
  assert.equal(inventoryCount(loaded.inventory,'branch'),3);assert.equal(loaded.time,state.time);
});
test('period refill is monotonic, idempotent, capacity capped and independent from depletion wait',()=>{
  const state=ready();collect(state);
  const configs={'ground-branches':{capacity:2},'ground-mushrooms':{capacity:1,waitSeconds:10}};
  let s=regenerationCandidate(state.gathering,registry,{now:100,period:3},configs);
  assert.equal(s.sources[branch.sourceId].remaining,2);assert.equal(s.sources[branch.sourceId].lastPeriod,3);
  s.sources[branch.sourceId]={...s.sources[branch.sourceId],remaining:1};
  assert.equal(regenerationCandidate(s,registry,{now:101,period:3},configs),s);
  assert.equal(regenerationCandidate(s,registry,{now:102,period:2},configs),s);
  s=regenerationCandidate(s,registry,{now:200,period:999},configs);
  assert.equal(s.sources[branch.sourceId].remaining,2);
  assert.throws(()=>regenerationCandidate(s,registry,{now:NaN},configs));
});
test('depletion waits from the final unit, each point has an independent deadline, due restoration is once',()=>{
  const configs={'ground-mushrooms':{capacity:2,waitSeconds:10}};
  const state=ready(mushroom);state.gathering.sources[mushroom.sourceId].remaining=2;state.time=2;collect(state);
  assert.equal(state.gathering.sources[mushroom.sourceId].depletedAt,null);
  state.time=8;assert.ok(beginGather(state,mushroom.sourceId,registry,blockers).ok);collect(state);
  assert.equal(state.gathering.sources[mushroom.sourceId].depletedAt,13);
  const other=makeGatheringSources()[3];state.gathering.sources[other.sourceId]={remaining:0,version:1,lastPeriod:null,depletedAt:17};
  assert.equal(regenerationCandidate(state.gathering,registry,{now:22},configs),state.gathering);
  const due=regenerationCandidate(state.gathering,registry,{now:23},configs);
  assert.equal(due.sources[mushroom.sourceId].remaining,2);assert.equal(due.sources[mushroom.sourceId].depletedAt,null);
  assert.equal(due.sources[other.sourceId].remaining,0);assert.equal(regenerationCandidate(due,registry,{now:23},configs),due);
  assert.equal(regenerationCandidate(due,registry,{now:27},configs).sources[other.sourceId].remaining,2);
});
