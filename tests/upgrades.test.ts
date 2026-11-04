import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {inventoryTransaction,inventoryCount,woodBatch} from '../src/domain/inventory.ts';
import {upgradeSnapshot,approachUpgrade,beginUpgrade} from '../src/domain/upgrades.ts';
import {advanceWorkshop,cancelWorkshop,beginWorkshop} from '../src/domain/workshop.ts';
import {CABIN_REPAIR_BLUEPRINT,WORKBENCH,SEAT_DEFINITION,STARTER_BLUEPRINTS} from '../src/content/workshop.ts';
import {CABIN_REPAIR,CABIN_REPAIR_STAND,UPGRADE_PROFILES} from '../src/content/upgrades.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {saveDigest} from '../src/domain/save-digest.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import {workstationColliders} from '../src/domain/furniture-placement.ts';
import {canStand,move} from '../src/domain/navigation.ts';

const context=createSaveContext();
const blockers=[...makeColliders(makeTrees()),...workstationColliders()];
function stocked(){
  const state=createState();
  state.inventory=inventoryTransaction(state.inventory,[
    {itemId:'wood',qualityId:'ordinary',wood:woodBatch({lengthMm:2400,thicknessMm:250,straightness:'straight'}),batchNote:'original log',delta:1},
    {itemId:'wood',qualityId:'fine',wood:woodBatch({lengthMm:2000,thicknessMm:200,straightness:'straight'}),delta:1},
    {itemId:'branch',qualityId:'ordinary',wood:woodBatch({lengthMm:900,thicknessMm:50,straightness:'curved'}),delta:3},
    {itemId:'wood',qualityId:'ordinary',wood:{...woodBatch(null),reserved:true},delta:4},
  ]);
  return state;
}
async function roundtrip(state:ReturnType<typeof createState>){
  const loaded=await prepareWorldSave(await serializeWorldSave(state,context,{sequence:1,savedAt:100}),context);
  assert.equal(loaded.decision,'restored');if(!('value' in loaded))throw new Error(loaded.diagnostics.join(';'));return loaded.value;
}
async function altered(raw:string,change:(saved:any)=>void){const saved=JSON.parse(raw);change(saved);const {checksum,...core}=saved;void checksum;return JSON.stringify({...core,checksum:await saveDigest(core)});}

test('remote inspection and approach remain usable without materials and never start a repair',()=>{
  const state=createState(),view=upgradeSnapshot(state,'cabin')!;
  assert.equal(view.near,false);assert.equal(view.canStart,false);assert.ok(view.requiredBlueprint?.known);assert.match(view.reason,/走近/);
  const original=structuredClone(state.inventory);assert.match(beginUpgrade(state,'cabin'),/走近/);assert.equal(state.workshop.job,null);
  assert.equal(canStand(CABIN_REPAIR_STAND,blockers),true);
  assert.match(approachUpgrade(state,'cabin',blockers),/走近/);assert.ok(state.route.length>0);
  let p={x:state.player.x,z:state.player.z};
  for(const waypoint of state.route){p=move(p,waypoint.x-p.x,waypoint.z-p.z,blockers);assert.ok(Math.hypot(p.x-waypoint.x,p.z-waypoint.z)<.1,'approach segments respect player collision');}
  Object.assign(state.player,p);state.route=[];
  const close=upgradeSnapshot(state,'cabin')!;assert.equal(close.near,true);assert.match(close.reason,/原木还差 2.*枝杈还差 3/);
  assert.match(beginUpgrade(state,'cabin'),/还差/);assert.deepEqual(state.inventory,original);assert.equal(state.workshop.job,null);
});

test('repair debit is atomic, records original material batches, and persists one visible stage',async()=>{
  const state=stocked();Object.assign(state.player,CABIN_REPAIR_STAND);
  const before=structuredClone(state.inventory);assert.equal(upgradeSnapshot(state,'cabin')!.canStart,true);
  assert.match(beginUpgrade(state,'cabin'),/开始/);assert.deepEqual(state.inventory,before);
  state.time=2;advanceWorkshop(state);const loaded=await roundtrip(state);
  assert.equal(loaded.workshop.job?.kind,'upgrade');assert.deepEqual(loaded.inventory.stacks,state.inventory.stacks);
  loaded.time=4.1;assert.match(advanceWorkshop(loaded)??'',/第一阶段已完成/);
  assert.equal(inventoryCount(loaded.inventory,'wood'),4);assert.equal(inventoryCount(loaded.inventory,'branch'),0);
  const progress=loaded.workshop.upgrades.cabin;assert.equal(progress.level,1);assert.deepEqual(progress.completedPaths,[CABIN_REPAIR.id]);
  assert.equal(progress.investments.reduce((n,s)=>n+s.quantity,0),5);assert.equal(progress.investments.find(s=>s.batchNote==='original log')?.wood?.spec?.lengthMm,2400);
  assert.equal(progress.investments.some(s=>s.wood?.reserved),false);
  const savedAgain=await roundtrip(loaded),after=structuredClone(savedAgain);
  assert.equal(advanceWorkshop(savedAgain),null);assert.deepEqual(savedAgain,after);
  assert.match(beginUpgrade(savedAgain,'cabin'),/后续图纸/);assert.deepEqual(savedAgain,after);
  assert.equal(upgradeSnapshot(savedAgain,'cabin')!.status,'planned');
});

test('missing blueprint, reserved-only materials, cancellation and interruption never debit',()=>{
  const state=stocked();Object.assign(state.player,CABIN_REPAIR_STAND);state.workshop.blueprints=[];
  assert.match(beginUpgrade(state,'cabin'),/图纸/);assert.equal(state.workshop.job,null);
  state.workshop.blueprints=[CABIN_REPAIR_BLUEPRINT.id];const original=structuredClone(state.inventory);
  beginUpgrade(state,'cabin');state.time=2;cancelWorkshop(state);state.time=8;advanceWorkshop(state);assert.deepEqual(state.inventory,original);assert.deepEqual(state.workshop.upgrades,{});
  beginUpgrade(state,'cabin');state.player.x+=3;advanceWorkshop(state);assert.deepEqual(state.inventory,original);assert.deepEqual(state.workshop.upgrades,{});
  Object.assign(state.player,CABIN_REPAIR_STAND);beginUpgrade(state,'cabin');state.selected='tent';advanceWorkshop(state);assert.deepEqual(state.inventory,original);
  Object.assign(state.player,CABIN_REPAIR_STAND);beginUpgrade(state,'cabin');state.inventory=inventoryTransaction(state.inventory,[{...state.inventory.stacks.find(s=>s.itemId==='branch')!,delta:-3}]);const insufficient=structuredClone(state.inventory);
  state.time+=5;assert.match(advanceWorkshop(state)??'',/不足/);assert.deepEqual(state.inventory,insufficient);assert.deepEqual(state.workshop.upgrades,{});
  const reserved=stocked();reserved.inventory.stacks=reserved.inventory.stacks.filter(s=>s.itemId!=='wood'||s.wood?.reserved);Object.assign(reserved.player,CABIN_REPAIR_STAND);
  assert.match(beginUpgrade(reserved,'cabin'),/原木还差 2/);
});

test('old v5 workshop slices gain only the starter plan and an empty upgrade ledger',async()=>{
  const raw=await serializeWorldSave(createState(),context,{sequence:1,savedAt:1});
  const legacy=await altered(raw,s=>{delete s.world.workshop.upgrades;s.world.workshop.blueprints=['blueprint.stump-cozy','blueprint.future'];});
  const loaded=await prepareWorldSave(legacy,context);assert.equal(loaded.decision,'restored');
  if('value' in loaded){assert.deepEqual(loaded.value.workshop.upgrades,{});assert.deepEqual(loaded.value.workshop.blueprints,[...new Set(['blueprint.stump-cozy','blueprint.future',...STARTER_BLUEPRINTS])]);}
  const state=stocked();Object.assign(state.player,CABIN_REPAIR_STAND);beginUpgrade(state,'cabin');state.time=5;advanceWorkshop(state);
  const repaired=await serializeWorldSave(state,context,{sequence:2,savedAt:2});
  for(const change of [
    (s:any)=>{s.world.workshop.upgrades.cabin.level=2;},
    (s:any)=>{s.world.workshop.upgrades.cabin.investments=[];},
    (s:any)=>{s.world.workshop.upgrades.cabin.completedPaths.push(CABIN_REPAIR.id);},
    (s:any)=>{s.world.workshop.upgrades.cabin.updatedAt=99;},
  ]){const invalid=await altered(repaired,change),result=await prepareWorldSave(invalid,context);assert.equal(result.decision,'protected');if(result.decision==='protected')assert.equal(result.raw,invalid);}
});

test('facilities share upgrade queries; nature remains on its own route and repair plans cannot craft furniture',()=>{
  const state=createState();
  for(const profile of UPGRADE_PROFILES)assert.ok(upgradeSnapshot(state,profile.id));
  assert.equal(upgradeSnapshot(state,'landmark-elder'),null);assert.equal(upgradeSnapshot(state,'gather.tree-slot-r3-hero-0.branches'),null);
  state.inventory.instances=[{instanceId:'future-owned',definitionId:SEAT_DEFINITION,blueprintId:'blueprint.stump-cozy',createdAt:0,location:{kind:'inventory'}}];
  assert.equal(upgradeSnapshot(state,'future-owned')!.status,'planned');
  Object.assign(state.player,WORKBENCH.stand);assert.match(beginWorkshop(state,'craft',[],CABIN_REPAIR_BLUEPRINT.id),/工作台/);assert.equal(state.workshop.job,null);
});
