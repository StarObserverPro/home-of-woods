/** Presentation-only knobs. These never change rarity identity, loot weights or item value. */
export const ITEM_VFX = {
  epic: { tint: '#b34dff', veil: .12, sheen: .90, core: 1.35, rim: .27, glints: 9, minPixels: 12, maxPixels: 52, diameter: .46 },
  legendary: { tint: '#ffb52e', veil: .14, sheen: 1.10, core: 1.75, rim: .34, glints: 12, minPixels: 15, maxPixels: 62, diameter: .55 },
} as const;
export type EffectRarity = keyof typeof ITEM_VFX;
export const ITEM_VFX_SPEED = .19;

export const RARITY_VFX_MODES = ['full', 'simple', 'off'] as const;
export type RarityVfxMode = typeof RARITY_VFX_MODES[number];
export const isRarityVfxMode = (value: unknown): value is RarityVfxMode =>
  RARITY_VFX_MODES.some(mode => mode === value);

/** Epic is the approved R2 baseline. Only legendary is quieter, especially at night. */
export const ITEM_VFX_LIGHT = {
  epic: { day: 1, night: .86 },
  legendary: { day: .82, night: .62 },
} as const;
export const ITEM_EMBLEM = { sizeRatio: .52, maxSize: .65, depthRatio: .12 } as const;
