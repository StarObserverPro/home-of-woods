import { canonicalStacks, inventoryCount, isRecord, validateInventory } from '../domain/inventory.ts';
import type { InventoryState } from '../domain/inventory.ts';
import { prepareInventoryData } from '../domain/inventory-persistence.ts';

export type SessionInventoryResult =
  | { decision: 'restored' | 'migrated'; diagnostics: string[] }
  | { decision: 'protected'; diagnostics: string[] };

/** Upgrade the supplied session atomically; never repair other world state here. */
export function upgradeSessionInventory(host: { inventory: unknown; forestry: object }): SessionInventoryResult {
  try {
    const original = host.inventory;
    let inventory: InventoryState;
    const diagnostics: string[] = [];
    if (isRecord(original) && Object.hasOwn(original, 'revision')) {
      inventory = { ...(original as InventoryState), stacks: validateInventory(original as InventoryState) };
    } else {
      const result = prepareInventoryData(original);
      if (result.decision === 'protected') return { decision: 'protected', diagnostics: result.diagnostics };
      inventory = result.value;
      diagnostics.push(...result.diagnostics);
    }
    const forestry = host.forestry as Record<string, unknown>;
    const hasWood = Object.hasOwn(forestry, 'wood');
    if (hasWood) {
      const wood = forestry.wood;
      if (!Number.isSafeInteger(wood) || (wood as number) < 0) throw new Error('Invalid legacy forestry wood');
      if (inventoryCount(inventory, 'wood') > 0 && ((wood as number) > 0 || !isRecord(original) || original.schemaVersion !== 1)) throw new Error('Conflicting legacy and inventory wood owners');
      if ((wood as number) > 0) inventory.stacks = canonicalStacks([...inventory.stacks, { itemId: 'wood', qualityId: 'ungraded', quantity: wood }]);
      diagnostics.push('Legacy forestry wood ownership transferred');
    }
    // All validation precedes both assignments. Keep revisions stable on ordinary re-entry.
    if (diagnostics.length) {
      if (!Number.isSafeInteger(inventory.revision + 1)) throw new Error('Inventory revision overflow');
      inventory.revision++;
    }
    host.inventory = inventory;
    if (hasWood) delete forestry.wood;
    return { decision: diagnostics.length ? 'migrated' : 'restored', diagnostics };
  } catch (error) {
    return { decision: 'protected', diagnostics: [error instanceof Error ? error.message : 'Inventory session protected'] };
  }
}
