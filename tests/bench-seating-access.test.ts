import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {guidedGeometry} from '../src/domain/workshop-guided.ts';
import {benchReadingSpot,safeBenchReadingSpot,diningReadingSpot,safeDiningReadingSpot,seatingColliders} from '../src/domain/housing.ts';
import {furnitureColliders,placementReason,workstationColliders} from '../src/domain/furniture-placement.ts';
import {approachInteraction} from '../src/domain/interaction-access.ts';
import {canStand} from '../src/domain/navigation.ts';
import {heightAt} from '../src/world/surface.ts';
import {BENCH_SEATING} from '../src/content/seating.ts';
import {DINING_SEAT,CAMP_PROPS} from '../src/content/scene-props.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import {createGeometrySpec} from '../src/domain/parametric-crafting.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';

function seatedFixture(parameters:Record<string,unknown>={},rotation=0){
  const state=createState();
  const geometry=guidedGeometry('blueprint.bench-guided',parameters);
  state.inventory.instances=[{instanceId:'bench-seating',definitionId:'furniture.guest-bench',blueprintId:'blueprint.bench-guided',createdAt:0,geometry,
    location:{kind:'world',x:-40.7,z:12.9,rotation}}];
  const spot=benchReadingSpot(state,'bench-seating')!;Object.assign(state.player,spot.stand);
  return {state,geometry,spot,blockers:furnitureColliders(state)};
}

test('all supported bench dimensions and rotations use the front edge and the real horizontal seat plane',()=>{
  for(const length of [1.6,2.4])for(const width of [.55,.9])for(const height of [.65,.95])for(const supportCount of [2,3])for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const {state,spot,blockers}=seatedFixture({length,width,height,supportCount},rotation),center=state.inventory.instances![0].location;
    if(center.kind!=='world')throw Error('invalid fixture');
    const dx=spot.seat.x-center.x,dz=spot.seat.z-center.z,c=Math.cos(rotation),s=Math.sin(rotation);
    assert.ok(Math.abs(c*dx-s*dz)<1e-10);assert.ok(Math.abs(s*dx+c*dz-(width/2+BENCH_SEATING.seatFrontOffset))<1e-10);
    assert.equal(spot.seat.facing,rotation);assert.equal(spot.seat.width,width);assert.equal(spot.seat.height,height);
    assert.equal(spot.seat.surfaceY,heightAt(center.x,center.z)+BENCH_SEATING.baseOffset+height);
    assert.equal(safeBenchReadingSpot(state,'bench-seating',blockers).code,'ready','valid dimensions remain usable from their clear front approach');
  }
});

test('front sitting requires a safe existing standing position and never mutates state while checking',()=>{
  const {state,blockers,spot}=seatedFixture({length:2.4,width:.9,height:.85});
  assert.ok(canStand(spot.stand,blockers));const before=structuredClone(state);
  const result=safeBenchReadingSpot(state,'bench-seating',blockers);assert.equal(result.code,'ready');assert.equal(result.reason,'');assert.deepEqual(result.frontStand,spot.stand);assert.deepEqual(state,before);
  Object.assign(state.player,{x:spot.stand.x+2,z:spot.stand.z});const side=structuredClone(state),approach=safeBenchReadingSpot(state,'bench-seating',blockers);
  assert.equal(approach.code,'approach');assert.equal(approach.requiresApproach,true);assert.ok(approach.spot);assert.deepEqual(state,side);
  assert.match(approachInteraction(state,'bench-seating',blockers,'sit'),/走近/);assert.ok(state.route.length);
  const arrived=state.route.at(-1)!;Object.assign(state.player,arrived);state.route=[];
  assert.equal(safeBenchReadingSpot(state,'bench-seating',blockers).code,'ready','walking and sitting agree on the exact front standing point');
});

test('blocked front exit and seated body space reject sitting with concrete reasons',()=>{
  const {state,blockers,spot}=seatedFixture({length:2.4,width:.9,height:.85});
  Object.assign(state.player,{x:spot.stand.x+1.5,z:spot.stand.z});
  const frontBlocked=[...blockers,{id:'neighbor-chair',x:spot.stand.x,z:spot.stand.z,radius:.6}];
  const before=structuredClone(state);const exit=safeBenchReadingSpot(state,'bench-seating',frontBlocked);
  assert.equal(exit.code,'blocked');assert.match(exit.reason,/起身位置/);assert.deepEqual(state,before);
  const shoulderBlocked=[...blockers,{id:'nearby-tree',x:spot.seat.x+1,z:spot.seat.z,radius:.5}];
  assert.ok(canStand(spot.stand,shoulderBlocked));
  const shoulder=safeBenchReadingSpot(state,'bench-seating',shoulderBlocked);assert.equal(shoulder.code,'blocked');assert.match(shoulder.reason,/身体和书本/);
  const originalBlocked=[...blockers,{id:'tent',x:state.player.x,z:state.player.z,halfX:.5,halfZ:.5}];
  const standing=safeBenchReadingSpot(state,'bench-seating',originalBlocked);assert.equal(standing.code,'blocked');assert.match(standing.reason,/现在的站位/);
});

test('rotated seated envelope detects neighboring geometry instead of assuming an unrotated chair',()=>{
  const {state,blockers,spot}=seatedFixture({length:2,width:.7,height:.8},Math.PI/2);
  const neighbor={id:'adjacent-table',x:spot.seat.x,z:spot.seat.z-.95,halfX:.18,halfZ:.4};
  assert.ok(canStand(spot.stand,[...blockers,neighbor]));
  const access=safeBenchReadingSpot(state,'bench-seating',[...blockers,neighbor]);assert.equal(access.code,'blocked');assert.match(access.reason,/身体和书本/);
});

test('non-seat items and active jobs cannot enter a reading pose',()=>{
  const {state,blockers}=seatedFixture();const before=structuredClone(state);
  assert.equal(safeBenchReadingSpot(state,'missing-seat',blockers).code,'invalid');assert.deepEqual(state,before);
  state.workshop.job={id:'pending-work',kind:'craft',blueprintId:'blueprint.guest-bench',phase:'working',startedAt:state.time,durationSeconds:3};
  assert.equal(safeBenchReadingSpot(state,'bench-seating',blockers).code,'busy');
  state.workshop.job=null;state.inventory.instances![0].definitionId='furniture.prep-side-table';
  assert.equal(safeBenchReadingSpot(state,'bench-seating',blockers).code,'invalid');
});

test('fire-side stump uses its actual seat plane, a clear front approach and a real walking collider',()=>{
  const state=createState(),spot=diningReadingSpot(),blockers=[...makeColliders(makeTrees()),...seatingColliders()];
  Object.assign(state.player,spot.stand);
  assert.equal(spot.seat.surfaceY,heightAt(DINING_SEAT.x,DINING_SEAT.z)+DINING_SEAT.height);
  assert.ok(Math.hypot(spot.seat.x-DINING_SEAT.x,spot.seat.z-DINING_SEAT.z)>.3,'hips move toward the stump front edge, not down through its center');
  assert.equal(canStand(DINING_SEAT,blockers),false,'the visible stump blocks normal walking');
  assert.equal(safeDiningReadingSpot(state,blockers).code,'ready');
  Object.assign(state.player,{x:CAMP_PROPS.fire.x,z:CAMP_PROPS.fire.z+3});
  assert.equal(safeDiningReadingSpot(state,blockers).code,'approach');
  assert.match(approachInteraction(state,CAMP_PROPS.fire.id,blockers,'sit'),/走近/);assert.ok(state.route.length);
  Object.assign(state.player,state.route.at(-1)!);state.route=[];
  assert.equal(safeDiningReadingSpot(state,blockers).code,'ready');
});

test('side approaches of rotated wide benches still end inside the shared safe standing range',()=>{
  for(const rotation of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const {state,spot,blockers}=seatedFixture({length:2.4,width:.9,height:.85},rotation);
    const c=Math.cos(rotation),s=Math.sin(rotation);
    Object.assign(state.player,{x:spot.stand.x+c*2,z:spot.stand.z-s*2});
    assert.equal(safeBenchReadingSpot(state,'bench-seating',blockers).code,'approach');
    assert.match(approachInteraction(state,'bench-seating',blockers,'sit'),/正在走近/);assert.ok(state.route.length);
    Object.assign(state.player,state.route.at(-1)!);state.route=[];
    assert.equal(safeBenchReadingSpot(state,'bench-seating',blockers).code,'ready');
  }
});

test('a player behind a rotated bench can walk around it to sit instead of crossing the backrest',()=>{
  const rotation=Math.PI/2,{state,blockers}=seatedFixture({length:2.4,width:.9,height:.85},rotation);
  Object.assign(state.player,{x:-43.4,z:12.9});
  assert.equal(safeBenchReadingSpot(state,'bench-seating',blockers).code,'approach');
  assert.match(approachInteraction(state,'bench-seating',blockers,'sit'),/正在走近/);assert.ok(state.route.length>1,'the route goes around the solid bench');
  for(const point of state.route)assert.ok(canStand(point,blockers));
  Object.assign(state.player,state.route.at(-1)!);state.route=[];
  assert.equal(safeBenchReadingSpot(state,'bench-seating',blockers).code,'ready');
});

test('a low saved seat can have valid placement yet fail the real uphill foot clearance without mutation',()=>{
  const state=createState(),geometry=createGeometrySpec('bench.supported',{length:1.6,width:.55,height:.45});
  state.inventory.instances=[{instanceId:'low-saved-bench',definitionId:'furniture.guest-bench',blueprintId:'blueprint.guest-bench',createdAt:0,geometry,
    location:{kind:'world',x:-37.5,z:15,rotation:Math.PI}}];
  const spot=benchReadingSpot(state,'low-saved-bench')!;Object.assign(state.player,spot.stand);
  const blockers=[...makeColliders(makeTrees()),...workstationColliders(),...furnitureColliders(state),{id:WOODCRAFT.id,x:WOODCRAFT.x,z:WOODCRAFT.z,halfX:3.2,halfZ:2.7}];
  assert.equal(placementReason(state,'low-saved-bench',{x:-37.5,z:15},blockers),'');
  const before=structuredClone(state),access=safeBenchReadingSpot(state,'low-saved-bench',blockers);
  assert.equal(access.code,'blocked');assert.match(access.reason,/脚下的地面/);assert.deepEqual(state,before);
});
