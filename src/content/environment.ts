/** Authored alpine massifs; decorative and independent of playable land. */
export type MountainDefinition = {
 id:string; center:readonly [number,number]; radius:readonly [number,number];
 baseY:number; height:number; snowLine:number; seed:number;
 spine:readonly (readonly [number,number,number])[]; segments:readonly [number,number];
};
export const MOUNTAINS: readonly MountainDefinition[] =[
 {id:'crown',center:[-58,-590],radius:[325,220],baseY:12,height:362,snowLine:.40,seed:7,
  spine:[[-1,.05,.04],[-.78,.04,.32],[-.60,-.06,.48],[-.40,.08,.60],[-.22,-.07,.79],[-.08,-.16,1],[.07,-.14,.89],[.20,.00,.72],[.34,.11,.81],[.50,.04,.51],[.72,.12,.34],[1,.03,.02]],segments:[78,48]},
 {id:'west-wall',center:[-460,-510],radius:[260,180],baseY:0,height:262,snowLine:.69,seed:19,
  spine:[[-1,0,.02],[-.70,-.02,.42],[-.40,.09,.67],[-.19,-.12,.94],[.03,.05,.57],[.26,-.03,1],[.46,.08,.61],[.68,-.09,.72],[1,0,.03]],segments:[48,30]},
 {id:'east-divide',center:[425,-640],radius:[300,210],baseY:-6,height:300,snowLine:.66,seed:31,
  spine:[[-1,0,.03],[-.80,.03,.40],[-.54,-.05,.70],[-.32,.09,.48],[-.08,-.11,1],[.10,-.03,.72],[.30,.08,.89],[.51,-.02,.59],[.74,.07,.65],[1,0,.02]],segments:[52,34]},
 {id:'distant-crown',center:[-90,-930],radius:[600,190],baseY:0,height:330,snowLine:.58,seed:43,
  spine:[[-1,0,.1],[-.72,.08,.61],[-.5,-.06,.80],[-.28,.09,.58],[-.08,-.02,1],[.15,.08,.69],[.4,-.1,.92],[.65,.08,.64],[1,0,.1]],segments:[48,26]},
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
  airColor: [.23, .34, .48] as const,
  airDensity: .00034,
  airHeight: 230,
  recommendedExposure: .85,
  environmentIntensity: .30,
};
// A priori geometry envelope. Browser draw cost remains view-dependent and is sampled by the app.
export const ENVIRONMENT_LIMITS = { triangles: 18000, meshes: 7, materialVariants: 2 };
