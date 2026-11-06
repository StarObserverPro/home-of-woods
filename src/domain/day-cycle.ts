import {VISUAL_DAY_SECONDS,CAMP_PROPS} from '../content/scene-props.ts';
import {TENT,CAMP_EXIT,START} from '../content/world.ts';
import type {Point} from '../content/world.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import {WORKBENCH} from '../content/workshop.ts';
import {makeColliders,makeTrees} from '../world/layout.ts';
import type {Collider} from '../world/layout.ts';
import {canStand,findPath} from './navigation.ts';
import {calendarAt,lifeDayAt,advanceLocalClock,LIFE_DAY_START_HOUR} from './local-clock.ts';
import type {GameState} from './state.ts';
import {isRecord} from './inventory.ts';

/** The world already starts at 14:00. Each day has one meal-time stop and one sunrise. */
export const DAY_RHYTHM={eveningHour:18,sunriseHour:LIFE_DAY_START_HOUR,campSleepRadius:14} as const;
export type DayCycleState={
  lastEveningStopDay:number|null;
  nightsSlept:number;
  wokeAt:number|null;
};
export const createDayCycle=():DayCycleState=>({lastEveningStopDay:null,nightsSlept:0,wokeAt:null});
const firstEvening=(DAY_RHYTHM.eveningHour-14)*VISUAL_DAY_SECONDS/24;
const firstSunrise=(24-14+DAY_RHYTHM.sunriseHour)*VISUAL_DAY_SECONDS/24;
function nextOccurrence(time:number,first:number){
  if(!Number.isFinite(time)||time<0)throw new Error('Invalid world time');
  return first+Math.max(0,Math.floor((time-first)/VISUAL_DAY_SECONDS)+1)*VISUAL_DAY_SECONDS;
}
export const nextEveningTime=(time:number)=>nextOccurrence(time,firstEvening);
export const nextSunriseTime=(time:number)=>nextOccurrence(time,firstSunrise);
export function validateDayCycle(raw:unknown,time:number):DayCycleState{
  if(!isRecord(raw)||Object.keys(raw).sort().join(',')!==['lastEveningStopDay','nightsSlept','wokeAt'].sort().join(','))
    throw new Error('Invalid day-cycle state');
  if(raw.lastEveningStopDay!==null&&(!Number.isSafeInteger(raw.lastEveningStopDay)||
    (raw.lastEveningStopDay as number)<1||(raw.lastEveningStopDay as number)>calendarAt(time).day))
    throw new Error('Invalid evening stop day');
  if(!Number.isSafeInteger(raw.nightsSlept)||(raw.nightsSlept as number)<0)throw new Error('Invalid sleep count');
  if(raw.wokeAt!==null&&(
    typeof raw.wokeAt!=='number'||!Number.isFinite(raw.wokeAt)||raw.wokeAt<0||raw.wokeAt>time))
    throw new Error('Invalid waking time');
  return structuredClone(raw) as DayCycleState;
}
/** Exact boundary clamp: large delta or 12x can never silently leap over dinner. */
export function advanceToEveningStop(host:Pick<GameState,'time'|'clock'|'dayCycle'>,dt:number){
  const before=host.time,evening=nextEveningTime(before);
  advanceLocalClock(host,dt);
  if(before<evening&&host.time>=evening){
    host.time=evening;
    host.clock={speed:0};
    host.dayCycle={...host.dayCycle,lastEveningStopDay:calendarAt(evening).day};
    return true;
  }
  return false;
}
export function sleepReason(host:GameState):string {
  const hour=calendarAt(host.time).hour;
  if(hour>=DAY_RHYTHM.sunriseHour&&hour<DAY_RHYTHM.eveningHour)return '傍晚后才能结束一天。';
  if(Math.hypot(host.player.x-TENT.x,host.player.z-TENT.z)>DAY_RHYTHM.campSleepRadius)return '先回到帐篷附近，再结束一天。';
  if(host.forestry.active||host.workshop.job||
    (host.gathering.action&&['approaching','performing'].includes(host.gathering.action.phase))||
    (host.ritual&&['approaching','performing'].includes(host.ritual.phase)))
    return '先完成或取消当前劳动与交互。';
  if(host.food.cooking)return '锅里的汤还在煮，请先做完再休息。';
  if(!Number.isSafeInteger(host.dayCycle.nightsSlept+1))return '休息计数已用尽。';
  if(!Number.isFinite(nextSunriseTime(host.time)))return '时间已超出可处理范围。';
  return '';
}
/** Reading is voluntary and local. It never grants a meal or cancels unfinished work. */
export function readingReason(host:GameState,seat:{x:number;z:number}=CAMP_PROPS.fire,reach=4.2):string{
  if(Math.hypot(host.player.x-seat.x,host.player.z-seat.z)>reach)return '先走近座位，再坐下读故事。';
  if(host.forestry.active||host.workshop.job||
    (host.gathering.action&&['approaching','performing'].includes(host.gathering.action.phase))||
    (host.ritual&&['approaching','performing'].includes(host.ritual.phase)))
    return '先完成或取消当前动作，再坐下来。';
  return '';
}
/**
 * Bounded, grid-aligned exits around the tent entrance. A placed bench may
 * occupy the first one; a safe wake point must still connect to camp activity.
 */
export function campExitPoint(blockers:Collider[]):Point|null{
  const exits=[
    [0,0],[1.5,0],[3,0],[1.5,1.5],[3,1.5],
    [0,-1.5],[1.5,-1.5],[3,-1.5],[0,-3],[1.5,-3],[3,-3],
  ];
  const destinations=[START,WORKBENCH.stand,{x:CAMP_VISITOR.x+2,z:CAMP_VISITOR.z+1}];
  for(const [dx,dz] of exits){
    const point={x:CAMP_EXIT.x+dx,z:CAMP_EXIT.z+dz};
    if(canStand(point,blockers)&&destinations.some(target=>findPath(point,target,blockers).length>0))return point;
  }
  return null;
}
/** Explicit player action; do not run offline, skip a second day, or grant an unearned meal. */
export function sleepUntilSunrise(host:GameState,blockers?:Collider[]):string{
  const reason=sleepReason(host);if(reason)return reason;
  const exit=campExitPoint(blockers??makeColliders(makeTrees(host.seed)));
  if(!exit)return '帐篷门前的通道被挡住了，请先挪开家具，再结束一天。';
  const wake=nextSunriseTime(host.time);
  host.time=wake;host.clock={speed:1};
  host.dayCycle={...host.dayCycle,nightsSlept:host.dayCycle.nightsSlept+1,wokeAt:wake};
  host.player={...exit,facing:0,moving:false};
  host.selected=null;host.route=[];
  return '夜色退去，清晨的阳光照在帐篷门前。新的一天开始了。';
}
export function dayCycleSnapshot(host:GameState){
  const day=calendarAt(host.time),reason=sleepReason(host);
  return {day:lifeDayAt(host.time),hour:day.hour,speed:host.clock.speed,
    eveningStopped:host.clock.speed===0&&host.dayCycle.lastEveningStopDay===day.day&&Math.abs(day.hour-DAY_RHYTHM.eveningHour)<1e-7,
    canSleep:reason==='',sleepReason:reason,
    nearCamp:Math.hypot(host.player.x-TENT.x,host.player.z-TENT.z)<=DAY_RHYTHM.campSleepRadius,
    lastEveningStopDay:host.dayCycle.lastEveningStopDay,nightsSlept:host.dayCycle.nightsSlept,
    wokeAt:host.dayCycle.wokeAt};
}
