import { WORLD } from '../content/world.ts';
import { isStableId } from './item-catalog.ts';
import { assertItemJson, isItemRecord, withoutFields } from './item-data.ts';
import type { ExtensibleRecord } from './item-data.ts';
export type ItemLocation = ExtensibleRecord & (
  { kind: 'inventory' } | { kind: 'world'; x: number; z: number; rotation: number } |
  { kind: 'mounted'; hostId: string; slotId: string }
);
export type OwnedItem = ExtensibleRecord & {
  instanceId: string; definitionId: string; blueprintId: string; createdAt: number;
  location: ItemLocation;
};
/** Open, lossless records. Only identity and ownership invariants can reject a load. */
export function canonicalInstances(value: unknown): OwnedItem[] {
  if (!Array.isArray(value)) throw new Error('Invalid owned instances');
  assertItemJson(value);
  const seen = new Set<string>();
  for (const v of value) {
    if (!isItemRecord(v) || !isStableId(v.instanceId) || !isStableId(v.definitionId) ||
        !isStableId(v.blueprintId) || seen.has(v.instanceId) ||
        typeof v.createdAt !== 'number' || !Number.isFinite(v.createdAt) || v.createdAt < 0)
      throw new Error('Invalid instance identity');
    seen.add(v.instanceId);
    const p = v.location;
    if (!isItemRecord(p)) throw new Error('Invalid instance location');
    if (p.kind === 'world') {
      if (![p.x, p.z, p.rotation].every(n => typeof n === 'number' && Number.isFinite(n)) ||
          (p.x as number) < WORLD.minX || (p.x as number) > WORLD.maxX ||
          (p.z as number) < WORLD.minZ || (p.z as number) > WORLD.maxZ)
        throw new Error('Invalid placed instance');
    } else if (p.kind === 'mounted') {
      if (!isStableId(p.hostId) || !isStableId(p.slotId)) throw new Error('Invalid mounted item reference');
    } else if (p.kind !== 'inventory') throw new Error('Unknown instance location');
  }
  return structuredClone(value as OwnedItem[]).sort((a,b) => a.instanceId.localeCompare(b.instanceId));
}
/** Replace the ownership core without losing future attachment/location metadata. */
export function withItemLocation(item: OwnedItem, location: ItemLocation): OwnedItem {
  return { ...item, location: { ...withoutFields(item.location, ['kind','x','z','rotation','hostId','slotId']), ...location } as ItemLocation };
}
