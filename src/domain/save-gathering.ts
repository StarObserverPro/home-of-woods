import type { GatheringState } from './gathering.ts';
import type { ForestryState } from './forestry.ts';
import type { SaveContext } from './save-context.ts';
import { recognizedStack } from './inventory.ts';
import { actionSequence, fields, finite, id, integer, object, requireValue, timestamp } from './save-validation.ts';

export function validateSavedGathering(raw: unknown, context: SaveContext, forestry: ForestryState, time: number, selected: string | null): GatheringState {
  const g = object(raw, 'gathering'); fields(g, ['sources', 'action', 'nextAction', 'settled'], 'gathering');
  const next = integer(g.nextAction, 'gathering.nextAction', 1);
  const sources = object(g.sources, 'gathering.sources'); fields(sources, [...context.registry.sources.keys()], 'gathering.sources');
  for (const [sourceId, definition] of context.registry.sources) {
    const p = `gathering.sources.${sourceId}`, life = object(sources[sourceId], p);
    fields(life, ['remaining', 'version', 'lastPeriod', 'depletedAt', ...(definition.hostRef ? ['hostIndividualId', 'hostAvailable'] : [])], p);
    const remaining = integer(life.remaining, `${p}.remaining`); integer(life.version, `${p}.version`);
    requireValue(remaining <= context.registry.definitions.get(definition.definitionId)!.capacity, p, '资源超过容量');
    if (life.lastPeriod !== null) integer(life.lastPeriod, `${p}.lastPeriod`);
    timestamp(life.depletedAt, `${p}.depletedAt`, time);
    if (remaining > 0) requireValue(life.depletedAt === null, p, '未采空资源含耗尽时间');
    if (definition.hostRef) {
      const tree = forestry.slots[definition.hostRef.slotId];
      const available = tree && (tree.status === 'standing' || tree.status === 'chopping');
      requireValue(tree && life.hostIndividualId === tree.individualId && life.hostAvailable === available, p, '资源池与宿主代次冲突');
      if (!available) requireValue(remaining === 0, p, '不可用宿主仍有资源');
    }
  }
  const settled = object(g.settled, 'gathering.settled');
  for (const [actionId, value] of Object.entries(settled)) {
    actionSequence(actionId, 'gather', next, `gathering.settled.${actionId}`); requireValue(value === true, 'gathering.settled', '结算标记无效');
  }
  if (g.action !== null) {
    const a = object(g.action, 'gathering.action');
    fields(a, ['actionId', 'actorId', 'sourceId', 'motionTag', 'targetAnchor', 'phase', 'progress', 'sourceVersion', 'startedAt', 'durationSeconds', 'reward'], 'gathering.action');
    const actionId = id(a.actionId, 'gathering.action.actionId'); actionSequence(actionId, 'gather', next, 'gathering.action.actionId');
    const source = context.registry.sources.get(id(a.sourceId, 'gathering.action.sourceId'));
    requireValue(source && a.actorId === 'player' && ['gather.pickup', 'gather.pluck'].includes(a.motionTag as string), 'gathering.action', '动作来源或角色无效');
    const anchor = object(a.targetAnchor, 'gathering.action.targetAnchor'); fields(anchor, ['x', 'y', 'z'], 'gathering.action.targetAnchor');
    requireValue(['x', 'y', 'z'].every(axis => typeof anchor[axis] === 'number' && Math.abs((anchor[axis] as number) - source.targetAnchor[axis as 'x' | 'y' | 'z']) < 1e-7), 'gathering.action', '挂点与布局冲突');
    requireValue(['approaching', 'performing', 'completed', 'cancelled'].includes(a.phase as string), 'gathering.action', '未知阶段');
    const progress = finite(a.progress, 'gathering.action.progress'); requireValue(progress <= 1, 'gathering.action', '进度越界');
    const version = integer(a.sourceVersion, 'gathering.action.sourceVersion'); finite(a.durationSeconds, 'gathering.action.durationSeconds');
    timestamp(a.startedAt, 'gathering.action.startedAt', time);
    const reward = object(a.reward, 'gathering.action.reward'); fields(reward, ['itemId', 'qualityId', 'quantity'], 'gathering.action.reward');
    id(reward.itemId, 'gathering.action.reward.itemId'); id(reward.qualityId, 'gathering.action.reward.qualityId'); integer(reward.quantity, 'gathering.action.reward.quantity', 1);
    if (a.phase === 'completed') {
      requireValue(settled[actionId] === true && progress === 1 && a.startedAt !== null && (sources[source.sourceId] as Record<string, number>).version > version, 'gathering.action', '已完成动作缺少结算');
    } else requireValue(!Object.hasOwn(settled, actionId), 'gathering.action', '未完成动作已结算');
    if (a.phase === 'approaching' || a.phase === 'performing') {
      const life = object(sources[source.sourceId], 'gathering.action.source');
      requireValue(forestry.active === null && selected === source.sourceId && life.version === version && (life.remaining as number) > 0 && life.hostAvailable !== false, 'gathering.action', '进行中动作与世界冲突');
      requireValue(recognizedStack(reward as { itemId: string; qualityId: string }, context.registry.catalog) && context.registry.items.get(reward.itemId as string)?.status === 'active', 'gathering.action', '待结算产物暂不可用');
      if (a.phase === 'approaching') requireValue(a.startedAt === null && progress === 0, 'gathering.action', '走近阶段已开始结算');
      else requireValue(a.startedAt !== null, 'gathering.action', '缺少开始时间');
    }
  }
  return structuredClone(g) as unknown as GatheringState;
}
