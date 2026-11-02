/** Only accepted final models are shipped. Optional wildlife failures do not block the valley. */
export const RUNTIME_MODELS = [
  { name: 'cabin', assetId: 'how-m0-cabin', url: '/assets/m0/cabin.glb' },
  { name: 'tent', assetId: 'how-m0-tent', url: '/assets/m0/tent.glb' },
  { name: 'ranger', assetId: 'how-character-player', url: '/assets/characters/player.glb' },
  { name: 'visitor', assetId: 'how-character-visitor', url: '/assets/characters/visitor.glb' },
  { name: 'axe', assetId: 'how-character-axe', url: '/assets/characters/axe.glb' },
  { name: 'motions', assetId: 'how-character-motions', url: '/assets/characters/motions.glb' },
  { name: 'pine', assetId: 'how-m0-pine', url: '/assets/m0/pine.glb' },
  { name: 'broadleaf', assetId: 'how-m0-broadleaf', url: '/assets/m0/broadleaf.glb' },
  { name: 'branches', assetId: 'how-gathering-branches', url: '/assets/gathering/branches.glb' },
  { name: 'mushrooms', assetId: 'how-gathering-mushrooms', url: '/assets/gathering/mushrooms.glb' },
  { name: 'squirrel', assetId: 'how-wildlife-squirrel', url: '/assets/wildlife/squirrel.glb', optional: true },
  { name: 'hare', assetId: 'how-wildlife-hare', url: '/assets/wildlife/hare.glb', optional: true },
  { name: 'stag', assetId: 'how-wildlife-stag', url: '/assets/wildlife/stag.glb', optional: true },
  // Original rigged faceted Oreamnos americanus; distinct from rejected Gobkit Goat.
  { name: 'mountain-goat', assetId: 'how-wildlife-mountain-goat', url: '/assets/wildlife/mountain-goat.glb', optional: true },
] as const;
export function runtimeModelEnabled(name: string): boolean {
  const spec = RUNTIME_MODELS.find(model => model.name === name);
  return spec !== undefined;
}
export const ENABLED_RUNTIME_MODELS = RUNTIME_MODELS.filter(model => runtimeModelEnabled(model.name));
