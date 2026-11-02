import type { CSSProperties } from 'react';
import { itemRarity } from '../domain/item-properties.ts';
/** One palette serves cards, labels and world-item details. */
export const rarityStyle = (item: unknown): CSSProperties =>
  ({ '--rarity-color': itemRarity(item).color } as CSSProperties);
