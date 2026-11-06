import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMP_EXIT,START,TENT} from '../src/content/world.ts';
import type {Point} from '../src/content/world.ts';
import {CAMP_VISITOR} from '../src/content/characters.ts';
import {WORKBENCH} from '../src/content/workshop.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';
import {makeColliders,makeTrees} from '../src/world/layout.ts';
import type {Collider} from '../src/world/layout.ts';
import {createState} from '../src/domain/state.ts';
import {campExitPoint,sleepUntilSunrise} from '../src/domain/day-cycle.ts';
import {canStand,findPath,move} from '../src/domain/navigation.ts';
import {furnitureColliders,workstationColliders} from '../src/domain/furniture-placement.ts';

function campsite(){
  const trees=makeTrees(),state=createState(trees);
  state.time=200;state.clock.speed=0;state.dayCycle.lastEveningStopDay=1;
  state.player.x=-35;state.player.z=10;
  state.inventory.instances=[{instanceId:'test-bench',definitionId:'furniture.guest-bench',blueprintId:'blueprint.guest-bench',createdAt:0,location:{kind:'world',x:-40.5,z:13,rotation:0}}];
  const blockers:Collider[]=[...makeColliders(trees),...workstationColliders(),...furnitureColliders(state),
    {id:WOODCRAFT.id,x:WOODCRAFT.x,z:WOODCRAFT.z,halfX:WOODCRAFT.halfX+.2,halfZ:WOODCRAFT.halfZ+.2}];
  return {state,blockers};
}

function walkTo(from:Point,to:Point,blockers:Collider[]){
  const route=findPath(from,to,blockers);assert.ok(route.length,'a normal click-to-walk path exists');
  let at={...from};
  for(const target of route){
    for(let step=0;step<100&&Math.hypot(target.x-at.x,target.z-at.z)>.01;step++){
      const dx=target.x-at.x,dz=target.z-at.z,scale=Math.min(1,.1/Math.hypot(dx,dz));
      at=move(at,dx*scale,dz*scale,blockers);
    }
    assert.ok(Math.hypot(target.x-at.x,target.z-at.z)<.011,'each grid segment is actually traversable');
  }
  assert.ok(Math.hypot(at.x-to.x,at.z-to.z)<.011);
}

test('sunrise exits the tent collision and can immediately walk to merchant, workbench and camp',()=>{
  const {state,blockers}=campsite();
  assert.equal(canStand({x:TENT.x+3.8,z:TENT.z+4.5},blockers),false,'the former waking point is inside the expanded tent');
  assert.match(sleepUntilSunrise(state,blockers),/清晨/);
  assert.deepEqual({x:state.player.x,z:state.player.z},CAMP_EXIT);
  assert.equal(canStand(state.player,blockers),true);
  assert.equal(state.time,800);
  assert.equal(state.player.x/1.5,Math.round(state.player.x/1.5));
  assert.equal(state.player.z/1.5,Math.round(state.player.z/1.5));
  for(const target of [START,WORKBENCH.stand,{x:CAMP_VISITOR.x+2,z:CAMP_VISITOR.z+1}])walkTo(state.player,target,blockers);
});

test('a blocked first exit chooses another connected tent-side point before advancing the day',()=>{
  const {state,blockers}=campsite();
  blockers.push({id:'temporary-furniture',...CAMP_EXIT,radius:.8});
  const exit=campExitPoint(blockers);assert.ok(exit);
  assert.notDeepEqual(exit,CAMP_EXIT);
  assert.match(sleepUntilSunrise(state,blockers),/清晨/);
  assert.deepEqual({x:state.player.x,z:state.player.z},exit);
  assert.equal(state.dayCycle.nightsSlept,1);
  assert.equal(canStand(state.player,blockers),true);
  walkTo(state.player,{x:CAMP_VISITOR.x+2,z:CAMP_VISITOR.z+1},blockers);
});

test('fully obstructed tent exits do not consume a night or move any world state',()=>{
  const {state,blockers}=campsite();
  blockers.push({id:'blocked-door-corridor',x:CAMP_EXIT.x+1.5,z:CAMP_EXIT.z-1,halfX:6,halfZ:6});
  const before=structuredClone(state);
  assert.equal(campExitPoint(blockers),null);
  assert.match(sleepUntilSunrise(state,blockers),/通道被挡住/);
  assert.deepEqual(state,before);
});

test('the default sunrise call also chooses a valid authored camp exit',()=>{
  const {state}=campsite();
  assert.match(sleepUntilSunrise(state),/清晨/);
  assert.equal(canStand(state.player,makeColliders(makeTrees())),true);
});
