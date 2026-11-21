/** Lighting-only tuning. No gameplay geometry or save state lives here. */
export const OCCLUSION = {
  version: 'local-occlusion-v1',
  maxVolumes: 40,
  nearFull: 18,
  nearEnd: 64,
  // Opt-in scene adapters fade a representative contact footprint by CSS pixels.
  // Legacy sandboxes keep the distance path until their own lighting is revisited.
  detailFootprint: .35,
  detailMinPixels: 1,
  detailFullPixels: 4.5,
  minimumAmbient: .40,
  distantUnderside: .07,
  forestStrength: .38,
  coreSize: 192,
  outerSize: 128,
  heightMin: -64,
  heightRange: 384,
  canopyHeightRange: 48,
  forestRefreshSeconds: 1,
} as const;
