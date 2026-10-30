import { canonicalStacks, createInventory, exactKeys, isRecord, validateInventory } from './inventory.ts';
import type { InventoryState } from './inventory.ts';
import { isStableId } from './item-catalog.ts';

export type InventoryLoadResult =
  | { decision: 'no-save' | 'restored' | 'migrated'; value: InventoryState; diagnostics: string[] }
  | { decision: 'protected'; raw: unknown; diagnostics: string[] };

/** Catalog changes are not format changes. Unknown item/quality IDs pass through intact. */
export function prepareInventoryData(raw: unknown): InventoryLoadResult {
  try {
    if (!isRecord(raw)) throw new Error('Invalid inventory object');
    if (Object.hasOwn(raw, 'schemaVersion')) {
      exactKeys(raw, ['schemaVersion', 'stacks']);
      if (raw.schemaVersion !== 1) throw new Error('Unsupported inventory schema');
      const stacks = canonicalStacks(raw.stacks);
      const migrated = JSON.stringify(stacks) !== JSON.stringify(raw.stacks);
      return { decision: migrated ? 'migrated' : 'restored', value: { schemaVersion: 1, revision: 0, stacks }, diagnostics: migrated ? ['Inventory safely canonicalized'] : [] };
    }
    // Actual pre-stack session shape; absent grades remain explicitly ungraded.
    exactKeys(raw, ['version', 'quantities']);
    if (!Number.isSafeInteger(raw.version) || (raw.version as number) < 0 || !isRecord(raw.quantities)) throw new Error('Invalid legacy inventory');
    const stacks = Object.entries(raw.quantities).map(([itemId, quantity]) => {
      if (!isStableId(itemId)) throw new Error('Invalid legacy item ID');
      return { itemId, qualityId: 'ungraded', quantity };
    });
    return { decision: 'migrated', value: { schemaVersion: 1, revision: 0, stacks: canonicalStacks(stacks) }, diagnostics: ['Legacy quantities retained as ungraded'] };
  } catch (error) {
    return { decision: 'protected', raw, diagnostics: [error instanceof Error ? error.message : 'Invalid inventory'] };
  }
}

export function prepareInventoryPersistence(raw: string | null): InventoryLoadResult {
  if (raw === null) return { decision: 'no-save', value: createInventory(), diagnostics: [] };
  try {
    const result = prepareInventoryData(JSON.parse(raw));
    return result.decision === 'protected' ? { ...result, raw } : result;
  } catch {
    return { decision: 'protected', raw, diagnostics: ['Invalid inventory JSON'] };
  }
}

/** This is a slice codec, not a second localStorage writer. */
export function serializeInventory(state: InventoryState): string {
  const stacks = validateInventory(state);
  return JSON.stringify({ schemaVersion: 1, stacks });
}
