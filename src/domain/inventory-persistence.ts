import {carryMethod} from './transport-location.ts';
import { canonicalInstances } from './owned-items.ts';
import { validateAttachedItems } from './item-attachment-contract.ts';
import { canonicalJson } from './save-digest.ts';
import { canonicalStacks, createInventory, isRecord, validateInventory, INVENTORY_SCHEMA_VERSION } from './inventory.ts';
import type { InventoryState } from './inventory.ts';
import { assertItemJson, withoutFields } from './item-data.ts';
import { itemPropertyDiagnostics } from './item-properties.ts';

export type InventoryLoadResult =
  | { decision: 'no-save' | 'restored' | 'migrated'; value: InventoryState; diagnostics: string[] }
  | { decision: 'protected'; raw: unknown; diagnostics: string[] };

/** One current core format. New optional attributes do not change this version. */
export function prepareInventoryData(raw: unknown): InventoryLoadResult {
  try {
    if (!isRecord(raw) || ![4, 5, INVENTORY_SCHEMA_VERSION].includes(raw.schemaVersion as number)) throw new Error('Unsupported inventory core format');
    assertItemJson(raw);
    if(raw.schemaVersion===4&&(Object.hasOwn(raw,'carryMode')||Array.isArray(raw.stacks)&&raw.stacks.some(s=>isRecord(s)&&Object.hasOwn(s,'transport'))))throw new Error('Ambiguous legacy carrying fields');
    carryMethod(raw.carryMode);
    const stacks = canonicalStacks(raw.stacks);
    const instances = Object.hasOwn(raw, 'instances') ? canonicalInstances(raw.instances) : undefined;
    if (raw.schemaVersion !== INVENTORY_SCHEMA_VERSION && instances?.some(item => item.location.kind === 'mounted'))
      throw new Error('Mounted ownership is not valid under a legacy inventory version');
    if (instances) validateAttachedItems(instances);
    const diagnostics = [...stacks, ...(instances ?? [])].flatMap((item, i) =>
      itemPropertyDiagnostics(item).map(message => `inventory[${i}].${message}`));
    const normalized = raw.schemaVersion !== INVENTORY_SCHEMA_VERSION || canonicalJson(stacks) !== canonicalJson(raw.stacks);
    return { decision: normalized ? 'migrated' : 'restored',
      value: { ...structuredClone(raw), schemaVersion: INVENTORY_SCHEMA_VERSION, revision: 0, stacks, ...(instances ? { instances } : {}) },
      diagnostics };
  } catch (error) {
    return { decision: 'protected', raw, diagnostics: [error instanceof Error ? error.message : 'Invalid inventory'] };
  }
}
export function prepareInventoryPersistence(raw: string | null): InventoryLoadResult {
  if (raw === null) return { decision: 'no-save', value: createInventory(), diagnostics: [] };
  try {
    const result = prepareInventoryData(JSON.parse(raw));
    return result.decision === 'protected' ? { ...result, raw } : result;
  } catch { return { decision: 'protected', raw, diagnostics: ['Invalid inventory JSON'] }; }
}
/** Shared by standalone tests and the single whole-world writer. No shadow save format. */
export function inventoryPersistenceData(state: InventoryState) {
  const stacks = validateInventory(state);
  return { ...withoutFields(structuredClone(state), ['revision']), schemaVersion: INVENTORY_SCHEMA_VERSION, stacks,
    ...(state.instances ? { instances: canonicalInstances(state.instances) } : {}) };
}
export const serializeInventory = (state: InventoryState) => canonicalJson(inventoryPersistenceData(state));
