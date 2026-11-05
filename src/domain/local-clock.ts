import {VISUAL_DAY_SECONDS} from '../content/scene-props.ts';
import {WORKSHOP_RULES} from '../content/workshop.ts';
export const CLOCK_SPEEDS = [0,1,4,12] as const;
export type ClockSpeed = typeof CLOCK_SPEEDS[number];
export type LocalClock = {speed:ClockSpeed};
export const createLocalClock = ():LocalClock => ({speed:1});
export function calendarAt(time:number){
  const absoluteDay=Math.floor((time/VISUAL_DAY_SECONDS*24+14)/24);
  const seasonIndex=Math.floor(absoluteDay/WORKSHOP_RULES.daysPerSeason)%4;
  return {day:absoluteDay+1,year:Math.floor(absoluteDay/(WORKSHOP_RULES.daysPerSeason*4))+1,
    season:['春','夏','秋','冬'][seasonIndex],seasonIndex,dayOfSeason:absoluteDay%WORKSHOP_RULES.daysPerSeason+1,
    hour:(14+time/VISUAL_DAY_SECONDS*24)%24};
}
export function advanceLocalClock(host:{time:number;clock:LocalClock},dt:number){
  if(!Number.isFinite(dt)||dt<0||!CLOCK_SPEEDS.includes(host.clock.speed))throw new Error('Invalid local clock step');
  const next=host.time+dt*host.clock.speed;
  if(!Number.isFinite(next)||next>Number.MAX_SAFE_INTEGER)throw new Error('Local clock overflow');
  host.time=next;
}
