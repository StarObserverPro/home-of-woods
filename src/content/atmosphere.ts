/** Bounded mountain-valley atmosphere. Distances are deliberately compressed for the scenic world. */
export const ATMOSPHERE = {
  metersPerWorldUnit: 8,
  baseY: 0,
  rayleighScaleHeightM: 8000,
  aerosolScaleHeightM: 1200,
  rayleighPerMeter: [5.802e-6, 13.558e-6, 33.1e-6] as const,
  aerosolExtinctionPerMeter: 3.0e-5,
  aerosolAlbedo: .9,
  lutWidth: 128,
  maxOpticalDistanceM: 40000,
  nearClearStart: 12,
  nearClearEnd: 48,
  weatherQuantization: 32,
  skyFill: .85,
  sunScatter: .12,
} as const;
