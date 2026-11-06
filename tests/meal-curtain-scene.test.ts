import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {characterModels} from './glb-fixtures.ts';
import {createStarterState} from '../src/domain/state.ts';
import {createCharacters} from '../src/scene/characters.ts';
import {createLifePresentation} from '../src/scene/life-presentation.ts';
import {diningReadingSpot} from '../src/domain/housing.ts';
import type {MealCommitted} from '../src/domain/food.ts';
import {penetrationReport} from './seated-geometry.ts';
import {consumeMeal} from '../src/domain/food.ts';
import {inventoryTransaction} from '../src/domain/inventory.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';

async function fixture(){
  const {resources,models}=await characterModels(),actors=createCharacters(resources,models,[],new Map()),state=createStarterState([]),spot=diningReadingSpot(),pot=new THREE.Group(),spoon=new THREE.Group();
  pot.position.set(1,2,3);pot.rotation.set(.1,.2,.3);spoon.position.set(4,5,6);
  state.inventory.instances!.push({instanceId:'owned-bowl',definitionId:'vessel.wooden-bowl',blueprintId:'blueprint.wooden-bowl',createdAt:0,location:{kind:'inventory'},traits:[{id:'food.curtain-call',value:1,category:'interaction',grade:'epic'}]});
  state.player={...spot.stand,facing:spot.seat.facing,moving:false};actors.setReading(true,spot.seat);
  const life=createLifePresentation(resources,actors.player,{curtainTargets:()=>({pot,spoon})});
  const event:MealCommitted={id:'meal-owned-test',mealSequence:1,at:0,day:1,itemId:'forest-soup',kind:'soup',bowlId:'owned-bowl',curtain:{ownerId:'owned-bowl',potId:'camp-fire:pot',hookId:'camp-fire:hook',spoonTableId:'real-table',durationSeconds:1.4}};
  const step=()=>{life.restorePose();actors.update(state,false,0);life.update(state,.1,false);};return {resources,actors,state,life,pot,spoon,event,step};
}
test('only an explicit actual-bowl event gives the finite after-meal curtain, then restores the same existing pot and spoon',async()=>{
  const {resources,actors,state,life,pot,spoon,event,step}=await fixture(),potBase=pot.quaternion.clone(),spoonBase=spoon.position.clone(),before=structuredClone(state);
  life.setRarityVfxMode('off');life.setWhimsyMode('full');assert.equal(life.presentMeal('soup',event),true);
  for(let i=0;i<35;i++)step();assert.equal(life.stats().curtain,false);assert.ok(pot.quaternion.angleTo(potBase)<1e-7);
  for(let i=0;i<5;i++)step();assert.equal(life.stats().curtain,true);assert.ok(pot.quaternion.angleTo(potBase)>.01);assert.ok(spoon.position.y>spoonBase.y);
  assert.equal(life.stats().owner,'owned-bowl','the same visible held bowl retains its actual instance owner');
  for(let i=0;i<12;i++)step();assert.equal(life.isMealPlaying(),false);assert.ok(pot.quaternion.angleTo(potBase)<1e-7);assert.deepEqual(spoon.position,spoonBase);assert.deepEqual(state,before);
  assert.equal(life.presentMeal('soup',event),false);life.setReading(true);for(let i=0;i<50;i++)step();assert.equal(life.stats().curtain,false,'ordinary reading never replays a saved meal event');
  life.dispose();actors.dispose();resources.dispose();
});
test('whimsy off preserves ordinary eating, and cancel restores external transforms without adding missing props',async()=>{
  const {resources,actors,state,life,pot,spoon,event,step}=await fixture(),base=pot.quaternion.clone(),position=spoon.position.clone();
  life.setWhimsyMode('off');life.presentMeal('soup',event);for(let i=0;i<38;i++)step();assert.equal(life.isMealPlaying(),false);assert.ok(pot.quaternion.angleTo(base)<1e-7);assert.deepEqual(spoon.position,position);
  life.setWhimsyMode('simple');life.presentMeal('soup',{...event,id:'meal-owned-next'});for(let i=0;i<40;i++)step();assert.equal(life.stats().curtain,true);life.cancelMeal();assert.ok(pot.quaternion.angleTo(base)<1e-7);assert.deepEqual(spoon.position,position);
  state.inventory.instances=state.inventory.instances!.filter(item=>item.instanceId!=='owned-bowl');life.presentMeal('soup',{...event,id:'meal-owned-missing'});step();assert.equal(life.isMealPlaying(),false,'a missing real owner does not turn into a second borrowed bowl');
  life.dispose();actors.dispose();resources.dispose();
});

test('the complete curtain keeps the same real bowl in both hands and clear of the deformed body',async()=>{
  const {resources,actors,state,life,event}=await fixture(),body=actors.player.children[0],bowl=life.group.getObjectByName('meal-wooden-bowl')!;
  for(const mode of ['full','simple'] as const)for(const at of [3.7,4.2,4.8]){
    life.cancelMeal();life.setWhimsyMode(mode);life.presentMeal('soup',{...event,id:`skin-${mode}-${at}`});
    let elapsed=0;
    while(elapsed<at-1e-8){const dt=Math.min(.1,at-elapsed);life.restorePose();actors.update(state,false,elapsed);life.update(state,dt,false);elapsed+=dt;}
    assert.equal(life.stats().curtain,true);assert.equal(bowl.visible,true);actors.player.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(bowl);
    for(const side of ['l','r'])assert.ok(bounds.distanceToPoint(body.getObjectByName('handslot'+side)!.getWorldPosition(new THREE.Vector3()))<.09,`${mode} at ${at}: the actual hand remains in contact with its bowl`);
    bowl.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;object.geometry.computeBoundingBox();
      const report=penetrationReport(body,[{id:'owned-bowl-curtain',box:object.geometry.boundingBox!.clone().expandByScalar(-.008)}],object.matrixWorld.clone().invert())[0];
      assert.deepEqual(Object.keys(report.bones).filter(bone=>/^(hips|spine|chest|head|upperarm|upperleg|lowerleg|foot|toes)|pack|scarf/.test(bone)),[],`${mode} at ${at}: the actual owned bowl clears skin and clothing`);
    });
  }
  life.cancelMeal();life.setWhimsyMode('full');life.presentMeal('soup',{...event,id:'reduced-curtain'});
  for(let i=0;i<37;i++){life.restorePose();actors.update(state,true,0);life.update(state,.1,true);}
  assert.equal(life.isMealPlaying(),false,'reduced motion retains ordinary eating and skips the optional curtain');
  life.dispose();actors.dispose();resources.dispose();
});

test('world replacement resets meal receipts while ordinary cancellation still rejects duplicate pulses',async()=>{
  const {resources,actors,state,life,step}=await fixture();state.selected=CAMP_PROPS.fire.id;
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'grain-porridge',qualityId:'ordinary',delta:1}]);
  const backup=structuredClone(state),first=consumeMeal(state,'grain-porridge','owned-bowl');assert.equal(first.ok,true);assert.ok(first.committed);
  assert.equal(life.presentMeal(first.committed.kind,first.committed),true);step();life.cancelMeal();
  assert.equal(life.presentMeal(first.committed.kind,first.committed),false,'ordinary cancellation cannot replay the same successful meal');
  Object.assign(state,structuredClone(backup));const next=consumeMeal(state,'grain-porridge','owned-bowl');assert.equal(next.ok,true);assert.ok(next.committed);assert.equal(next.committed.id,first.committed.id);
  life.resetPresentationHistory();step();assert.equal(life.isMealPlaying(),false,'replacing the world itself does not emit a meal');
  assert.equal(life.presentMeal(next.committed.kind,next.committed),true,'a new successful commit in the replaced world is visible');step();
  assert.equal(life.group.getObjectByName('meal-wooden-bowl')!.visible,true);assert.equal(life.stats().owner,'owned-bowl');
  assert.equal(life.presentMeal(next.committed.kind,next.committed),false,'deduplication resumes immediately within the new world');
  life.dispose();actors.dispose();resources.dispose();
});
