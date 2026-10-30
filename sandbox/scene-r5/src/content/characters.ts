/** Authored character/prop specifications. Scene consumes these without owning gameplay. */
export const CHARACTER = {
  worldScale: 1.5,
  embeddedScale: .78,
  maxWoodBite: .0375,
  horizontalWindup: .20,
  verticalWindup: .36,
  strokeEnd: .67,
  strikePhase: .58,
  releasePhase: .69,
} as const;
export const CAMP_VISITOR = { id: 'camp-visitor', x: -40, z: -1, radius: .56, waveRange: 12, waveInterval: 9 } as const;
