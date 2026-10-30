/** Authored PNW-inspired silhouettes, not a reconstruction of named real mountains. */
export type RidgeKnot = readonly [x: number, z: number, height: number];
export type MountainDefinition = {
  id: string;
  kind: "volcano" | "ridge";
  center: readonly [x: number, z: number];
  radius: readonly [x: number, z: number];
  height: number;
  baseY: number;
  snowLine: number;
  haze: number;
  seed: number;
  segments: readonly [x: number, z: number];
  spine?: readonly RidgeKnot[];
};
export const MOUNTAINS: readonly MountainDefinition[] = [
  {
    id: "glacier-volcano", kind: "volcano", center: [-110, -495], radius: [235, 165],
    height: 282, baseY: -128, snowLine: .44, haze: .10, seed: 517,
    segments: [44, 34],
  },
  {
    id: "western-cirques", kind: "ridge", center: [-430, -370], radius: [245, 145],
    height: 242, baseY: -132, snowLine: .64, haze: .06, seed: 181,
    segments: [34, 22],
    spine: [[-.94,.04,.23],[-.68,-.1,.72],[-.45,.08,.49],[-.23,-.12,1],[.01,.03,.59],[.28,-.02,.88],[.55,.16,.51],[.81,.04,.65],[1,.05,.12]],
  },
  {
    id: "eastern-aretes", kind: "ridge", center: [280, -455], radius: [290, 155],
    height: 254, baseY: -132, snowLine: .61, haze: .14, seed: 709,
    segments: [38, 24],
    spine: [[-1,-.05,.12],[-.72,.05,.48],[-.49,-.08,.89],[-.25,.12,.53],[.02,-.13,1],[.25,.05,.57],[.46,-.04,.78],[.72,.12,.46],[1,0,.16]],
  },
  {
    id: "distant-ice-divide", kind: "ridge", center: [105, -745], radius: [400, 170],
    height: 283, baseY: -163, snowLine: .55, haze: .36, seed: 941,
    segments: [36, 20],
    spine: [[-1,.05,.12],[-.75,-.08,.69],[-.52,.04,.48],[-.26,-.03,.86],[0,.1,.57],[.23,-.09,1],[.51,.06,.65],[.78,0,.83],[1,.03,.2]],
  },
  {
    id: "western-sentinels", kind: "ridge", center: [-510, 55], radius: [165, 215],
    height: 230, baseY: -137, snowLine: .70, haze: .20, seed: 211,
    segments: [24, 26],
    spine: [[-1,.1,.1],[-.62,-.05,.66],[-.27,.12,.4],[.06,-.06,1],[.37,.05,.56],[.72,-.03,.77],[1,.05,.15]],
  },
  {
    id: "eastern-shoulders", kind: "ridge", center: [515, 85], radius: [180, 220],
    height: 239, baseY: -137, snowLine: .68, haze: .20, seed: 647,
    segments: [24, 26],
    spine: [[-1,-.04,.12],[-.63,.04,.6],[-.28,-.06,.89],[.01,.12,.5],[.28,-.08,1],[.64,.04,.59],[1,.05,.12]],
  },
];
export const ENVIRONMENT_STYLE = {
  reference: "https://sky-porch.starobserverpro.chatgpt.site",
  turbidity: 2.2,
  rayleigh: 2.4,
  mieCoefficient: .0042,
  mieDirectionalG: .82,
  cloudCoverage: .28,
  cloudDensity: .43,
  cloudScale: .00072,
  cloudSpeed: .0000011,
  // Sky's physical horizon is very bright; calibrate its radiance before PMREM and tone mapping.
  skyRadianceScale: .11,
  skyTint: [.68, .84, 1] as const,
  sunDirection: [-.52, .81, -.28] as const,
  ambientIntensity: 1.05,
  // Diffuse sky-fill floors apply only to classified snow/ice; terrain lighting is unchanged.
  snowDiffuseFloor: [1.62, 1.68, 1.72] as const,
  iceDiffuseFloor: [.62, 1.06, 1.42] as const,
  airColor: [.23, .34, .48] as const,
  airDensity: .00034,
  airHeight: 230,
  recommendedExposure: .85,
  environmentIntensity: .30,
};
// A priori geometry envelope. Browser draw cost remains view-dependent and is sampled by the app.
export const ENVIRONMENT_LIMITS = { triangles: 18000, meshes: 7, materialVariants: 2 };
