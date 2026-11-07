import test from 'node:test';
import assert from 'node:assert/strict';
import {MOVEMENT,START} from '../src/content/world.ts';
import {movementOffset} from '../src/domain/movement.ts';
import {canStand,move} from '../src/domain/navigation.ts';

test('running preserves load penalties and clamps the last route step',()=>{
  const direction={x:.6,z:.8},loadSpeed=.55;
  const walk=movementOffset(direction,loadSpeed,false,MOVEMENT.fixedStep);
  const run=movementOffset(direction,loadSpeed,true,MOVEMENT.fixedStep);
  assert.ok(Math.abs(Math.hypot(run.x,run.z)/Math.hypot(walk.x,walk.z)-1.6)<1e-12);
  const closeWaypoint=.03;
  const lastStep=movementOffset(direction,loadSpeed,true,MOVEMENT.fixedStep,closeWaypoint);
  assert.ok(Math.abs(Math.hypot(lastStep.x,lastStep.z)-closeWaypoint)<1e-12);
});

test('running fixed steps keep the collision boundary while reaching it sooner',()=>{
  const blocker={id:'test-run-blocker',x:START.x+2,z:START.z,radius:.5};
  let walking={...START},running={...START};
  for(let frame=0;frame<12;frame++){
    const walkStep=movementOffset({x:1,z:0},1,false,MOVEMENT.fixedStep);
    const runStep=movementOffset({x:1,z:0},1,true,MOVEMENT.fixedStep);
    walking=move(walking,walkStep.x,walkStep.z,[blocker]);
    running=move(running,runStep.x,runStep.z,[blocker]);
    assert.equal(canStand(running,[blocker]),true);
  }
  assert.ok(running.x>=walking.x);
  assert.ok(running.x<blocker.x-MOVEMENT.radius);
  for(let frame=0;frame<90;frame++){
    const step=movementOffset({x:1,z:0},1,true,MOVEMENT.fixedStep);
    running=move(running,step.x,step.z,[blocker]);
  }
  assert.equal(canStand(running,[blocker]),true);
  assert.ok(running.x<blocker.x-MOVEMENT.radius);
});
