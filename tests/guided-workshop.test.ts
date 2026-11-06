import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import type {GameState} from '../src/domain/state.ts';
import {inventoryTransaction,inventoryCount,woodBatch} from '../src/domain/inventory.ts';
import {WORKBENCH} from '../src/content/workshop.ts';
import {WORKBENCH_BRACING} from '../src/content/workshop-series.ts';
import {beginUpgrade} from '../src/domain/upgrades.ts';
import {advanceWorkshop,cancelWorkshop,beginWorkshop,validateWorkshop} from '../src/domain/workshop.ts';
import {learnWorkshopPlan,beginGuidedCraft,setGuidedCraftDimensions,adjustGuidedPart,submitGuidedPart,finishGuidedCraft,cancelGuidedCraft,guidedWorkshopSnapshot,guidedGeometry,validateGuidedAssembly} from '../src/domain/workshop-guided.ts';
import {assessAssembly,geometryParts} from '../src/domain/parametric-crafting.ts';
import {furnitureGeometry,furnitureRadius,furnitureColliders,placeFurniture,packFurniture,suggestFurniturePlacement,workstationColliders} from '../src/domain/furniture-placement.ts';
import {benchReadingSpot} from '../src/domain/housing.ts';
import {canStand} from '../src/domain/navigation.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {resolveCraftOutcome} from '../src/domain/crafting-result.ts';

const benchPlan='blueprint.bench-guided',tablePlan='blueprint.prep-side-table';
function stocked(){
  const state=createState();Object.assign(state.player,WORKBENCH.stand);state.selected=WORKBENCH.id;
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'wood',qualityId:'ordinary',delta:20},{itemId:'branch',qualityId:'ordinary',delta:20}]);
  return state;
}
function improve(state:GameState){
  assert.match(learnWorkshopPlan(state,WORKBENCH_BRACING.blueprintId),/已学会/);
  assert.match(beginUpgrade(state,WORKBENCH_BRACING.id),/开始/);state.time+=3.01;assert.match(advanceWorkshop(state)??'',/支架与定位靠山/);
  assert.equal(state.workshop.upgrades[WORKBENCH_BRACING.id].level,1);
}
function ready(){const state=stocked();improve(state);learnWorkshopPlan(state,benchPlan);learnWorkshopPlan(state,tablePlan);return state;}
function fitting(state:GameState,id=benchPlan,dimensions:Record<string,unknown>={}){
  assert.match(beginGuidedCraft(state,id,dimensions),/开始备料/);state.time+=WORKBENCH_BRACING.prepareSeconds+.01;assert.match(advanceWorkshop(state)??'',/备料完成/);
  assert.equal(state.workshop.job!.assembly!.phase,'fitting');
}
function lockAll(state:GameState,offsetLast=false){
  while(state.workshop.job!.assembly!.activePartId){
    assert.match(adjustGuidedPart(state,'align'),/导向范围/);
    if(offsetLast&&state.workshop.job!.assembly!.activePartId==='surface')adjustGuidedPart(state,'right');
    assert.match(submitGuidedPart(state),/卡好/);
  }
}
function finish(state:GameState){
  assert.match(finishGuidedCraft(state),/开始收尾/);state.time+=WORKBENCH_BRACING.finishSeconds+.01;
  assert.match(advanceWorkshop(state)??'',/装配完成/);return state.inventory.instances!.at(-1)!;
}

test('workbench bracing is a paid fixture upgrade in the existing job and investment ledger',()=>{
  const state=stocked(),inventory=structuredClone(state.inventory);
  assert.match(beginUpgrade(state,WORKBENCH_BRACING.id),/图纸/);assert.deepEqual(state.inventory,inventory);
  learnWorkshopPlan(state,WORKBENCH_BRACING.blueprintId);beginUpgrade(state,WORKBENCH_BRACING.id);cancelWorkshop(state);
  assert.deepEqual(state.inventory,inventory);assert.equal(state.workshop.upgrades[WORKBENCH_BRACING.id],undefined);
  beginUpgrade(state,WORKBENCH_BRACING.id);assert.equal(state.workshop.job?.kind,'upgrade');assert.deepEqual(state.inventory,inventory);
  state.time+=3.01;advanceWorkshop(state);
  assert.equal(inventoryCount(state.inventory,'wood'),18);assert.equal(inventoryCount(state.inventory,'branch'),18);
  const entry=state.workshop.upgrades[WORKBENCH_BRACING.id];assert.equal(entry.level,1);assert.deepEqual(entry.completedPaths,[WORKBENCH_BRACING.pathId]);
  assert.equal(entry.investments.find(s=>s.itemId==='wood')?.quantity,2);assert.equal(entry.investments.find(s=>s.itemId==='branch')?.quantity,2);
  const after=structuredClone(state);assert.equal(advanceWorkshop(state),null);assert.deepEqual(state,after);
});

test('unimproved, distant, unlearned and malformed size requests never create work or debit materials',()=>{
  const state=stocked();learnWorkshopPlan(state,benchPlan);const initial=structuredClone(state.inventory);
  assert.match(beginGuidedCraft(state,benchPlan),/支架/);assert.equal(state.workshop.job,null);assert.deepEqual(state.inventory,initial);
  improve(state);const improved=structuredClone(state.inventory);Object.assign(state.player,{x:0,z:0});
  assert.match(beginGuidedCraft(state,benchPlan),/先走近/);assert.deepEqual(state.inventory,improved);
  Object.assign(state.player,WORKBENCH.stand);assert.match(beginGuidedCraft(state,tablePlan),/学会/);
  assert.match(beginGuidedCraft(state,benchPlan,{length:9}),/尺寸超出/);assert.equal(state.workshop.job,null);assert.deepEqual(state.inventory,improved);
  assert.throws(()=>guidedGeometry(tablePlan,{seatThickness:.25}),/Fixed assembly/);
  assert.throws(()=>guidedGeometry(tablePlan,{height:NaN}),/out of range/);
});

test('bench and prep table reuse one parameterized family without equating craft tier and rarity',()=>{
  const small=guidedGeometry(benchPlan,{length:1.6,width:.55,height:.65}),table=guidedGeometry(tablePlan,{length:2,width:.9,height:1.2,supportCount:3});
  assert.equal(small.templateId,'bench.supported');assert.equal(table.templateId,small.templateId);assert.equal(small.family,'supported-surface');
  assert.equal(geometryParts(small).length,3);assert.equal(geometryParts(table).length,4);
  assert.equal(geometryParts(table).find(p=>p.id==='surface')?.dimensions.y,.15);
  assert.throws(()=>resolveCraftOutcome(benchPlan,104729,1,{mode:'preset'}),/requires fitting evidence/);
  const state=ready();assert.match(beginWorkshop(state,'craft',[],benchPlan),/先获得/);assert.equal(state.workshop.job,null,'the preset executor cannot bypass guided work');
});

test('failed trial remains visible but unlocked, dimensions clear old fitting, and cancel is free',()=>{
  const state=ready(),inventory=structuredClone(state.inventory);fitting(state);
  const first=state.workshop.job!.assembly!.activePose!;
  assert.match(submitGuidedPart(state),/还没对齐/);assert.deepEqual(state.workshop.job!.assembly!.activePose,first);assert.equal(state.workshop.job!.assembly!.placements.length,0);
  assert.match(finishGuidedCraft(state),/没装好/);assert.deepEqual(state.inventory,inventory);
  const original=structuredClone(state.workshop.job);assert.match(submitGuidedPart(state,{...first,id:'unknown-piece'}),/当前高亮/);assert.deepEqual(state.workshop.job,original);
  assert.match(submitGuidedPart(state,{...first,x:NaN}),/无效/);assert.deepEqual(state.workshop.job,original);
  adjustGuidedPart(state,'align');submitGuidedPart(state);assert.equal(state.workshop.job!.assembly!.placements.length,1);
  assert.match(setGuidedCraftDimensions(state,{length:2.4}),/重新对齐/);assert.equal(state.workshop.job!.assembly!.placements.length,0);assert.equal(state.workshop.job!.assembly!.geometry.parameters.length,2.4);
  const edited=structuredClone(state.workshop.job);assert.match(setGuidedCraftDimensions(state,{height:4}),/范围/);assert.deepEqual(state.workshop.job,edited);
  assert.match(cancelGuidedCraft(state),/没有扣除/);assert.deepEqual(state.inventory,inventory);assert.equal(state.workshop.job,null);
});

test('completion uses actual locked placements for quality and commits all materials and one item once',()=>{
  const state=ready(),inventory=structuredClone(state.inventory);fitting(state,benchPlan,{length:2.2,width:.8,height:.9});lockAll(state,true);
  const evidence=structuredClone(state.workshop.job!.assembly!),assessment=assessAssembly(evidence.geometry,evidence.placements);
  assert.ok(assessment.valid);assert.ok(assessment.score<100&&assessment.score>0,'the deliberately offset panel yields its measured score');
  assert.deepEqual(state.inventory,inventory);assert.match(finishGuidedCraft(state),/开始收尾/);
  assert.deepEqual(state.inventory,inventory);assert.equal(advanceWorkshop(state),null);
  state.time+=2.01;assert.match(advanceWorkshop(state)??'',/装配完成/);
  assert.equal(inventoryCount(state.inventory,'wood'),inventoryCount(inventory,'wood')-2);assert.equal(inventoryCount(state.inventory,'branch'),inventoryCount(inventory,'branch')-1);
  const item=state.inventory.instances![0];assert.equal(item.definitionId,'furniture.guest-bench');assert.deepEqual(item.geometry,evidence.geometry);assert.deepEqual(item.traits,[]);
  const record=item.crafting as {processTier:number;qualityScore:number;scoreSource:string;assembly:{placements:unknown}};
  assert.equal(record.processTier,2);assert.equal(record.scoreSource,'guided');assert.equal(record.qualityScore,assessment.score);assert.deepEqual(record.assembly.placements,evidence.placements);
  assert.ok(['common','uncommon'].includes(item.rarityId as string),'facility tier does not force a rare item');
  const done=structuredClone(state);for(let i=0;i<5;i++)assert.equal(advanceWorkshop(state),null);assert.deepEqual(state,done);
});

test('distance, competing work and a final material shortfall cancel without partial debit or output',()=>{
  const away=ready();fitting(away);const before=structuredClone(away.inventory);away.player.x+=5;
  assert.match(advanceWorkshop(away)??'',/已取消/);assert.equal(away.workshop.job,null);assert.deepEqual(away.inventory,before);
  const missing=ready();fitting(missing,tablePlan);lockAll(missing);finishGuidedCraft(missing);
  missing.inventory=inventoryTransaction(missing.inventory,[{itemId:'branch',qualityId:'ordinary',delta:-inventoryCount(missing.inventory,'branch')}]);
  const depleted=structuredClone(missing.inventory);missing.time+=2.01;
  assert.match(advanceWorkshop(missing)??'',/材料已不足/);assert.deepEqual(missing.inventory,depleted);assert.equal(missing.inventory.instances?.length??0,0);assert.equal(missing.workshop.job,null);
  const reserved=ready();reserved.inventory=inventoryTransaction(reserved.inventory,[{itemId:'wood',qualityId:'ordinary',delta:-18},{itemId:'wood',qualityId:'ordinary',wood:{...woodBatch(null),reserved:true},delta:5}]);
  const held=structuredClone(reserved.inventory);assert.match(beginGuidedCraft(reserved,benchPlan),/材料不足/);assert.deepEqual(reserved.inventory,held);
});

test('in-progress preparation, fitting and finishing restore their evidence and settle once after reload',async()=>{
  let state=ready();beginGuidedCraft(state,tablePlan,{length:1.8,width:.8,height:1.15,supportCount:3});const context=createSaveContext();
  async function roundtrip(){
    const expected=structuredClone(state.workshop),raw=await serializeWorldSave(state,context,{sequence:1,savedAt:1}),loaded=await prepareWorldSave(raw,context);
    assert.equal(loaded.decision,'restored');if(loaded.decision!=='restored')throw Error(loaded.diagnostics.join(';'));
    state=loaded.value;assert.deepEqual(state.workshop,expected);
  }
  await roundtrip();state.time+=3.01;advanceWorkshop(state);adjustGuidedPart(state,'left');adjustGuidedPart(state,'turn-left');
  await roundtrip();lockAll(state);finishGuidedCraft(state);await roundtrip();
  const before=inventoryCount(state.inventory,'wood');state.time+=2.01;advanceWorkshop(state);
  assert.equal(inventoryCount(state.inventory,'wood'),before-2);assert.equal(state.inventory.instances!.length,1);assert.equal(state.inventory.instances![0].definitionId,'furniture.prep-side-table');
  assert.equal(advanceWorkshop(state),null);state.selected=state.inventory.instances![0].instanceId;await roundtrip();
});

test('incomplete or forged locked assembly evidence cannot finish or serialize as valid work',()=>{
  const state=ready();fitting(state);const before=structuredClone(state.inventory);
  const forged=structuredClone(state.workshop.job!.assembly!);forged.placements=[{...forged.activePose!}];
  assert.throws(()=>validateGuidedAssembly(forged,benchPlan),/Invalid locked/);
  state.workshop.job!.assembly=forged;assert.throws(()=>validateWorkshop(state.workshop,state.time,state.inventory),/Invalid locked/);
  assert.match(advanceWorkshop(state)??'',/资料不完整/);assert.deepEqual(state.inventory,before);assert.equal(state.workshop.job,null);
});

test('stored dimensions change physical footprint, bench seat height and table placement ownership',()=>{
  const state=ready();fitting(state,benchPlan,{length:1.6,width:.55,height:.65});lockAll(state);const small=finish(state);
  fitting(state,benchPlan,{length:2.4,width:.9,height:.95});lockAll(state);const large=finish(state);
  fitting(state,tablePlan,{length:1.2,width:.5,height:1});lockAll(state);const table=finish(state);
  assert.ok(furnitureRadius(small)<furnitureRadius(large));
  const point={x:-40.7,z:12.9},obstacle=[{id:'edge-obstacle',x:point.x+1.2,z:point.z,radius:.1}];
  assert.equal(canStand(point,obstacle,furnitureRadius(small)),true);assert.equal(canStand(point,obstacle,furnitureRadius(large)),false);
  const blockers=[...makeColliders(makeTrees()),...workstationColliders()];
  Object.assign(state.player,WORKBENCH.stand);const suggested=suggestFurniturePlacement(state,small.instanceId,blockers);assert.ok(suggested);
  assert.match(placeFurniture(state,small.instanceId,suggested,0,blockers),/摆好/);
  const spot=benchReadingSpot(state,small.instanceId)!;assert.equal(spot.seat.height,.65);assert.equal(furnitureColliders(state).find(c=>c.id===small.instanceId)?.radius,furnitureRadius(small));
  Object.assign(state.player,spot.stand);packFurniture(state,small.instanceId);
  Object.assign(state.player,WORKBENCH.stand);const tablePoint=suggestFurniturePlacement(state,table.instanceId,blockers);assert.ok(tablePoint);
  const original=structuredClone(state.inventory.instances!.find(i=>i.instanceId===table.instanceId));
  assert.match(placeFurniture(state,table.instanceId,tablePoint,0,blockers),/摆好/);assert.match(packFurniture(state,table.instanceId),/收回/);
  assert.deepEqual(state.inventory.instances!.find(i=>i.instanceId===table.instanceId),original);assert.equal(benchReadingSpot(state,table.instanceId),null);
  assert.equal(furnitureGeometry({...large,geometry:{templateId:'future.table'}}),null,'future geometry is not silently replaced by a known default');
});
