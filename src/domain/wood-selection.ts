import {canonicalJson} from './save-digest.ts';
import { WOOD_CAPABILITIES, WOOD_USES, WOOD_RULE_VERSION } from '../content/wood-uses.ts';
import { inventoryTransaction, stackKey, validateInventory } from './inventory.ts';
import type { InventoryState, InventoryDelta, InventoryStack, WoodSpec } from './inventory.ts';
import { ITEM_CATALOG } from './item-catalog.ts';
export type WoodRequirement = {
  useId: string; mode: 'aggregate'; measureId: 'piece'; amount: number; allowValuable?: boolean;
} | {
  useId: string; mode: 'piece'; count: number; minLengthMm: number; minThicknessMm: number;
  allowedStraightness: WoodSpec['straightness'][];
};
export type WoodSelection = { revision: number; fingerprint:string; ruleVersion: number; requirements: WoodRequirement[]; allocations: { key: string; count: number }[] };
const uses = new Map(WOOD_USES.map(u => [u.useId, u]));
export function woodCandidates(state: InventoryState, requirement: WoodRequirement): InventoryStack[] {
  const use = uses.get(requirement.useId);
  if (!use || use.mode !== requirement.mode) throw new Error('Unknown or mismatched wood use');
  const count = requirement.mode === 'aggregate' ? requirement.amount : requirement.count;
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Invalid requested wood quantity');
  if (requirement.mode === 'aggregate' && requirement.measureId !== use.measureId) throw new Error('Incompatible wood units');
  if (requirement.mode === 'piece' && (![requirement.minLengthMm, requirement.minThicknessMm].every(v => Number.isSafeInteger(v) && v > 0) || !requirement.allowedStraightness.length || requirement.allowedStraightness.some(v => !['straight','curved','crooked'].includes(v)))) throw new Error('Invalid wood dimensions');
  return validateInventory(state).filter(stack => {
    if (stack.wood?.reserved || !ITEM_CATALOG.qualities.has(stack.qualityId) || !(WOOD_CAPABILITIES[stack.itemId] ?? []).includes(use.capability)) return false;
    const spec = stack.wood?.spec;
    if (requirement.mode === 'aggregate') return (requirement.allowValuable===true || !(stack.itemId==='wood' || stack.qualityId==='fine' || spec?.straightness==='straight')) && (use.allowUnknown || !!spec);
    return !!spec && spec.lengthMm >= requirement.minLengthMm && spec.thicknessMm >= requirement.minThicknessMm && requirement.allowedStraightness.includes(spec.straightness);
  }).sort((a,b) => (WOOD_CAPABILITIES[a.itemId].length - WOOD_CAPABILITIES[b.itemId].length) || ((a.wood?.spec?.lengthMm ?? 0) - (b.wood?.spec?.lengthMm ?? 0)) || stackKey(a).localeCompare(stackKey(b)));
}
/** One shared reservation table; piece requirements precede flexible aggregate inputs. */
export function selectWood(state: InventoryState, requirements: readonly WoodRequirement[]): WoodSelection {
  if (!requirements.length) throw new Error('Empty wood transaction');
  const reserved = new Map<string, number>();
  for (const req of [...requirements].sort((a,b) => Number(b.mode === 'piece') - Number(a.mode === 'piece'))) {
    let need = req.mode === 'piece' ? req.count : req.amount;
    for (const stack of woodCandidates(state, req)) {
      const key = stackKey(stack), available = stack.quantity - (reserved.get(key) ?? 0), take = Math.min(available, need);
      if (take > 0) { reserved.set(key, (reserved.get(key) ?? 0) + take); need -= take; }
      if (!need) break;
    }
    if (need) throw new Error('Insufficient qualifying wood');
  }
  return { revision: state.revision, fingerprint:canonicalJson(validateInventory(state)), ruleVersion: WOOD_RULE_VERSION, requirements: structuredClone([...requirements]), allocations: [...reserved].map(([key,count]) => ({key,count})) };
}
/** Recompute eligibility and reservation before atomically consuming and awarding outputs. */
export function commitWood(state: InventoryState, candidate: WoodSelection, outputs: readonly InventoryDelta[] = []): InventoryState {
  if (candidate.fingerprint!==canonicalJson(validateInventory(state)) || candidate.revision !== state.revision || candidate.ruleVersion !== WOOD_RULE_VERSION) throw new Error('Stale wood selection');
  const fresh = selectWood(state, candidate.requirements);
  if (JSON.stringify(fresh.allocations) !== JSON.stringify(candidate.allocations)) throw new Error('Changed wood selection');
  const byKey = new Map(state.stacks.map(s => [stackKey(s), s]));
  return inventoryTransaction(state, [...fresh.allocations.map(a => ({ ...byKey.get(a.key)!, delta: -a.count })), ...outputs], ITEM_CATALOG, candidate.revision);
}
