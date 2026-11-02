/** Presentation-only knobs. These never change rarity identity, loot weights or item value. */
export const ITEM_VFX = {
  epic: { tint: '#b34dff', veil: .12, sheen: .90, core: 1.35, rim: .27, glints: 9, minPixels: 12, maxPixels: 52, diameter: .46 },
  legendary: { tint: '#ffb52e', veil: .14, sheen: 1.10, core: 1.75, rim: .34, glints: 12, minPixels: 15, maxPixels: 62, diameter: .55 },
} as const;
export type EffectRarity = keyof typeof ITEM_VFX;
export const ITEM_VFX_SPEED = .19;
