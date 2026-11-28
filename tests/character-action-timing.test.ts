import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {characterModels} from './glb-fixtures.ts';
import {createCharacters} from '../src/scene/characters.ts';
import {createState} from '../src/domain/state.ts';
import {diningReadingSpot} from '../src/domain/housing.ts';
import {WORKBENCH} from '../src/content/workshop.ts';
import {createShoeSoles} from '../src/scene/character-soles.ts';
import {heightAt} from '../src/world/surface.ts';

test('sitting can reverse partway through the step without moving the gameplay anchor',async()=>{
  const {resources,models}=await characterModels(),actor=createCharacters(resources,models,[],new Map());
  try{
    const spot=diningReadingSpot(),state=createState([]);
    state.player={...spot.stand,facing:spot.seat.facing,moving:false};
    const anchor={...state.player};
    actor.update(state,false,0);const stand=actor.player.position.clone();
    actor.setReading(true,spot.seat);actor.update(state,false,0);
    assert.ok(stand.distanceTo(actor.player.position)<1e-8);
    actor.update(state,false,.5);const halfway=actor.player.position.clone();
    assert.ok(stand.distanceTo(halfway)>.15&&actor.seatAmount()<.8);
    actor.setReading(false);actor.update(state,false,.5);
    assert.ok(halfway.distanceTo(actor.player.position)<1e-8);
    actor.update(state,false,.67);assert.ok(stand.distanceTo(actor.player.position)<stand.distanceTo(halfway));
    actor.update(state,false,1.5);assert.ok(stand.distanceTo(actor.player.position)<1e-8);
    assert.deepEqual(state.player,anchor);
  }finally{actor.dispose();resources.dispose();}
});

test('crafting and bracing use a planted support hand and a moving working hand at the bench',async()=>{
  const {resources,models}=await characterModels(),actor=createCharacters(resources,models,[],new Map());
  try{
    const state=createState([]);
    state.player={...WORKBENCH.stand,facing:Math.PI,moving:false};
    for(const kind of ['craft','upgrade'] as const){
      state.workshop.job={id:'bench-motion',kind,blueprintId:null,targetId:WORKBENCH.id,phase:'working',startedAt:0,durationSeconds:3};
      const hands:{l:THREE.Vector3;r:THREE.Vector3}[]=[];
      for(let frame=48;frame<=111;frame+=3){
        state.time=frame/60;actor.update(state,false,state.time);
        const driver=actor.player.children.find(child=>child.visible&&child.getObjectByName('handslotr'))!;
        const palm=(side:string)=>driver.getObjectByName('handslot'+side)!.getWorldPosition(new THREE.Vector3());
        hands.push({l:palm('l'),r:palm('r')});
      }
      const span=(side:'l'|'r')=>Math.max(...hands.flatMap(a=>hands.map(b=>a[side].distanceTo(b[side]))));
      assert.ok(span('r')>.10,kind+' needs a full work stroke');
      assert.ok(span('l')<.06,kind+' keeps the other palm on the work');
    }
  }finally{actor.dispose();resources.dispose();}
});

test('the fallback boots meet both sides of a real slope without drifting while stopped',async()=>{
  const {resources,models}=await characterModels(),actor=createCharacters(resources,models,[],new Map());
  try{
    const state=createState([]);
    state.player={x:-52.5,z:-6.5,facing:3.0115926535897932,moving:false};
    const soles=createShoeSoles(actor.player.children[0]);
    const stand=(seconds:number)=>{
      actor.update(state,false,seconds);actor.present(seconds,false,false);
      return soles(heightAt).clearance.slice();
    };
    const resting=stand(0);
    assert.ok(resting.every(height=>height>-.009&&height<.025),JSON.stringify(resting));
    assert.deepEqual(stand(1/60),resting);
    assert.deepEqual(stand(.75),resting);
  }finally{actor.dispose();resources.dispose();}
});
