/** Candidate interaction parameters; the complete M1 economy/calendar is not frozen. */
export const FORESTRY = {
  harvestItemId: 'wood',
  harvestQualityId: 'ordinary',
  basePoints: 24,
  interactRange: 3.6,
  reachBeyondTrunk: 1.15,
  preferredStandOffset: 1.1,
  chopSeconds: 3.6,
  hits: 4,
  fallSeconds: 1.7,
  regrowDelay: 150,
  saplingSeconds: 300,
} as const;
