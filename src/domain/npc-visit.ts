import type {Point} from '../content/world.ts';
import {NPC_VISIT,NPC_VISIT_STAY_SECONDS,NPC_VISIT_COOLDOWN_SECONDS,NPC_VISIT_PURPOSES} from '../content/npc-visit.ts';
import {calendarAt,CLOCK_SPEEDS} from './local-clock.ts';
import type {ClockSpeed} from './local-clock.ts';

export type NpcVisitPhase='arriving'|'waiting'|'wandering'|'talking'|'activity'|'leaving';
export type NpcAttention='unanswered'|'engaged'|'released'|'busy';
/** Host-owned affordances. available means the host can actually perform this activity now. */
export type NpcActivityTarget={
  id:string;abilityId:string;label:string;available:boolean;reason?:string;target:Point;
  /** Physical activity duration; never multiplied by the calendar speed. */
  durationSeconds?:number;shared?:boolean;autonomous?:boolean;
};
export type NpcActivity={
  id:string;abilityId:string;label:string;target:Point;remainingSeconds:number;
  shared:boolean;started:boolean;
};
export type NpcVisit={
  id:string;npcId:string;index:number;purpose:string;startedAt:number;deadlineAt:number;
  phase:NpcVisitPhase;attention:NpcAttention;position:Point;facing:number;route:Point[];
  entry:Point;greeting:Point;activity:NpcActivity|null;nextActivityAt:number;
  plan:{source:'local'|'model';revision:number;wishes:string[];cursor:number};
  leaveRequested:boolean;departureReason:string|null;blockedSeconds:number;lastMessage:string;
};
export type NpcVisitState={
  version:1;visitIndex:number;nextVisitAt:number;lastDepartedAt:number|null;active:NpcVisit|null;
};
export type NpcVisitEnvironment={
  /** The one authoritative game calendar, already advanced by the app. */
  time:number;
  /** Unscaled active-frame seconds; paused/hidden apps must not tick. */
  dt:number;playerInCamp:boolean;hostFocused:boolean;player?:Point;
  entry?:Point;greeting?:Point;activities?:readonly NpcActivityTarget[];
  /** Must use the same navigation and obstacle facts as the player. */
  planRoute:(from:Point,to:Point)=>Point[]|null;
  /** Optional per-step collision revalidation using the host's current obstacles. */
  move?:(from:Point,dx:number,dz:number)=>Point;
};
export type NpcVisitEvent={
  type:'started'|'arrived'|'engaged'|'released'|'activity-started'|'activity-finished'|'unavailable'|'leaving'|'left';
  visitId:string;time:number;message?:string;activityId?:string;abilityId?:string;shared?:boolean;
};
export type NpcVisitResult={ok:boolean;message:string;events:NpcVisitEvent[]};
export type NpcVisitInteraction='greet'|'talk'|'finish-talk'|'roam'|'goodbye'|'activity';

const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.z-b.z);
const clonePoint=(point:Point):Point=>({x:point.x,z:point.z});
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const point=(value:unknown):value is Point=>!!value&&typeof value==='object'&&
  finite((value as Point).x)&&finite((value as Point).z)&&
  Math.abs((value as Point).x)<=10000&&Math.abs((value as Point).z)<=10000;
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown,max=240):value is string=>typeof value==='string'&&value.length<=max;
const identifier=(value:unknown):value is string=>typeof value==='string'&&/^[a-z0-9][a-z0-9_.:-]{0,95}$/i.test(value);
const event=(visit:NpcVisit,type:NpcVisitEvent['type'],time:number,message?:string,activity?:NpcActivity):NpcVisitEvent=>
  ({type,visitId:visit.id,time,...(message?{message}:{}),...(activity?{activityId:activity.id,abilityId:activity.abilityId,shared:activity.shared}:{})});
const say=(visit:NpcVisit,message:string)=>{visit.lastMessage=message;return message;};
function routeTo(from:Point,to:Point,env:NpcVisitEnvironment):Point[]|null {
  if(distance(from,to)<.03)return [];
  const route=env.planRoute(clonePoint(from),clonePoint(to));
  if(!Array.isArray(route)||route.length===0||route.length>512||route.some(p=>!point(p))||distance(route.at(-1)!,to)>.2)return null;
  return route.map(clonePoint);
}

export function createNpcVisitState(time=0):NpcVisitState {
  if(!finite(time)||time<0)throw new Error('Invalid NPC world time');
  return {version:1,visitIndex:0,nextVisitAt:time+NPC_VISIT.firstDelay,lastDepartedAt:null,active:null};
}

/** Human-scale animation/movement is independent of a fast or stopped calendar. */
function advanceRoute(visit:NpcVisit,env:NpcVisitEnvironment):boolean {
  let travel=NPC_VISIT.walkingSpeed*env.dt,moved=false;
  for(let count=0;travel>0&&visit.route.length&&count<512;count++){
    const next=visit.route[0],remaining=distance(visit.position,next);
    if(remaining<.025){visit.route.shift();continue;}
    const step=Math.min(remaining,travel),dx=(next.x-visit.position.x)/remaining*step,dz=(next.z-visit.position.z)/remaining*step;
    const candidate=env.move?env.move(clonePoint(visit.position),dx,dz):{x:visit.position.x+dx,z:visit.position.z+dz};
    if(!point(candidate))break;
    const actual=distance(visit.position,candidate);
    // A host collision adapter cannot teleport a visitor or move further than this step.
    if(actual>step+.001||actual<.000001)break;
    visit.position=clonePoint(candidate);visit.facing=Math.atan2(dx,dz);moved=true;travel-=actual;
    if(distance(visit.position,next)<.025)visit.route.shift();
    if(actual<step-.001)break;
  }
  if(visit.route.length&&!moved)visit.blockedSeconds+=env.dt;
  else if(moved)visit.blockedSeconds=0;
  return visit.route.length===0;
}

function finishDeparture(state:NpcVisitState,time:number):NpcVisitEvent[] {
  const visit=state.active;if(!visit)return [];
  state.lastDepartedAt=time;state.nextVisitAt=time+NPC_VISIT_COOLDOWN_SECONDS;state.active=null;
  return [event(visit,'left',time,'邻居沿小路回去了。')];
}

function beginDeparture(state:NpcVisitState,env:NpcVisitEnvironment,reason:string):NpcVisitEvent[] {
  const visit=state.active;if(!visit||visit.phase==='leaving')return [];
  visit.phase='leaving';visit.attention='released';visit.activity=null;visit.leaveRequested=true;visit.departureReason=reason;
  visit.route=routeTo(visit.position,visit.entry,env)??[];visit.blockedSeconds=0;
  const message=say(visit,reason==='goodbye'?'那我先回去了，下次再来。':'时候不早了，我先往回走。');
  const events=[event(visit,'leaving',env.time,message)];
  if(distance(visit.position,visit.entry)<.03)events.push(...finishDeparture(state,env.time));
  return events;
}

function startActivity(state:NpcVisitState,abilityOrId:string,env:NpcVisitEnvironment,shared=false):NpcVisitResult {
  const visit=state.active;if(!visit)return {ok:false,message:'邻居还没到。',events:[]};
  const target=env.activities?.find(a=>a.id===abilityOrId)??env.activities?.find(a=>a.abilityId===abilityOrId);
  if(!target||!target.available||!point(target.target)){
    const message=say(visit,target?.reason||'这里还缺合适的东西，这件事先不做了，我看看周围。');
    return {ok:false,message,events:[event(visit,'unavailable',env.time,message)]};
  }
  const route=routeTo(visit.position,target.target,env);
  if(route===null){
    const message=say(visit,'那边暂时走不过去，先不做了。');
    return {ok:false,message,events:[event(visit,'unavailable',env.time,message)]};
  }
  const seconds=target.durationSeconds??6;
  if(!finite(seconds)||seconds<=0||seconds>120)return {ok:false,message:'这件事暂时还做不了。',events:[]};
  visit.activity={id:target.id,abilityId:target.abilityId,label:target.label,target:clonePoint(target.target),
    remainingSeconds:seconds,shared:shared||target.shared===true,started:false};
  visit.route=route;visit.phase='activity';visit.blockedSeconds=0;
  if(visit.activity.shared)visit.attention='engaged';
  const message=say(visit,`我去${target.label}。`);
  return {ok:true,message,events:[]};
}

function chooseIndependentActivity(state:NpcVisitState,env:NpcVisitEnvironment):NpcVisitEvent[] {
  const visit=state.active;if(!visit)return [];
  const events:NpcVisitEvent[]=[];
  // A finite visit plan is consumed once; unmet wishes are not retried every frame.
  while(visit.plan.cursor<visit.plan.wishes.length){
    const wish=visit.plan.wishes[visit.plan.cursor++];
    const target=env.activities?.find(a=>a.id===wish||a.abilityId===wish);
    if(target&&(target.shared||target.autonomous===false))continue;
    const result=startActivity(state,wish,env);events.push(...result.events);
    if(result.ok)return events;
  }
  visit.phase='wandering';visit.activity=null;visit.route=[];
  visit.nextActivityAt=visit.deadlineAt;
  if(!events.length)say(visit,'我在这儿看看，你先忙。');
  return events;
}

function assertEnvironment(env:NpcVisitEnvironment){
  if(!finite(env.time)||env.time<0||!finite(env.dt)||env.dt<0||env.dt>60)throw new Error('Invalid NPC tick');
}

/** No wall-clock timers, per-frame model work, resource grants, or private navigation world. */
export function tickNpcVisit(state:NpcVisitState,env:NpcVisitEnvironment):NpcVisitEvent[] {
  assertEnvironment(env);
  const events:NpcVisitEvent[]=[];
  if(!state.active){
    const hour=calendarAt(env.time).hour;
    if(env.time<state.nextVisitAt||!env.playerInCamp||hour<NPC_VISIT.startHour||hour>=NPC_VISIT.lastArrivalHour)return events;
    const entry=env.entry??NPC_VISIT.entry,greeting=env.greeting??NPC_VISIT.greeting;
    if(!point(entry)||!point(greeting))return events;
    const route=routeTo(entry,greeting,env);
    if(route===null){state.nextVisitAt=env.time+NPC_VISIT.retryArrivalAfter;return events;}
    const index=state.visitIndex+1,purpose=NPC_VISIT_PURPOSES[(index-1)%NPC_VISIT_PURPOSES.length];
    state.visitIndex=index;
    state.active={id:`${NPC_VISIT.npcId}:visit:${index}`,npcId:NPC_VISIT.npcId,index,purpose:purpose.label,
      startedAt:env.time,deadlineAt:env.time+NPC_VISIT_STAY_SECONDS,phase:'arriving',attention:env.hostFocused?'busy':'unanswered',
      position:clonePoint(entry),facing:0,route,entry:clonePoint(entry),greeting:clonePoint(greeting),activity:null,
      nextActivityAt:env.time+NPC_VISIT.greetingWait,plan:{source:'local',revision:0,wishes:[...purpose.wishes],cursor:0},
      leaveRequested:false,departureReason:null,blockedSeconds:0,lastMessage:'山那边的邻居沿着小路来了。'};
    events.push(event(state.active,'started',env.time,state.active.lastMessage));
  }
  const visit=state.active;
  if(env.hostFocused&&visit.phase!=='leaving'&&visit.attention!=='released'&&visit.attention!=='busy'){
    visit.attention='busy';
    if(visit.phase==='talking')visit.phase='waiting';
    if(visit.activity?.shared){visit.activity=null;visit.route=[];visit.phase='waiting';}
    events.push(event(visit,'released',env.time,say(visit,'你先忙，我在周围看看。')));
  }
  if(env.time>=visit.deadlineAt&&visit.phase!=='leaving'){
    // Complete a currently engaged physical interaction before departure; do not cut a handoff in half.
    if(visit.phase==='talking'||(visit.phase==='activity'&&visit.activity?.shared))visit.leaveRequested=true;
    else events.push(...beginDeparture(state,env,'time'));
  }
  if(!state.active)return events;
  if(visit.phase==='talking')return events;

  const reached=advanceRoute(visit,env);
  if(visit.blockedSeconds>=NPC_VISIT.routeBlockedRetrySeconds){
    const target=visit.phase==='leaving'?visit.entry:visit.activity?.target??visit.greeting;
    const route=routeTo(visit.position,target,env);visit.blockedSeconds=0;
    if(route!==null)visit.route=route;
    else if(visit.phase!=='leaving'){
      const message=say(visit,'这边的路被挡住了，我先不往那儿走。');
      events.push(event(visit,'unavailable',env.time,message));
      visit.activity=null;visit.route=[];visit.phase='wandering';visit.nextActivityAt=env.time+NPC_VISIT.betweenActivities;
    }
  }
  if(visit.phase==='leaving'){
    if(reached&&distance(visit.position,visit.entry)<.03)events.push(...finishDeparture(state,env.time));
    else if(!visit.route.length){
      // A moved prop can block the exit. Stay visible, and retry at human time rather than teleporting.
      visit.blockedSeconds+=env.dt;
      if(visit.blockedSeconds>=NPC_VISIT.routeBlockedRetrySeconds){
        visit.blockedSeconds=0;visit.route=routeTo(visit.position,visit.entry,env)??[];
      }
    }
    return events;
  }
  if(visit.phase==='arriving'&&reached){
    visit.phase='waiting';visit.nextActivityAt=env.time+NPC_VISIT.greetingWait;
    events.push(event(visit,'arrived',env.time,say(visit,env.hostFocused?'你忙着呢，我在旁边歇一会儿。':'翻过山来看看你，今天在忙什么？')));
  }
  if(visit.phase==='activity'&&visit.activity){
    const activity=visit.activity;
    // A facility may have been moved, occupied, removed, or exhausted after planning.
    const target=env.activities?.find(a=>a.id===activity.id);
    if(!target?.available||!point(target.target)||distance(target.target,activity.target)>.2){
      const message=say(visit,target?.reason||'这里现在不太合适，先不做了。');
      events.push(event(visit,'unavailable',env.time,message,activity));
      visit.activity=null;visit.route=[];visit.phase='waiting';visit.nextActivityAt=env.time+NPC_VISIT.betweenActivities;
    }else if(reached){
      if(!activity.started){activity.started=true;events.push(event(visit,'activity-started',env.time,undefined,activity));}
      else activity.remainingSeconds=Math.max(0,activity.remainingSeconds-env.dt);
      if(activity.remainingSeconds<=0){
        events.push(event(visit,'activity-finished',env.time,undefined,activity));
        visit.activity=null;visit.phase=visit.attention==='engaged'?'waiting':'wandering';
        visit.nextActivityAt=env.time+NPC_VISIT.betweenActivities;
        if(visit.leaveRequested)events.push(...beginDeparture(state,env,'time'));
      }
    }
  }
  if(state.active&&['waiting','wandering'].includes(visit.phase)&&visit.attention!=='engaged'&&env.time>=visit.nextActivityAt)
    events.push(...chooseIndependentActivity(state,env));
  return events;
}

export function interactNpcVisit(state:NpcVisitState,action:NpcVisitInteraction,env:NpcVisitEnvironment,activityId?:string):NpcVisitResult {
  assertEnvironment(env);
  const visit=state.active;
  if(!visit)return {ok:false,message:'邻居这会儿不在营地。',events:[]};
  if(visit.phase==='leaving')return {ok:false,message:'邻居已经告别，正在往回走。',events:[]};
  if(env.hostFocused&&action!=='goodbye'&&action!=='roam')return {ok:false,message:'先收起手上的活，再和邻居说话。',events:[]};
  if(env.player&&distance(env.player,visit.position)>NPC_VISIT.interactionReach)
    return {ok:false,message:'走近邻居再打招呼。',events:[]};
  if(action==='goodbye')return {ok:true,message:'那我先回去了，下次再来。',events:beginDeparture(state,env,'goodbye')};
  if(action==='roam'){
    visit.attention='released';visit.activity=null;visit.route=[];visit.phase='wandering';visit.nextActivityAt=env.time;
    const message=say(visit,'好，你先忙，我在周围转转。');
    return {ok:true,message,events:[event(visit,'released',env.time,message)]};
  }
  if(action==='activity'){
    if(!activityId)return {ok:false,message:'你想让我看看哪一件？',events:[]};
    return startActivity(state,activityId,env,true);
  }
  if(action==='finish-talk'){
    if(visit.phase!=='talking')return {ok:false,message:'这会儿没有正在进行的交谈。',events:[]};
    visit.phase='waiting';
    if(visit.leaveRequested)return {ok:true,message:'我也该回去了，下回接着聊。',events:beginDeparture(state,env,'time')};
    const message=say(visit,'我再待一会儿。');
    return {ok:true,message,events:[]};
  }
  visit.attention='engaged';visit.phase=action==='talk'?'talking':'waiting';visit.activity=null;visit.route=[];
  const message=say(visit,action==='talk'?'嗯，你说。':'今天翻过山，顺道来看看你。');
  return {ok:true,message,events:[event(visit,'engaged',env.time,message)]};
}

/** Apply one bounded plan to the existing visit; it never creates a second actor or restarts the visit. */
export function applyNpcVisitPlan(state:NpcVisitState,proposal:{visitId:string;expectedRevision:number;wishes:string[]},env:NpcVisitEnvironment):boolean {
  const visit=state.active;
  if(!visit||visit.phase==='leaving'||visit.id!==proposal.visitId||visit.plan.revision!==proposal.expectedRevision||visit.plan.source==='model'||
    !Array.isArray(proposal.wishes)||proposal.wishes.length>4||proposal.wishes.some(w=>!identifier(w))||
    new Set(proposal.wishes).size!==proposal.wishes.length)return false;
  const permitted=new Set((env.activities??[]).filter(a=>a.autonomous!==false&&!a.shared).flatMap(a=>[a.id,a.abilityId]));
  if(proposal.wishes.some(w=>!permitted.has(w)))return false;
  visit.plan={source:'model',revision:visit.plan.revision+1,wishes:[...proposal.wishes],cursor:0};
  return true;
}

/** Awaiting reception and engaged company keep the calendar at human pace. */
export function npcVisitClockReason(state:NpcVisitState|undefined,speed:ClockSpeed,hostFocused=false):string {
  if(!CLOCK_SPEEDS.includes(speed))return '时间速度无效。';
  if(speed<=1||!state?.active)return '';
  const visit=state.active;
  if(visit.phase==='talking'||visit.activity?.shared)return '正在和邻居相处，先聊完或请他自己转转。';
  if(visit.phase==='leaving'||visit.attention==='released'||hostFocused||visit.attention==='busy')return '';
  return '邻居正在等你招呼；可以先说声“你自己转转”。';
}

export function npcVisitSleepReason(state:NpcVisitState|undefined):string {
  if(!state?.active||state.active.phase==='leaving')return '';
  return '邻居还在营地，先和他告别再休息。';
}

/** Explicit goodbye permits the existing sleep transition to finish the already-started departure. */
export function settleNpcVisitForSleep(state:NpcVisitState,time:number):NpcVisitEvent[] {
  if(!finite(time)||time<0)throw new Error('Invalid NPC sleep time');
  if(npcVisitSleepReason(state))return [];
  return finishDeparture(state,time);
}

export function npcVisitSnapshot(state:NpcVisitState,time:number,hostFocused=false){
  const visit=state.active;
  return {npcId:NPC_VISIT.npcId,visible:!!visit,visitIndex:state.visitIndex,nextVisitAt:state.nextVisitAt,
    active:visit?structuredClone(visit):null,remainingSeconds:visit?Math.max(0,visit.deadlineAt-time):0,
    moving:!!visit?.route.length,clockReason:npcVisitClockReason(state,4,hostFocused),
    canFastForward:npcVisitClockReason(state,4,hostFocused)==='',sleepReason:npcVisitSleepReason(state)};
}

/** Minimal current-version persistence validation; no path or step is copied into personal memory. */
export function validateNpcVisitState(raw:unknown,time:number):NpcVisitState {
  if(!finite(time)||time<0)throw new Error('Invalid NPC world time');
  if(raw===undefined)return createNpcVisitState(time);
  if(!record(raw)||raw.version!==1||!Number.isSafeInteger(raw.visitIndex)||(raw.visitIndex as number)<0||
    !finite(raw.nextVisitAt)||raw.nextVisitAt<0||
    (raw.lastDepartedAt!==null&&(!finite(raw.lastDepartedAt)||raw.lastDepartedAt<0||raw.lastDepartedAt>time)))
    throw new Error('Invalid NPC visit state');
  if(raw.active!==null){
    const v=raw.active;
    if(!record(v)||v.npcId!==NPC_VISIT.npcId||!identifier(v.id)||!Number.isSafeInteger(v.index)||v.index!==raw.visitIndex||
      !text(v.purpose)||!finite(v.startedAt)||v.startedAt<0||v.startedAt>time||
      !finite(v.deadlineAt)||v.deadlineAt<v.startedAt||!finite(v.nextActivityAt)||v.nextActivityAt<0||
      !['arriving','waiting','wandering','talking','activity','leaving'].includes(v.phase as string)||
      !['unanswered','engaged','released','busy'].includes(v.attention as string)||
      !point(v.position)||!point(v.entry)||!point(v.greeting)||!finite(v.facing)||
      !Array.isArray(v.route)||v.route.length>512||v.route.some(p=>!point(p))||
      typeof v.leaveRequested!=='boolean'||!(v.departureReason===null||text(v.departureReason))||
      !finite(v.blockedSeconds)||v.blockedSeconds<0||!text(v.lastMessage)||!record(v.plan)||
      !['local','model'].includes(v.plan.source as string)||!Number.isSafeInteger(v.plan.revision)||(v.plan.revision as number)<0||
      !Array.isArray(v.plan.wishes)||v.plan.wishes.length>4||v.plan.wishes.some(w=>!identifier(w))||
      !Number.isSafeInteger(v.plan.cursor)||(v.plan.cursor as number)<0||(v.plan.cursor as number)>v.plan.wishes.length)
      throw new Error('Invalid NPC active visit');
    if(v.activity!==null){
      const a=v.activity;
      if(!record(a)||!identifier(a.id)||!identifier(a.abilityId)||!text(a.label)||!point(a.target)||
        !finite(a.remainingSeconds)||a.remainingSeconds<0||a.remainingSeconds>120||typeof a.shared!=='boolean'||typeof a.started!=='boolean')
        throw new Error('Invalid NPC activity');
    }
    if((v.phase==='activity')!==(v.activity!==null))throw new Error('Invalid NPC activity phase');
  }
  return structuredClone(raw) as NpcVisitState;
}
