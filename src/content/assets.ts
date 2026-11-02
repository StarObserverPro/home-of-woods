/** Catalogue identities also include withdrawn assets; only ENABLED_RUNTIME_MODELS are loaded. */
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
  // Rejected silhouette: preserve provenance and identity, but never fetch or instantiate this model.
  // A replacement needs visual review; rebuilding the old GLB does not lift this gate.
  { name: 'goat', assetId: 'how-wildlife-goat', url: '/assets/wildlife/goat.glb', optional: true, enabled: false },
] as const;
export function runtimeModelEnabled(name: string): boolean {
  const spec = RUNTIME_MODELS.find(model => model.name === name);
  return spec !== undefined && (!('enabled' in spec) || spec.enabled);
}
export const ENABLED_RUNTIME_MODELS = RUNTIME_MODELS.filter(model => runtimeModelEnabled(model.name));
