import type { Point } from './world.ts';

export type CampTreeSpecies = 'douglas-fir' | 'hemlock' | 'redcedar' | 'bigleaf-maple' | 'red-alder';
export type CampTreeLayer = 'old-growth' | 'canopy' | 'midstory' | 'pole' | 'young' | 'elder';
export type CampTreeForm = { species: CampTreeSpecies; layer: CampTreeLayer };
export type RegenerationHabitat = 'sunny-edge' | 'under-canopy' | 'moist-terrace';
type SpeciesWeight = readonly [CampTreeSpecies, number];

export const CAMP_TREE_SPECIES = {
  'douglas-fir': { name: '花旗松', kind: 'pine', height: 41, radius: 1.14, crown: 7.3, crownBase: .56, bark: '#886a51', leaf: '#5b805c' },
  hemlock: { name: '西部铁杉', kind: 'pine', height: 24, radius: .51, crown: 4.5, crownBase: .38, bark: '#877767', leaf: '#6b8a66' },
  redcedar: { name: '西部红柏', kind: 'pine', height: 31, radius: .88, crown: 5.6, crownBase: .35, bark: '#966e50', leaf: '#6c8858' },
  'bigleaf-maple': { name: '大叶枫', kind: 'broadleaf', height: 25, radius: .69, crown: 7.7, crownBase: .40, bark: '#8b8470', leaf: '#8c9f56' },
  'red-alder': { name: '红桤木', kind: 'broadleaf', height: 18, radius: .35, crown: 3.8, crownBase: .42, bark: '#b7b5a3', leaf: '#96ad64' },
} as const;

export const CAMP_WOODLAND_GROVES = [
  { id: 'tent-slope', x: -54, z: 6, rx: 12, rz: 19, canopy: 4, midstory: 2, lead: 'douglas-fir' },
  { id: 'cabin-slope', x: -47, z: -32, rx: 13, rz: 12, canopy: 3, midstory: 2, lead: 'douglas-fir' },
  { id: 'trail-west', x: -47, z: 29, rx: 10, rz: 11, canopy: 3, midstory: 2, lead: 'douglas-fir' },
  { id: 'trail-east', x: -13, z: 29, rx: 9, rz: 11, canopy: 3, midstory: 2, lead: 'redcedar' },
  { id: 'lower-ridge', x: -27, z: 38, rx: 7, rz: 12, canopy: 2, midstory: 1, lead: 'douglas-fir' },
  { id: 'creek-terrace', x: -16, z: 46, rx: 10, rz: 9, canopy: 3, midstory: 1, lead: 'red-alder' },
  { id: 'creek-bend', x: 1, z: 29, rx: 8, rz: 6, canopy: 2, midstory: 1, lead: 'red-alder' },
  { id: 'east-bank', x: 35, z: 49, rx: 9, rz: 10, canopy: 2, midstory: 2, lead: 'bigleaf-maple' },
] as const satisfies readonly (Point & { id: string; rx: number; rz: number; canopy: number; midstory: number; lead: CampTreeSpecies })[];

export type RegenerationStrip = {
  id: string;
  name: string;
  habitat: RegenerationHabitat;
  spine: readonly [Point, Point, ...Point[]];
  halfWidth: number;
  trees: number;
  permits: number;
  mixture: readonly SpeciesWeight[];
  existing?: readonly { id: string; species: CampTreeSpecies }[];
};

/** The quotas are visible-tree budgets. Only established poles with room to work reach the application roster. */
export const CAMP_REGENERATION_STRIPS: readonly RegenerationStrip[] = [
  { id: 'lookout-edge', name: '望台小路外侧', habitat: 'sunny-edge',
    spine: [{x:-19,z:-61},{x:-13,z:-46},{x:-5,z:-31}], halfWidth: 7, trees: 9, permits: 4,
    mixture: [['douglas-fir', 6], ['hemlock', 4]] },
  { id: 'west-shade', name: '营地西坡老林下', habitat: 'under-canopy',
    spine: [{x:-63,z:-31},{x:-59,z:-7},{x:-64,z:13},{x:-61,z:29}], halfWidth: 7, trees: 12, permits: 3,
    mixture: [['hemlock', 8], ['redcedar', 2]],
    existing: [{id:'tree-slot-r3-hero-1', species:'hemlock'}] },
  { id: 'camp-edge', name: '营地东侧林窗', habitat: 'sunny-edge',
    spine: [{x:-11,z:-14},{x:-9,z:2},{x:-13,z:17}], halfWidth: 7, trees: 9, permits: 4,
    mixture: [['douglas-fir', 5], ['hemlock', 3], ['bigleaf-maple', 2]] },
  { id: 'lower-edge', name: '下坡旧林窗', habitat: 'sunny-edge',
    spine: [{x:-20,z:24},{x:-25,z:34},{x:-21,z:44}], halfWidth: 7, trees: 9, permits: 4,
    mixture: [['douglas-fir', 4], ['hemlock', 3], ['bigleaf-maple', 3]],
    existing: [{id:'tree-slot-r3-hero-0', species:'hemlock'}] },
  { id: 'west-terrace', name: '溪谷西岸更新台地', habitat: 'moist-terrace',
    spine: [{x:5,z:23},{x:1,z:32},{x:-10,z:41},{x:-18,z:49}], halfWidth: 8, trees: 10, permits: 4,
    mixture: [['red-alder', 7], ['bigleaf-maple', 3]] },
  { id: 'east-terrace', name: '东岸缓坡与阔叶林缘', habitat: 'moist-terrace',
    spine: [{x:39,z:45},{x:47,z:53},{x:42,z:60},{x:31,z:65}], halfWidth: 7, trees: 11, permits: 5,
    mixture: [['red-alder', 6], ['bigleaf-maple', 3], ['redcedar', 1]],
    existing: [{id:'tree-slot-19-20', species:'redcedar'}] },
];

export const CAMP_WOODLAND_DIMENSIONS = { breastHeight: 2, worldUnitsPerMetre: 2.55 / 1.75 } as const;
