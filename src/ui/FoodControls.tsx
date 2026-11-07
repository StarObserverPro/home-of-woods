import {ItemBrowser,ItemHeading,MaterialCounts,MenuAction} from './ItemBrowser.tsx';
import {useState} from 'react';
import {GameIcon} from './GameIcon.tsx';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {FOOD_GRAIN_NAMES,POT_MEAL_SERIES} from '../content/food.ts';
import {MUSHROOM_DRYING} from '../content/processing.ts';
import type {FoodGrain} from '../content/food.ts';
import type {InteractionAccess} from '../domain/interaction-access.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';
import type {foodSnapshot} from '../domain/food.ts';
import type {MealVesselsSnapshot} from '../domain/meal-vessels.ts';

type FoodView=ReturnType<typeof foodSnapshot>;
export function FoodControls({selected,view,workshop,access,disabled,mealPlaying=false,vessels,onApproach,onDry,onCook,onCookPorridge,onEat,onEatPorridge,onBread,onUnpack,onRead}:{
  selected:string|null;view:FoodView;workshop:WorkshopSnapshot;access:InteractionAccess|null;disabled:boolean;
  mealPlaying?:boolean;
  vessels?:MealVesselsSnapshot;
  onApproach:()=>void;onDry:()=>void;onCook:(grain:FoodGrain)=>void;onEat:(bowlId?:string)=>void;onBread:()=>void;onUnpack:()=>void;onRead:()=>void;
  onCookPorridge?:(grain:FoodGrain)=>void;onEatPorridge?:(bowlId?:string)=>void;
}){
  const [chosenBowl,setChosenBowl]=useState('');
  const availableBowls=vessels?.bowls.filter(bowl=>bowl.available)??[];
  const bowlId=availableBowls.some(bowl=>bowl.instanceId===chosenBowl)?chosenBowl:undefined;
  const fire=selected===CAMP_PROPS.fire.id,dryer=selected===CAMP_PROPS.dryer.id;
  if(!fire&&!dryer)return null;
  if(access&&!access.near)return <button className="context-button" disabled={disabled} onClick={onApproach}>走近</button>;
  const c=view.counts;
  const pot=(workshop.upgrades['camp-fire:pot']?.level??0)>=1&&workshop.mounted['camp-fire:top']==='camp-fire:hook';
  const mushroom=(c.mushroom??0)+(c['dried-mushroom']??0);
  const rackBuilt=(workshop.upgrades[CAMP_PROPS.dryer.id]?.level??0)>0;
  const locked=disabled||mealPlaying;
  const meals=[
    {id:'soup',name:'菌菇汤',icon:'forest-soup' as const,quantity:c['forest-soup']??0,category:'eat',run:()=>onEat(bowlId),blocked:!(c['forest-soup']>0)},
    {id:'porridge',name:'热粥',icon:'wooden-bowl' as const,quantity:c['grain-porridge']??0,category:'eat',run:()=>onEatPorridge?.(bowlId),blocked:!onEatPorridge||!(c['grain-porridge']>0)},
    {id:'bread',name:'黑面包',icon:'black-bread' as const,quantity:c['food-black-bread']??0,category:'eat',run:onBread,blocked:!(c['food-black-bread']>0)},
    {id:'read',name:'森林故事',icon:'read' as const,category:'eat',run:onRead,blocked:false},
    {id:'sack',name:'粮袋',icon:'trail-rations' as const,quantity:c['trail-rations']??0,category:'eat',run:onUnpack,blocked:!(c['trail-rations']>0)},
    ...view.cookingOptions.map(option=>({id:option.series+option.grain,name:option.name,icon:option.series==='grain-porridge'?'wooden-bowl' as const:'forest-soup' as const,category:'cook',run:()=>option.series==='grain-porridge'?onCookPorridge?.(option.grain):onCook(option.grain),blocked:!pot||!option.canStart||(option.series==='grain-porridge'&&!onCookPorridge),option})),
  ];
  return <section aria-label="营地食物">
    {fire&&<><ItemBrowser label="火塘" items={meals} categories={[{id:'all',name:'全部',icon:'campfire'},{id:'eat',name:'用餐',icon:'wooden-bowl'},{id:'cook',name:'烹煮',icon:'soup-pot'}]} renderDetail={item=><>
      <ItemHeading name={item.name} icon={item.icon} subtitle={item.category==='eat'?(mealPlaying?'正在用餐':view.nextDayReady?'下次日出可做重活':'正餐为下次日出补充体力'):undefined}/>
      {'option' in item&&item.option&&<><MaterialCounts items={[{name:FOOD_GRAIN_NAMES[item.option.grain],available:c[item.option.grain]??0,quantity:1},...(item.option.series==='mushroom-grain-soup'?[{name:'菌菇',available:mushroom,quantity:1}]:[])]}/>{!pot?<p className="wood-reason">先在改造页装好汤锅和吊钩</p>:item.option.reason&&<p className="wood-reason">{item.option.reason}</p>}</>}
      {['soup','porridge'].includes(item.id)&&availableBowls.length>0&&<select aria-label="盛饭的碗" value={bowlId??''} onChange={e=>setChosenBowl(e.target.value)}><option value="">借用碗</option>{availableBowls.map(bowl=><option key={bowl.instanceId} value={bowl.instanceId}>{bowl.name}</option>)}</select>}
      <MenuAction disabled={locked||item.blocked} onClick={item.run}>{item.category==='cook'?'煮一碗':item.id==='read'?'坐下阅读':item.id==='sack'?'拆开':'坐下吃'}</MenuAction>
    </>}/>{view.cookingProgress!==null&&<progress aria-label="烹煮进度" value={view.cookingProgress} max={1}/>}</>}
    {dryer&&<><ItemHeading name="晾晒蘑菇" icon="drying-rack"/><MaterialCounts items={[{name:'菌菇',available:c.mushroom??0,quantity:MUSHROOM_DRYING.inputs[0].quantity}]}/>{!rackBuilt?<p className="wood-reason">先在改造页搭好晾晒架</p>:view.dryingProgress!==null?<progress aria-label="晾晒进度" value={view.dryingProgress} max={1}/>:<MenuAction disabled={disabled||!!view.dryingReason} onClick={onDry}>开始晾晒</MenuAction>}{view.dryingReason&&<p className="wood-reason">{view.dryingReason}</p>}</>}
  </section>;
}
