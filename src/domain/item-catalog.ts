import { ITEMS } from '../content/items.ts';
import type { ItemDefinition } from '../content/items.ts';
import { QUALITIES } from '../content/qualities.ts';
import type { QualityDefinition } from '../content/qualities.ts';
import { ITEM_TAXONOMY } from '../content/item-types.ts';
import type { ItemTaxonomy } from '../content/item-types.ts';

export const isStableId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-z0-9][a-z0-9._:-]{0,159}$/.test(id);

export function createItemCatalog(items: readonly ItemDefinition[] = ITEMS, qualities: readonly QualityDefinition[] = QUALITIES, taxonomy: ItemTaxonomy = ITEM_TAXONOMY) {
  const unique = <T>(entries: readonly T[], key: (entry: T) => string) => {
    const map = new Map<string, T>();
    for (const entry of entries) { const id = key(entry); if (!isStableId(id) || map.has(id)) throw new Error('Duplicate or invalid taxonomy ID'); map.set(id, entry); }
    return map;
  };
  const categories = unique(taxonomy.categories, entry => entry.categoryId);
  const materials = unique(taxonomy.materials, entry => entry.materialId);
  const types = unique(taxonomy.types, entry => entry.typeId);
  const useGroups = unique(taxonomy.useGroups, entry => entry.useGroupId);
  if (categories.has('all') || categories.has('unknown')) throw new Error('Reserved category ID');
  for (const category of categories.values()) if (!category.name) throw new Error('Invalid category name');
  for (const material of materials.values()) if (!material.name || !material.categoryIds.length || material.categoryIds.some(id => !categories.has(id))) throw new Error('Invalid material/category reference');
  for (const group of useGroups.values()) if (!group.name || !group.resourceLines.length || group.resourceLines.some(line => !['small-wood', 'structure-wood', 'forest-produce'].includes(line))) throw new Error('Invalid use-group resource line');
  for (const type of types.values()) {
    if (!categories.has(type.categoryId) || !isStableId(type.formId) || new Set(type.useGroupIds).size !== type.useGroupIds.length ||
        type.useGroupIds.some(id => !useGroups.get(id)?.resourceLines.includes(type.resourceLine))) throw new Error('Invalid type or use-group reference');
  }
  const itemById = new Map<string, ItemDefinition>();
  const qualityById = new Map<string, QualityDefinition>();
  for (const quality of qualities) {
    if (!isStableId(quality.qualityId) || qualityById.has(quality.qualityId) || !quality.name ||
        (quality.rank !== null && (!Number.isSafeInteger(quality.rank) || quality.rank < 0))) throw new Error('Duplicate or invalid quality');
    qualityById.set(quality.qualityId, quality);
  }
  if (!qualityById.has('ungraded')) throw new Error('Missing legacy ungraded quality');
  for (const item of items) {
    const type = types.get(item.typeId);
    if (!type || type.categoryId !== item.category || type.resourceLine !== item.resourceLine || type.formId !== item.formId || !materials.get(item.materialId)?.categoryIds.includes(item.category)) throw new Error('Invalid item type/category/form/material');
    if (!isStableId(item.itemId) || itemById.has(item.itemId) || !isStableId(item.materialId) || !isStableId(item.formId) ||
        !qualityById.has(item.defaultQualityId) || !['active', 'planned', 'retired'].includes(item.status)) throw new Error('Duplicate or invalid item');
    itemById.set(item.itemId, item);
  }
  return { items: itemById as ReadonlyMap<string, ItemDefinition>, qualities: qualityById as ReadonlyMap<string, QualityDefinition>, categories, materials, types, useGroups };
}
export type ItemCatalog = ReturnType<typeof createItemCatalog>;
export const ITEM_CATALOG = createItemCatalog();
