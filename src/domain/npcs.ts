import {RIDGE_NEIGHBOUR} from '../content/npcs/ridge-neighbour/profile.ts';
import {calendarAt} from './local-clock.ts';
import {createNpcMemory,validateNpcMemory} from './npc-memory.ts';
import type {NpcMemoryState} from './npc-memory.ts';
import {createNpcVisitState,validateNpcVisitState} from './npc-visit.ts';
import type {NpcVisitState} from './npc-visit.ts';

/** Per-person records live in the single world save; presentation assets stay in content. */
export type NpcState={memory:NpcMemoryState;visit:NpcVisitState};
export type NpcsState={'ridge-neighbour':NpcState};
export function createNpcs(time=0):NpcsState {
  return {'ridge-neighbour':{memory:createNpcMemory(RIDGE_NEIGHBOUR.id,calendarAt(time).day),visit:createNpcVisitState(time)}};
}
export function validateNpcs(raw:unknown,time:number):NpcsState {
  if(raw===undefined)return createNpcs(time);
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==1||!('ridge-neighbour' in raw))throw new Error('Invalid NPC records');
  const record=(raw as Record<string,unknown>)['ridge-neighbour'];
  if(!record||typeof record!=='object'||Array.isArray(record)||!('memory' in record)||!('visit' in record))throw new Error('Invalid neighbour record');
  const memory=validateNpcMemory(record.memory),visit=validateNpcVisitState(record.visit,time);
  const day=calendarAt(time).day;
  if(memory.npcId!==RIDGE_NEIGHBOUR.id||memory.consolidatedThroughDay>day||memory.memories.some(item=>item.day>day||item.lastRecalledDay>day)||memory.recentDialogue.some(item=>item.day>day)||memory.promises.some(item=>item.madeDay>day||(item.resolvedDay??0)>day))throw new Error('Invalid neighbour memory time');
  return {'ridge-neighbour':{memory,visit}};
}
