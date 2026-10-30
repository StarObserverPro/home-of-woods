import type { ItemDefinition } from '../content/items.ts';
import { PROCESSING } from '../content/processing.ts';
import type { ProcessingDefinition } from '../content/processing.ts';

export function createProcessingService(items: ReadonlyMap<string, ItemDefinition>, definitions = PROCESSING) {
  const byId = new Map<string, ProcessingDefinition>();
  for (const d of definitions) {
    if (!d.processingId || byId.has(d.processingId)) throw new Error(`Duplicate processing ID: ${d.processingId}`);
    if (!d.inputs.length || !d.outputs.length || !d.station || !['planned', 'configured'].includes(d.status)) throw new Error(`Invalid processing definition: ${d.processingId}`);
    for (const side of [d.inputs, d.outputs]) {
      const ids = new Set<string>();
      for (const m of side) {
        if (!items.has(m.itemId) || ids.has(m.itemId)) throw new Error(`Invalid processing item: ${m.itemId}`);
        if (m.quantity !== null && (!Number.isSafeInteger(m.quantity) || m.quantity <= 0)) throw new Error('Invalid processing quantity');
        ids.add(m.itemId);
      }
    }
    if (d.durationSeconds !== null && (!Number.isFinite(d.durationSeconds) || d.durationSeconds < 0)) throw new Error('Invalid processing duration');
    if (d.status === 'configured' && (d.durationSeconds === null || [...d.inputs, ...d.outputs].some(m => m.quantity === null))) throw new Error('Configured processing requires quantities and duration');
    if (d.outputs.some(m => items.get(m.itemId)!.resourceLine === 'structure-wood') && !d.inputs.some(m => items.get(m.itemId)!.resourceLine === 'structure-wood')) throw new Error('Small materials cannot create structure wood');
    byId.set(d.processingId, d);
  }
  return { definitions: byId, forItem: (itemId: string) => [...byId.values()].filter(d => d.inputs.some(m => m.itemId === itemId)) };
}
