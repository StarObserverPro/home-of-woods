/**
 * Rainier southwest foothill art preset. All functions are pure and own no
 * persistent tree identities, resource counts, terrain samples or RNG stream.
 * Research values and authored scene scales deliberately live in separate data.
 * Sources, measurement thresholds and adaptations: docs/RAINIER_ECOLOGY.md.
 */
export type RainierTreeKind = 'pine' | 'spruce' | 'fir' | 'oak' | 'poplar';
export type RainierForestWeights = Record<RainierTreeKind, number>;

export const RAINIER_CAMP = {
  id: 'rainier-southwest-foothills',
  name: 'Rainier 山麓营地',
  region: 'Mount Rainier 西南麓 · Nisqually 河谷森林',
  referenceElevationMeters: [550, 750],
  setting: '西部铁杉—花旗松—西部红柏低海拔森林中的林窗',
  // A visual-density target for a future life-size stand, not a census result
  // or an instruction to populate every hectare of the compressed panorama.
  authoredStandDensityPerHectare: { min: 150, target: 180, max: 220 },
  scenicPolicy: 'Keep the existing outer-forest instance and triangle caps.',
  seed: 105071,
} as const;

/** Shaw et al. 2004, Table 3: 4 ha Wind River plot, conifers DBH > 5 cm.
 * This plot is in the southern Washington Cascades, not at Rainier.
 * Means below are reference observations, never sampling distributions.
 */
export const WIND_RIVER_REFERENCE = {
  citation: 'Shaw et al. (2004), Ecosystems 7: 427–439, Table 3',
  url: 'https://research.fs.usda.gov/treesearch/24798',
  plotAreaHectares: 4,
  minimumDbhCmExclusive: 5,
  totalConifersPerHectare: 427.3,
  species: {
    westernHemlock: { stemsPerHectare: 224.0, meanHeightMeters: 19.0, meanDbhCm: 29.9 },
    douglasFir: { stemsPerHectare: 35.0, meanHeightMeters: 52.0, meanDbhCm: 111.0 },
    westernRedcedar: { stemsPerHectare: 30.0, meanHeightMeters: 29.0, meanDbhCm: 68.6 },
    pacificYew: { stemsPerHectare: 85.8, meanHeightMeters: 6.2, meanDbhCm: 13.8 },
    pacificSilverFir: { stemsPerHectare: 47.0, meanHeightMeters: 8.5, meanDbhCm: 12.2 },
  },
} as const;

type TreeArchetype = {
  name: string;
  scientificName: string;
  leaf: string;
  trunk: string;
  conifer: boolean;
  silhouette: string;
  // Multipliers on existing distantTreeGeometry, not heights measured in meters.
  heightScale: readonly [number, number];
  widthScale: readonly [number, number];
};

/** Existing scenery keys are mesh buckets, not botanical or inventory IDs. */
export const RAINIER_TREE_ARCHETYPES: Readonly<Record<RainierTreeKind, TreeArchetype>> = {
  pine: {
    name: '花旗松', scientificName: 'Pseudotsuga menziesii',
    leaf: '#54794e', trunk: '#795b42', conifer: true,
    silhouette: '高直树干，上部不规则开展冠，少量露出林冠的大树',
    heightScale: [1.80, 2.80], widthScale: [1.05, 1.75],
  },
  spruce: {
    name: '西部铁杉', scientificName: 'Tsuga heterophylla',
    leaf: '#426e55', trunk: '#705c47', conifer: true,
    silhouette: '较窄的分层树冠，略下垂的顶梢，主体中层林冠',
    heightScale: [1.05, 2.05], widthScale: [0.90, 1.55],
  },
  fir: {
    name: '西部红柏', scientificName: 'Thuja plicata',
    leaf: '#5b7955', trunk: '#80604a', conifer: true,
    silhouette: '下部较展开的垂挂冠，湿润沟谷与缓坡中的宽基树干',
    heightScale: [1.15, 2.10], widthScale: [1.10, 1.90],
  },
  oak: {
    name: '藤枫', scientificName: 'Acer circinatum',
    leaf: '#839653', trunk: '#7b7052', conifer: false,
    silhouette: '低矮的多干阔叶簇，林窗和河谷边缘的亮色块',
    heightScale: [0.62, 1.04], widthScale: [0.74, 1.20],
  },
  poplar: {
    name: '红桤木', scientificName: 'Alnus rubra',
    leaf: '#78925c', trunk: '#8a8774', conifer: false,
    silhouette: '溪岸的中小型阔叶冠，浅灰树干',
    heightScale: [0.85, 1.35], widthScale: [0.88, 1.42],
  },
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const mix = (a: number, b: number, n: number) => a + (b - a) * n;
function smooth(a: number, b: number, n: number) {
  const t = clamp01((n - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Local scene height is an artistic relief coordinate, never an ASL elevation. */
export function rainierForestWeights(height: number, bankDistance: number): RainierForestWeights {
  const upper = smooth(65, 175, height);
  const wet = 1 - smooth(24, 105, Math.abs(bankDistance));
  return {
    pine: 0.16 + 0.13 * upper + 0.05 * (1 - wet),
    spruce: 0.60 + 0.10 * upper,
    fir: 0.12 + 0.19 * wet,
    oak: (0.045 + 0.025 * wet) * (1 - 0.65 * upper),
    poplar: (0.012 + 0.14 * wet) * (1 - 0.80 * upper),
  };
}

/** Stable spatial hashing makes chunk generation order irrelevant. */
function spatialUnit(x: number, z: number, seed: number) {
  let h = Math.imul(x | 0, 0x1f123bb5) ^ Math.imul(z | 0, 0x5f356495) ^ seed;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function patchNoise(x: number, z: number, scale: number, seed: number) {
  const px = x / scale, pz = z / scale, ix = Math.floor(px), iz = Math.floor(pz);
  const tx = smooth(0, 1, px - ix), tz = smooth(0, 1, pz - iz);
  return mix(
    mix(spatialUnit(ix, iz, seed), spatialUnit(ix + 1, iz, seed), tx),
    mix(spatialUnit(ix, iz + 1, seed), spatialUnit(ix + 1, iz + 1, seed), tx), tz,
  );
}

export type RainierSite = {
  x: number;
  z: number;
  height: number;
  bankDistance: number;
  slope: number;
};

/**
 * Authored candidate acceptance probability, not stems per hectare. The caller
 * still owns placement count, river/route exclusions and triangle budgets.
 * Broad patches and smaller cohorts leave reproducible gaps without grid rows.
 */
export function rainierDensityAt(site: RainierSite): number {
  const { x, z, height, bankDistance, slope } = site;
  if (![x, z, height, bankDistance, slope].every(Number.isFinite)) return 0;
  if (Math.abs(bankDistance) < 18 || slope > 1.15) return 0;
  const stand = smooth(0.18, 0.76, patchNoise(x, z, 82, RAINIER_CAMP.seed));
  const cohort = patchNoise(x, z, 24, RAINIER_CAMP.seed + 97);
  const steep = smooth(0.55, 1.15, slope);
  const upper = smooth(90, 185, height);
  return clamp01((0.25 + 0.64 * stand) * (0.72 + 0.28 * cohort) * (1 - 0.55 * steep) * (1 - 0.25 * upper));
}

/** Deterministic weighted choice. sample must be a normalized [0, 1] value. */
export function chooseRainierTreeKind(height: number, bankDistance: number, sample: number): RainierTreeKind {
  const weights = rainierForestWeights(height, bankDistance);
  const entries = Object.entries(weights) as [RainierTreeKind, number][];
  let remaining = clamp01(sample) * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [kind, weight] of entries) {
    remaining -= weight;
    if (remaining <= 0) return kind;
  }
  return entries[entries.length - 1][0];
}

/** Mesh multipliers. Bounds are authored to preserve the game's compressed scale. */
export function rainierTreeScale(kind: RainierTreeKind, x: number, z: number, height = 0) {
  const archetype = RAINIER_TREE_ARCHETYPES[kind];
  const ix = Math.round(x * 16), iz = Math.round(z * 16);
  const stature = spatialUnit(ix, iz, RAINIER_CAMP.seed + 151);
  const widthVariation = spatialUnit(ix, iz, RAINIER_CAMP.seed + 419);
  const exposure = 1 - 0.12 * smooth(95, 180, height);
  return {
    height: mix(...archetype.heightScale, stature) * exposure,
    width: mix(...archetype.widthScale, stature * 0.65 + widthVariation * 0.35),
  };
}
