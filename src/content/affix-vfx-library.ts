/**
 * A declarative vocabulary, NOT a running particle renderer or a loot table.
 * Normal-view legibility comes before tiny decorative details.
 * Original item rarity VFX remains completely independent.
 */
import { AFFIX_COLOR_DUOS, AFFIX_SWATCH_BY_ID } from './affix-vfx-palette.ts';

export const AFFIX_PARTICLE_SHAPES = [
  {id:'soft-disc',name:'柔光圆点',complexity:'simple',geometry:'billboard-disc'},
  {id:'diamond',name:'小菱晶',complexity:'simple',geometry:'billboard-quad'},
  {id:'short-streak',name:'短流线',complexity:'simple',geometry:'line-segment'},
  {id:'confetti',name:'彩纸片',complexity:'simple',geometry:'billboard-quad'},
  {id:'hollow-ring',name:'空心小环',complexity:'simple',geometry:'ring'},
  {id:'soft-arc',name:'月弧碎片',complexity:'simple',geometry:'arc'},
  {id:'four-star',name:'四芒星',complexity:'ornate',geometry:'star-4'},
  {id:'petal',name:'小花瓣',complexity:'ornate',geometry:'petal'},
  {id:'leaf',name:'小叶片',complexity:'ornate',geometry:'leaf'},
  {id:'crescent',name:'弯月',complexity:'ornate',geometry:'crescent'},
  {id:'snowflake',name:'六枝雪晶',complexity:'ornate',geometry:'snowflake-6'},
] as const;
export type AffixParticleShapeId=typeof AFFIX_PARTICLE_SHAPES[number]['id'];

export const AFFIX_EMISSION_PATTERNS = [
  {id:'head-crown',name:'头顶花冠',anchor:'above-head',motion:'brief-ring',widths:1.1, maxParticles:8},
  {id:'shoulder-rise',name:'双肩轻升',anchor:'around-shoulders',motion:'upward',widths:1.3,maxParticles:10},
  {id:'body-orbit',name:'随身星环',anchor:'whole-body',motion:'short-orbit',widths:1.5,maxParticles:12},
  {id:'back-fan',name:'身后扇影',anchor:'behind-body',motion:'fan-out',widths:1.5,maxParticles:10},
  {id:'feet-ripple',name:'脚边涟漪',anchor:'at-feet',motion:'outward-rings',widths:1.7,maxParticles:10},
  {id:'short-trail',name:'两步余光',anchor:'behind-body',motion:'short-trail',widths:1.5,maxParticles:12},
  {id:'head-spray',name:'头顶一簇',anchor:'above-head',motion:'small-burst',widths:1.2,maxParticles:8},
  {id:'nearby-fall',name:'身旁细落',anchor:'whole-body',motion:'slow-fall',widths:1.6,maxParticles:12},
] as const;
export type AffixEmissionPatternId=typeof AFFIX_EMISSION_PATTERNS[number]['id'];

/** 'source' means the upstream data exists, not that a low-tier effect is active.
 * Each trigger needs a one-shot adapter and/or handler before runtime use.
 */
export const AFFIX_TRIGGER_LIBRARY = [
  {id:'time.dawn',name:'破晓',family:'time',source:'calendar',readiness:'source-present'},
  {id:'time.noon',name:'日中',family:'time',source:'calendar',readiness:'source-present'},
  {id:'time.dusk',name:'薄暮',family:'time',source:'calendar',readiness:'source-present'},
  {id:'time.midnight',name:'子夜',family:'time',source:'calendar',readiness:'source-present'},
  {id:'season.first-spring',name:'初春首日',family:'time',source:'calendar',readiness:'source-present'},
  {id:'season.first-winter',name:'初冬首日',family:'time',source:'calendar',readiness:'source-present'},
  {id:'place.riverside',name:'走近溪边',family:'environment',source:'proximity',readiness:'adapter-needed'},
  {id:'place.campfire',name:'靠近篝火',family:'environment',source:'proximity',readiness:'adapter-needed'},
  {id:'weather.rain-stops',name:'雨停',family:'environment',source:'weather',readiness:'future-feature'},
  {id:'weather.fog-enters',name:'入雾',family:'environment',source:'weather',readiness:'future-feature'},
  {id:'player.walk-start',name:'迈步',family:'action',source:'player',readiness:'source-present'},
  {id:'player.walk-stop',name:'停步',family:'action',source:'player',readiness:'source-present'},
  {id:'action.gather-done',name:'采集完成',family:'action',source:'gathering',readiness:'adapter-needed'},
  {id:'action.craft-done',name:'制作完成',family:'action',source:'workshop',readiness:'adapter-needed'},
] as const;
export type AffixTriggerId=typeof AFFIX_TRIGGER_LIBRARY[number]['id'];
export type AffixComplexity='common'|'uncommon';
export type LowTierAffixCandidate={
  id:string;name:string;complexity:AffixComplexity; colorIds:readonly string[];
  triggerId:AffixTriggerId; imagery:string;status:'candidate';
  visual:
    | {kind:'tint';target:'upper-body'|'lower-body'|'headwear'|'footwear'}
    | {kind:'particles';shapeId:AffixParticleShapeId;patternId:AffixEmissionPatternId};
};
/**
 * Examples are prototypes for word/visual review, not accepted affixes.
 * Their names remain curated, even though shape/placement/trigger are shared.
 */
export const LOW_TIER_AFFIX_CANDIDATES:readonly LowTierAffixCandidate[]=[
  {id:'apparel.meadow-afterglow',name:'麦田余温',complexity:'common',
    colorIds:['tone-180'],triggerId:'time.dusk',imagery:'黄昏过后，外套留住一会儿麦浪的暖色',
    status:'candidate',visual:{kind:'tint',target:'upper-body'}},
  {id:'apparel.peppermint-after-rain',name:'雨后薄荷',complexity:'common',
    colorIds:['tone-79'],triggerId:'weather.rain-stops',imagery:'雨刚停，衣服忽然换成清新的薄荷色',
    status:'candidate',visual:{kind:'tint',target:'upper-body'}},
  {id:'apparel.moon-dew',name:'月露微光',complexity:'common',
    colorIds:['tone-159'],triggerId:'time.midnight',imagery:'几颗月露色的光点围着人慢慢绕一圈',
    status:'candidate',visual:{kind:'particles',shapeId:'soft-disc',patternId:'body-orbit'}},
  {id:'apparel.sunset-berry',name:'夕云莓焰',complexity:'common',
    colorIds:['tone-210'],triggerId:'time.dusk',imagery:'帽子在夕阳里短暂变成云边的莓红',
    status:'candidate',visual:{kind:'tint',target:'headwear'}},
  {id:'apparel.oak-dawn',name:'橡叶晨绿',complexity:'common',
    colorIds:['tone-107'],triggerId:'time.dawn',imagery:'肩头升起几粒橡叶色的菱形晨光',
    status:'candidate',visual:{kind:'particles',shapeId:'diamond',patternId:'shoulder-rise'}},
  {id:'apparel.stream-glimmer',name:'清溪碎波',complexity:'common',
    colorIds:['tone-81'],triggerId:'place.riverside',imagery:'走近溪边，脚边水色的小环轻轻散开',
    status:'candidate',visual:{kind:'particles',shapeId:'hollow-ring',patternId:'feet-ripple'}},
  {id:'apparel.ember-step',name:'篝火朱砂',complexity:'common',
    colorIds:['tone-203'],triggerId:'place.campfire',imagery:'离火塘不远，身后浮起几笔温暖的短线',
    status:'candidate',visual:{kind:'particles',shapeId:'short-streak',patternId:'back-fan'}},
  {id:'apparel.peach-dawn',name:'桃云初醒',complexity:'common',
    colorIds:['tone-217'],triggerId:'player.walk-start',imagery:'清晨迈步般轻快，头顶闪过一簇桃色纸片',
    status:'candidate',visual:{kind:'particles',shapeId:'confetti',patternId:'head-spray'}},
  {id:'apparel.fog-silver',name:'碎银薄雾',complexity:'common',
    colorIds:['tone-188'],triggerId:'weather.fog-enters',imagery:'走进雾里，身旁缓缓落下几颗银白光点',
    status:'candidate',visual:{kind:'particles',shapeId:'soft-disc',patternId:'nearby-fall'}},
  {id:'apparel.gold-meets-lake',name:'金铃落湖',complexity:'uncommon',
    colorIds:['tone-220','tone-74'],triggerId:'time.dusk',imagery:'金色和湖蓝色的四芒星绕身而过',
    status:'candidate',visual:{kind:'particles',shapeId:'four-star',patternId:'body-orbit'}},
  {id:'apparel.frost-and-ember',name:'霜火隔窗',complexity:'uncommon',
    colorIds:['tone-209','tone-153'],triggerId:'season.first-winter',imagery:'冬天第一日，霜蓝与火橙的弯月依次掠过身后',
    status:'candidate',visual:{kind:'particles',shapeId:'crescent',patternId:'back-fan'}},
  {id:'apparel.lavender-dawn',name:'丁香迎曦',complexity:'uncommon',
    colorIds:['tone-176','tone-223'],triggerId:'time.dawn',imagery:'杏白和丁香紫的花瓣在头顶绽开一圈',
    status:'candidate',visual:{kind:'particles',shapeId:'petal',patternId:'head-crown'}},
  {id:'apparel.stream-leaf',name:'溪叶同行',complexity:'uncommon',
    colorIds:['tone-81','tone-72'],triggerId:'place.riverside',imagery:'蓝色水花和青枝叶片一齐漂过脚边',
    status:'candidate',visual:{kind:'particles',shapeId:'leaf',patternId:'feet-ripple'}},
];

/** Structural checks only; never converts proposals into a gameplay handler. */
export function validateLowTierAffixLibrary():void {
  const ids=new Set<string>();
  const shapes=new Map(AFFIX_PARTICLE_SHAPES.map(shape=>[shape.id,shape]));
  const patterns=new Map(AFFIX_EMISSION_PATTERNS.map(pattern=>[pattern.id,pattern]));
  const triggers=new Set(AFFIX_TRIGGER_LIBRARY.map(trigger=>trigger.id));
  for(const affix of LOW_TIER_AFFIX_CANDIDATES){
    if(ids.has(affix.id)||!affix.id||!affix.name||!triggers.has(affix.triggerId)||
      affix.colorIds.length<1||affix.colorIds.length>(affix.complexity==='common'?1:2)||
      affix.colorIds.some(id=>!AFFIX_SWATCH_BY_ID.has(id)))
      throw new Error('Invalid low-tier affix candidate: '+affix.id);
    if(new Set(affix.colorIds).size!==affix.colorIds.length)
      throw new Error('Duplicate affix colors: '+affix.id);
    if(affix.colorIds.length===2&&!AFFIX_COLOR_DUOS.some(duo =>
      duo.colors.every(colorId=>affix.colorIds.includes(colorId))))
      throw new Error('Unreviewed affix color combination: '+affix.id);
    ids.add(affix.id);
    if(affix.visual.kind==='particles'){
      const shape=shapes.get(affix.visual.shapeId),pattern=patterns.get(affix.visual.patternId);
      if(!shape||!pattern||affix.complexity==='common'&&shape.complexity!=='simple')
        throw new Error('Unsupported particle shape for candidate: '+affix.id);
    }
  }
}
/**
 * A future adapter must deduplicate time-window crossings, including 12x clock;
 * sample source calendarAt(state.time) once per simulation update, but run the
 * finite effect in unscaled real time. No new interval/timer is introduced.
 * Never cross-load loot rarity glow or grant item stats from this library.
 */
