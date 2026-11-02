import {createWoodcraft} from '../domain/woodcraft.ts';
import {createWorkshop} from '../domain/workshop.ts';
import {createLocalClock} from '../domain/local-clock.ts';
import type { GameState } from '../domain/state.ts';
import type { SaveContext } from '../domain/save-context.ts';
import { FORESTRY } from '../content/forestry.ts';
import { upgradeSessionInventory } from './inventory-session.ts';
import { fields, object, requireValue } from '../domain/save-validation.ts';
import { validateWorldState } from '../domain/world-save.ts';

/** Only the actual pre-save in-memory shapes are upgraded, before one root commit. */
export function upgradeWorldSession(state: GameState, context: SaveContext) {
  const candidate = structuredClone(state);
  if(!Object.hasOwn(candidate,'woodcraft'))candidate.woodcraft=createWoodcraft();
  if(!Object.hasOwn(candidate,'ritual'))candidate.ritual=null;
  if(!Object.hasOwn(candidate,'workshop'))candidate.workshop=createWorkshop();
  if(!Object.hasOwn(candidate,'clock'))candidate.clock=createLocalClock();
  const inventory = upgradeSessionInventory(candidate);
  requireValue(inventory.decision !== 'protected', 'session.inventory', inventory.diagnostics.join('；'));
  const chop = candidate.forestry.active;
  if (chop && !Object.hasOwn(chop, 'reward')) {
    fields(object(chop, 'session.chop'), ['id', 'treeId', 'individualId', 'year', 'cost', 'yield', 'startedAt', 'committedAt', 'phase'], 'session.chop');
    chop.reward = { itemId: FORESTRY.harvestItemId, qualityId: FORESTRY.harvestQualityId };
  }
  const gather = candidate.gathering.action;
  if (gather && !Object.hasOwn(gather, 'reward') && !Object.hasOwn(gather, 'durationSeconds')) {
    fields(object(gather, 'session.gather'), ['actionId', 'actorId', 'sourceId', 'motionTag', 'targetAnchor', 'phase', 'progress', 'sourceVersion', 'startedAt'], 'session.gather');
    const source = context.registry.sources.get(gather.sourceId), definition = source && context.registry.definitions.get(source.definitionId);
    requireValue(definition, 'session.gather', '旧动作来源不可用');
    gather.reward = { itemId: definition.itemId, qualityId: definition.qualityId, quantity: definition.yieldPerUnit };
    gather.durationSeconds = definition.durationSeconds;
  }
  Object.assign(state, validateWorldState(candidate, context, 'runtime').state);
}
