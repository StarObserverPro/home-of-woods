import { inventoryCount, inventoryTransaction } from '../src/domain/inventory.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGatheringSources } from '../src/world/gathering-layout.ts';
import { makeTrees, makeColliders } from '../src/world/layout.ts';
import { heightAt } from '../src/world/surface.ts';
import { TREE_RESOURCE_PROFILES } from '../src/content/tree-resources.ts';
import { RUNTIME_MODELS } from '../src/content/assets.ts';
import { ITEMS } from '../src/content/items.ts';
import { PROCESSING } from '../src/content/processing.ts';
import { createProcessingService } from '../src/domain/processing.ts';
import { warehouseSnapshot } from '../src/domain/warehouse-view.ts';
import { createState } from '../src/domain/state.ts';
import { createGatheringRegistry } from '../src/domain/gathering-registry.ts';
import { synchronizeGatheringHosts, beginGather, advanceGather, commitGather, regenerationCandidate, interactionRoute } from '../src/domain/gathering.ts';

const trees=makeTrees(),blockers=makeColliders(trees),registry=createGatheringRegistry({assetIds:RUNTIME_MODELS.map(a=>a.assetId)});
test('resource identities resolve to fixed hosts and species-specific circles grounded on the shared surface',()=>{
  const sources=makeGatheringSources();assert.equal(sources.length,10);
  assert.deepEqual(sources,makeGatheringSources([...trees].reverse()),'loading order cannot change identities or circle placement');
  for(const s of sources){
    const host=trees.find(t=>t.id===s.hostRef!.slotId)!;assert.ok(host);assert.equal(s.hostRef!.id,host.individualId);
    assert.equal(s.hostKind,host.kind);assert.equal(s.hostRef!.kind,host.role==='landmark'?'landmark':'tree-individual');
    assert.ok(interactionRoute({player:{x:-35,z:2,facing:0,moving:false}},s,registry,blockers).reachable);
    for(const p of s.patches!)assert.equal(p.y,heightAt(p.x,p.z));
    if(s.placement==='mushroom-circle'){
      const profile=TREE_RESOURCE_PROFILES[host.kind];assert.equal(s.patches!.length,profile.patches);
      for(const p of s.patches!)assert.ok(Math.abs(Math.hypot(p.x-host.x,p.z-host.z)-(host.scale*profile.radiusPerScale+profile.radiusBase))<1e-8);
    }else assert.equal(s.patches!.length,1);
  }
  assert.equal(new Set(sources.map(s=>s.sourceId)).size,sources.length);
});
test('felling invalidates hosted resources and stale candidates; cancellation does not deplete the host',()=>{
  const state=createState(),source=makeGatheringSources()[0],host=state.forestry.slots[source.hostRef!.slotId];
  host.status='chopping';synchronizeGatheringHosts(state,registry);assert.equal(state.gathering.sources[source.sourceId].remaining,1);
  host.status='standing';synchronizeGatheringHosts(state,registry);assert.equal(state.gathering.sources[source.sourceId].remaining,1);
  state.selected=source.sourceId;const path=interactionRoute(state,source,registry,blockers);state.player={...state.player,...path.route.at(-1)!};
  assert.ok(beginGather(state,source.sourceId,registry,blockers).ok);state.route=[];const candidate=advanceGather(state,registry,blockers)!;assert.ok(candidate);
  host.status='falling';assert.equal(commitGather(state,candidate,registry,blockers),false,'live host is rechecked even before synchronization');
  synchronizeGatheringHosts(state,registry);assert.equal(state.gathering.sources[source.sourceId].remaining,0);assert.equal(state.gathering.sources[source.sourceId].hostAvailable,false);
  assert.deepEqual(state.inventory.stacks,[]);assert.equal(beginGather(state,source.sourceId,registry,blockers).ok,false);
  const recovered=regenerationCandidate(state.gathering,registry,{now:100,period:1},{'ground-branches':{capacity:2}});
  assert.equal(recovered.sources[source.sourceId].remaining,0,'period notification cannot replenish a felled host');
});
test('new tree generations have new host identity and no mature-resource windfall',()=>{
  const state=createState(),source=makeGatheringSources()[1],host=state.forestry.slots[source.hostRef!.slotId];
  host.status='sapling';host.generation++;host.individualId=`${host.slotId}:g1`;synchronizeGatheringHosts(state,registry);
  let life=state.gathering.sources[source.sourceId];assert.equal(life.hostIndividualId,host.individualId);assert.equal(life.remaining,0);assert.equal(life.depletedAt,null);
  host.status='standing';synchronizeGatheringHosts(state,registry);life=state.gathering.sources[source.sourceId];assert.equal(life.hostAvailable,true);assert.equal(life.remaining,0);
  synchronizeGatheringHosts(state,registry);assert.equal(state.gathering.sources[source.sourceId],life,'repeated updates are stable');
});
test('warehouse derives wood and collected goods from their owning balances and exposes processing data without mutation',()=>{
  const state=createState();state.inventory=inventoryTransaction(state.inventory,[{itemId:'branch',qualityId:'ordinary',delta:6},{itemId:'mushroom',qualityId:'ordinary',delta:2},{itemId:'wood',qualityId:'ordinary',delta:5}]);
  assert.equal(Object.hasOwn(state.forestry,'wood'),false,'forestry has no second material balance');
  const before=JSON.stringify(state),view=warehouseSnapshot(state,registry);
  assert.equal(view.items.find(i=>i.itemId==='wood')!.quantity,5);assert.equal(view.total,13);assert.equal(view.occupiedKinds,3);
  assert.equal(view.items.find(i=>i.itemId==='mushroom')!.processing[0].outputs[0],'干蘑菇');
  assert.equal(view.items.find(i=>i.itemId==='branch')!.processing[0].parametersReady,false);
  assert.equal(view.items.some(i=>i.itemId==='small-wood'),false,'catalog outputs do not pretend to be stored goods');
  assert.equal(JSON.stringify(state),before);
});
test('processing registry rejects dangling/duplicate data, invalid parameters and small-material structure-wood creation',()=>{
  const items=new Map(ITEMS.map(i=>[i.itemId,i]));
  assert.equal(createProcessingService(items).forItem('mushroom').length,1);
  assert.throws(()=>createProcessingService(items,[PROCESSING[0],PROCESSING[0]]),/Duplicate/);
  assert.throws(()=>createProcessingService(items,[{...PROCESSING[0],outputs:[{itemId:'missing',quantity:null}]}]),/item/);
  assert.throws(()=>createProcessingService(items,[{...PROCESSING[0],inputs:[{itemId:'branch',quantity:-1}]}]),/quantity/);
  assert.throws(()=>createProcessingService(items,[{...PROCESSING[0],status:'configured'}]),/requires/);
  assert.throws(()=>createProcessingService(items,[{...PROCESSING[0],outputs:[{itemId:'wood',quantity:null}]}]),/structure wood/);
});
