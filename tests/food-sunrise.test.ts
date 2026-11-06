import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {calendarAt,lifeDayAt} from '../src/domain/local-clock.ts';
import {consumeMeal,foodSnapshot,heavyLaborAllowed,startGrainPorridge,advanceFood} from '../src/domain/food.ts';
import {dayCycleSnapshot,sleepUntilSunrise} from '../src/domain/day-cycle.ts';
import {inventoryCount,inventoryTransaction} from '../src/domain/inventory.ts';
import {prepareWorldSave,serializeWorldSave} from '../src/domain/world-save.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {findUpgradeProfile} from '../src/content/upgrades.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {FOOD_RULES} from '../src/content/food.ts';
import {TENT} from '../src/content/world.ts';

function hearth(state:ReturnType<typeof createState>){
  state.selected=CAMP_PROPS.fire.id;state.player.x=CAMP_PROPS.fire.x;state.player.z=CAMP_PROPS.fire.z+2.8;
}
function grant(state:ReturnType<typeof createState>,id:string,quantity=1){
  state.inventory=inventoryTransaction(state.inventory,[{itemId:id,qualityId:'ordinary',delta:quantity}]);
}

test('the first night keeps the first life day and initial work permission until exactly 06:00',()=>{
  const state=createState();
  for(const time of [0,200,499.999,500,700.375,799.999]){
    state.time=time;
    assert.equal(lifeDayAt(time),1);assert.equal(dayCycleSnapshot(state).day,1);
    assert.equal(heavyLaborAllowed(state.food,time),true);
  }
  assert.equal(calendarAt(500).day,2,'the natural calendar still turns over at midnight');
  state.time=800;
  assert.equal(calendarAt(state.time).hour,6);assert.equal(dayCycleSnapshot(state).day,2);
  assert.equal(heavyLaborAllowed(state.food,state.time),false);
});

test('porridge actually cooked and eaten after midnight prepares the nearest sunrise across the one save',async()=>{
  const state=createState();state.time=700.375-FOOD_RULES.cookSeconds;hearth(state);
  const materialIds:Record<string,string>={'wood.log':'wood','wood.branch':'branch','supply.hardware':'hardware-kit'};
  for(const id of ['camp-fire:stones','camp-fire:support','camp-fire:hook','camp-fire:pot']){
    const path=findUpgradeProfile(id)!.paths[0];
    state.workshop.upgrades[id]={level:1,completedPaths:[path.id],investments:path.materials.map(material=>({itemId:materialIds[material.typeId],qualityId:'ordinary',quantity:material.quantity})),updatedAt:0};
  }
  state.workshop.mounted['camp-fire:top']='camp-fire:hook';
  grant(state,'food-rice');assert.match(startGrainPorridge(state,'food-rice'),/粥已下锅/);
  state.time+=FOOD_RULES.cookSeconds;advanceFood(state);
  const result=consumeMeal(state,'grain-porridge');
  assert.equal(result.ok,true);assert.equal(result.committed?.day,1);assert.equal(result.committed?.at,700.375);
  assert.equal(calendarAt(state.time).day,2);assert.equal(state.food.lastMealDay,1);
  assert.equal(foodSnapshot(state).nextDayReady,true);assert.equal(inventoryCount(state.inventory,'grain-porridge'),0);
  assert.equal(consumeMeal(state,'grain-porridge').ok,false);assert.equal(state.food.mealsEaten,1);
  const context=createSaveContext(),saved=await serializeWorldSave(state,context,{sequence:1,savedAt:1});
  const restored=await prepareWorldSave(saved,context);assert.equal(restored.decision,'restored');
  if(!('value' in restored))throw Error('late dinner did not restore');
  const world=restored.value;world.player.x=TENT.x;world.player.z=TENT.z;
  assert.match(sleepUntilSunrise(world),/清晨/);
  assert.equal(world.time,800);assert.equal(calendarAt(world.time).day,2);assert.equal(dayCycleSnapshot(world).day,2);
  assert.equal(heavyLaborAllowed(world.food,world.time),true);assert.equal(foodSnapshot(world).nextDayReady,false);
  assert.equal(world.food.mealsEaten,1);assert.equal(advanceFood(world),null);
});

test('not eating still permits nearest-sunrise rest but grants no work permission',()=>{
  const state=createState();state.time=750.5;state.player.x=TENT.x;state.player.z=TENT.z;
  assert.match(sleepUntilSunrise(state),/清晨/);assert.equal(state.time,800);
  assert.equal(state.food.mealsEaten,0);assert.equal(heavyLaborAllowed(state.food,state.time),false);
});

test('breakfast and another post-midnight meal preserve the already earned life day',()=>{
  const state=createState();hearth(state);grant(state,'food-black-bread',3);
  state.time=200.25;consumeMeal(state,'food-black-bread');
  state.time=801.25;assert.equal(heavyLaborAllowed(state.food,state.time),true);
  consumeMeal(state,'food-black-bread');
  assert.equal(state.food.previousMealDay,1);assert.equal(state.food.lastMealDay,2);
  state.time=1900.25;assert.equal(calendarAt(state.time).day,3);assert.equal(lifeDayAt(state.time),2);
  consumeMeal(state,'food-black-bread');
  assert.equal(state.food.previousMealDay,1);assert.equal(state.food.lastMealDay,2);
  assert.equal(heavyLaborAllowed(state.food,state.time),true);assert.equal(foodSnapshot(state).nextDayReady,true);
  assert.equal(heavyLaborAllowed(state.food,2000),true);assert.equal(heavyLaborAllowed(state.food,3200),false);
  assert.equal(inventoryCount(state.inventory,'food-black-bread'),0);assert.equal(state.food.mealsEaten,3);
});
