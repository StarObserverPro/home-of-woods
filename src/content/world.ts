export type Point = { x: number; z: number };
export const WORLD_SEED = 104729;
export const WORLD_LAYOUT_VERSION = 'how-valley-r3-hosts-1';
export const WORLD_RULESET_VERSION = 1;
export const WORLD = {
  minX: -150,
  maxX: 150,
  minZ: -150,
  maxZ: 150,
  step: 2,
  waterY: 1.35,
  riverHalfWidth: 4.5,
  minOpenZ: -75,
};
// Atlas R3 anchors cleaned for independent props and a continuous walkable route.
export const HOME = { x: -36, z: -4 };
export const START = { x: -35, z: 2 };
export const CABIN = { x: -31, z: -16 };
export const TENT = { x: -44, z: 6 };
export const GIANT = { x: -1, z: 43 };
const PATH_KNOTS: Point[] = [
  { x: -27, z: -70 }, { x: -22, z: -46 }, { x: -14, z: -27 },
  { x: -21, z: 8 }, { x: -33, z: 22 },
  { x: -35, z: 39 }, { x: -29, z: 53 }, { x: -14, z: 55 },
  { x: -5, z: 52 }, { x: 3, z: 48 },
];
export const PATH: Point[] = PATH_KNOTS.flatMap((b,i,a)=>{
  if(i===a.length-1)return [b];
  const p=a[Math.max(0,i-1)],c=a[i+1],d=a[Math.min(a.length-1,i+2)];
  return [0,1/3,2/3].map(t=>{
    const f=(k:'x'|'z')=>.5*((2*b[k])+(-p[k]+c[k])*t+(2*p[k]-5*b[k]+4*c[k]-d[k])*t*t+(-p[k]+3*b[k]-3*c[k]+d[k])*t*t*t);
    return {x:f('x'),z:f('z')};
  });
});
export const RIVER_KNOTS: Point[]=[{z:-150,x:180},{z:-35,x:104},{z:15,x:43},{z:36,x:23.4},{z:46,x:14.7},{z:57,x:-.24},{z:62,x:-12.3},{z:95,x:-67},{z:150,x:-135}];
export const WAYPOINTS = [
  {
    id: "home",
    name: "山间营地",
    note: "帐篷与旧木屋",
    x: START.x,
    z: START.z,
  },
  { id: "lookout", name: "宅后望台", note: "沿宅后小路登高", x: -27, z: -70 },
  { id: "giant", name: "守林巨木", note: "山路旁的老朋友", x: -6, z: 48 },
  { id: "creek", name: "溪谷河岸", note: "沿下坡小路走到水边", x: 3, z: 48 },
] as const;
export const CAMERA = {
  yaw: -0.13,
  elevation: 0.24,
  minElevation: 0.12,
  zoom: 0.76,
  minZoom: 0.48,
  maxZoom: 2.4,
};
export const MOVEMENT = {
  speed: 5.2,
  radius: 0.48,
  maxSlope: 0.9,
  fixedStep: 1 / 60,
};
export const PALETTE = {
  grass: "#a4ba62",
  forest: "#7c9a42",
  path: "#ba8b60",
  bank: "#a6ad60",
  pine: "#426c25",
  pineLight: "#577b32",
  leaf: "#628a34",
  leafLight: "#809e42",
  wood: "#95602f",
  cream: "#f0d6a1",
  roof: "#a97036",
  rock: "#9ca9a0",
  water: "#4eb89b",
};
