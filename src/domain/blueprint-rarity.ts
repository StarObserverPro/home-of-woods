import { BLUEPRINT_QUALITY_BANDS } from '../content/parametric-crafting.ts';
import { RARITIES } from '../content/rarities.ts';
import type { RarityId } from '../content/rarities.ts';
import { random } from '../world/layout.ts';

/** Template tier fixes the reachable grades; craftsmanship only tilts positive base weights. */
export function blueprintRarityProbabilities(tier: RarityId, score: number): Readonly<Record<RarityId, number>> {
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error('Invalid crafting quality score');
  const band = BLUEPRINT_QUALITY_BANDS[tier];
  if (!band) throw new Error('Unknown blueprint rarity tier');
  const center = RARITIES.findIndex(r => r.id === tier);
  const bias = (score - 50) / 50 * .85;
  const weighted = band.weights.map((weight, i) => weight <= 0 ? 0 : weight * Math.exp((i - center) * bias));
  const total = weighted.reduce((a,b) => a + b, 0);
  if (total <= 0) throw new Error('Empty blueprint rarity distribution');
  return Object.fromEntries(RARITIES.map((r,i) => [r.id, weighted[i] / total])) as Record<RarityId, number>;
}
const blueprintHash = (name: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619) >>> 0;
  return hash;
};
/** Identity-locked roll: no reroll on cancelled jobs, reload, elapsed time or inspection. */
export function rollBlueprintRarity(seed: number, serial: number, blueprintId: string, tier: RarityId, score: number): RarityId {
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(serial) || serial < 1 || !blueprintId) throw new Error('Invalid crafting identity');
  const distribution = blueprintRarityProbabilities(tier, score);
  const roll = random((seed ^ Math.imul(serial, 0x9e3779b1) ^ blueprintHash(blueprintId)) >>> 0)();
  let cumulative = 0;
  for (const rarity of RARITIES) {
    cumulative += distribution[rarity.id];
    if (roll < cumulative) return rarity.id;
  }
  return RARITIES[RARITIES.length - 1].id;
}
