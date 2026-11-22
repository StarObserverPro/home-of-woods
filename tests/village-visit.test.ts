import test from 'node:test';
import assert from 'node:assert/strict';
import {VILLAGER_MODELS} from '../src/content/characters.ts';
import {VISUAL_DAY_SECONDS} from '../src/content/scene-props.ts';
import {scheduledVillager,villagePose,villageRoute} from '../src/domain/village-visit.ts';

const time=(day:number,hour:number)=>(day-1+(hour-14)/24)*VISUAL_DAY_SECONDS;

test('four villagers rotate on isolated game days and keep their identities after loading',()=>{
  assert.equal(scheduledVillager(time(1,15.24)),null);
  for(const [index,model] of VILLAGER_MODELS.entries()){
    const day=1+3*index;
    const frame=time(day,15.5);
    assert.equal(scheduledVillager(frame)?.model,model);
    assert.equal(scheduledVillager(time(day,17.25))?.model,model);
    assert.equal(scheduledVillager(time(day+1,15.5)),null);
    assert.equal(scheduledVillager(time(day,18)),null);
  }
  assert.equal(scheduledVillager(time(13,15.5))?.model,VILLAGER_MODELS[0]);
});

test('the villager walks a routed distance, waits briefly and returns along the same path',()=>{
  const route=villageRoute([{x:0,z:0},{x:0,z:4},{x:0,z:4},{x:6,z:4}]);
  assert.equal(route.length,10);
  assert.deepEqual(villagePose(route,2,1),{x:0,z:2,facing:0,moving:true,walked:2});
  assert.deepEqual(villagePose(route,11,1),{x:6,z:4,facing:Math.PI/2,moving:false,walked:10});
  assert.deepEqual(villagePose(route,25,1),{x:3,z:4,facing:Math.PI*1.5,moving:true,walked:13});
  assert.equal(villagePose(route,32,1),null);
});
