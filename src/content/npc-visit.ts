import {VISUAL_DAY_SECONDS} from './scene-props.ts';

/** Tuning for one neighbour. Calendar seconds and motion seconds are deliberately separate. */
export const NPC_VISIT = {
  npcId:'ridge-neighbour',
  actorId:'ridge-neighbour',
  firstDelay:30,
  intervalDays:2,
  stayHours:4,
  startHour:9,
  lastArrivalHour:17,
  greetingWait:12,
  betweenActivities:10,
  retryArrivalAfter:60,
  walkingSpeed:2.4,
  interactionReach:4.2,
  routeBlockedRetrySeconds:2,
  entry:{x:-22,z:-30},
  greeting:{x:-33,z:2},
} as const;

export const NPC_VISIT_STAY_SECONDS=NPC_VISIT.stayHours*VISUAL_DAY_SECONDS/24;
export const NPC_VISIT_COOLDOWN_SECONDS=NPC_VISIT.intervalDays*VISUAL_DAY_SECONDS;
export const NPC_VISIT_PURPOSES=[
  {id:'drop-in',label:'翻过山来串个门',wishes:['observe-workbench','rest-seat','warm-fire']},
  {id:'rest-on-way',label:'回家路上歇一会儿',wishes:['rest-seat','warm-fire','observe-workbench']},
] as const;
