import type {CharacterQualityTier} from './character-quality.ts';
import {CHARACTER_SURFACE_STANDARD} from './character-quality.ts';

/** Approved looks, not spawned entities. Texture changes never change a saved NPC id. */
export type SelectedCharacterLook = {
  id:string; reference:'F'|'G'|'E'|'J'|'K'|'L'; label:string;
  role:'regular-trader'|'visitor'|'legendary-trader'|'neighbor';
  tier:CharacterQualityTier;
  status:'visual-approved-awaiting-source'; source:string;
  retain:readonly string[]; change:readonly string[];
};

export const SELECTED_CHARACTER_LOOKS:readonly SelectedCharacterLook[] = [
  {
    id:'frontier-trader-f',reference:'F',label:'林地行商',role:'regular-trader',tier:'trader',
    status:'visual-approved-awaiting-source',source:'https://5883d.com/thread-2361-1-1.html',
    retain:['已接受改装稿的大头比例','粉色侧辫','奶油色卷袖衬衣','苔绿背心'],
    change:['增加两个有体积的腰袋和一个斜挎货包','胸前/裤侧增加四至六处贴图衣袋','宽皮带、短靴、少量黄铜扣','避免主角同款蓝工作服和背包剪影'],
  },
  {
    id:'frontier-visitor-g',reference:'G',label:'Kevin 来客',role:'visitor',tier:'visitor',
    status:'visual-approved-awaiting-source',source:'https://www.cgmol.com/model/3/17139.html',
    retain:['皮帽','短背心','宽短裤','年轻冒险者轮廓'],
    change:['衬衣改为暖帆布色','赭棕皮件','一只野外肩包','用补丁和口袋减弱城镇制服感'],
  },
  {
    id:'legendary-trader-e',reference:'E',label:'传奇商人',role:'legendary-trader',tier:'visitor',
    status:'visual-approved-awaiting-source',source:'https://www.5883d.com/thread-4509-1-1.html',
    retain:['绿发','宽大外套','两侧工具包','较丰富的装备身份'],
    change:['灰蓝外套与暖棕皮件统一到项目色板','金属装饰集中在少数大扣件','低频身份沿用普通来客面数档，不以传奇稀有度增加精度','小齿轮和花纹烘入贴图'],
  },
  {
    id:'frontier-neighbor-j',reference:'J',label:'May / 梅伊',role:'neighbor',tier:'neighbor',
    status:'visual-approved-awaiting-source',source:'https://dragonnest.fandom.com/wiki/May',
    retain:['棕色双辫','围裙','亲切的生活人物轮廓'],
    change:['围裙增加两个大贴袋','奶油衬衣、靛蓝或锈红裙装','缩减蕾丝与亮色装饰','不自动替换已有阿榆的身份、记忆或来访调度'],
  },
  {
    id:'frontier-elder-k',reference:'K',label:'Harold / 海洛德',role:'visitor',tier:'visitor',
    status:'visual-approved-awaiting-source',source:'https://dnest.wikidot.com/prairie-village',
    retain:['白胡子','矮圆长者体型','手杖','连帽轮廓'],
    change:['兜帽外套改厚布料与皮革包边','金色肩纹改压低对比的缝线','保留小腰包','手杖握持时关闭触头和理衣动作'],
  },
  {
    id:'frontier-smith-l',reference:'L',label:'白胡子铁匠',role:'visitor',tier:'visitor',
    status:'visual-approved-awaiting-source',source:'https://www.cgmol.com/model/3/17133.html',
    retain:['敦实体型','白胡子','工装围裙'],
    change:['厚皮围裙增加宽工具袋','保留一至两件轮廓清楚的工具','小铆钉烘入贴图','与 K 保留头形、身宽和主色差别'],
  },
];

const P=CHARACTER_SURFACE_STANDARD.palette;
/** Artwork recipes only: three baked atlases are prepared after the source UVs exist. */
export const CHARACTER_TEXTURE_RECIPES = [
  {id:'moss-canvas',cloth:P.moss,secondary:P.canvas,leather:P.brown,accent:P.brass,pockets:'broad-flap'},
  {id:'indigo-workwear',cloth:P.indigo,secondary:P.canvas,leather:P.brown,accent:P.rust,pockets:'double-patch'},
  {id:'rust-travel',cloth:P.rust,secondary:P.canvas,leather:P.brown,accent:P.moss,pockets:'reinforced-flap'},
] as const;

export const CHARACTER_CAST_PLAN = {
  selectedLooks:SELECTED_CHARACTER_LOOKS.length,
  userProvidedOriginalLooks:4,
  npcLooks:10,
  protagonistLooks:1,
  totalIncludingProtagonist:11,
} as const;
