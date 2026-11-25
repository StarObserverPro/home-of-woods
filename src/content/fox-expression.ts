/** Pinned Vuena fox atlas and rig; see sources/vuena/cute-pets/README.md. */
export const FOX_EXPRESSION = {
  eyes: [[.412841796875, .26025390625], [.586669921875, .26025390625]],
  eyeRadius: [.028076171875, .04052734375],
  // Sample coordinates move opposite to the visible feature. +U is model -X.
  eyeUvTravel: [.003, .0035],
  // Original ORM separates the painted eye (82/255) from fur (140/255).
  eyeOptics: {
    roughnessMask: [.36, .51],
    irisRoughness: .18,
    coatRoughness: .12,
    coatStrength: .9,
    domeSlope: .7,
    specularVariance: .35,
    blinkFade: [.15, .85],
  },
  lidsClosedDelta: [-5.820767423613881e-9, .051249854266643524, .011388839222490788],
  blinkWindow: 4.7,
  closeSeconds: .065,
  closedSeconds: .035,
  openSeconds: .12,
  noticeDistance: 5.5,
  maxHeadYaw: .36,
  maxHeadPitch: .16,
  eyeResponse: 12,
  headResponse: 4,
} as const;
