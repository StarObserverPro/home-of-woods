import { ITEM_CATALOG, isStableId } from './item-catalog.ts';
import type { ItemCatalog } from './item-catalog.ts';

export type StackIdentity = { itemId: string; qualityId: string };
export type InventoryStack = StackIdentity & { quantity: number };
export type InventoryState = { schemaVersion: 1; revision: number; stacks: InventoryStack[] };
export type InventoryDelta = StackIdentity & { delta: number };
export const stackKey = (stack: StackIdentity) => JSON.stringify([stack.itemId, stack.qualityId]);
export const createInventory = (): InventoryState => ({ schemaVersion: 1, revision: 0, stacks: [] });
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) throw new Error('Unknown or missing inventory fields');
}
/** Structural validation never consults the live catalog or discards unknown IDs. */
export function canonicalStacks(value: unknown): InventoryStack[] {
  if (!Array.isArray(value)) throw new Error('Invalid inventory stacks');
  const seen = new Set<string>();
  let total = 0;
  const stacks: InventoryStack[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) throw new Error('Invalid inventory stack');
    exactKeys(raw, ['itemId', 'qualityId', 'quantity']);
    if (!isStableId(raw.itemId) || !isStableId(raw.qualityId) || !Number.isSafeInteger(raw.quantity) || (raw.quantity as number) < 0) throw new Error('Invalid inventory identity or quantity');
    const stack = { itemId: raw.itemId, qualityId: raw.qualityId, quantity: raw.quantity as number };
    const key = stackKey(stack);
    if (seen.has(key)) throw new Error('Duplicate inventory stack identity');
    seen.add(key);
    total += stack.quantity;
    if (!Number.isSafeInteger(total)) throw new Error('Inventory total overflow');
    if (stack.quantity > 0) stacks.push(stack);
  }
  return stacks.sort((a, b) => stackKey(a) < stackKey(b) ? -1 : stackKey(a) > stackKey(b) ? 1 : 0);
}
export function validateInventory(state: InventoryState) {
  if (!isRecord(state)) throw new Error('Invalid inventory state');
  exactKeys(state, ['schemaVersion', 'revision', 'stacks']);
  if (state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error('Unsupported inventory state');
  return canonicalStacks(state.stacks);
}
export function inventoryCount(state: InventoryState, itemId: string, qualityId?: string) {
  return state.stacks.reduce((sum, stack) => sum + (stack.itemId === itemId && (qualityId === undefined || stack.qualityId === qualityId) ? stack.quantity : 0), 0);
}
export const recognizedStack = (stack: StackIdentity, catalog: ItemCatalog = ITEM_CATALOG) =>
  catalog.items.has(stack.itemId) && catalog.qualities.has(stack.qualityId);

/** Build the complete result first. A failed line cannot debit any other line. */
export function inventoryTransaction(state: InventoryState, deltas: readonly InventoryDelta[], catalog: ItemCatalog = ITEM_CATALOG, expectedRevision = state.revision): InventoryState {
  const stacks = validateInventory(state);
  if (state.revision !== expectedRevision || !Number.isSafeInteger(state.revision + 1)) throw new Error('Stale or exhausted inventory revision');
  const changes = new Map<string, InventoryDelta>();
  const debits = new Map<string, number>();
  for (const line of deltas) {
    if (!isStableId(line.itemId) || !isStableId(line.qualityId) || !Number.isSafeInteger(line.delta) || !recognizedStack(line, catalog)) throw new Error('Unrecognized inventory transaction');
    if (line.delta > 0 && catalog.items.get(line.itemId)!.status !== 'active') throw new Error('Inactive item cannot be awarded');
    const key = stackKey(line), delta = (changes.get(key)?.delta ?? 0) + line.delta;
    if (!Number.isSafeInteger(delta)) throw new Error('Inventory delta overflow');
    changes.set(key, { ...line, delta });
    if (line.delta < 0) {
      const debit = (debits.get(key) ?? 0) - line.delta;
      if (!Number.isSafeInteger(debit)) throw new Error('Inventory debit overflow');
      debits.set(key, debit);
    }
  }
  const next = new Map(stacks.map(stack => [stackKey(stack), stack]));
  for (const [key, debit] of debits) if ((next.get(key)?.quantity ?? 0) < debit) throw new Error('Insufficient inventory inputs');
  for (const [key, line] of changes) {
    const quantity = (next.get(key)?.quantity ?? 0) + line.delta;
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('Insufficient or invalid inventory quantity');
    next.set(key, { itemId: line.itemId, qualityId: line.qualityId, quantity });
  }
  return { schemaVersion: 1, revision: state.revision + 1, stacks: canonicalStacks([...next.values()]) };
}
export function inventoryCandidate(state: InventoryState, itemId: string, delta: number, qualityId: string, catalog: ItemCatalog = ITEM_CATALOG) {
  return inventoryTransaction(state, [{ itemId, qualityId, delta }], catalog);
}
