export type WoodUse = { useId: string; mode: 'aggregate' | 'piece'; capability: string; measureId: 'piece'; allowUnknown: boolean };
export const WOOD_RULE_VERSION = 1;
// Units are explicit whole pieces, not implied mass or volume. No partial-piece burning.
export const WOOD_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  'scrap-fuel': ['fuel'], branch: ['fuel', 'auxiliary', 'primary', 'carving'],
  'small-wood': ['fuel', 'auxiliary', 'primary', 'carving'], wood: ['fuel', 'auxiliary', 'primary', 'carving'],
};
export const WOOD_USES: readonly WoodUse[] = [
  { useId: 'campfire.fuel', mode: 'aggregate', capability: 'fuel', measureId: 'piece', allowUnknown: true },
  { useId: 'craft.auxiliary-wood', mode: 'aggregate', capability: 'auxiliary', measureId: 'piece', allowUnknown: true },
  { useId: 'craft.primary-stock', mode: 'piece', capability: 'primary', measureId: 'piece', allowUnknown: false },
  { useId: 'carving.blank', mode: 'piece', capability: 'carving', measureId: 'piece', allowUnknown: false },
];
// Deliberately unconfigured: do not replace the user's 'very rare' with an invented percentage.
export const SCRAP_RARE_DROP: { probability: number | null; quantity: number | null } = { probability: null, quantity: null };

// Initial admitted harvest grades (game specifications; old stock remains unknown).
export const BRANCH_HARVEST_SPEC = {lengthMm:800, thicknessMm:40, straightness:'curved'} as const;
export const LOG_HARVEST_LENGTH_MM = 3000;
