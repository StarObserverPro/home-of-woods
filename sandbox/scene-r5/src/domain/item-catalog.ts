import { ITEMS } from '../content/items.ts';
import type { ItemDefinition } from '../content/items.ts';
import { QUALITIES } from '../content/qualities.ts';
import type { QualityDefinition } from '../content/qualities.ts';

export const isStableId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(id);

export function createItemCatalog(items: readonly ItemDefinition[] = ITEMS, qualities: readonly QualityDefinition[] = QUALITIES) {
  const itemById = new Map<string, ItemDefinition>();
  const qualityById = new Map<string, QualityDefinition>();
  for (const quality of qualities) {
    if (!isStableId(quality.qualityId) || qualityById.has(quality.qualityId) || !quality.name ||
        (quality.rank !== null && (!Number.isSafeInteger(quality.rank) || quality.rank < 0))) throw new Error('Duplicate or invalid quality');
    qualityById.set(quality.qualityId, quality);
  }
  if (!qualityById.has('ungraded')) throw new Error('Missing legacy ungraded quality');
  for (const item of items) {
    if (!isStableId(item.itemId) || itemById.has(item.itemId) || !isStableId(item.materialId) || !isStableId(item.formId) ||
        !qualityById.has(item.defaultQualityId) || !['active', 'planned', 'retired'].includes(item.status)) throw new Error('Duplicate or invalid item');
    itemById.set(item.itemId, item);
  }
  return { items: itemById as ReadonlyMap<string, ItemDefinition>, qualities: qualityById as ReadonlyMap<string, QualityDefinition> };
}
export type ItemCatalog = ReturnType<typeof createItemCatalog>;
export const ITEM_CATALOG = createItemCatalog();
