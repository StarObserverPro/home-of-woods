import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createState} from '../src/domain/state.ts';
import {advanceToEveningStop,dayCycleSnapshot,readingReason,sleepUntilSunrise} from '../src/domain/day-cycle.ts';
import {eatBlackBread,heavyLaborAllowed,validateFoodState} from '../src/domain/food.ts';
import {inventoryCount,inventoryTransaction} from '../src/domain/inventory.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {validateWorldState} from '../src/domain/world-save.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {TENT} from '../src/content/world.ts';
import {Resources} from '../src/scene/resources.ts';
import {createLifePresentation,mealPresentationAt} from '../src/scene/life-presentation.ts';
import {characterModels} from './glb-fixtures.ts';
import {createCharacters} from '../src/scene/characters.ts';

test('eating again today preserves today’s earned work permission and tomorrow’s meal',()=>{
  const state=createState();
  state.player.x=CAMP_PROPS.fire.x;state.player.z=CAMP_PROPS.fire.z;state.selected=CAMP_PROPS.fire.id;
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'food-black-bread',qualityId:'ordinary',delta:3}]);
  state.time=200;
  eatBlackBread(state);
  state.time=800;
  assert.equal(heavyLaborAllowed(state.food,state.time),true);
  eatBlackBread(state);
  assert.equal(state.food.lastMealDay,2);
  assert.equal(state.food.previousMealDay,1);
  assert.equal(heavyLaborAllowed(state.food,state.time),true);
  eatBlackBread(state);
  assert.equal(state.food.previousMealDay,1);
  assert.equal(heavyLaborAllowed(state.food,state.time),true);
  assert.equal(inventoryCount(state.inventory,'food-black-bread'),0);
  assert.equal(heavyLaborAllowed(state.food,2000),true);
  assert.equal(heavyLaborAllowed(state.food,3200),false);
  const restored=validateWorldState(structuredClone(state),createSaveContext(),'persisted').state;
  assert.equal(heavyLaborAllowed(restored.food,restored.time),true);
});

test('failed distant meal leaves inventory, food and work eligibility unchanged',()=>{
  const state=createState();state.time=800;
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'food-black-bread',qualityId:'ordinary',delta:1}]);
  state.selected=CAMP_PROPS.fire.id;state.player.x=30;state.player.z=50;
  const before=structuredClone({inventory:state.inventory,food:state.food});
  assert.match(eatBlackBread(state),/火塘/);
  assert.deepEqual({inventory:state.inventory,food:state.food},before);
  assert.equal(heavyLaborAllowed(state.food,state.time),false);
});

test('meal history accepts existing records but rejects impossible previous days',()=>{
  const current=createState().food;
  const {previousMealDay,...existing}=current;
  assert.equal(validateFoodState(existing,0).previousMealDay,null);
  assert.throws(()=>validateFoodState({...current,lastMealDay:2,previousMealDay:2},800),/previous meal/i);
  assert.throws(()=>validateFoodState({...current,lastMealDay:null,previousMealDay:1},800),/previous meal/i);
});

test('later manual night pause does not pretend the player just arrived at 18:00',()=>{
  const state=createState();state.clock.speed=12;
  assert.equal(advanceToEveningStop(state,100),true);
  assert.equal(dayCycleSnapshot(state).eveningStopped,true);
  state.clock.speed=1;advanceToEveningStop(state,30);state.clock.speed=0;
  assert.equal(dayCycleSnapshot(state).eveningStopped,false);
  assert.equal(state.dayCycle.lastEveningStopDay,1);
});

test('an unfed day can still read and end at the next sunrise without receiving food',()=>{
  const state=createState();state.time=1400;state.player.x=CAMP_PROPS.fire.x;state.player.z=CAMP_PROPS.fire.z;
  const before=structuredClone(state.food);
  assert.equal(readingReason(state),'');
  assert.deepEqual(state.food,before);
  state.player.x=TENT.x;state.player.z=TENT.z;
  sleepUntilSunrise(state);
  assert.equal(state.time,2000);
  assert.equal(heavyLaborAllowed(state.food,state.time),false);
  assert.equal(state.food.mealsEaten,0);
});

test('reading must be close to an actual seat and cannot silently cancel a craft',()=>{
  const state=createState();state.player.x=45;state.player.z=45;
  assert.match(readingReason(state),/走近/);
  state.player.x=-35;state.player.z=14;
  state.workshop.job={id:'workshop-1',kind:'craft',blueprintId:'blueprint.stump-cozy',phase:'working',startedAt:0,durationSeconds:3};
  assert.match(readingReason(state),/当前动作/);
  assert.ok(state.workshop.job);
});

test('meal/book props use the existing resource owner and never consume a second meal',()=>{
  const resources=new Resources(),player=new THREE.Group();
  const oldBowl=new THREE.Group();oldBowl.name='reading-bowl';player.add(oldBowl);
  const presentation=createLifePresentation(resources,player),state=createState();
  const inventory=structuredClone(state.inventory),food=structuredClone(state.food);
  presentation.presentMeal('soup');presentation.update(state,.1,false);
  assert.equal(player.getObjectByName('meal-wooden-bowl')?.visible,true);
  const elapsed=presentation.stats().elapsed;
  presentation.update(state,.1,false,true);
  assert.equal(presentation.stats().elapsed,elapsed);
  for(let i=0;i<40;i++)presentation.update(state,.1,false);
  assert.equal(presentation.isMealPlaying(),false);
  presentation.setReading(true);presentation.update(state,.1,true);
  assert.equal(player.getObjectByName('forest-storybook')?.visible,true);
  assert.equal(oldBowl.visible,false);
  assert.deepEqual(state.inventory,inventory);assert.deepEqual(state.food,food);
  const cached=resources.stats();presentation.dispose();
  assert.equal(player.getObjectByName('camp-life-held-props'),undefined);
  assert.equal(resources.stats().geometries,cached.geometries);
  resources.dispose();assert.equal(resources.stats().geometries,0);
  assert.equal(mealPresentationAt(4,true).done,true);
});

test('the actual standard skeleton holds its book and meal props in both standing and seated poses',async()=>{
  const {resources,models}=await characterModels();
  const actors=createCharacters(resources,models,[],new Map()),state=createState();
  const life=createLifePresentation(resources,actors.player);
  state.player.x=CAMP_PROPS.fire.x;state.player.z=CAMP_PROPS.fire.z;
  const body=actors.player.children.find(child=>child!==life.group&&!!child.getObjectByName('hips'))!;
  const point=(id:string)=>body.getObjectByName(id)!.getWorldPosition(new THREE.Vector3());
  const assertHeld=(name:string)=>{
    actors.player.updateMatrixWorld(true);
    const object=actors.player.getObjectByName(name)!,bounds=new THREE.Box3().setFromObject(object);
    for(const side of ['l','r'])assert.ok(bounds.distanceToPoint(point('handslot'+side))<.09,`${name} meets both actual hand contact points`);
    assert.ok(object.getWorldPosition(new THREE.Vector3()).y<point('head').y+.2,`${name} does not float above the visible head`);
  };
  for(const seated of [false,true]){
    life.restorePose();
    actors.setReading(seated,seated?{x:-35,z:14,facing:.7,height:.85}:undefined);
    actors.update(state,true);
    for(const kind of ['soup','bread'] as const){
      life.presentMeal(kind);life.update(state,0,true);assertHeld(kind==='soup'?'meal-wooden-bowl':'meal-black-bread');
      const upper=body.getObjectByName('upperarml')!.quaternion.clone();
      for(let i=0;i<10;i++)life.update(state,0,true);
      assert.ok(upper.angleTo(body.getObjectByName('upperarml')!.quaternion)<1e-7,'identical zero-time renders do not accumulate arm rotation');
      life.cancelMeal();
    }
    if(seated){life.setReading(true);life.update(state,0,true);assertHeld('forest-storybook');life.setReading(false);}
  }
  life.dispose();actors.dispose();resources.dispose();
});
