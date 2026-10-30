import type { GameState } from '../domain/state.ts';
import type { Tree, Collider } from '../world/layout.ts';
import type { GatheringRegistry } from '../domain/gathering-registry.ts';
import { beginGather, cancelGather, gatheringBusy, advanceGather, commitGather } from '../domain/gathering.ts';
import { startChop, cancelChop } from '../domain/forestry.ts';

export function cancelPlayerAction(state: GameState) {
  const gather = cancelGather(state), chop = cancelChop(state);
  return gather ? '采集已取消。' : chop.ok ? chop.message : '';
}
export function startPlayerChop(state: GameState, tree: Tree | undefined) {
  if (gatheringBusy(state.gathering)) return { ok: false, message: '正在采集，先完成或取消当前动作。' };
  return startChop(state, tree);
}
export function startPlayerGather(state: GameState, sourceId: string, registry: GatheringRegistry, blockers: Collider[]) {
  return beginGather(state, sourceId, registry, blockers);
}
export function advancePlayerGather(state: GameState, registry: GatheringRegistry, blockers: Collider[]) {
  const candidate = advanceGather(state, registry, blockers);
  return candidate && commitGather(state, candidate, registry, blockers) ? candidate.message : null;
}
