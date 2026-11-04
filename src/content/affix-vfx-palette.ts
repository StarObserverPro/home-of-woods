/**
 * The shared visual vocabulary for low-tier whimsical affixes (not loot or rarity VFX).
 * 48 hand-curated swatches from the deterministic xterm-256 RGB cube/gray ramp.
 * Terminal-dependent indices 0–15 are deliberately excluded.
 *
 * Color *names* and associations are content; the RGB conversion is a technical
 * reference so paint, particle and UI previews always agree.
 */
export const AFFIX_COLOR_FAMILIES = [
  'harvest','ember','berry','violet','water','mist','forest','frost',
] as const;
export type AffixColorFamily = typeof AFFIX_COLOR_FAMILIES[number];
export type AffixSwatch = {
  id: string; paletteIndex: number; hex: string; name: string;
  family: AffixColorFamily; imagery: readonly [string,string];
};

const levels = [0,95,135,175,215,255] as const;
const byteHex = (value:number) => value.toString(16).padStart(2,'0').toUpperCase();
/** xterm palette 16–231 = 6³ cube; 232–255 = 24 grayscale steps. */
export function colorFrom256Index(index:number):string {
  if (!Number.isInteger(index)||index<16||index>255)throw new Error('Invalid deterministic 256-color index');
  if(index>=232){
    const shade=8+(index-232)*10;
    return '#'+byteHex(shade).repeat(3);
  }
  const value=index-16,r=levels[Math.floor(value/36)],g=levels[Math.floor((value%36)/6)],b=levels[value%6];
  return '#'+byteHex(r)+byteHex(g)+byteHex(b);
}

type ColorSeed = readonly [paletteIndex:number,name:string,imageryA:string,imageryB:string];
const seeds: Record<AffixColorFamily,readonly ColorSeed[]> = {
  harvest: [
    [180,'麦田余温','麦浪','晚风'],
    [186,'蜜梨薄光','秋果','晨露'],
    [215,'杏橙灯火','炉边','柑橘'],
    [220,'午后金铃','铜铃','向阳坡'],
    [222,'晚霞蜜糖','炊烟','暮云'],
    [223,'云间杏乳','薄云','晴窗'],
  ],
  ember: [
    [173,'栗壳夕烧','树皮','余烬'],
    [174,'落霞玫瑰','红土','晚照'],
    [179,'烤栗浮金','秋果','火塘'],
    [203,'篝火朱砂','火苗','山夜'],
    [209,'山柿初熟','柿子','檐角'],
    [210,'夕云莓焰','云边','暖光'],
  ],
  berry: [
    [168,'野莓旧梦','浆果','晚春'],
    [169,'紫莓微雨','莓枝','细雨'],
    [175,'山茶暮粉','山茶','夕照'],
    [176,'丁香薄雾','花雾','小径'],
    [181,'桃木浅红','桃木','晨光'],
    [217,'桃云初醒','春云','花枝'],
  ],
  violet: [
    [97,'夜藤丁香','暮藤','花影'],
    [103,'雾紫山影','远山','晚雾'],
    [135,'紫晶星潮','星群','晶石'],
    [141,'烟萝夜梦','藤萝','月色'],
    [177,'晚香花月','夜花','新月'],
    [183,'云霞淡紫','浮云','薄暮'],
  ],
  water: [
    [67,'深溪微光','潭影','石岸'],
    [74,'雨后湖蓝','湖面','雨歇'],
    [75,'远山初晴','山峦','晴空'],
    [81,'清溪碎波','水花','浅滩'],
    [110,'雨幕浅蓝','小雨','远岸'],
    [117,'露空晴蓝','晴朗','露水'],
  ],
  mist: [
    [30,'溪潭深青','深潭','水草'],
    [37,'青潮回音','潮汐','回声'],
    [43,'苔水新绿','溪石','苔丝'],
    [79,'雨后薄荷','雨滴','薄荷'],
    [115,'林雾水青','林雾','山泉'],
    [152,'晨雾青瓷','雾气','青瓷'],
  ],
  forest: [
    [71,'林间新苔','苔藓','林地'],
    [72,'翠羽青枝','羽毛','枝梢'],
    [78,'雨露嫩芽','新芽','晨雨'],
    [107,'橡叶晨绿','橡叶','清晨'],
    [114,'春风草醒','春草','微风'],
    [150,'苔光麦绿','草坡','麦穗'],
  ],
  frost: [
    [153,'冻湖微蓝','冰面','冬晨'],
    [159,'月露微光','月色','水滴'],
    [188,'碎银薄雾','云丝','远烟'],
    [224,'春雪樱白','初雪','樱瓣'],
    [230,'晨霜奶白','薄霜','晨光'],
    [254,'云纸月白','纸页','月华'],
  ],
};
export const AFFIX_SWATCHES:readonly AffixSwatch[] =
  AFFIX_COLOR_FAMILIES.flatMap(family => seeds[family].map(([paletteIndex,name,a,b]) => ({
    id:'tone-'+paletteIndex, paletteIndex, hex:colorFrom256Index(paletteIndex),
    name, family, imagery:[a,b] as const,
  })));
export const AFFIX_SWATCH_BY_ID: ReadonlyMap<string,AffixSwatch> =
  new Map(AFFIX_SWATCHES.map(s=>[s.id,s]));
export const AFFIX_SWATCH_BY_INDEX: ReadonlyMap<number,AffixSwatch> =
  new Map(AFFIX_SWATCHES.map(s=>[s.paletteIndex,s]));

/**
 * Curated combinations; RGB contrast, harmony and storytelling have been considered.
 * Two colors do not by themselves award uncommon or higher rarity to an item.
 */
export const AFFIX_COLOR_DUOS = [
  {id:'late-gold-lake',name:'金铃落湖',colors:['tone-220','tone-74'],imagery:'暖金落进雨后的湖面'},
  {id:'berry-moon',name:'莓云抱月',colors:['tone-168','tone-159'],imagery:'晚春野莓与冷白月露'},
  {id:'spring-mist',name:'春草含雾',colors:['tone-114','tone-152'],imagery:'春草醒时，晨雾还没散'},
  {id:'ember-frost',name:'霜火隔窗',colors:['tone-209','tone-153'],imagery:'火塘的橘与窗外的冰'},
  {id:'lavender-dawn',name:'丁香迎曦',colors:['tone-176','tone-223'],imagery:'雾紫花影与杏白朝云'},
  {id:'sea-leaf',name:'溪叶同行',colors:['tone-81','tone-72'],imagery:'一道水光，跟着一片新叶'},
  {id:'moon-harvest',name:'月照麦浪',colors:['tone-186','tone-254'],imagery:'月光落在收割后的田野'},
  {id:'violet-sunset',name:'紫云返照',colors:['tone-141','tone-210'],imagery:'紫色夜云留住最后一缕霞光'},
] as const;
