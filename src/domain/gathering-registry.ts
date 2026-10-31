import { ITEMS } from '../content/items.ts';
import type { ItemDefinition } from '../content/items.ts';
import { GATHERABLES } from '../content/gatherables.ts';
import type { GatherableDefinition } from '../content/gatherables.ts';
import { makeGatheringSources } from '../world/gathering-layout.ts';
import type { GatheringSource } from '../world/gathering-layout.ts';
import { createProcessingService } from './processing.ts';
import { heightAt } from '../world/surface.ts';
import { TREE_RESOURCE_ANCHORS } from '../content/tree-resources.ts';
import { createItemCatalog } from './item-catalog.ts';
import type { QualityDefinition } from '../content/qualities.ts';
import type { ItemTaxonomy } from '../content/item-types.ts';

export function createGatheringRegistry(options: {
  items?: readonly ItemDefinition[]; qualities?: readonly QualityDefinition[]; taxonomy?: ItemTaxonomy; definitions?: readonly GatherableDefinition[];
  sources?: readonly GatheringSource[]; assetIds: readonly string[];
  isReachable?: (source: GatheringSource) => boolean;
}) {
  const unique = <T>(values: readonly T[], id: (value: T) => string) => {
    const map = new Map<string, T>();
    for (const value of values) {
      const key = id(value);
      if (!key || map.has(key)) throw new Error(`Duplicate or empty ID: ${key}`);
      map.set(key, value);
    }
    return map;
  };
  const catalog = createItemCatalog(options.items ?? ITEMS, options.qualities, options.taxonomy);
  const items = catalog.items;
  const definitions = unique(options.definitions ?? GATHERABLES, v => v.definitionId);
  const sources = unique(options.sources ?? makeGatheringSources(), v => v.sourceId);
  for (const d of definitions.values()) {
    if (items.get(d.itemId)?.status !== 'active' || !catalog.qualities.has(d.qualityId) || !options.assetIds.includes(d.assetId)) throw new Error(`Unresolved reference: ${d.definitionId}`);
    if (!['period-refill', 'after-depletion'].includes(d.regeneration.kind) || !d.regeneration.configKey) throw new Error(`Unknown regeneration: ${d.definitionId}`);
    if (!['gather.pickup', 'gather.pluck', 'gather.climb'].includes(d.motionTag)) throw new Error(`Unknown motion: ${d.definitionId}`);
    if (![d.capacity, d.yieldPerUnit].every(v => Number.isSafeInteger(v) && v > 0) || ![d.range, d.hitRadius].every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(d.durationSeconds) || d.durationSeconds < 0) throw new Error(`Invalid configuration: ${d.definitionId}`);
  }
  for (const s of sources.values()) {
    if (!definitions.has(s.definitionId) || !s.region || ![s.x, s.z, s.targetAnchor.x, s.targetAnchor.y, s.targetAnchor.z].every(Number.isFinite) || Math.hypot(s.x - s.targetAnchor.x, s.z - s.targetAnchor.z) > .01) throw new Error(`Invalid source: ${s.sourceId}`);
    if (options.isReachable && !options.isReachable(s)) throw new Error(`Unreachable source: ${s.sourceId}`);
    if (Math.abs(s.targetAnchor.y - heightAt(s.x, s.z)) > .01) throw new Error(`Invalid ground anchor: ${s.sourceId}`);
    if (s.hostRef && (!s.hostRef.id || !s.hostRef.slotId || !s.hostKind || !s.placement || !Object.values(TREE_RESOURCE_ANCHORS).some(a => a.kind === s.placement && (a.hosts as readonly string[]).includes(s.hostKind!)))) throw new Error(`Invalid host attachment: ${s.sourceId}`);
    if (s.patches?.some(p => ![p.x, p.y, p.z, p.scale, p.rotation].every(Number.isFinite) || p.scale <= 0 || Math.abs(p.y-heightAt(p.x,p.z))>.01)) throw new Error(`Invalid resource patch: ${s.sourceId}`);
  }
  return { items, catalog, definitions, sources, processing: createProcessingService(items) };
}
export type GatheringRegistry = ReturnType<typeof createGatheringRegistry>;
