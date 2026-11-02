import { isRarityId, rarityDefinition } from '../content/rarities.ts';
import type { RarityId } from '../content/rarities.ts';
import { isStableId } from './item-catalog.ts';
import { isItemRecord } from './item-data.ts';

export type ItemTrait = { id: string; value: number; [key: string]: unknown };
type Field<T> = { accepts: (value: unknown) => value is T; fallback: T };
const field = <T>(accepts: Field<T>['accepts'], fallback: T): Field<T> => ({ accepts, fallback });
const validTraits = (value: unknown): value is readonly ItemTrait[] => Array.isArray(value) &&
  value.every(t => isItemRecord(t) && isStableId(t.id) && typeof t.value === 'number' && Number.isFinite(t.value)) &&
  new Set(value.map(t => t.id)).size === value.length;

/** Stable missing-field defaults, NOT the defaults used to generate a new item. */
export const ITEM_FIELDS = {
  rarityId: field<RarityId>(isRarityId, 'common'),
  traits: field<readonly ItemTrait[]>(validTraits, Object.freeze([])),
};
type Resolved<S> = { [K in keyof S]: S[K] extends Field<infer T> ? T : never };
export function resolveFields<S extends Record<string, Field<unknown>>>(raw: unknown, schema: S): Resolved<S> {
  const source = isItemRecord(raw) ? raw : {};
  return Object.fromEntries(Object.entries(schema).map(([key, f]) => {
    const value = Object.hasOwn(source, key) ? source[key] : undefined;
    return [key, f.accepts(value) ? value : f.fallback];
  })) as Resolved<S>;
}
export const itemProperties = (raw: unknown) => resolveFields(raw, ITEM_FIELDS);
export const itemRarity = (raw: unknown) => rarityDefinition(itemProperties(raw).rarityId);
/** Diagnostics are collected at IO boundaries, never logged each render frame. */
export function itemPropertyDiagnostics(raw: unknown): string[] {
  if (!isItemRecord(raw)) return [];
  return Object.entries(ITEM_FIELDS).flatMap(([key, f]) =>
    Object.hasOwn(raw, key) && !f.accepts(raw[key]) ? [`${key}: unsupported value retained; using default`] : []);
}
