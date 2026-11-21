import { START } from './world.ts';

/** Authored representative woodlands. Coordinates are game units; player height is about 2. */
export type ExpeditionId = 'upper' | 'mixed' | 'lower';
export type ExpeditionMapId = ExpeditionId;
export type ExpeditionPoint = { x: number; z: number };
export type ExpeditionPoint3 = ExpeditionPoint & { y: number };
export type ExpeditionTreeKind = 'redwood' | 'hemlock' | 'spruce' | 'fir' | 'pine' | 'cedar' | 'oak' | 'maple' | 'beech' | 'birch' | 'aspen' | 'elm' | 'ash' | 'hazel' | 'berry' | 'serviceberry';
export type ExpeditionResourceRole = 'soil-fungus' | 'wood-fungus' | 'berry' | 'nut' | 'resin' | 'branch' | 'long-timber' | 'curved-branch' | 'seed' | 'sap' | 'tree-fruit' | 'shelf-fungus' | 'wood-ear';
export type ExpeditionWoodSubstrate = 'fallen-log' | 'nurse-log' | 'stump' | 'standing-trunk';
export type ExpeditionResourceSite = ExpeditionPoint3 & {
  id: string; habitatId: string; role: ExpeditionResourceRole; hostTreeId?: string; substrate?: ExpeditionWoodSubstrate;
};
export type ExpeditionTree = ExpeditionPoint3 & {
  id: string; kind: ExpeditionTreeKind; height: number; trunkRadius: number; crownRadius: number;
  variant: 0 | 1 | 2; rotation: number; landmark: boolean; habitatId: string; moss: boolean;
};
export type ExpeditionRoute = { id: string; name: string; loop: boolean; halfWidth: number; points: readonly ExpeditionPoint[] };
export type ExpeditionHabitat = {
  id: string; name: string; note: string; center: ExpeditionPoint; radiusX: number; radiusZ: number;
  moisture: number; openness: number; trees: readonly { kind: ExpeditionTreeKind; weight: number }[];
};
export type ExpeditionDefinition = {
  id: ExpeditionId; name: string; subtitle: string; description: string; seed: number;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }; terrainStep: number;
  spawn: ExpeditionPoint; supply: ExpeditionPoint; treeCount: number;
  routes: readonly ExpeditionRoute[]; habitats: readonly ExpeditionHabitat[];
  terrain: { base: number; slopeZ: number; slopeX: number; relief: number; rim: number };
  stream: { x: number; wave: number; phase: number; y: number; slope: number; halfWidth: number; bankWidth: number; deepHalfWidth: number };
  palette: { ground: string; shade: string; path: string; rock: string; water: string; fog: string; sky: string };
  landmarks: readonly { id: string; name: string; kind: ExpeditionTreeKind; x: number; z: number; height: number; habitatId: string }[];
  resourceAnchors: readonly { key: string; role: ExpeditionResourceRole; habitatId: string; x: number; z: number; substrate?: ExpeditionWoodSubstrate; hostKind?: ExpeditionTreeKind }[];
};

export const EXPEDITION_TERRAIN_STEP = 2;
const bounds = { minX: -90, maxX: 90, minZ: -90, maxZ: 90 };
const weights = (entries: readonly [ExpeditionTreeKind, number][]) => entries.map(([kind, weight]) => ({ kind, weight }));
const route = (id: string, name: string, loop: boolean, points: readonly [number, number][]): ExpeditionRoute => ({ id, name, loop, halfWidth: loop ? 2.6 : 1.9, points: points.map(([x, z]) => ({ x, z })) });
const habitat = (id: string, name: string, note: string, x: number, z: number, radiusX: number, radiusZ: number, moisture: number, openness: number, trees: readonly [ExpeditionTreeKind, number][]): ExpeditionHabitat => ({ id, name, note, center: { x, z }, radiusX, radiusZ, moisture, openness, trees: weights(trees) });
const site = (key: string, role: ExpeditionResourceRole, habitatId: string, x: number, z: number, substrate?: ExpeditionWoodSubstrate, hostKind?: ExpeditionTreeKind) => ({ key, role, habitatId, x, z, ...(substrate ? { substrate } : {}), ...(hostKind ? { hostKind } : {}) });

export const EXPEDITIONS: readonly ExpeditionDefinition[] = [
  {
    id: 'upper', name: '雾杉高林', subtitle: '巨木 · 苔谷 · 风倒木',
    description: '沿湿润的山腰走入高大针叶林，在抬高的林冠下寻找树脂、菌菇与风倒木。',
    seed: 734921, bounds, terrainStep: EXPEDITION_TERRAIN_STEP, spawn: { x: 0, z: 62 }, supply: { x: 6, z: 64 }, treeCount: 110,
    routes: [
      route('upper-loop', '高林巡游', true, [[0,62],[-38,40],[-48,5],[-40,-38],[0,-52],[37,-34],[42,12],[27,47],[0,62]]),
      route('upper-ridge', '岩肩支路', false, [[-40,-38],[-55,-47],[-65,-60]]),
      route('upper-ravine', '苔谷支路', false, [[42,12],[48,0],[47,-15]]),
    ],
    habitats: [
      habitat('upper-cathedral', '巨木厅', '高干抬起林冠，林下保留可辨认的空隙。', -17,-22,43,37,.72,.24,[['redwood',4],['hemlock',3],['spruce',2],['cedar',1]]),
      habitat('upper-ravine', '苔藓溪沟', '潮湿的沟壁、附生苔帘和朽木菌。', 37,0,27,45,.96,.30,[['hemlock',5],['cedar',3],['spruce',2]]),
      habitat('upper-windfall', '风倒林隙', '倒木打开采光，嫩树与菌类围绕旧木更新。', -25,36,42,28,.64,.60,[['spruce',3],['hemlock',3],['fir',2],['pine',2],['berry',3]]),
      habitat('upper-ridge', '露岩肩坡', '较干的岩肩缩小树冠，松与冷杉形成疏林。', -27,-63,46,22,.35,.55,[['fir',4],['pine',4],['spruce',2]]),
    ],
    terrain: { base: 17, slopeZ: -.075, slopeX: -.026, relief: 3.4, rim: 7 },
    stream: { x: 64, wave: 6, phase: .2, y: 12, slope: -.075, halfWidth: 3.0, bankWidth: 8, deepHalfWidth: 1.7 },
    palette: { ground: '#657c55', shade: '#405c4d', path: '#998666', rock: '#7c8781', water: '#567f79', fog: '#b4c8c4', sky: '#c5d5d2' },
    landmarks: [
      { id: 'upper-elder', name: '双冠老杉', kind: 'redwood', x: -10, z: -24, height: 48, habitatId: 'upper-cathedral' },
      { id: 'upper-moss-elder', name: '苔帘老铁杉', kind: 'hemlock', x: 34, z: -5, height: 40, habitatId: 'upper-ravine' },
    ],
    resourceAnchors: [
      site('floor-fungi','soil-fungus','upper-cathedral',-35,-25), site('amber','resin','upper-cathedral',-30,-43), site('high-branch','branch','upper-cathedral',-45,4),
      site('nurse-log','wood-fungus','upper-windfall',-25,43,'nurse-log'), site('windfall-berries','berry','upper-windfall',-25,35), site('cones','seed','upper-windfall',-39,29), site('windfall-timber','long-timber','upper-windfall',-45,24),
      site('ravine-fungi','soil-fungus','upper-ravine',39,-21), site('ravine-resin','resin','upper-ravine',42,5), site('wet-log','wood-fungus','upper-ravine',47,-13,'fallen-log'),
      site('ridge-cones','seed','upper-ridge',-58,-51), site('dry-branch','branch','upper-ridge',-63,-58), site('ridge-timber','long-timber','upper-ridge',-37,-48),
    ],
  },
  {
    id: 'mixed', name: '斑荫横岭', subtitle: '混交林 · 老枫 · 林缘果丛',
    description: '沿等高线穿过松栎肩坡与湿润枫林，寻找弯枝、果子和不同材性的木料。',
    seed: 421733, bounds, terrainStep: EXPEDITION_TERRAIN_STEP, spawn: { x: 0, z: 63 }, supply: { x: 6, z: 65 }, treeCount: 144,
    routes: [
      route('mixed-loop','横岭巡游',true,[[0,63],[-35,44],[-44,8],[-40,-34],[-12,-52],[29,-42],[46,-10],[37,32],[0,63]]),
      route('mixed-shoulder','松岩支路',false,[[-40,-34],[-48,-48],[-50,-62]]),
      route('mixed-edge','果丛支路',false,[[46,-10],[63,-6],[69,12]]),
    ],
    habitats: [
      habitat('mixed-shoulder','松栎肩坡','较干的高处形成松栎疏林。',-36,-34,35,36,.36,.52,[['pine',4],['oak',4],['birch',2]]),
      habitat('mixed-cove','老枫凹谷','避风凹坡里，阔冠老枫与铁杉共享湿润空气。',22,-28,35,36,.79,.30,[['maple',5],['hemlock',3],['beech',2]]),
      habitat('mixed-regrowth','桦杨新林','曾经打开的林隙里，浅色细干成群更新。',-22,37,38,28,.56,.58,[['birch',5],['aspen',4],['maple',1]]),
      habitat('mixed-edge','向阳果丛','树冠退开后，果灌木沿林缘而不是深荫结果。',48,20,25,35,.48,.76,[['oak',3],['maple',2],['hazel',2],['berry',3],['serviceberry',2]]),
    ],
    terrain: { base: 8.5, slopeZ: -.025, slopeX: .006, relief: 2.7, rim: 5 },
    stream: { x: -67, wave: 5, phase: 1.3, y: 3.4, slope: -.025, halfWidth: 2.8, bankWidth: 7.5, deepHalfWidth: 1.5 },
    palette: { ground: '#889b60', shade: '#5b7750', path: '#baa17b', rock: '#979c87', water: '#6d9e92', fog: '#c4d0ba', sky: '#d3dfd3' },
    landmarks: [
      { id: 'mixed-old-maple', name: '横枝老枫', kind: 'maple', x: 14, z: -25, height: 25, habitatId: 'mixed-cove' },
      { id: 'mixed-split-pine', name: '岩肩双干松', kind: 'pine', x: -39, z: -55, height: 23, habitatId: 'mixed-shoulder' },
    ],
    resourceAnchors: [
      site('ridge-resin','resin','mixed-shoulder',-43,-40), site('crooked-branch','curved-branch','mixed-shoulder',-48,-56), site('shoulder-timber','long-timber','mixed-shoulder',-37,-19),
      site('cove-fungi','soil-fungus','mixed-cove',28,-43), site('old-log','wood-fungus','mixed-cove',42,-23,'fallen-log'), site('maple-shelves','shelf-fungus','mixed-cove',26,-31,'standing-trunk'), site('maple-seeds','seed','mixed-cove',6,-49),
      site('birch-branch','branch','mixed-regrowth',-34,38), site('young-fungi','soil-fungus','mixed-regrowth',-43,17), site('regrowth-seeds','seed','mixed-regrowth',-17,52),
      site('berries','berry','mixed-edge',63,0), site('edge-serviceberry','tree-fruit','mixed-edge',59,9), site('hazels','nut','mixed-edge',65,14,undefined,'hazel'), site('edge-branch','curved-branch','mixed-edge',40,22),
    ],
  },
  {
    id: 'lower', name: '白桦溪甸', subtitle: '阔叶林 · 榛果 · 河岸木',
    description: '从明亮的桦杨林走到榆与白蜡的河岸，采坚果、果子与长在朽木上的菌。',
    seed: 964187, bounds, terrainStep: EXPEDITION_TERRAIN_STEP, spawn: { x: 0, z: 64 }, supply: { x: 6, z: 66 }, treeCount: 156,
    routes: [
      route('lower-loop','溪甸巡游',true,[[0,64],[-35,45],[-47,12],[-40,-28],[-10,-49],[27,-40],[41,-9],[35,34],[0,64]]),
      route('lower-aspen','白干支路',false,[[-47,12],[-64,9],[-70,-9]]),
      route('lower-bank','河岸支路',false,[[41,-9],[48,-17],[49,-34]]),
    ],
    habitats: [
      habitat('lower-aspen','桦杨亮林','成群的浅色树干与错开的树冠。',-40,3,37,43,.46,.65,[['birch',5],['aspen',5]]),
      habitat('lower-hardwood','枫榆阔冠','较厚的土层承托开展树冠与秋季坚果。',-7,-37,37,30,.61,.38,[['maple',4],['elm',3],['beech',2],['oak',1],['serviceberry',2]]),
      habitat('lower-bank','白蜡河岸','湿润而非永久积水的高河岸生长白蜡与榆。',37,-10,24,43,.84,.48,[['ash',5],['elm',3],['birch',2]]),
      habitat('lower-edge','榛果林缘','低矮多干榛丛和果灌木占据明亮空地边缘。',8,42,36,28,.49,.76,[['hazel',5],['berry',3],['aspen',2]]),
    ],
    terrain: { base: 5.1, slopeZ: -.012, slopeX: -.004, relief: 1.4, rim: 3.5 },
    stream: { x: 65, wave: 7, phase: .5, y: 1.3, slope: -.012, halfWidth: 3.7, bankWidth: 8.5, deepHalfWidth: 2.2 },
    palette: { ground: '#a0af71', shade: '#758e5b', path: '#c5b38a', rock: '#a2a58f', water: '#78ada1', fog: '#d5ddc7', sky: '#dfebde' },
    landmarks: [
      { id: 'lower-old-elm', name: '溪甸伞榆', kind: 'elm', x: 12, z: -23, height: 23, habitatId: 'lower-hardwood' },
      { id: 'lower-white-birch', name: '三生白桦', kind: 'birch', x: -57, z: -8, height: 19, habitatId: 'lower-aspen' },
    ],
    resourceAnchors: [
      site('aspen-fungi','soil-fungus','lower-aspen',-46,4), site('birch-sap','sap','lower-aspen',-66,-4,undefined,'birch'), site('birch-seeds','seed','lower-aspen',-48,21),
      site('hardwood-fungi','wood-fungus','lower-hardwood',-18,-45,'stump'), site('cove-serviceberry','tree-fruit','lower-hardwood',-7,-46), site('beech-nuts','nut','lower-hardwood',6,-47,undefined,'beech'), site('bent-wood','curved-branch','lower-hardwood',-36,-30),
      site('bank-log','wood-fungus','lower-bank',47,-28,'fallen-log'), site('bank-wood-ear','wood-ear','lower-bank',45,-20,'fallen-log'), site('ash-branch','branch','lower-bank',39,-10), site('bank-timber','long-timber','lower-bank',37,15),
      site('hazelnuts','nut','lower-edge',24,45,undefined,'hazel'), site('berries','berry','lower-edge',9,56), site('hazel-seed','seed','lower-edge',-15,54),
    ],
  },
];

export const EXPEDITION_BY_ID = Object.fromEntries(EXPEDITIONS.map(definition => [definition.id, definition])) as Record<ExpeditionId, ExpeditionDefinition>;

export const CAMP_FOREST_TRAIL = { id: 'camp-forest-trail', name: '林地小径', point: START, reach: 2.4 } as const;
