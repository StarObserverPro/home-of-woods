import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {characterModels} from './glb-fixtures.ts';
import {createCharacters} from '../src/scene/characters.ts';
import {createHousingPresentation} from '../src/scene/housing-presentation.ts';
import {createState} from '../src/domain/state.ts';
import {benchReadingSpot} from '../src/domain/housing.ts';
import {HOUSING} from '../src/content/housing.ts';
import {CABIN} from '../src/content/world.ts';
import {heightAt} from '../src/world/surface.ts';
import {CAMP_PROPS,DINING_SEAT} from '../src/content/scene-props.ts';
import {createCampProps} from '../src/scene/camp-props.ts';
import {createLifePresentation} from '../src/scene/life-presentation.ts';

test('the visible KayKit pelvis rests at the actual bench seat and standing restores the world position',async()=>{
  const {resources,models}=await characterModels(),state=createState([]);
  state.inventory.instances=[{instanceId:'bench-contact',definitionId:HOUSING.guestBench.definitionId,blueprintId:'blueprint.guest-bench',createdAt:0,location:{kind:'world',x:-34,z:14,rotation:.35}}];
  const spot=benchReadingSpot(state,'bench-contact')!;
  state.player={...spot.stand,facing:spot.seat.facing,moving:false};
  const before=structuredClone(state),characters=createCharacters(resources,models,[],new Map());
  characters.setReading(true,spot.seat);
  // The hidden procedural actor has a separate pelvis; contact must measure the visible body.
  const visibleBody=characters.player.children[0],hips=visibleBody.getObjectByName('hips')!;
  assert.ok(hips instanceof THREE.Bone);
  const targetY=heightAt(spot.seat.x,spot.seat.z)+spot.seat.height;
  for(const time of [0,.1,.5,1,2]){
    characters.update(state,true,time);characters.player.updateMatrixWorld(true);
    const actual=hips.getWorldPosition(new THREE.Vector3()).y;
    assert.ok(Math.abs(actual-targetY)<.15,`visible pelvis should meet seat: offset ${actual-targetY}`);
  }
  assert.deepEqual(state,before,'sitting borrows only the rendered actor');
  characters.setReading(false);characters.update(state,true,2);
  assert.deepEqual(characters.player.position.toArray(),[state.player.x,heightAt(state.player.x,state.player.z),state.player.z]);
  characters.dispose();resources.dispose();
});

test('doorbell visible pinecones are selectable in front of the actual scaled cabin wall',async()=>{
  const {resources,models}=await characterModels(),state=createState([]),cabin=models.staticClone('cabin');
  cabin.scale.setScalar(1.6);cabin.position.set(CABIN.x,heightAt(CABIN.x,CABIN.z),CABIN.z);
  state.inventory.instances=[{instanceId:'bell-contact',definitionId:HOUSING.doorbell.definitionId,blueprintId:'blueprint.pinecone-doorbell',createdAt:0,location:{kind:'mounted',hostId:'cabin',slotId:'cabin:entry-hanging'}}];
  const housing=createHousingPresentation(resources,cabin);housing.update(state);cabin.updateMatrixWorld(true);
  const bell=housing.object('bell-contact')!,target=bell.localToWorld(new THREE.Vector3(.32,-.76,0));
  const ray=new THREE.Raycaster(target.clone().add(new THREE.Vector3(0,0,5)),new THREE.Vector3(0,0,-1));
  const hit=ray.intersectObject(cabin,true)[0];
  assert.ok(hit,'the actual pinecone geometry must intersect the pointer ray');
  assert.equal(housing.hits.resolve(hit.object),'bell-contact','the cabin wall must not swallow the visible hanging item hit');
  housing.dispose();resources.dispose();
});

test('the default fire stump meets its own slope height and the seated body holds its book and bowl above the seat',async()=>{
  const {resources,models}=await characterModels(),state=createState([]),camp=createCampProps(resources);
  const ground=heightAt(DINING_SEAT.x,DINING_SEAT.z),seatY=ground+DINING_SEAT.height;
  assert.notEqual(ground,heightAt(CAMP_PROPS.fire.x,CAMP_PROPS.fire.z),'the fixed campsite includes a real seat/fire ground-height difference');
  camp.group.updateMatrixWorld(true);
  const top=camp.group.getObjectByName('evening-reading-stump')!,trunk=camp.group.getObjectByName('evening-reading-stump-body')!;
  assert.ok(Math.abs(new THREE.Box3().setFromObject(top).max.y-seatY)<1e-6,'the physical seat plane follows the shared height at the seat, not the fire origin');
  assert.ok(Math.abs(new THREE.Box3().setFromObject(trunk).min.y-ground)<1e-6,'the stump rests on its own terrain sample');
  state.player={x:CAMP_PROPS.fire.x,z:CAMP_PROPS.fire.z+3,facing:0,moving:false};
  const before=structuredClone(state),characters=createCharacters(resources,models,[],new Map()),life=createLifePresentation(resources,characters.player);
  characters.setReading(true);life.setReading(true);
  const body=characters.player.children[0],hips=body.getObjectByName('hips')!;
  for(const time of [0,.1,.5,1]){
    life.restorePose();characters.update(state,true,time);life.update(state,.05,true);characters.player.updateMatrixWorld(true);
    const actual=hips.getWorldPosition(new THREE.Vector3()).y;
    assert.ok(Math.abs(actual-seatY)<.15,`default reading pelvis should meet stump: offset ${actual-seatY}`);
  }
  assert.equal(characters.player.rotation.y,DINING_SEAT.facing);
  const book=life.group.getObjectByName('forest-storybook')!;
  assert.equal(book.visible,true);assert.ok(book.getWorldPosition(new THREE.Vector3()).y>seatY+.12,'the book remains at the hands above the seat');
  life.presentMeal('soup');life.restorePose();characters.update(state,true,1);life.update(state,.1,true);characters.player.updateMatrixWorld(true);
  const bowl=life.group.getObjectByName('meal-wooden-bowl')!;
  assert.equal(bowl.visible,true);assert.ok(bowl.getWorldPosition(new THREE.Vector3()).y>seatY+.12,'the bowl follows the seated hands');
  assert.deepEqual(state,before,'seat and handheld props never write the world position or consume food');
  life.dispose();characters.dispose();camp.dispose();resources.dispose();
});
