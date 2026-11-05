import {VISUAL_DAY_SECONDS} from '../content/scene-props.ts';
import {TENT} from '../content/world.ts';
import {calendarAt,advanceLocalClock} from './local-clock.ts';
import type {GameState} from './state.ts';
import {isRecord} from './inventory.ts';

/** The world already starts at 14:00. Each day has one meal-time stop and one sunrise. */
export const DAY_RHYTHM={eveningHour:18,sunriseHour:6,campSleepRadius:14} as const;
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
/** Explicit player action; do not run offline, skip a second day, or grant an unearned meal. */
export function sleepUntilSunrise(host:GameState):string{
  const reason=sleepReason(host);if(reason)return reason;
  const wake=nextSunriseTime(host.time);
  host.time=wake;host.clock={speed:1};
  host.dayCycle={...host.dayCycle,nightsSlept:host.dayCycle.nightsSlept+1,wokeAt:wake};
  host.player={x:TENT.x+3.8,z:TENT.z+4.5,facing:0,moving:false};
  host.selected=null;host.route=[];
  return '夜色退去，清晨的阳光照在帐篷门前。新的一天开始了。';
}
export function dayCycleSnapshot(host:GameState){
  const day=calendarAt(host.time),reason=sleepReason(host);
  return {day:day.day,hour:day.hour,speed:host.clock.speed,
    eveningStopped:host.clock.speed===0&&host.dayCycle.lastEveningStopDay===day.day,
    canSleep:reason==='',sleepReason:reason,
    nearCamp:Math.hypot(host.player.x-TENT.x,host.player.z-TENT.z)<=DAY_RHYTHM.campSleepRadius,
    lastEveningStopDay:host.dayCycle.lastEveningStopDay,nightsSlept:host.dayCycle.nightsSlept,
    wokeAt:host.dayCycle.wokeAt};
}
