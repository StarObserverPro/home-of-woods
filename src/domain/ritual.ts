import type { GameState } from './state.ts';
import type { Collider } from '../world/layout.ts';
import { CAMP_PROPS } from '../content/scene-props.ts';
import { ALTAR_LAYOUT } from '../content/altar.ts';
import { findPath } from './navigation.ts';
import { gatheringBusy } from './gathering.ts';
export type RitualAction = { kind: 'prayer'; phase: 'approaching' | 'performing' | 'completed' | 'cancelled'; startedAt: number | null };
export const ritualBusy = (state: Pick<GameState,'ritual'>) => state.ritual?.phase === 'approaching' || state.ritual?.phase === 'performing';
export function cancelRitual(state: GameState) {
  if (!ritualBusy(state)) return false;
  state.ritual = {...state.ritual!,phase:'cancelled'};state.route=[];return true;
}
export function beginRitual(state: GameState, blockers: Collider[], kind: 'prayer' | 'offering') {
  if (kind === 'offering') return {ok:false,message:'祭祀供品与回应规则尚未配置，暂不收取供品。'};
  if (state.forestry.active || gatheringBusy(state.gathering) || ritualBusy(state)) return {ok:false,message:'先完成或取消当前动作。'};
  if (![CAMP_PROPS.altar.id, ALTAR_LAYOUT.oracle.id].includes(state.selected as typeof CAMP_PROPS.altar.id)) return {ok:false,message:'先选中林间祭坛。'};
  const target={x:CAMP_PROPS.altar.x,z:CAMP_PROPS.altar.z+5};
  const near=Math.hypot(state.player.x-target.x,state.player.z-target.z)<.6;
  const route=near?[]:findPath(state.player,target,blockers);
  if(!near&&!route.length)return {ok:false,message:'暂时无法走到祭坛前。'};
  state.route=route;state.ritual={kind:'prayer',phase:'approaching',startedAt:null};
  return {ok:true,message:'走到祭坛前，合掌祈祷。'};
}
export function advanceRitual(state: GameState) {
  const a=state.ritual;if(!a||!ritualBusy(state))return null;
  if (![CAMP_PROPS.altar.id,ALTAR_LAYOUT.oracle.id].includes(state.selected as typeof CAMP_PROPS.altar.id) || state.forestry.active || gatheringBusy(state.gathering)) {cancelRitual(state);return null;}
  if(a.phase==='approaching'){
    if(state.route.length)return null;
    if(Math.hypot(state.player.x-CAMP_PROPS.altar.x,state.player.z-CAMP_PROPS.altar.z-5)>.8){cancelRitual(state);return null;}
    a.phase='performing';a.startedAt=state.time;state.player.facing=Math.atan2(CAMP_PROPS.altar.x-state.player.x,CAMP_PROPS.altar.z-state.player.z);state.player.moving=false;
  }
  if(state.time-a.startedAt!>=5.5){a.phase='completed';return '祈祷结束，林间渐渐安静下来。';}
  return null;
}
