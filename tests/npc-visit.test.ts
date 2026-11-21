import test from 'node:test';
import assert from 'node:assert/strict';
import {NPC_VISIT,NPC_VISIT_STAY_SECONDS,NPC_VISIT_COOLDOWN_SECONDS} from '../src/content/npc-visit.ts';
import {createNpcVisitState,tickNpcVisit,interactNpcVisit,npcVisitClockReason,npcVisitSleepReason,
  settleNpcVisitForSleep,npcVisitSnapshot,validateNpcVisitState,applyNpcVisitPlan} from '../src/domain/npc-visit.ts';
import type {NpcVisitEnvironment,NpcVisitEvent} from '../src/domain/npc-visit.ts';

function environment(patch:Partial<NpcVisitEnvironment>={}):NpcVisitEnvironment {
  return {time:30,dt:0,playerInCamp:true,hostFocused:false,
    entry:{x:0,z:0},greeting:{x:24,z:0},activities:[],planRoute:(_from,to)=>[{...to}],...patch};
}
function arriving(patch:Partial<NpcVisitEnvironment>={}){
  const state=createNpcVisitState(),env=environment(patch);
  const events=tickNpcVisit(state,env);
  assert.equal(events[0]?.type,'started');assert.ok(state.active);
  return {state,env};
}
function atGreeting(patch:Partial<NpcVisitEnvironment>={}){
  const {state,env}=arriving({...patch,entry:{x:0,z:0},greeting:{x:0,z:0}});
  assert.equal(state.active!.phase,'waiting');return {state,env};
}

test('one neighbour starts once from a reachable route and never respawns on reload',()=>{
  const state=createNpcVisitState();
  assert.deepEqual(tickNpcVisit(state,environment({time:29})),[]);
  assert.deepEqual(tickNpcVisit(state,environment({playerInCamp:false})),[]);
  const events=tickNpcVisit(state,environment());
  assert.equal(events.filter(e=>e.type==='started').length,1);
  assert.equal(state.active?.npcId,'ridge-neighbour');
  const saved=validateNpcVisitState(JSON.parse(JSON.stringify(state)),30);
  assert.equal(saved.active?.id,state.active?.id);
  assert.equal(saved.active?.deadlineAt,30+NPC_VISIT_STAY_SECONDS);
  assert.deepEqual(tickNpcVisit(saved,environment()),[]);
  assert.equal(saved.visitIndex,1);
});

test('an inaccessible entrance defers the visit without spawning or incrementing the identity',()=>{
  const state=createNpcVisitState();
  tickNpcVisit(state,environment({planRoute:()=>[]}));
  assert.equal(state.active,null);assert.equal(state.visitIndex,0);
  assert.equal(state.nextVisitAt,30+NPC_VISIT.retryArrivalAfter);
  assert.deepEqual(tickNpcVisit(state,environment({time:31})),[]);
});

test('calendar multipliers consume the stay deadline but do not accelerate feet',()=>{
  const a=arriving({greeting:{x:100,z:0}}),b=arriving({greeting:{x:100,z:0}});
  for(let i=1;i<=10;i++){
    tickNpcVisit(a.state,{...a.env,time:30+i,dt:1,hostFocused:true});
    tickNpcVisit(b.state,{...b.env,time:30+i*4,dt:1,hostFocused:true});
  }
  assert.deepEqual(a.state.active!.position,b.state.active!.position);
  assert.ok(Math.abs(a.state.active!.position.x-NPC_VISIT.walkingSpeed*10)<1e-7);
  assert.equal(npcVisitSnapshot(a.state,40).remainingSeconds,190);
  assert.equal(npcVisitSnapshot(b.state,70).remainingSeconds,160);
  const deadline=b.state.active!.deadlineAt;
  const atExpiry=tickNpcVisit(b.state,{...b.env,time:deadline,dt:0,hostFocused:true});
  assert.ok(atExpiry.some(e=>e.type==='leaving'));
  assert.equal(b.state.active!.phase,'leaving');
  const before=b.state.active!.position.x;
  tickNpcVisit(b.state,{...b.env,time:deadline+12,dt:1,hostFocused:true});
  assert.ok(Math.abs(before-b.state.active!.position.x-NPC_VISIT.walkingSpeed)<1e-7);
});

test('a stopped calendar still permits the unscaled physical walk',()=>{
  const {state,env}=arriving();
  tickNpcVisit(state,{...env,dt:1});
  assert.equal(state.active!.position.x,NPC_VISIT.walkingSpeed);
  assert.equal(state.active!.deadlineAt,30+NPC_VISIT_STAY_SECONDS);
});

test('waiting for reception locks fast-forward; an explicit roam instruction releases it',()=>{
  const {state,env}=atGreeting();
  assert.notEqual(npcVisitClockReason(state,4),'');
  assert.equal(npcVisitClockReason(state,0),'');assert.equal(npcVisitClockReason(state,1),'');
  assert.equal(interactNpcVisit(state,'greet',env).ok,true);
  assert.notEqual(npcVisitClockReason(state,12),'');
  const result=interactNpcVisit(state,'roam',env);
  assert.equal(result.ok,true);assert.equal(state.active!.attention,'released');
  assert.equal(npcVisitClockReason(state,12),'');
  assert.equal(npcVisitSnapshot(state,env.time).canFastForward,true);
});

test('a full-screen activity lets the unacknowledged visitor occupy himself and leave without interruption',()=>{
  const {state,env}=atGreeting({hostFocused:true,activities:[
    {id:'workbench-watch',abilityId:'observe-workbench',label:'看看木作',available:true,target:{x:1,z:0},durationSeconds:2},
  ]});
  assert.equal(state.active!.attention,'busy');assert.equal(npcVisitClockReason(state,12,true),'');
  const reply=interactNpcVisit(state,'talk',env);
  assert.equal(reply.ok,false);assert.match(reply.message,/先收起/);
  const own=tickNpcVisit(state,{...env,time:45,dt:1});
  assert.equal(state.active!.activity?.abilityId,'observe-workbench');
  assert.ok(!own.some(e=>e.type==='engaged'));
  tickNpcVisit(state,{...env,time:46,dt:1});
  const completed=tickNpcVisit(state,{...env,time:48,dt:2});
  assert.ok(completed.some(e=>e.type==='activity-finished'));
  const expired=tickNpcVisit(state,{...env,time:230,dt:0});
  assert.ok(expired.some(e=>e.type==='leaving'));
  const left=tickNpcVisit(state,{...env,time:231,dt:1});
  assert.ok(left.some(e=>e.type==='left'));
  assert.equal(state.active,null);
});

test('entering full-screen work releases an ongoing conversation only once',()=>{
  const {state,env}=atGreeting();
  interactNpcVisit(state,'talk',env);
  const interrupted=tickNpcVisit(state,{...env,hostFocused:true});
  assert.equal(interrupted.filter(e=>e.type==='released').length,1);
  assert.equal(state.active!.attention,'busy');assert.equal(state.active!.phase,'waiting');
  assert.equal(tickNpcVisit(state,{...env,hostFocused:true}).filter(e=>e.type==='released').length,0);
});

test('absent facilities produce a grounded refusal, never a pretend activity or resource outcome',()=>{
  const {state,env}=atGreeting({activities:[
    {id:'bench',abilityId:'rest-seat',label:'坐一会儿',available:false,reason:'还没有能坐的长凳，先站一会儿吧。',target:{x:3,z:0}},
  ]});
  const denied=interactNpcVisit(state,'activity',env,'bench');
  assert.equal(denied.ok,false);assert.match(denied.message,/没有能坐/);
  assert.equal(state.active!.activity,null);
  assert.deepEqual(denied.events.map(e=>e.type),['unavailable']);
  const absent=interactNpcVisit(state,'activity',env,'dance');
  assert.equal(absent.ok,false);assert.equal(state.active!.activity,null);
  tickNpcVisit(state,{...env,time:45,dt:1});
  assert.equal(state.active!.phase,'wandering');
  assert.equal(state.active!.plan.cursor,state.active!.plan.wishes.length);
  assert.deepEqual(tickNpcVisit(state,{...env,time:46,dt:1}),[]);
});

test('capabilities and targets are checked again on arrival, after a plan was accepted',()=>{
  const activity={id:'bench',abilityId:'rest-seat',label:'坐一会儿',available:true,target:{x:5,z:0},durationSeconds:5};
  const {state,env}=atGreeting({activities:[activity]});
  assert.equal(interactNpcVisit(state,'activity',env,'bench').ok,true);
  assert.notEqual(npcVisitClockReason(state,4),'');
  const removed=tickNpcVisit(state,{...env,time:31,dt:1,activities:[{...activity,available:false,reason:'凳子挪走了。'}]});
  assert.ok(removed.some(e=>e.type==='unavailable'&&e.message==='凳子挪走了。'));
  assert.equal(state.active!.activity,null);assert.deepEqual(state.active!.route,[]);
  assert.ok(!removed.some(e=>e.type==='activity-finished'));
});

test('physical activities last unscaled seconds and an engaged handoff ends before departure',()=>{
  const activity={id:'watch',abilityId:'observe-workbench',label:'看看木作',available:true,target:{x:0,z:0},durationSeconds:4};
  const {state,env}=atGreeting({activities:[activity]});
  interactNpcVisit(state,'activity',env,'watch');
  const started=tickNpcVisit(state,{...env,dt:0});
  assert.ok(started.some(e=>e.type==='activity-started'));
  tickNpcVisit(state,{...env,time:229,dt:1});
  assert.equal(state.active!.activity!.remainingSeconds,3);
  const due=tickNpcVisit(state,{...env,time:230,dt:1});
  assert.equal(state.active!.activity!.remainingSeconds,2);
  assert.equal(state.active!.leaveRequested,true);
  assert.ok(!due.some(e=>e.type==='leaving'));
  const done=tickNpcVisit(state,{...env,time:231,dt:2});
  assert.ok(done.some(e=>e.type==='activity-finished'));
  assert.ok(done.some(e=>e.type==='leaving'));
});

test('a conversation can finish naturally when its visit deadline has passed',()=>{
  const {state,env}=atGreeting();
  interactNpcVisit(state,'talk',env);
  tickNpcVisit(state,{...env,time:240,dt:1});
  assert.equal(state.active!.phase,'talking');assert.equal(state.active!.leaveRequested,true);
  const finish=interactNpcVisit(state,'finish-talk',{...env,time:240});
  assert.equal(finish.ok,true);assert.ok(finish.events.some(e=>e.type==='leaving'));
  assert.equal(state.active,null);
});

test('sleep requires farewell and finishes only the departure already agreed on',()=>{
  const {state,env}=arriving();
  tickNpcVisit(state,{...env,time:31,dt:1});
  assert.match(npcVisitSleepReason(state),/告别/);
  assert.deepEqual(settleNpcVisitForSleep(state,800),[]);assert.ok(state.active);
  interactNpcVisit(state,'goodbye',{...env,time:31});
  assert.equal(state.active!.phase,'leaving');assert.equal(npcVisitSleepReason(state),'');
  const events=settleNpcVisitForSleep(state,800);
  assert.equal(events[0].type,'left');assert.equal(state.active,null);
  assert.equal(state.nextVisitAt,800+NPC_VISIT_COOLDOWN_SECONDS);
});

test('model visit plan is bounded to one current session and host-declared autonomous abilities',()=>{
  const {state,env}=atGreeting({activities:[
    {id:'watch',abilityId:'observe-workbench',label:'看看木作',available:true,target:{x:4,z:0}},
    {id:'meal',abilityId:'share-meal',label:'吃饭',available:true,target:{x:4,z:0},shared:true},
  ]});
  const visitId=state.active!.id;
  assert.equal(applyNpcVisitPlan(state,{visitId,expectedRevision:0,wishes:['give-gold']},env),false);
  assert.equal(applyNpcVisitPlan(state,{visitId,expectedRevision:0,wishes:['share-meal']},env),false);
  assert.equal(applyNpcVisitPlan(state,{visitId:'old',expectedRevision:0,wishes:['watch']},env),false);
  assert.equal(applyNpcVisitPlan(state,{visitId,expectedRevision:0,wishes:['watch']},env),true);
  assert.equal(applyNpcVisitPlan(state,{visitId,expectedRevision:1,wishes:['watch']},env),false);
  assert.deepEqual(state.active!.plan,{source:'model',revision:1,wishes:['watch'],cursor:0});
});

test('one local visit completes, remembers its cooldown, and does not replay itself without any provider',()=>{
  const {state,env}=arriving({greeting:{x:6,z:0},activities:[
    {id:'watch',abilityId:'observe-workbench',label:'看看木作',available:true,target:{x:8,z:0},durationSeconds:2},
  ]});
  const all:NpcVisitEvent[]=[];
  for(let t=31;t<=250;t++)all.push(...tickNpcVisit(state,{...env,time:t,dt:1,hostFocused:true}));
  assert.equal(all.filter(e=>e.type==='arrived').length,1);
  assert.equal(all.filter(e=>e.type==='activity-started').length,1);
  assert.equal(all.filter(e=>e.type==='activity-finished').length,1);
  assert.equal(all.filter(e=>e.type==='left').length,1);
  assert.equal(state.active,null);assert.equal(state.visitIndex,1);
  const restored=validateNpcVisitState(JSON.parse(JSON.stringify(state)),250);
  assert.deepEqual(tickNpcVisit(restored,{...env,time:251,dt:1}),[]);
  assert.equal(restored.active,null);
});

test('current state validation rejects malformed times, routes and dangling activities',()=>{
  const {state}=atGreeting();
  assert.deepEqual(validateNpcVisitState(state,30),state);
  assert.throws(()=>validateNpcVisitState({...state,nextVisitAt:Infinity},30),/NPC/);
  assert.throws(()=>validateNpcVisitState({...state,active:{...state.active,route:[{x:NaN,z:0}]}},30),/NPC/);
  assert.throws(()=>validateNpcVisitState({...state,active:{...state.active,phase:'activity'}},30),/NPC/);
  assert.throws(()=>tickNpcVisit(state,environment({dt:-1})),/NPC/);
});

test('a temporarily blocked departure waits visibly, retries, and walks out when the route opens',()=>{
  const {state,env}=arriving();
  tickNpcVisit(state,{...env,time:31,dt:1});
  const blocked={...env,time:31,planRoute:()=>null};
  interactNpcVisit(state,'goodbye',blocked);
  assert.equal(state.active!.phase,'leaving');assert.equal(state.active!.route.length,0);
  for(let i=0;i<20;i++)tickNpcVisit(state,{...blocked,time:32+i*.1,dt:.1});
  assert.ok(state.active);assert.equal(state.active!.position.x,NPC_VISIT.walkingSpeed);
  for(let i=0;i<40&&state.active;i++)tickNpcVisit(state,{...env,time:34+i*.1,dt:.1});
  assert.equal(state.active,null);
});
