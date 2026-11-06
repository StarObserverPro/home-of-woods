import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {inventoryTransaction,inventoryCount,woodBatch} from '../src/domain/inventory.ts';
import {learnHousingBlueprint,beginHousingCraft,mountHousingItem,detachHousingItem,ringHousingBell,housingSnapshot,benchReadingSpot} from '../src/domain/housing.ts';
import {advanceWorkshop,cancelWorkshop,merchantStock} from '../src/domain/workshop.ts';
import {HOUSING,HOUSING_BLUEPRINTS} from '../src/content/housing.ts';
import {WORKBENCH} from '../src/content/workshop.ts';
import {merchantListings} from '../src/content/merchant.ts';
import {ITEM_CATALOG} from '../src/domain/item-catalog.ts';
import {placeFurniture,packFurniture,placementReason,furnitureColliders,workstationColliders,suggestFurniturePlacement} from '../src/domain/furniture-placement.ts';
import {interactionAccess,approachInteraction} from '../src/domain/interaction-access.ts';
import {makeColliders,makeTrees} from '../src/world/layout.ts';
import {canStand} from '../src/domain/navigation.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {saveDigest} from '../src/domain/save-digest.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';
import type {GameState} from '../src/domain/state.ts';

const bellPlan=HOUSING_BLUEPRINTS[0].id,benchPlan=HOUSING_BLUEPRINTS[1].id;
function stocked(){const state=createState();state.inventory=inventoryTransaction(state.inventory,[{itemId:'branch',qualityId:'ordinary',delta:8},{itemId:'wood',qualityId:'ordinary',delta:6}]);return state;}
function atBench(state:GameState){Object.assign(state.player,WORKBENCH.stand);state.selected=WORKBENCH.id;}
function craft(state:GameState,id:string){
  atBench(state);learnHousingBlueprint(state,id);assert.match(beginHousingCraft(state,id,[]),/工作台/);
  advanceWorkshop(state);state.time+=3.01;assert.match(advanceWorkshop(state)??'',/做好/);
  return state.inventory.instances!.find(item=>item.blueprintId===id&&item.location.kind==='inventory')!;
}
function atDoor(state:GameState){Object.assign(state.player,HOUSING.doorbell.stand);state.selected='cabin';}

test('ordinary patterns are explicitly learned near the workbench without a grant or material debit',()=>{
  const state=stocked(),before=structuredClone(state.inventory);
  assert.match(learnHousingBlueprint(state,bellPlan),/先走近/);assert.ok(!state.workshop.blueprints.includes(bellPlan));
  atBench(state);assert.match(learnHousingBlueprint(state,bellPlan),/已学会/);assert.deepEqual(state.inventory,before);
  const learned=structuredClone(state.workshop.blueprints);assert.match(learnHousingBlueprint(state,bellPlan),/已经学会/);assert.deepEqual(state.workshop.blueprints,learned);
  assert.match(learnHousingBlueprint(state,'blueprint.copper-kettle'),/没有/);
  assert.equal(ITEM_CATALOG.ownedItems.get('vessel.copper-kettle')?.status,'planned');
});

test('registered inputs are consumed atomically once; ordinary items work without an affix',()=>{
  const state=stocked(),bell=craft(state,bellPlan),bench=craft(state,benchPlan);
  assert.equal(inventoryCount(state.inventory,'branch'),6);assert.equal(inventoryCount(state.inventory,'wood'),4);
  assert.equal(bell.definitionId,HOUSING.doorbell.definitionId);assert.equal(bench.definitionId,HOUSING.guestBench.definitionId);
  assert.notEqual(bell.instanceId,bench.instanceId);assert.deepEqual(bell.traits,[]);assert.deepEqual(bench.traits,[]);
  assert.deepEqual((bench.geometry as {parameters:unknown}).parameters,HOUSING.guestBench.geometry);
  const before=structuredClone(state);for(let i=0;i<8;i++)assert.equal(advanceWorkshop(state),null);assert.deepEqual(state,before);
});

test('far, busy, unlearned, insufficient and cancelled crafting leave materials unchanged',()=>{
  const state=stocked(),original=structuredClone(state.inventory);
  assert.match(beginHousingCraft(state,bellPlan,[]),/先走近/);assert.equal(state.workshop.job,null);
  atBench(state);assert.match(beginHousingCraft(state,bellPlan,[]),/先获得/);
  learnHousingBlueprint(state,bellPlan);beginHousingCraft(state,bellPlan,[]);assert.match(beginHousingCraft(state,benchPlan,[]),/当前动作/);
  advanceWorkshop(state);state.time+=1;cancelWorkshop(state);state.time+=20;advanceWorkshop(state);assert.deepEqual(state.inventory,original);
  const empty=createState();atBench(empty);learnHousingBlueprint(empty,bellPlan);assert.match(beginHousingCraft(empty,bellPlan,[]),/材料不足/);assert.equal(empty.workshop.job,null);
});

test('ground, fuel-only and reserved wood cannot replace real recipe inputs',()=>{
  const state=createState();atBench(state);learnHousingBlueprint(state,bellPlan);learnHousingBlueprint(state,benchPlan);
  state.inventory=inventoryTransaction(state.inventory,[
    {itemId:'branch',qualityId:'ordinary',transport:{kind:'ground',x:-35,z:2},delta:10},
    {itemId:'wood',qualityId:'ordinary',wood:{...woodBatch(null),reserved:true},delta:3},
    {itemId:'scrap-fuel',qualityId:'ordinary',delta:5},
  ]);
  const before=structuredClone(state.inventory);assert.match(beginHousingCraft(state,bellPlan,[]),/材料不足/);assert.match(beginHousingCraft(state,benchPlan,[]),/材料不足/);assert.deepEqual(state.inventory,before);
  assert.equal(housingSnapshot(state).plans[0].costs[0].available,0);
});

test('mount, ordinary ringing and detach preserve one exact instance and all metadata',()=>{
  const state=stocked(),bell=craft(state,bellPlan);bell.future={kept:'yes'};bell.location.note='custom location data';
  const original=structuredClone(bell),farInventory=structuredClone(state.inventory);
  assert.match(mountHousingItem(state,bell.instanceId),/先走近/);assert.deepEqual(state.inventory,farInventory);
  atDoor(state);assert.match(mountHousingItem(state,bell.instanceId),/已经挂/);
  assert.equal(state.inventory.instances!.length,1);assert.equal(state.inventory.instances![0].location.kind,'mounted');
  const installed=structuredClone(state.inventory);assert.match(ringHousingBell(state,bell.instanceId),/叮咚/);assert.deepEqual(state.inventory,installed);
  assert.ok(interactionAccess(state,bell.instanceId)?.near);assert.match(detachHousingItem(state,bell.instanceId),/拆回/);
  assert.deepEqual(state.inventory.instances![0],original);assert.match(detachHousingItem(state,bell.instanceId),/没有挂/);
});

test('occupied slot and distant or busy use fail without changing ownership',()=>{
  const state=stocked(),one=craft(state,bellPlan);craft(state,bellPlan);
  const two=state.inventory.instances!.find(item=>item.instanceId!==one.instanceId)!;
  atDoor(state);mountHousingItem(state,one.instanceId);const before=structuredClone(state.inventory);
  assert.match(mountHousingItem(state,two.instanceId),/已经挂着/);assert.deepEqual(state.inventory,before);
  Object.assign(state.player,{x:50,z:50});assert.match(detachHousingItem(state,one.instanceId),/先走近/);assert.match(ringHousingBell(state,one.instanceId),/先走近/);assert.deepEqual(state.inventory,before);
  atDoor(state);state.workshop.job={id:'workshop-test',kind:'craft',phase:'working',startedAt:state.time,durationSeconds:3,blueprintId:bellPlan};assert.match(detachHousingItem(state,one.instanceId),/当前动作/);assert.deepEqual(state.inventory,before);
});

test('bench placement, movement, sitting approach and packing keep the same finished item',()=>{
  const state=stocked(),bench=craft(state,benchPlan),original=structuredClone(bench);
  const blockers=[...makeColliders(makeTrees()),...workstationColliders()];
  let chosen:{x:number;z:number}|null=null;
  for(let x=-49;x<-25&&!chosen;x+=.5)for(let z=-7;z<19;z+=.5){
    Object.assign(state.player,{x:x+2.4,z});
    if(!placementReason(state,bench.instanceId,{x,z},blockers)){chosen={x,z};break;}
  }
  assert.ok(chosen,'current camp has flat, clear ground for a full-sized bench');
  assert.match(placeFurniture(state,bench.instanceId,chosen,0,blockers),/摆好/);
  const spot=benchReadingSpot(state,bench.instanceId)!;assert.ok(spot);assert.equal(spot.seat.height,.85);
  assert.ok(canStand(spot.stand,[...blockers,...furnitureColliders(state)]),'reading approach stands outside bench collision');
  assert.equal(furnitureColliders(state).find(c=>c.id===bench.instanceId)?.radius,1.4);
  Object.assign(state.player,{x:80,z:80});const placed=structuredClone(state.inventory);
  assert.match(packFurniture(state,bench.instanceId),/先走近/);assert.deepEqual(state.inventory,placed);
  Object.assign(state.player,spot.stand);assert.match(placeFurniture(state,bench.instanceId,chosen,Math.PI/2,blockers),/摆好/);
  assert.match(packFurniture(state,bench.instanceId),/收回/);assert.deepEqual(state.inventory.instances![0],original);
});

test('new housing plans do not alter merchant rotation or offering stock',()=>{
  for(let visit=0;visit<8;visit++)assert.ok(merchantListings(104729,visit).every(item=>!HOUSING_BLUEPRINTS.some(plan=>plan.id===item.blueprintId)));
  const state=stocked();assert.ok(merchantStock(state).every(id=>!HOUSING_BLUEPRINTS.some(plan=>plan.id===id)));
});

test('world save roundtrip includes selected mounted doorbell, blueprint knowledge and original item',async()=>{
  const state=stocked(),bell=craft(state,bellPlan);atDoor(state);mountHousingItem(state,bell.instanceId);state.selected=bell.instanceId;
  const context=createSaveContext(),raw=await serializeWorldSave(state,context,{sequence:1,savedAt:1});
  const loaded=await prepareWorldSave(raw,context);assert.equal(loaded.decision,'restored');if(loaded.decision!=='restored')throw Error(loaded.diagnostics.join(';'));
  assert.deepEqual(loaded.value.inventory.stacks,state.inventory.stacks);assert.deepEqual(loaded.value.inventory.instances,state.inventory.instances);assert.equal(loaded.value.selected,bell.instanceId);assert.deepEqual(loaded.value.workshop.blueprints,state.workshop.blueprints);
  assert.match(detachHousingItem(loaded.value,bell.instanceId),/拆回/);assert.equal(loaded.value.inventory.instances![0].instanceId,bell.instanceId);
});

test('selecting either real housing item in inventory saves and reloads, while unknown inventory selections stay protected',async()=>{
  const state=stocked(),bell=craft(state,bellPlan),bench=craft(state,benchPlan),context=createSaveContext();
  for(const item of [bell,bench]){
    state.selected=item.instanceId;
    const raw=await serializeWorldSave(state,context,{sequence:1,savedAt:1}),loaded=await prepareWorldSave(raw,context);
    assert.equal(loaded.decision,'restored');if(loaded.decision!=='restored')throw Error(loaded.diagnostics.join(';'));
    assert.equal(loaded.value.selected,item.instanceId);assert.deepEqual(loaded.value.inventory.instances,state.inventory.instances);
  }
  const unknown={...structuredClone(bell),instanceId:'future-owned-item',definitionId:'future.furniture',blueprintId:'future.pattern'};
  state.inventory.instances!.push(unknown);state.selected=null;
  const raw=await serializeWorldSave(state,context,{sequence:2,savedAt:2});
  const changed=JSON.parse(raw);changed.world.selected=unknown.instanceId;
  const {checksum,...core}=changed;void checksum;
  const protectedLoad=await prepareWorldSave(JSON.stringify({...core,checksum:await saveDigest(core)}),context);
  assert.equal(protectedLoad.decision,'protected');assert.match(protectedLoad.diagnostics.join(';'),/未知目标引用/);
});

test('doorbell approach stops on walkable ground and measures reach from the actual hanging point',()=>{
  const state=stocked(),bell=craft(state,bellPlan),blockers=[...makeColliders(makeTrees()),...workstationColliders()];
  Object.assign(state.player,{x:-35,z:2});
  const initial=structuredClone(state.inventory);
  assert.ok(canStand(HOUSING.doorbell.stand,blockers),'preferred door approach clears the real cabin collider');
  assert.match(approachInteraction(state,'cabin',blockers),/正在走近/);assert.ok(state.route.length);
  assert.deepEqual(state.inventory,initial,'walking to the door has no resource or ownership effect');
  assert.ok(Math.hypot(state.route.at(-1)!.x-HOUSING.doorbell.point.x,state.route.at(-1)!.z-HOUSING.doorbell.point.z)<=HOUSING.doorbell.reach,'resolved approach remains within reach of the actual doorbell');
  for(const step of state.route)assert.ok(canStand(step,blockers),'every route waypoint is walkable');
  Object.assign(state.player,state.route.at(-1)!);state.route=[];
  assert.equal(housingSnapshot(state).hostNear,true);assert.equal(interactionAccess(state,'cabin')?.near,true);
  assert.match(mountHousingItem(state,bell.instanceId),/已经挂/);
  assert.equal(interactionAccess(state,bell.instanceId)?.near,true);
  assert.deepEqual(interactionAccess(state,bell.instanceId)?.point,HOUSING.doorbell.point);
  Object.assign(state.player,{x:HOUSING.doorbell.point.x,z:HOUSING.doorbell.point.z+HOUSING.doorbell.reach+.01});
  assert.equal(housingSnapshot(state).hostNear,false);assert.equal(interactionAccess(state,bell.instanceId)?.near,false);
  const mounted=structuredClone(state.inventory);assert.match(ringHousingBell(state,bell.instanceId),/先走近/);assert.deepEqual(state.inventory,mounted);
});

test('workbench placement suggestion finds a legal full-sized bench preview without changing the world',()=>{
  const state=stocked(),bench=craft(state,benchPlan);
  const blockers=[{id:WOODCRAFT.id,x:WOODCRAFT.x,z:WOODCRAFT.z,halfX:WOODCRAFT.halfX+.2,halfZ:WOODCRAFT.halfZ+.2},...makeColliders(makeTrees()),...workstationColliders()];
  for(const player of [WORKBENCH.stand,{x:-43.88581646,z:14.51096809}]){
    Object.assign(state.player,player);const before=structuredClone(state),blockersBefore=structuredClone(blockers);
    const point=suggestFurniturePlacement(state,bench.instanceId,blockers);assert.ok(point,'a full-sized bench can be previewed from the real workbench approach');
    assert.equal(placementReason(state,bench.instanceId,point,blockers),'');
    assert.ok(Math.hypot(point.x-state.player.x,point.z-state.player.z)<=3.85+1e-8);
    assert.deepEqual(state,before);assert.deepEqual(blockers,blockersBefore);
  }
});

test('fully obstructed placement suggestion returns no preview without changing identity or inventory',()=>{
  const state=stocked(),bench=craft(state,benchPlan),before=structuredClone(state);
  const blockers=[{id:'all-blocked',x:state.player.x,z:state.player.z,halfX:20,halfZ:20}];
  assert.equal(suggestFurniturePlacement(state,bench.instanceId,blockers),null);assert.deepEqual(state,before);
});
