import {findPath} from '../src/domain/navigation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createInventory,inventoryTransaction,woodBatch,stackKey,inventoryCount} from '../src/domain/inventory.ts';
import {prepareInventoryPersistence,serializeInventory} from '../src/domain/inventory-persistence.ts';
import {selectWood,commitWood,woodCandidates} from '../src/domain/wood-selection.ts';
import type {WoodRequirement} from '../src/domain/wood-selection.ts';
import {createState} from '../src/domain/state.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {prepareWorldSave,serializeWorldSave} from '../src/domain/world-save.ts';
import {beginRitual,advanceRitual,cancelRitual} from '../src/domain/ritual.ts';
import {startPlayerGather,startPlayerChop,cancelPlayerAction} from '../src/app/player-actions.ts';
import {makeColliders,makeTrees} from '../src/world/layout.ts';
const primary:WoodRequirement={useId:'carving.blank',mode:'piece',count:1,minLengthMm:700,minThicknessMm:30,allowedStraightness:['straight']};
const fuel:WoodRequirement={useId:'campfire.fuel',mode:'aggregate',measureId:'piece',amount:2};
const stock=()=>inventoryTransaction(createInventory(),[
  {itemId:'scrap-fuel',qualityId:'ordinary',delta:2},
  {itemId:'branch',qualityId:'ordinary',delta:2,wood:woodBatch({lengthMm:400,thicknessMm:40,straightness:'straight'})},
  {itemId:'branch',qualityId:'ordinary',delta:1,wood:woodBatch({lengthMm:800,thicknessMm:40,straightness:'straight'})},
]);
test('same quantity with different shapes stays separate; short pieces cannot become one long blank',()=>{
 const inv=stock();assert.equal(new Set(inv.stacks.map(stackKey)).size,3);
 assert.equal(woodCandidates(inv,primary).length,1);
 const selection=selectWood(inv,[fuel,primary]),next=commitWood(inv,selection);
 assert.equal(inventoryCount(next,'scrap-fuel'),0);assert.equal(inventoryCount(next,'branch'),2);
 assert.throws(()=>selectWood(next,[primary]),/Insufficient/);
 assert.throws(()=>selectWood(next,[fuel]),/Insufficient/,'valuable stock is not automatically burned');
 assert.equal(selectWood(next,[{...fuel,allowValuable:true}]).allocations[0].count,2);
});
test('scraps are fuel-only; unknown dimensions and incompatible units never satisfy piece recipes',()=>{
 const inv=inventoryTransaction(createInventory(),[{itemId:'scrap-fuel',qualityId:'ordinary',delta:20},{itemId:'branch',qualityId:'ungraded',delta:3}]);
 assert.throws(()=>selectWood(inv,[primary]),/Insufficient/);
 const scraps=inventoryTransaction(createInventory(),[{itemId:'scrap-fuel',qualityId:'ordinary',delta:20}]);
 assert.throws(()=>selectWood(scraps,[{useId:'craft.auxiliary-wood',mode:'aggregate',measureId:'piece',amount:1}]),/Insufficient/);
 assert.throws(()=>selectWood(inv,[{...fuel,measureId:'kg'} as never]),/units/);
});
test('mixed requirements reserve once; stale/replayed/edited candidates and failed outputs leave inputs unchanged',()=>{
 const inv=stock(),before=JSON.stringify(inv),candidate=selectWood(inv,[primary]);
 assert.throws(()=>selectWood(inv,[primary,primary]),/Insufficient/);
 const forged=structuredClone(candidate);forged.allocations[0].count=2;assert.throws(()=>commitWood(inv,forged),/Changed/);
 assert.throws(()=>commitWood(inv,candidate,[{itemId:'not-registered',qualityId:'ordinary',delta:1}]),/Unrecognized/);
 assert.equal(JSON.stringify(inv),before);
 const next=commitWood(inv,candidate);assert.throws(()=>commitWood(next,candidate),/Stale/);
 const reloaded=prepareInventoryPersistence(serializeInventory(next));assert.notEqual(reloaded.decision,'protected');
 if('value'in reloaded)assert.throws(()=>commitWood(reloaded.value,candidate),/Stale/);
});
test('spec batches roundtrip losslessly; corrupt metadata is protected, legacy stock keeps unknown sizes',()=>{
 const original=stock(),loaded=prepareInventoryPersistence(serializeInventory(original));assert.equal(loaded.decision,'restored');
 if('value'in loaded)assert.deepEqual(loaded.value.stacks,original.stacks);
 const old=prepareInventoryPersistence(JSON.stringify({schemaVersion:1,stacks:[{itemId:'wood',qualityId:'ordinary',quantity:3}]}));
 if('value'in old){assert.equal(old.value.stacks[0].wood,undefined);assert.throws(()=>selectWood(old.value,[primary]),/Insufficient/);}
 const corrupt=JSON.parse(serializeInventory(original));corrupt.stacks.find((s:any)=>s.wood).wood.spec.lengthMm=-1;
 assert.equal(prepareInventoryPersistence(JSON.stringify(corrupt)).decision,'protected');
});
test('ruleset-1 migration preserves old pools, stock and tree generations; second load does not refill',async()=>{
 const ctx=createSaveContext(),raw=await readFile(new URL('../evidence/scene-r5/before-save.json',import.meta.url),'utf8'),legacy=JSON.parse(raw);
 const loaded=await prepareWorldSave(raw,ctx);assert.equal(loaded.decision,'migrated');if(!('value'in loaded))return;
 assert.deepEqual(loaded.value.forestry,legacy.world.forestry);
 for(const [id,life] of Object.entries(legacy.world.gathering.sources))assert.deepEqual(loaded.value.gathering.sources[id],life);
 assert.equal(loaded.value.inventory.stacks.find(s=>s.itemId==='wood')!.wood,undefined);
 const id=Object.keys(loaded.value.gathering.sources).find(id=>id.endsWith('.scraps'))!;
 loaded.value.gathering.sources[id]={remaining:0,version:1,lastPeriod:null,depletedAt:loaded.value.time};
 const again=await prepareWorldSave(await serializeWorldSave(loaded.value,ctx,{sequence:2,savedAt:123}),ctx);
 assert.equal(again.decision,'restored');if('value'in again)assert.equal(again.value.gathering.sources[id].remaining,0);
});
test('prayer has one action owner, pauses with game time, cancels cleanly and awards no inventory',async()=>{
 const state=createState(),ctx=createSaveContext(),blockers=makeColliders(makeTrees());state.selected='grove-altar';state.player={x:-10,z:50,facing:0,moving:false};
 const before=JSON.stringify(state.inventory);assert.equal(beginRitual(state,blockers,'offering').ok,false);
 assert.ok(beginRitual(state,blockers,'prayer').ok);advanceRitual(state);
 assert.equal(startPlayerGather(state,[...ctx.registry.sources.keys()][0],ctx.registry,blockers).ok,false);
 assert.equal(startPlayerChop(state,[...ctx.trees.values()][0]).ok,false);
 for(let i=0;i<5;i++)advanceRitual(state);assert.equal(state.ritual!.phase,'performing');
 const loaded=await prepareWorldSave(await serializeWorldSave(state,ctx,{sequence:1,savedAt:123}),ctx);assert.equal(loaded.decision,'restored');
 state.time=5.5;assert.ok(advanceRitual(state));assert.equal(advanceRitual(state),null);assert.equal(JSON.stringify(state.inventory),before);
 assert.ok(beginRitual(state,blockers,'prayer').ok);cancelPlayerAction(state);assert.equal(state.ritual!.phase,'cancelled');assert.equal(cancelRitual(state),false);
});

test('scene click and waypoint metadata never leak into saved route points',async()=>{
 const state=createState(),ctx=createSaveContext(),destination={x:-35,z:5,kind:'move',name:'test'};
 state.route=findPath(state.player,destination,makeColliders(makeTrees()));assert.ok(state.route.length);
 assert.deepEqual(state.route.at(-1),{x:-35,z:5});
 assert.equal((await prepareWorldSave(await serializeWorldSave(state,ctx,{sequence:1,savedAt:1}),ctx)).decision,'restored');
});
