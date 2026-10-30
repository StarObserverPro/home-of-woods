import type { ForestryState } from './forestry.ts';
import type { SaveContext } from './save-context.ts';
import { actionSequence, fields, finite, id, integer, object, point, requireValue, timestamp, uniqueStrings } from './save-validation.ts';

export function validateSavedForestry(raw: unknown, context: SaveContext, time: number): ForestryState {
  const f = object(raw, 'forestry');
  fields(f, ['ledger', 'slots', 'active', 'nextAction', 'completedActions'], 'forestry');
  const ledger = object(f.ledger, 'forestry.ledger'); fields(ledger, ['year', 'base', 'used', 'reserved'], 'forestry.ledger');
  const year = integer(ledger.year, 'ledger.year', 1), base = integer(ledger.base, 'ledger.base', 1);
  const used = integer(ledger.used, 'ledger.used'), reserved = integer(ledger.reserved, 'ledger.reserved');
  requireValue(Number.isSafeInteger(used + reserved) && used + reserved <= base, 'ledger', '额度不守恒');
  const next = integer(f.nextAction, 'forestry.nextAction', 1);
  const completed = uniqueStrings(f.completedActions, 'forestry.completedActions');
  const sequences = completed.map(action => actionSequence(action, 'chop', next, 'forestry.completedActions'));
  requireValue(new Set(sequences).size === sequences.length, 'forestry.completedActions', '动作序号重复');
  const slots = object(f.slots, 'forestry.slots'); fields(slots, [...context.trees.keys()], 'forestry.slots');
  const working: string[] = [];
  for (const [slotId, tree] of context.trees) {
    const p = `forestry.slots.${slotId}`, life = object(slots[slotId], p);
    fields(life, ['slotId', 'individualId', 'generation', 'status', 'felledAt', 'regrowAt', 'bornAt', 'maturesAt', 'fallDirection', 'actionId'], p);
    const generation = integer(life.generation, `${p}.generation`);
    requireValue(life.slotId === slotId && life.individualId === (generation === 0 ? tree.individualId : `${slotId}:g${generation}`), p, '树位与个体身份冲突');
    requireValue(['standing', 'chopping', 'falling', 'stump', 'sapling'].includes(life.status as string), p, '未知树木状态');
    if (tree.role === 'landmark') requireValue(generation === 0 && life.status === 'standing', p, '保护巨木状态冲突');
    timestamp(life.bornAt, `${p}.bornAt`, time); timestamp(life.felledAt, `${p}.felledAt`, time);
    if (generation === 0) requireValue(life.bornAt === null && life.maturesAt === null, p, '初代出生记录冲突');
    else requireValue(life.bornAt !== null && finite(life.maturesAt, `${p}.maturesAt`) >= (life.bornAt as number), p, '成长记录冲突');
    const direction = point(life.fallDirection, `${p}.fallDirection`);
    requireValue(Math.abs(Math.hypot(direction.x, direction.z) - 1) < 1e-6, p, '倒伏方向无效');
    if (life.status === 'falling' || life.status === 'stump') {
      requireValue(life.felledAt !== null && finite(life.regrowAt, `${p}.regrowAt`) > (life.felledAt as number), p, '补生时间冲突');
      requireValue(typeof life.actionId === 'string' && completed.includes(life.actionId), p, '缺少已结算动作');
    } else requireValue(life.felledAt === null && life.regrowAt === null, p, '未采伐树含结算记录');
    if (life.status === 'standing' || life.status === 'sapling') requireValue(life.actionId === null, p, '非工作树仍占用动作');
    if (life.status === 'sapling') requireValue(generation > 0, p, '幼树代次无效');
    if (life.status === 'chopping' || life.status === 'falling') working.push(slotId);
  }
  for (const action of completed) {
    const individual = action.replace(/^chop-[0-9]+-/, '');
    requireValue([...context.trees.values()].some(tree => {
      if (tree.role !== 'managed') return false;
      const prefix = `${tree.id}:g`;
      if (!individual.startsWith(prefix)) return false;
      const suffix = individual.slice(prefix.length);
      return /^(0|[1-9][0-9]*)$/.test(suffix) && Number(suffix) <= (slots[tree.id] as Record<string, number>).generation;
    }), 'forestry.completedActions', '已结算动作引用未知个体');
  }
  if (f.active === null) requireValue(working.length === 0 && reserved === 0, 'forestry', '悬空动作或预留');
  else {
    const a = object(f.active, 'forestry.active');
    fields(a, ['id', 'treeId', 'individualId', 'year', 'cost', 'yield', 'reward', 'startedAt', 'committedAt', 'phase'], 'forestry.active');
    const treeId = id(a.treeId, 'forestry.active.treeId'), life = object(slots[treeId], 'forestry.active.tree');
    requireValue(context.trees.get(treeId)?.role === 'managed' && a.individualId === life.individualId && a.id === life.actionId, 'forestry.active', '动作与树木冲突');
    actionSequence(id(a.id, 'forestry.active.id'), 'chop', next, 'forestry.active.id');
    requireValue(a.id === `chop-${String(a.id).split('-')[1]}-${String(a.individualId)}` && a.year === year, 'forestry.active', '动作个体或年度冲突');
    const cost = integer(a.cost, 'forestry.active.cost', 1); requireValue(integer(a.yield, 'forestry.active.yield', 1) === cost, 'forestry.active', '当前规则的产出与体量冲突');
    timestamp(a.startedAt, 'forestry.active.startedAt', time); requireValue(a.startedAt !== null, 'forestry.active', '缺少开始时间');
    const reward = object(a.reward, 'forestry.active.reward'); fields(reward, ['itemId', 'qualityId'], 'forestry.active.reward');
    id(reward.itemId, 'forestry.active.reward.itemId'); id(reward.qualityId, 'forestry.active.reward.qualityId');
    requireValue(working.length === 1 && working[0] === treeId && life.status === a.phase, 'forestry.active', '动作阶段冲突');
    if (a.phase === 'chopping') {
      requireValue(a.committedAt === null && !completed.includes(a.id as string) && reserved === cost, 'forestry.active', '未结算动作与预留冲突');
      requireValue(context.registry.items.get(reward.itemId as string)?.resourceLine === 'structure-wood' && context.registry.catalog.qualities.has(reward.qualityId as string), 'forestry.active', '无法恢复待结算产物');
    } else {
      requireValue(a.phase === 'falling' && completed.includes(a.id as string) && reserved === 0 && used >= cost && a.committedAt === life.felledAt, 'forestry.active', '已结算动作不一致');
    }
  }
  return structuredClone(f) as unknown as ForestryState;
}
