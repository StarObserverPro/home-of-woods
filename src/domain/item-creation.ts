import { CRAFT_RARITY_WEIGHTS } from '../content/rarities.ts';
import type { RarityId } from '../content/rarities.ts';
import { random } from '../world/layout.ts';
/** Stable per awarded identity: cancel, time speed and reload cannot reroll the next craft. */
export function craftedRarity(seed: number, serial: number): RarityId {
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(serial) || serial < 1) throw new Error('Invalid rarity identity');
  const roll = random((seed ^ Math.imul(serial, 0x9e3779b1)) >>> 0)();
  const total = CRAFT_RARITY_WEIGHTS.reduce((n, entry) => n + entry.weight, 0);
  let threshold = 0;
  for (const entry of CRAFT_RARITY_WEIGHTS) {
    threshold += entry.weight / total;
    if (roll < threshold) return entry.id;
  }
  return 'legendary';
}
