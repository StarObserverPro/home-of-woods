import { HOST_ATTACHMENT_SLOTS } from '../content/item-attachment-slots.ts';
import type { AttachmentSlotDefinition } from '../content/item-attachment-slots.ts';
import type { OwnedItemDefinition } from '../content/owned-item-definitions.ts';
import { ITEM_CATALOG, isStableId } from './item-catalog.ts';
import type { OwnedItem } from './owned-items.ts';

/** Pure ownership contract; intentionally does not import inventory transactions. */
export type AttachmentRegistry = {
  slots: ReadonlyMap<string, AttachmentSlotDefinition>;
  definitions: ReadonlyMap<string, OwnedItemDefinition>;
};
export type MountEnvironment = {
  builtUpgrades: ReadonlySet<string>;
  legacyMounted: Readonly<Record<string, string>>;
};
export function createAttachmentRegistry(
  slots: readonly AttachmentSlotDefinition[] = HOST_ATTACHMENT_SLOTS,
  definitions: ReadonlyMap<string, OwnedItemDefinition> = ITEM_CATALOG.ownedItems,
): AttachmentRegistry {
  const byId = new Map<string, AttachmentSlotDefinition>();
  for (const slot of slots) {
    if (!isStableId(slot.slotId) || byId.has(slot.slotId) || !isStableId(slot.kind) ||
        !isStableId(slot.anchorId) || !['planned','active'].includes(slot.status) ||
        !['fixture','item','character'].includes(slot.host.kind) ||
        (slot.host.kind === 'item' ? !isStableId(slot.host.definitionId) : !isStableId(slot.host.id)) ||
        !Array.isArray(slot.contexts) || slot.contexts.some(v => !isStableId(v)) ||
        new Set(slot.contexts).size !== slot.contexts.length)
      throw new Error('Invalid attachment slot registration');
    if (slot.requires && (!isStableId(slot.requires.upgradeId) ||
        !!slot.requires.activeLegacySlot !== !!slot.requires.activeLegacyPart ||
        (slot.requires.activeLegacySlot !== undefined &&
          (!isStableId(slot.requires.activeLegacySlot) || !isStableId(slot.requires.activeLegacyPart)))))
      throw new Error('Invalid attachment slot prerequisite');
    byId.set(slot.slotId, slot);
  }
  return { slots: byId, definitions };
}
export const ITEM_ATTACHMENT_REGISTRY = createAttachmentRegistry();

export const mountedSlotKey = (hostId: string, slotId: string) => JSON.stringify([hostId, slotId]);
export function resolveSlot(instances: readonly OwnedItem[], hostId: string, slotId: string, registry: AttachmentRegistry) {
  const slot = registry.slots.get(slotId);
  if (!slot) throw new Error('Unrecognized attachment slot: ' + slotId);
  if (slot.host.kind === 'fixture' || slot.host.kind === 'character') {
    if (slot.host.id !== hostId) throw new Error('Wrong ' + slot.host.kind + ' for attachment slot');
  } else {
    const host = instances.find(item => item.instanceId === hostId);
    if (!host || host.definitionId !== slot.host.definitionId) throw new Error('Missing or wrong item host');
  }
  return slot;
}
/** Structural and referential integrity: ownership never lives in a second host-side item list. */
export function validateAttachedItems(instances: readonly OwnedItem[], registry: AttachmentRegistry = ITEM_ATTACHMENT_REGISTRY): void {
  const byId = new Map(instances.map(item => [item.instanceId, item]));
  const occupied = new Set<string>();
  for (const item of instances) {
    if (item.location.kind !== 'mounted') continue;
    const {hostId, slotId} = item.location;
    if (!isStableId(hostId) || !isStableId(slotId)) throw new Error('Invalid mounted item reference');
    if (hostId === item.instanceId) throw new Error('Item cannot mount itself');
    const slot = resolveSlot(instances, hostId, slotId, registry);
    const definition = registry.definitions.get(item.definitionId);
    // Unknown future item definitions remain lossless, but cannot be newly mounted by current code.
    if (definition && !definition.mountKinds.includes(slot.kind)) throw new Error('Item cannot use this slot');
    const key = mountedSlotKey(hostId, slotId);
    if (occupied.has(key)) throw new Error('Attachment slot already occupied');
    occupied.add(key);
  }
  for (const item of instances) {
    const seen = new Set<string>();
    let current: OwnedItem | undefined = item;
    while (current?.location.kind === 'mounted') {
      if (seen.has(current.instanceId)) throw new Error('Cyclic mounted-item ownership');
      seen.add(current.instanceId);
      current = byId.get(current.location.hostId);
    }
  }
}
