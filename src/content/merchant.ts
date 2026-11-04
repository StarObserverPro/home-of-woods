import {calendarAt} from '../domain/local-clock.ts';
import {VISUAL_DAY_SECONDS} from './scene-props.ts';
import {CRAFT_BLUEPRINTS,CAMP_EXTERIOR_BLUEPRINTS} from './workshop.ts';

/** Temporary caravan rhythm; the separate calendar-design task owns the final cadence. */
export const MERCHANT_VISIT = {
  firstDay: 1, intervalDays: 14, stayDays: 2,
  arrivalSeconds: 12, departureSeconds: 12,
} as const;
export const MERCHANT_CAPACITY = { cargoUnits: 100, buyBudget: 800, creditLimit: 200 } as const;
/** Merchant stops beside the road; the covered cargo hold intentionally has no visible inventory. */
export const MERCHANT_SCENE = {
  parked: { x: -40, z: -1 },
  wagon: { x: -43.6, z: -3.2 },
  entryOffset: { x: 15, z: 14 },
} as const;

export type MerchantCategory = 'food'|'material'|'blueprint'|'consumable'|'gift';
export type MerchantListing = {
  id: string; kind: 'stack'|'blueprint'; category: MerchantCategory;
  name: string; icon: string; price: number; stock: number;
  itemId?: string; blueprintId?: string; uses?: number|null; detail: string;
};

export function merchantVisitAt(time: number) {
  const day = calendarAt(time).day;
  const elapsedDays = day - MERCHANT_VISIT.firstDay;
  const index = elapsedDays < 0 ? -1 : Math.floor(elapsedDays / MERCHANT_VISIT.intervalDays);
  const active = index >= 0 && elapsedDays % MERCHANT_VISIT.intervalDays < MERCHANT_VISIT.stayDays;
  const within = active ? time - index*MERCHANT_VISIT.intervalDays*VISUAL_DAY_SECONDS : 0;
  const remaining = MERCHANT_VISIT.stayDays*VISUAL_DAY_SECONDS - within;
  const travel = !active ? 0 : within < MERCHANT_VISIT.arrivalSeconds ?
    Math.max(0, Math.min(1, within/MERCHANT_VISIT.arrivalSeconds)) :
    remaining < MERCHANT_VISIT.departureSeconds ?
    Math.max(0, Math.min(1, remaining/MERCHANT_VISIT.departureSeconds)) : 1;
  return {active,index,travel,parked:active&&travel>=1,day};
}

const fixed: readonly MerchantListing[] = [
  {id:'supply.food',kind:'stack',category:'food',name:'常备粮袋',icon:'🥖',price:200,stock:1,itemId:'trail-rations',detail:'每次来访都带一袋基础干粮。'},
  {id:'supply.canvas',kind:'stack',category:'material',name:'耐雨帆布',icon:'🧵',price:90,stock:2,itemId:'canvas-roll',detail:'帐篷改装所需的真实耗材。'},
  {id:'supply.hardware',kind:'stack',category:'material',name:'火塘五金',icon:'🔧',price:85,stock:2,itemId:'hardware-kit',detail:'烧烤网与烟罩制作所需的真实零件。'},
];
const consumables: readonly MerchantListing[] = [
  {id:'supply.soap',kind:'stack',category:'consumable',name:'手工皂',icon:'🧼',price:35,stock:2,itemId:'merchant-soap',detail:'澡堂用的消耗品，使用效果后续接线。'},
  {id:'supply.salt',kind:'stack',category:'consumable',name:'浴盐',icon:'🛁',price:40,stock:2,itemId:'bath-salt',detail:'舒适生活物资，暂不提供额外属性。'},
  {id:'supply.ink',kind:'stack',category:'consumable',name:'纸墨包',icon:'✒️',price:50,stock:2,itemId:'paper-ink',detail:'留纸条和绘图的生活物资，效果待开放。'},
  {id:'supply.spark',kind:'stack',category:'consumable',name:'小烟花',icon:'🎇',price:110,stock:1,itemId:'festival-spark',detail:'节日装饰物，当前只收藏，不触发烟火效果。'},
];
const namedBlueprint = (id:string, name:string, icon:string, price:number, uses:number|null, detail:string):MerchantListing =>
  ({id:'plan.'+id,kind:'blueprint',category:'blueprint',name,icon,price,stock:1,blueprintId:id,uses,detail});

/** Stable stock for one visit. No refresh by opening a shop or changing game speed. */
export function merchantListings(seed:number,index:number):MerchantListing[] {
  if(index<0)return [];
  const craft=CRAFT_BLUEPRINTS[index%CRAFT_BLUEPRINTS.length];
  const exterior=CAMP_EXTERIOR_BLUEPRINTS.filter(plan=>!['blueprint.tent-ropes','blueprint.camp-fire-stones'].includes(plan.id));
  const first=exterior[(index*3+seed)%exterior.length],second=exterior[(index*3+seed+5)%exterior.length];
  const extras=consumables.filter((_,i)=>(i+index)%consumables.length===0||(i+index)%consumables.length===2);
  return [
    ...fixed,
    namedBlueprint(craft.id,craft.name,'📜',220,null,'基础木作图纸；学会后永久可用。'),
    namedBlueprint(first.id,first.name,'📜',275,first.id.includes('smoker')?2:null,'外部改造图纸；复杂图纸会逐渐磨损。'),
    ...(second.id!==first.id?[namedBlueprint(second.id,second.name,'📜',280,second.id.includes('grill')?2:null,'从行商货箱中翻出的图纸。')]:[]),
    ...extras,
  ];
}

/** Values below are tuning candidates, not a universal resale price formula. */
export const MERCHANT_BUY_RULES = {
  'furniture.stump-seat': {name:'整木坐墩',icon:'🪵',basePrice:125,cargoUnits:10,perVisit:2},
  'furniture.chair': {name:'木椅',icon:'🪑',basePrice:240,cargoUnits:30,perVisit:2,status:'planned'},
  'furniture.table': {name:'木桌',icon:'🪑',basePrice:500,cargoUnits:80,perVisit:1,status:'planned'},
  'woodcarving.small': {name:'小木雕',icon:'🪺',basePrice:45,cargoUnits:2,perVisit:12,status:'planned'},
} as const;
export const MERCHANT_RARITY_MULTIPLIER:Record<string,number> = {common:1,uncommon:1.25,rare:1.65,epic:2.15,legendary:2.9};
