import type { AttachmentSlotDefinition } from '../content/item-attachment-slots.ts';
import type { InventoryState } from './inventory.ts';
import { inventoryTransaction } from './inventory.ts';
import { canonicalInstances, withItemLocation } from './owned-items.ts';
import { itemProperties } from './item-properties.ts';
import { ITEM_ATTACHMENT_REGISTRY, resolveSlot, validateAttachedItems } from './item-attachment-contract.ts';
import type { AttachmentRegistry, MountEnvironment } from './item-attachment-contract.ts';
export { createAttachmentRegistry, ITEM_ATTACHMENT_REGISTRY, validateAttachedItems, mountedSlotKey } from './item-attachment-contract.ts';
export type { AttachmentRegistry, MountEnvironment } from './item-attachment-contract.ts';

function prerequisitesSatisfied(slot: AttachmentSlotDefinition, environment?: MountEnvironment) {
  if (!slot.requires) return true;
  if (!environment || !environment.builtUpgrades.has(slot.requires.upgradeId)) return false;
  return !slot.requires.activeLegacySlot ||
    environment.legacyMounted[slot.requires.activeLegacySlot] === slot.requires.activeLegacyPart;
}
/** The caller still owns walking/reachability, presentation and craft unlock checks. */
export function mountIndependentItem(
  inventory: InventoryState, instanceId: string, hostId: string, slotId: string,
  registry: AttachmentRegistry = ITEM_ATTACHMENT_REGISTRY, environment?: MountEnvironment,
): InventoryState {
  const instances = canonicalInstances(inventory.instances ?? []);
  validateAttachedItems(instances, registry);
  const item = instances.find(v => v.instanceId === instanceId);
  if (!item || item.location.kind !== 'inventory') throw new Error('Item must be available in inventory');
  const definition = registry.definitions.get(item.definitionId);
  const slot = resolveSlot(instances, hostId, slotId, registry);
  if (!definition || definition.status !== 'active' || slot.status !== 'active' ||
      !definition.mountKinds.includes(slot.kind)) throw new Error('Item or slot is not available for mounting');
  if (!prerequisitesSatisfied(slot, environment)) throw new Error('Mount prerequisite is not active');
  const next = inventoryTransaction(inventory, []);
  next.instances = canonicalInstances(instances.map(v => v.instanceId === instanceId
    ? withItemLocation(v, {kind: 'mounted', hostId, slotId}) : v));
  validateAttachedItems(next.instances, registry);
  return next;
}
export function unmountIndependentItem(
  inventory: InventoryState, instanceId: string,
  registry: AttachmentRegistry = ITEM_ATTACHMENT_REGISTRY,
): InventoryState {
  const instances = canonicalInstances(inventory.instances ?? []);
  validateAttachedItems(instances, registry);
  const item = instances.find(v => v.instanceId === instanceId);
  if (!item || item.location.kind !== 'mounted') throw new Error('Item is not mounted');
  if (!registry.definitions.has(item.definitionId)) throw new Error('Unknown mounted item is read-only');
  const next = inventoryTransaction(inventory, []);
  next.instances = canonicalInstances(instances.map(v => v.instanceId === instanceId
    ? withItemLocation(v, {kind: 'inventory'}) : v));
  validateAttachedItems(next.instances, registry);
  return next;
}
/** Effects belong to source item instances. The host provides only context, never duplicated traits. */
export function mountedItemSources(inventory: InventoryState, hostId: string,
  registry: AttachmentRegistry = ITEM_ATTACHMENT_REGISTRY) {
  const instances = canonicalInstances(inventory.instances ?? []);
  validateAttachedItems(instances, registry);
  return instances.filter(item => item.location.kind === 'mounted' && item.location.hostId === hostId)
    .map(item => {
      const slot = registry.slots.get((item.location as {slotId:string}).slotId)!;
      return { instanceId: item.instanceId, definitionId: item.definitionId, hostId,
        slotId: slot.slotId, contexts: [...slot.contexts],
        rarityId: itemProperties(item).rarityId, traits: structuredClone(itemProperties(item).traits) };
    });
}
