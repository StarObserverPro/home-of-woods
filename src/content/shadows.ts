/** Shared perceptual rules. Scene adapters supply geometry/state, never private shadow tuning. */
export const SHADOW_PROFILES = {
  version: 'shared-shadow-rules-v1',
  outdoor: {
    mapSize: 2048,
    span: 128,
    lightDistance: 180,
    near: 1,
    far: 360,
    normalBiasTexels: .55,
    depthBiasTexels: -.35,
    solidSoftness: .095,
    // Stylised standing-tree coverage by root-relative world height, not receiver distance.
    treeHeightFade: {start:3,end:18,minimumCoverage:.3},
    canopy: {
      // Broad crown transmittance only. The single near map retains fine solid shadows.
      size: [192, 48, 192] as const,
      strength: .38,
      maximumShade: .65,
      coreRatio: .48,
      baseSoftness: .28,
      angularSpread: .035,
      maximumSoftness: 4,
      minimumSunY: .12,
      refreshSeconds: .35,
      angularThreshold: .007,
      fallbackRefreshSeconds: 8,
      fallbackAngularThreshold: .035,
      boundaryCells: 2,
    },
  },
  character: {
    maxFeet: 4,
    radiusX: .13,
    radiusZ: .22,
    maxStrength: .28,
    fullContactHeight: .015,
    liftedEnd: .25,
    spread: .45,
    receiverThickness: .10,
  },
} as const;
