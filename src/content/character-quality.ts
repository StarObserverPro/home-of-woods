/**
 * HOW-CHARACTER-1: authored limits for one fully dressed LOD0 character.
 * Targets guide retopology; they are never minimum polygon quotas. A mesh below
 * target only needs work when its silhouette, face or deformation needs it.
 * Keep this contract, the intake audit and CHARACTER_STANDARD.md in one change.
 */
export const CHARACTER_QUALITY_VERSION = 'HOW-CHARACTER-1' as const;

export const CHARACTER_QUALITY_TIERS = {
  hero: {
    triangles: {target: 12_000, maximum: 16_000, bodyTarget: 9_000, accessoryTarget: 3_000},
    materials: 4, drawCalls: 4, bones: 64, morphTargets: 8,
    textureDimension: 2048, texturePixels: 6 * 1024 * 1024,
  },
  trader: {
    triangles: {target: 9_000, maximum: 12_000, bodyTarget: 6_500, accessoryTarget: 2_500},
    materials: 4, drawCalls: 4, bones: 64, morphTargets: 8,
    textureDimension: 1024, texturePixels: 3 * 1024 * 1024,
  },
  neighbor: {
    triangles: {target: 7_500, maximum: 10_000, bodyTarget: 6_000, accessoryTarget: 1_500},
    materials: 3, drawCalls: 3, bones: 64, morphTargets: 8,
    textureDimension: 1024, texturePixels: 3 * 1024 * 1024,
  },
  visitor: {
    triangles: {target: 6_000, maximum: 8_000, bodyTarget: 5_000, accessoryTarget: 1_000},
    materials: 3, drawCalls: 3, bones: 64, morphTargets: 8,
    textureDimension: 1024, texturePixels: 3 * 1024 * 1024,
  },
} as const;

export type CharacterQualityTier = keyof typeof CHARACTER_QUALITY_TIERS;

export const CHARACTER_SURFACE_STANDARD = {
  bodyAtlas: 1024,
  heroCloseupAtlas: 2048,
  eyeAtlasMaximum: 256,
  normalAtlasMaximum: 1024,
  packedMaskAtlasMaximum: 512,
  bodyTexelsPerMeter: 512,
  faceTexelsPerMeter: 768,
  texelDensityTolerance: .2,
  baseColorSpace: 'srgb',
  dataTextureColorSpace: 'linear',
  mipmaps: true,
  roughness: {cloth: .88, leather: .72, metal: .48},
  palette: {
    canvas: '#d8c9ab', moss: '#69745a', brown: '#735443',
    indigo: '#586979', rust: '#a9654d', brass: '#a28b5a',
  },
  colorArea: {base: .7, secondary: .25, accent: .05},
  variantCount: 3,
} as const;

export const CHARACTER_IMPORT_RULES = {
  format: 'glb',
  upAxis: '+Y',
  forwardAxis: '+Z',
  maximumSkinInfluences: 4,
  preserveExistingNp120Bones: 50,
  proportionsReference: 'local-np120-j01',
  preserveTopology: ['face', 'hands', 'joint-loops', 'silhouette'],
  textureDetails: ['pocket-seams', 'stitching', 'patches', 'flat-straps', 'small-buckles'],
  geometryDetails: ['large-pouches', 'satchel', 'hat-brim', 'coat-hem', 'silhouette-changing-tools'],
  automaticSubdivision: false,
  runtimeDecimation: false,
  sourceFilesInPublicRepositoryByDefault: false,
} as const;
