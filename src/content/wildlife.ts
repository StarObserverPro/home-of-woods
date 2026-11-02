/** Wildlife is decorative; all numbers are conservative scene candidates. */
export const WILDLIFE = {
  version: 1, targetMammals: 2, maxMammals: 3, perSpecies: 1, maxLandmarks: 1,
  windowSeconds: 120, visitSeconds: 94, fadeSeconds: 1.2,
  roamRadius: 5, noticeDistance: 3.5, fleeDistance: 1.8,
  dayStart: 6, dayEnd: 19,
  landmarkWindowSeconds: 260, landmarkAdmitSeconds: 5, landmarkChancePercent: 28,
  landmarkMinPlayerDistance: 35, landmarkMaxCameraDistance: 260,
  landmarkVisitSeconds: 32, landmarkMaxHoldSeconds: 74,
  landmarkUnseenSeconds: 9, landmarkLostSeconds: 1.5,
} as const;
export const WILDLIFE_DEFINITIONS = [
  { id: 'wildlife.squirrel', name: '松鼠', model: 'squirrel', assetId: 'how-wildlife-squirrel',
    category: 'common', habitat: 'forest-edge', visualScale: 1, walkSpeed: 1.05, fleeSpeed: 2.8, capabilities: [] },
  { id: 'wildlife.hare', name: '野兔', model: 'hare', assetId: 'how-wildlife-hare',
    category: 'common', habitat: 'meadow-edge', visualScale: 1, walkSpeed: .9, fleeSpeed: 3.2, capabilities: [] },
  { id: 'wildlife.stag', name: '远坡雄鹿', model: 'stag', assetId: 'how-wildlife-stag',
    category: 'landmark', habitat: 'ridge-meadow', visualScale: .76, walkSpeed: 1.1, fleeSpeed: 1.1, capabilities: [] },
  { id: 'wildlife.goat', name: '崖上山羊', model: 'goat', assetId: 'how-wildlife-goat',
    category: 'landmark', habitat: 'cliff-ledge', visualScale: .56, walkSpeed: .57, fleeSpeed: .57, capabilities: [] },
] as const;
export type WildlifeDefinition = typeof WILDLIFE_DEFINITIONS[number];
export type WildlifeDefinitionId = WildlifeDefinition['id'];
