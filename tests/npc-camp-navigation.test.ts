import test from 'node:test';
import assert from 'node:assert/strict';
import {NPC_VISIT} from '../src/content/npc-visit.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {WORKBENCH,SEAT_DEFINITION} from '../src/content/workshop.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';
import type {Point} from '../src/content/world.ts';
import {createState} from '../src/domain/state.ts';
import {forestryColliders} from '../src/domain/forestry.ts';
import {workstationColliders,furnitureColliders} from '../src/domain/furniture-placement.ts';
import {seatingColliders} from '../src/domain/housing.ts';
import {canStand,findPath,move,navigationGridPoint} from '../src/domain/navigation.ts';
import {createNpcVisitState,tickNpcVisit,interactNpcVisit} from '../src/domain/npc-visit.ts';
import type {NpcActivityTarget,NpcVisitEnvironment,NpcVisitEvent} from '../src/domain/npc-visit.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import {travelAccess} from '../src/world/regions.ts';

const dt=1/60;
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const activities:readonly NpcActivityTarget[]=[
  {id:WORKBENCH.id,abilityId:'observe-workbench',label:'看看工作台',available:true,
    target:{x:WORKBENCH.x+2,z:WORKBENCH.z+2.4},durationSeconds:6},
  {id:CAMP_PROPS.fire.id,abilityId:'warm-fire',label:'在火塘旁歇一会儿',available:true,
    target:{x:CAMP_PROPS.fire.x+2.5,z:CAMP_PROPS.fire.z-1.5},durationSeconds:8},
];

function camp(upgradedDryer=false){
  const trees=makeTrees(),world=createState(trees),base=makeColliders(trees),treeById=new Map(trees.map(t=>[t.id,t]));
  if(upgradedDryer)world.workshop.upgrades[CAMP_PROPS.dryer.id]={level:1,completedPaths:[],investments:[],updatedAt:0};
  // Match runtime.activeColliders: the visitor must not navigate an empty test world.
  const blockers=()=>[
    ...((world.workshop.upgrades[CAMP_PROPS.dryer.id]?.level??0)>0?
      [{id:CAMP_PROPS.dryer.id,x:CAMP_PROPS.dryer.x,z:CAMP_PROPS.dryer.z,radius:.95}]:[]),
    {id:WOODCRAFT.id,x:WOODCRAFT.x,z:WOODCRAFT.z,halfX:WOODCRAFT.halfX+.2,halfZ:WOODCRAFT.halfZ+.2},
    ...forestryColliders(base,treeById,world.forestry,world.time),
    ...workstationColliders(),...furnitureColliders(world),...seatingColliders(),
  ];
  const env=(time=NPC_VISIT.firstDelay):NpcVisitEnvironment=>{
    world.time=time;
    const current=blockers(),access=travelAccess(world);
    return {time,dt,playerInCamp:true,hostFocused:true,activities,
      planRoute:(from,to)=>findPath(from,to,current,access),
      move:(from,dx,dz)=>move(from,dx,dz,current,access)};
  };
  return {world,blockers,env};
}

/** Follow every real A* edge in ordinary 60 Hz walking steps, including the exact final target. */
function walkRoute(from:Point,to:Point,fixture:ReturnType<typeof camp>){
  const blockers=fixture.blockers(),access=travelAccess(fixture.world),path=findPath(from,to,blockers,access);
  assert.ok(path.length>0,`a route exists from ${JSON.stringify(from)} to ${JSON.stringify(to)}`);
  let position={...from},steps=0;
  for(const waypoint of path){
    for(let attempts=0;distance(position,waypoint)>1e-6;attempts++){
      assert.ok(attempts<1000,`walk reaches waypoint ${JSON.stringify(waypoint)}`);
      const remaining=distance(position,waypoint),step=Math.min(remaining,NPC_VISIT.walkingSpeed*dt);
      const next=move(position,(waypoint.x-position.x)/remaining*step,(waypoint.z-position.z)/remaining*step,blockers,access);
      assert.ok(distance(position,next)>1e-8,'each walk step makes progress');
      assert.ok(distance(position,next)<=step+1e-8,'collision handling does not teleport');
      assert.equal(canStand(next,blockers,undefined,access),true,'every physical step remains on valid ground');
      position=next;steps++;
    }
  }
  assert.ok(distance(position,to)<1e-6,'the body, not only the A* list, reaches the exact target');
  assert.ok(steps>0);
  return position;
}

test('camp entry, greeting and activities are reachable with all runtime obstacles and an upgraded dryer',()=>{
  for(const upgraded of [false,true]){
    const fixture=camp(upgraded),blockers=fixture.blockers(),access=travelAccess(fixture.world);
    for(const point of [NPC_VISIT.entry,NPC_VISIT.greeting,...activities.map(a=>a.target)]){
      assert.equal(canStand(point,blockers,undefined,access),true,`standing point ${JSON.stringify(point)}`);
      assert.equal(canStand(navigationGridPoint(point),blockers,undefined,access),true,'the A* grid anchor is also clear');
    }
    for(const activity of activities){
      const greeting=walkRoute(NPC_VISIT.entry,NPC_VISIT.greeting,fixture);
      const target=walkRoute(greeting,activity.target,fixture);
      walkRoute(target,NPC_VISIT.entry,fixture);
    }
  }
});

test('a local visit walks the actual camp, performs available activities and returns along the real route',()=>{
  const fixture=camp(true),state=createNpcVisitState(),events:NpcVisitEvent[]=[];
  const before=JSON.stringify(fixture.world.inventory);
  let time=NPC_VISIT.firstDelay,previous:Point|null=null;
  const initial=tickNpcVisit(state,{...fixture.env(time),dt:0});events.push(...initial);
  assert.equal(initial[0]?.type,'started');assert.ok(state.active);
  for(let frame=0;state.active&&frame<60*360;frame++){
    previous={...state.active.position};time+=dt;
    const current=tickNpcVisit(state,fixture.env(time));events.push(...current);
    if(state.active){
      assert.ok(distance(previous,state.active.position)<=NPC_VISIT.walkingSpeed*dt+.001);
      assert.equal(canStand(state.active.position,fixture.blockers(),undefined,travelAccess(fixture.world)),true);
      for(const event of current.filter(e=>e.type==='activity-started')){
        const target=activities.find(activity=>activity.id===event.activityId)!;
        assert.ok(distance(state.active.position,target.target)<.03,'activity starts only after the body arrives');
      }
    }
  }
  assert.equal(state.active,null,'the guest physically exits before the bounded test deadline');
  assert.equal(events.filter(event=>event.type==='started').length,1);
  assert.ok(events.some(event=>event.type==='arrived'));
  for(const activity of activities){
    assert.ok(events.some(event=>event.type==='activity-started'&&event.activityId===activity.id));
    assert.ok(events.some(event=>event.type==='activity-finished'&&event.activityId===activity.id));
  }
  assert.equal(events.filter(event=>event.type==='left').length,1);
  assert.equal(JSON.stringify(fixture.world.inventory),before,'looking and resting never grant camp inventory');
});

test('a placed piece of furniture can block an activity without a fake performance or crossing its collider',()=>{
  const fixture=camp(),state=createNpcVisitState();
  let time=NPC_VISIT.firstDelay;
  tickNpcVisit(state,{...fixture.env(time),dt:0});
  while(state.active?.phase==='arriving'&&time<60){time+=dt;tickNpcVisit(state,fixture.env(time));}
  assert.equal(state.active?.phase,'waiting');
  const target=activities[0];
  fixture.world.inventory.instances=[{instanceId:'npc-route-test-seat',definitionId:SEAT_DEFINITION,
    blueprintId:'blueprint.stump-seat',createdAt:time,location:{kind:'world',...target.target,rotation:0}}];
  assert.ok(fixture.blockers().some(blocker=>blocker.id==='npc-route-test-seat'));
  assert.equal(canStand(target.target,fixture.blockers()),false);
  const position={...state.active!.position};
  const result=interactNpcVisit(state,'activity',{...fixture.env(time),hostFocused:false,player:position},target.id);
  assert.equal(result.ok,false);assert.match(result.message,/走不过去/);
  assert.ok(result.events.some(event=>event.type==='unavailable'));
  assert.equal(state.active!.activity,null);assert.deepEqual(state.active!.position,position);
});
