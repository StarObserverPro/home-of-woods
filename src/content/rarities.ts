export const RARITIES = [
  { id: 'common', name: '普通', color: '#d3d8d4', emission: '#000000', intensity: 0 },
  { id: 'uncommon', name: '优秀', color: '#8dd69a', emission: '#000000', intensity: 0 },
  { id: 'rare', name: '稀有', color: '#88c4f5', emission: '#000000', intensity: 0 },
  { id: 'epic', name: '史诗', color: '#d1a5f3', emission: '#c8a0ed', intensity: .28 },
  { id: 'legendary', name: '传说', color: '#f4cf7c', emission: '#f2cb83', intensity: .34 },
] as const;
export type RarityId = typeof RARITIES[number]['id'];
export const isRarityId = (value: unknown): value is RarityId => RARITIES.some(r => r.id === value);
export const rarityDefinition = (id: RarityId) => RARITIES.find(r => r.id === id)!;

/** Initial visual-reward weights, tunable independently of costs and traits. */
export const CRAFT_RARITY_WEIGHTS: readonly { id: RarityId; weight: number }[] = [
  { id: 'common', weight: 60 }, { id: 'uncommon', weight: 25 },
  { id: 'rare', weight: 10 }, { id: 'epic', weight: 4 }, { id: 'legendary', weight: 1 },
];
