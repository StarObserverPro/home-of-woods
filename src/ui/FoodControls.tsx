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
  return <section className="workshop-controls" aria-label="营地食物">
    {fire&&<>
      {availableBowls.length>0&&<label className="material-filter">盛饭的碗<select aria-label="盛饭的碗" value={bowlId??''} disabled={disabled||mealPlaying} onChange={event=>setChosenBowl(event.target.value)}>
        <option value="">营地借用碗</option>{availableBowls.map(bowl=><option key={bowl.instanceId} value={bowl.instanceId}>{bowl.name}{bowl.curtainCall?' · 饭后谢幕':''}</option>)}
      </select></label>}
      <div className="tree-actions">
        <button className="context-button" disabled={disabled||mealPlaying||!(c['forest-soup']>0)} onClick={()=>onEat(bowlId)}><GameIcon name="forest-soup" size={28}/>坐下喝汤 · {c['forest-soup']??0}</button>
        <button className="context-button" disabled={disabled||mealPlaying||!onEatPorridge||!(c['grain-porridge']>0)} onClick={()=>onEatPorridge?.(bowlId)}>吃热粥 · {c['grain-porridge']??0}</button>
        <button className="context-button" disabled={disabled||mealPlaying||!(c['food-black-bread']>0)} onClick={onBread}><GameIcon name="black-bread" size={28}/>吃黑面包 · {c['food-black-bread']??0}</button>
        <button className="context-button" disabled={disabled||mealPlaying} onClick={onRead}><GameIcon name="read" size={28}/>坐下读故事</button>
      </div>
      {mealPlaying&&<p role="status">慢慢吃一会儿。</p>}
      <p className="food-day-readiness">{view.heavyWork?'现在可以做重活。':'现在可以散步、采菌和拾枝。'} {view.nextDayReady?'下次日出后可以做重活。':'吃一顿正餐，为下次日出做准备。'}</p>
      {view.cookingProgress!==null&&<p role="status">{view.cookingName??'正餐'}正在煮 · {Math.round(view.cookingProgress*100)}%</p>}
      {POT_MEAL_SERIES.map(series=><details className="context-details" key={series}><summary>{series==='grain-porridge'?'煮谷物粥':'煮菌菇汤'}</summary>
        {series==='grain-porridge'&&<p>燕麦、米或杂豆都可以。没有菌类，也能煮一碗主食。</p>}
        {!pot?<p>在「改造与修缮」制作汤锅并挂上吊钩。</p>:view.cookingOptions.filter(option=>option.series===series).map(option=><div className="recipe-row" key={option.grain}>
          <div><strong>{option.name}</strong><small>{series==='mushroom-grain-soup'?`菌类 ${mushroom}/1 · `:''}{FOOD_GRAIN_NAMES[option.grain]} {c[option.grain]??0}/1</small></div>
          <button className="context-button" title={option.reason} disabled={disabled||mealPlaying||!option.canStart||(series==='grain-porridge'&&!onCookPorridge)} onClick={()=>series==='grain-porridge'?onCookPorridge?.(option.grain):onCook(option.grain)}>煮一碗</button>
        </div>)}
      </details>)}
      {(c['trail-rations']??0)>0&&<button className="context-button" disabled={disabled} onClick={onUnpack}>拆开粮袋 · {c['trail-rations']}</button>}
    </>}
    {dryer&&<>
      <p>鲜菌 {c.mushroom??0} · 干菌 {c['dried-mushroom']??0}</p>
      {!rackBuilt?<p>在「改造与修缮」搭建晾晒架。</p>:<>
        <p>{MUSHROOM_DRYING.inputs[0].quantity} 份鲜菌 → {MUSHROOM_DRYING.outputs[0].quantity} 份干菌</p>
        {view.dryingProgress!==null?<p role="status">晾晒中 · {Math.round(view.dryingProgress*100)}%</p>:<button className="context-button" disabled={disabled||(c.mushroom??0)<MUSHROOM_DRYING.inputs[0].quantity} onClick={onDry}>晾晒蘑菇</button>}
      </>}
    </>}
  </section>;
}
