/** Phase-one values are candidates, not an approval to increase scene budgets. */
export const WILDLIFE = {
  version: 1, targetMammals: 2, maxMammals: 3, perSpecies: 1,
  windowSeconds: 120, visitSeconds: 94, fadeSeconds: 1.2,
  roamRadius: 5, noticeDistance: 3.5, fleeDistance: 1.8,
  dayStart: 6, dayEnd: 19,
} as const;
export const WILDLIFE_DEFINITIONS = [
  { id: 'wildlife.squirrel', name: '松鼠', model: 'squirrel', assetId: 'how-wildlife-squirrel',
    habitat: 'forest-edge', walkSpeed: 1.05, fleeSpeed: 2.8, capabilities: [] },
  { id: 'wildlife.hare', name: '野兔', model: 'hare', assetId: 'how-wildlife-hare',
    habitat: 'meadow-edge', walkSpeed: .9, fleeSpeed: 3.2, capabilities: [] },
] as const;
export type WildlifeDefinition = typeof WILDLIFE_DEFINITIONS[number];
export type WildlifeDefinitionId = WildlifeDefinition['id'];
