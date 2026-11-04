/** Gameplay units, not kilograms/litres inferred from the exaggerated toy-scale timber. */
export type CarrySize = { weight: number; bulk: number; bundleFactor: number };
export const CARRY_ITEMS: Readonly<Record<string, CarrySize>> = {
  mushroom: {weight: .2, bulk: 1, bundleFactor: 1},
  branch: {weight: 4, bulk: 3, bundleFactor: .55},
  wood: {weight: 30, bulk: 10, bundleFactor: 1},
  'scrap-fuel': {weight: 1, bulk: 1.5, bundleFactor: .7},
  'small-wood': {weight: 2, bulk: 2, bundleFactor: .65},
  'dried-mushroom': {weight: .1, bulk: .5, bundleFactor: 1},
  'canvas-roll': {weight: 3, bulk: 4, bundleFactor: 1},
  'hardware-kit': {weight: 4, bulk: 2, bundleFactor: 1},
  'trail-rations': {weight: 2, bulk: 3, bundleFactor: 1},
  'merchant-soap': {weight: .25, bulk: .35, bundleFactor: 1},
  'bath-salt': {weight: .9, bulk: .7, bundleFactor: 1},
  'paper-ink': {weight: 1.1, bulk: .9, bundleFactor: 1},
  'festival-spark': {weight: .7, bulk: .7, bundleFactor: 1},
};
export type CarryMethod = 'hands' | 'bundle';
export type CarryProfile = {
  name: string; status: 'active' | 'planned'; weightLimit: number; bulkLimit: number;
  comfortWeight: number; effortLimit: number; comfortBulk: number; tare: number;
  effortFactor: number; handling: number; bundle: boolean; excludes: readonly string[];
};
const base = {weightLimit:30, bulkLimit:10, comfortWeight:10, effortLimit:30,
  comfortBulk:4, tare:0, effortFactor:1, handling:1, bundle:false, excludes:[]};
export const CARRY_PROFILES = {
  hands: {...base, name:'双手携带', status:'active'},
  bundle: {...base, name:'整理打捆', status:'active', bundle:true, handling:.9},
  parcel: {...base, name:'包裹', status:'planned', bulkLimit:18, comfortBulk:8, tare:1, handling:.95, excludes:['wood']},
  basket: {...base, name:'大筐', status:'planned', bulkLimit:25, comfortBulk:12, tare:2, handling:.95, excludes:['wood']},
  backpack: {...base, name:'大背包', status:'planned', bulkLimit:30, comfortBulk:15, tare:3, excludes:['wood']},
  cart: {...base, name:'小推车', status:'planned', weightLimit:150, bulkLimit:80, comfortBulk:40, tare:10, effortFactor:.15, handling:.85},
} as const satisfies Record<string, CarryProfile>;
export const CARRY_RULES = {minSpeed:1/3, pickupReach:2.4, storageReach:4.2} as const;
export const CARRY_VISUALS = ['backpack', 'wood-bundle', 'shoulder-log'] as const;
