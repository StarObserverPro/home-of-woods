import { ITEM_ACTIONS, LOCAL_MOTIONS } from '../content/item-behaviors.ts';
import type { ActionTarget, ActionTrigger, ItemActionDefinition, LocalMotionProfile } from '../content/item-behaviors.ts';
import type { OwnedItemDefinition } from '../content/owned-item-definitions.ts';
import { ITEM_CATALOG, isStableId } from './item-catalog.ts';
import { WORLD } from '../content/world.ts';
import { itemProperties } from './item-properties.ts';
import { ITEM_ATTACHMENT_REGISTRY, validateAttachedItems } from './item-attachment-contract.ts';
import type { AttachmentRegistry } from './item-attachment-contract.ts';
import type { OwnedItem } from './owned-items.ts';

export type ItemBehaviorRegistry = {
  actions: ReadonlyMap<string, ItemActionDefinition>;
  motions: ReadonlyMap<string, LocalMotionProfile>;
  itemDefinitions: ReadonlyMap<string, OwnedItemDefinition>;
};
const uniqueIds = (values: readonly string[]) =>
  values.every(isStableId) && new Set(values).size === values.length;

/** Content validation is independent of the renderer, physics, clock and inventory transactions. */
export function createItemBehaviorRegistry(
  actions: readonly ItemActionDefinition[] = ITEM_ACTIONS,
  motions: readonly LocalMotionProfile[] = LOCAL_MOTIONS,
  itemDefinitions: ReadonlyMap<string, OwnedItemDefinition> = ITEM_CATALOG.ownedItems,
): ItemBehaviorRegistry {
  const motionMap = new Map<string, LocalMotionProfile>();
  for (const profile of motions) {
    if (!isStableId(profile.motionId) || motionMap.has(profile.motionId) ||
        !['active','planned'].includes(profile.status) || !['time','movement'].includes(profile.driver) ||
        profile.channels.length < 1 || profile.channels.length > 2 ||
        !uniqueIds(profile.channels.map(c => c.anchorId)) ||
        profile.channels.some(c => !['x','y','z'].includes(c.axis) ||
          !Number.isFinite(c.amplitude) || Math.abs(c.amplitude) > .5 ||
          !Number.isFinite(c.frequency) || c.frequency <= 0 || c.frequency > 6 ||
          !Number.isFinite(c.phase))) throw new Error('Invalid local item motion profile');
    motionMap.set(profile.motionId, profile);
  }
  const actionMap = new Map<string, ItemActionDefinition>();
  for (const entry of actions) {
    const owner = itemDefinitions.get(entry.ownerDefinitionId);
    if (!isStableId(entry.actionId) || actionMap.has(entry.actionId) || !owner ||
        !['base','trait'].includes(entry.source) || !['active','planned'].includes(entry.status) ||
        !['direct','movement','environment'].includes(entry.trigger) ||
        !['none','point','item','environment'].includes(entry.target) ||
        entry.allowedLocations.length === 0 ||
        !entry.allowedLocations.every(x => ['inventory','world','mounted'].includes(x)) ||
        new Set(entry.allowedLocations).size !== entry.allowedLocations.length ||
        !uniqueIds(entry.requiredFeatures) || !uniqueIds(entry.requiredContexts) ||
        !uniqueIds(entry.requiredItemDefinitions) ||
        (entry.source === 'trait' ? !isStableId(entry.traitId) : entry.traitId !== undefined) ||
        (entry.motionProfileId !== null && !motionMap.has(entry.motionProfileId)) ||
        (entry.handlerId !== null && !isStableId(entry.handlerId))) throw new Error('Invalid item action registration');
    actionMap.set(entry.actionId, entry);
  }
  return { actions: actionMap, motions: motionMap, itemDefinitions };
}
export const ITEM_BEHAVIOR_REGISTRY = createItemBehaviorRegistry();

export type ItemActionContext = {
  trigger: ActionTrigger;
  target: ActionTarget;
  /** Concrete targets come from trusted scene/domain selection, not descriptive tags. */
  targetPoint?: { x: number; z: number };
  targetItemId?: string;
  targetContextId?: string;
  nearby: boolean;
  features: ReadonlySet<string>;
  contexts: ReadonlySet<string>;
  presentItemDefinitions: ReadonlySet<string>;
  handlers: ReadonlySet<string>;
};
export type ItemActionEligibility = { available: boolean; reason: string };

/**
 * No side effects: a valid action is only a request for a separately registered
 * handler. A known-but-planned action or missing feature can never quietly run.
 */
export function itemActionEligibility(
  item: OwnedItem, actionId: string, context: ItemActionContext,
  registry: ItemBehaviorRegistry = ITEM_BEHAVIOR_REGISTRY,
): ItemActionEligibility {
  const action = registry.actions.get(actionId);
  if (!action || action.ownerDefinitionId !== item.definitionId) return { available: false, reason: 'Action does not belong to this item' };
  const definition = registry.itemDefinitions.get(item.definitionId);
  if (!definition || definition.status !== 'active' || action.status !== 'active')
    return { available: false, reason: 'Item action is not implemented' };
  if (!action.allowedLocations.includes(item.location.kind))
    return { available: false, reason: 'Item is not at an operable location' };
  if (action.source === 'trait' && !itemProperties(item).traits.some(t => t.id === action.traitId))
    return { available: false, reason: 'Required affix is not on this item' };
  if (context.trigger !== action.trigger || context.target !== action.target)
    return { available: false, reason: 'Wrong action trigger or target' };
  if (!context.nearby) return { available: false, reason: 'Approach the item or target first' };
  if (action.target === 'point') {
    const point = context.targetPoint;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z) ||
        point.x < WORLD.minX || point.x > WORLD.maxX || point.z < WORLD.minZ || point.z > WORLD.maxZ)
      return { available: false, reason: 'Select a valid world point' };
  }
  if (action.target === 'item' && !isStableId(context.targetItemId))
    return { available: false, reason: 'Select a valid target item' };
  if (action.target === 'environment' &&
      (!isStableId(context.targetContextId) || !context.contexts.has(context.targetContextId)))
    return { available: false, reason: 'Select a real environmental event' };
  if (action.requiredFeatures.some(id => !context.features.has(id)))
    return { available: false, reason: 'Required gameplay system is not available' };
  if (action.requiredContexts.some(id => !context.contexts.has(id)))
    return { available: false, reason: 'Required environmental context is missing' };
  if (action.requiredItemDefinitions.some(id => !context.presentItemDefinitions.has(id)))
    return { available: false, reason: 'Required equipment is missing' };
  if (!action.handlerId || !context.handlers.has(action.handlerId))
    return { available: false, reason: 'No executable action handler is registered' };
  if (action.motionProfileId && registry.motions.get(action.motionProfileId)?.status !== 'active')
    return { available: false, reason: 'Required local motion is not implemented' };
  return { available: true, reason: '' };
}

export type ItemActionIntent = {
  instanceId: string; actionId: string; handlerId: string;
  target:
    | {kind: 'none'}
    | {kind: 'point'; point: {x:number;z:number}}
    | {kind: 'item'; instanceId: string}
    | {kind: 'environment'; contextId: string};
};
export function prepareItemAction(
  item: OwnedItem, actionId: string, context: ItemActionContext,
  registry: ItemBehaviorRegistry = ITEM_BEHAVIOR_REGISTRY,
): ItemActionIntent {
  const result = itemActionEligibility(item, actionId, context, registry);
  if (!result.available) throw new Error(result.reason);
  const action = registry.actions.get(actionId)!;
  const target: ItemActionIntent['target'] = action.target === 'point'
    ? {kind:'point',point:{...context.targetPoint!}}
    : action.target === 'item' ? {kind:'item',instanceId:context.targetItemId!}
    : action.target === 'environment' ? {kind:'environment',contextId:context.targetContextId!}
    : {kind:'none'};
  return { instanceId: item.instanceId, actionId, handlerId: action.handlerId!, target };
}
/** For inspection UIs: descriptors may be listed even when not currently operable. */
export const actionsForItem = (item: OwnedItem, registry: ItemBehaviorRegistry = ITEM_BEHAVIOR_REGISTRY) =>
  [...registry.actions.values()].filter(action => action.ownerDefinitionId === item.definitionId &&
    (action.source !== 'trait' || itemProperties(item).traits.some(trait => trait.id === action.traitId)));

/** Reuse #14's installed-slot contexts; never copy or rewrite the host's traits. */
export function itemMountedContexts(
  item: OwnedItem, instances: readonly OwnedItem[],
  attachments: AttachmentRegistry = ITEM_ATTACHMENT_REGISTRY,
): readonly string[] {
  if (item.location.kind !== 'mounted') return [];
  validateAttachedItems(instances, attachments);
  const registered = instances.find(value => value.instanceId === item.instanceId);
  if (!registered || registered.location.kind !== 'mounted' ||
      registered.location.hostId !== item.location.hostId ||
      registered.location.slotId !== item.location.slotId)
    throw new Error('Item is not mounted in the supplied owner ledger');
  const slot = attachments.slots.get(item.location.slotId)!;
  return [...slot.contexts];
}
