import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {inventoryTransaction,inventoryCount,stackKey} from '../src/domain/inventory.ts';
import {transferWood,collectWood,collectAllWood} from '../src/domain/woodcraft.ts';
import {changeCarrying} from '../src/domain/carrying.ts';
import {transportLocation} from '../src/domain/transport-location.ts';
import {advanceWeather,setWeather,setWeatherIntensity,setWeatherAutomatic,weatherSnapshot,validateWeather,fineWorkMultiplier} from '../src/domain/weather.ts';
import {readWoodCondition} from '../src/domain/wood-condition.ts';
import {WEATHER_RULES} from '../src/content/weather.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {WORKBENCH,WORKSHOP_RULES} from '../src/content/workshop.ts';
import {WORKBENCH_BRACING} from '../src/content/workshop-series.ts';
import {beginWorkshop,advanceWorkshop} from '../src/domain/workshop.ts';
import {beginUpgrade} from '../src/domain/upgrades.ts';
import {learnWorkshopPlan,beginGuidedCraft,adjustGuidedPart,submitGuidedPart,finishGuidedCraft} from '../src/domain/workshop-guided.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {saveDigest} from '../src/domain/save-digest.ts';
import {startChop,advanceForestry,chopRange} from '../src/domain/forestry.ts';
import {makeTrees} from '../src/world/layout.ts';
import {FORESTRY} from '../src/content/forestry.ts';

function woodStock(quantity=4){
  const state=createState();
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'wood',qualityId:'ordinary',delta:quantity}]);
  return state;
}
function hours(state:ReturnType<typeof createState>,count:number){state.time+=WEATHER_RULES.hourSeconds*count;advanceWeather(state);}

test('one game hour of rain wets actual loose wood and keeps sheltered inventory dry',()=>{
  const state=woodStock();transferWood(state,'one');
  const beforeKey=stackKey(state.inventory.stacks[0]);
  setWeather(state,'rain');hours(state,1);
  assert.ok(readWoodCondition(state.woodcraft.pieces[0].source).moisture>.6);
  assert.ok(readWoodCondition(state.inventory.stacks[0]).moisture<.2);
  assert.equal(stackKey(state.inventory.stacks[0]),beforeKey,'weather does not invalidate pointer or recipe keys');
  assert.equal(inventoryCount(state.inventory,'wood')+state.woodcraft.pieces.length,4);
  assert.ok(weatherSnapshot(state).puddles>.8);
});

test('wet loose wood returns as a distinct batch, and withdrawal/drop/take/deposit preserve moisture',()=>{
  const state=woodStock();transferWood(state,'one');setWeather(state,'rain');hours(state,1);
  const id=state.woodcraft.pieces[0].id,wet=readWoodCondition(state.woodcraft.pieces[0].source).moisture;
  assert.equal(collectWood(state,id),true);assert.equal(collectWood(state,id),false);
  assert.equal(state.inventory.stacks.length,2);
  let stack=state.inventory.stacks.find(item=>readWoodCondition(item).moisture>.5)!;
  assert.equal(stack.quantity,1);assert.ok(stack.woodLot);
  state.player={...state.player,x:CAMP_PROPS.logs.x-3.3,z:CAMP_PROPS.logs.z+1};
  assert.match(changeCarrying(state,{kind:'withdraw',key:stackKey(stack)},[]),/已拿起/);
  stack=state.inventory.stacks.find(item=>transportLocation(item)?.kind==='carried')!;
  assert.equal(readWoodCondition(stack).moisture,wet);
  Object.assign(state.player,WOODCRAFT.stand);
  assert.match(changeCarrying(state,{kind:'drop',key:stackKey(stack)},[]),/放在脚边/);
  stack=state.inventory.stacks.find(item=>transportLocation(item)?.kind==='ground')!;
  assert.equal(readWoodCondition(stack).moisture,wet);
  assert.match(changeCarrying(state,{kind:'take',key:stackKey(stack)},[]),/已拿起/);
  state.player={...state.player,x:CAMP_PROPS.logs.x-3.3,z:CAMP_PROPS.logs.z+1};
  assert.match(changeCarrying(state,{kind:'store'},[]),/全部存入/);
  assert.ok(state.inventory.stacks.some(item=>readWoodCondition(item).moisture===wet));
  assert.equal(inventoryCount(state.inventory,'wood'),4);
});

test('snow accumulates outside first and melts into wood after sunny weather returns',()=>{
  const state=woodStock();transferWood(state,'one');setWeather(state,'snow');hours(state,1);
  const before=readWoodCondition(state.woodcraft.pieces[0].source);
  assert.ok(before.snow>.9);assert.equal(readWoodCondition(state.inventory.stacks[0]).snow,0);
  setWeather(state,'sunny');hours(state,.5);
  const after=readWoodCondition(state.woodcraft.pieces[0].source);
  assert.ok(after.snow<before.snow);assert.ok(after.moisture>before.moisture+.1);
  collectAllWood(state);assert.equal(inventoryCount(state.inventory,'wood'),4);
});

test('frame chunking, automatic sequence, intensity changes and reserved batch identity remain deterministic',()=>{
  const state=woodStock();transferWood(state,'one');setWeatherAutomatic(state,true);
  state.inventory.stacks[0].wood={spec:null,measureId:'piece',amountPerPiece:1,reserved:true};
  const other=structuredClone(state),key=stackKey(state.inventory.stacks[0]);
  state.time=500;advanceWeather(state);
  for(let second=1;second<=500;second++){other.time=second;advanceWeather(other);}
  assert.deepEqual(state,other);assert.equal(stackKey(state.inventory.stacks[0]),key);
  assert.equal(state.inventory.stacks[0].wood?.reserved,true);
  assert.equal(setWeatherIntensity(state,0),true);assert.equal(weatherSnapshot(state).intensity,0);
  assert.equal(setWeatherIntensity(state,1.2),false);
  assert.throws(()=>validateWeather({...state.weather,snow:2},state.time));
});

test('rain intensity zero leaves new exposed wood dry while harvested green wood starts moist',()=>{
  const state=woodStock();transferWood(state,'one');setWeather(state,'rain');setWeatherIntensity(state,0);hours(state,1);
  assert.ok(readWoodCondition(state.woodcraft.pieces[0].source).moisture<=.2);
  assert.equal(weatherSnapshot(state).rain,0);
  const trees=makeTrees(),tree=trees.find(item=>item.role==='managed')!,fresh=createState(trees);
  fresh.player={...fresh.player,x:tree.x+chopRange(tree)-.1,z:tree.z};fresh.selected=tree.id;
  assert.equal(startChop(fresh,tree).ok,true);fresh.time=FORESTRY.chopSeconds+.01;
  advanceForestry(fresh,new Map(trees.map(item=>[item.id,item])));
  assert.equal(readWoodCondition(fresh.inventory.stacks[0]).moisture,WEATHER_RULES.freshMoisture);
});

test('actual recipe-selected moisture increases fine craft duration and the completion commits once',()=>{
  const dry=woodStock(),wet=woodStock();
  wet.inventory.stacks[0].woodCondition={moisture:.8,snow:0};
  for(const state of [dry,wet]){
    state.workshop.blueprints.push('blueprint.stump-cozy');Object.assign(state.player,WORKBENCH.stand);
    beginWorkshop(state,'craft',[],'blueprint.stump-cozy');advanceWorkshop(state);
  }
  assert.equal(dry.workshop.job?.durationSeconds,WORKSHOP_RULES.craftSeconds);
  assert.equal(wet.workshop.job?.woodMoisture,.8);
  assert.equal(wet.workshop.job?.durationSeconds,WORKSHOP_RULES.craftSeconds*fineWorkMultiplier(.8));
  wet.time=WORKSHOP_RULES.craftSeconds+.01;assert.equal(advanceWorkshop(wet),null);
  wet.time=wet.workshop.job!.durationSeconds+.01;assert.match(advanceWorkshop(wet)??'',/做好/);
  assert.equal(wet.inventory.instances?.length,1);assert.equal(inventoryCount(wet.inventory,'wood'),3);
  assert.equal(advanceWorkshop(wet),null);assert.equal(wet.inventory.instances?.length,1);
});

test('guided finishing persists its selected moisture and honors the longer final stage',async()=>{
  const state=woodStock(20);Object.assign(state.player,WORKBENCH.stand);state.selected=WORKBENCH.id;
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'branch',qualityId:'ordinary',delta:20}]);
  learnWorkshopPlan(state,WORKBENCH_BRACING.blueprintId);beginUpgrade(state,WORKBENCH_BRACING.id);
  state.time+=3.01;advanceWorkshop(state);
  learnWorkshopPlan(state,'blueprint.bench-guided');beginGuidedCraft(state,'blueprint.bench-guided');
  state.time+=WORKBENCH_BRACING.prepareSeconds+.01;advanceWorkshop(state);
  while(state.workshop.job?.assembly?.activePartId){adjustGuidedPart(state,'align');submitGuidedPart(state);}
  for(const stack of state.inventory.stacks)stack.woodCondition={moisture:.7,snow:0};
  finishGuidedCraft(state);
  assert.equal(state.workshop.job?.durationSeconds,WORKBENCH_BRACING.finishSeconds*fineWorkMultiplier(.7));
  const context=createSaveContext(),saved=await serializeWorldSave(state,context,{sequence:1,savedAt:1});
  const restored=await prepareWorldSave(saved,context);
  assert.notEqual(restored.decision,'protected');
  if(restored.decision==='restored'||restored.decision==='migrated')assert.ok(Math.abs(restored.value.workshop.job!.woodMoisture!-.7)<1e-12);
});

test('weather and wet wood survive a real world save, and existing saves default at their own clock',async()=>{
  const context=createSaveContext(),state=woodStock();transferWood(state,'one');setWeather(state,'rain');hours(state,1);
  const saved=await serializeWorldSave(state,context,{sequence:1,savedAt:1}),restored=await prepareWorldSave(saved,context);
  assert.notEqual(restored.decision,'protected');
  if(restored.decision!=='restored'&&restored.decision!=='migrated')return;
  assert.deepEqual(restored.value.weather,state.weather);
  assert.deepEqual(restored.value.woodcraft.pieces[0].source.woodCondition,state.woodcraft.pieces[0].source.woodCondition);
  const older=JSON.parse(saved);delete older.world.weather;
  const {checksum,...core}=older;older.checksum=await saveDigest(core);
  const loaded=await prepareWorldSave(JSON.stringify(older),context);
  assert.notEqual(loaded.decision,'protected');
  if(loaded.decision==='restored'||loaded.decision==='migrated'){
    assert.equal(loaded.value.weather?.updatedAt,state.time);
    assert.equal(weatherSnapshot(loaded.value).weather,'sunny');
  }
});
