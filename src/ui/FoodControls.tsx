import {CAMP_PROPS} from '../content/scene-props.ts';
import {FOOD_GRAINS} from '../content/food.ts';
import {MUSHROOM_DRYING} from '../content/processing.ts';
import type {FoodGrain} from '../content/food.ts';
import type {InteractionAccess} from '../domain/interaction-access.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';
import type {foodSnapshot} from '../domain/food.ts';

type FoodView=ReturnType<typeof foodSnapshot>;
export function FoodControls({selected,view,workshop,access,disabled,onApproach,onDry,onCook,onEat,onBread,onUnpack,onRead}:{
  selected:string|null;view:FoodView;workshop:WorkshopSnapshot;access:InteractionAccess|null;disabled:boolean;
  onApproach:()=>void;onDry:()=>void;onCook:(grain:FoodGrain)=>void;onEat:()=>void;onBread:()=>void;onUnpack:()=>void;onRead:()=>void;
}){
  const fire=selected===CAMP_PROPS.fire.id,dryer=selected===CAMP_PROPS.dryer.id;
  if(!fire&&!dryer)return null;
  if(access&&!access.near)return <button className="context-button" disabled={disabled} onClick={onApproach}>走近</button>;
  const c=view.counts;
  const pot=(workshop.upgrades['camp-fire:pot']?.level??0)>=1&&workshop.mounted['camp-fire:top']==='camp-fire:hook';
  const mushroom=(c.mushroom??0)+(c['dried-mushroom']??0);
  const rackBuilt=(workshop.upgrades[CAMP_PROPS.dryer.id]?.level??0)>0;
  const grainNames:Record<FoodGrain,string>={'food-oats':'燕麦','food-beans':'干豆','food-rice':'米'};
  return <section className="workshop-controls" aria-label="营地食物">
    {fire&&<>
      <div className="tree-actions">
        <button className="context-button" disabled={disabled||!(c['forest-soup']>0)} onClick={onEat}>喝汤 · {c['forest-soup']??0}</button>
        <button className="context-button" disabled={disabled||!(c['food-black-bread']>0)} onClick={onBread}>吃面包 · {c['food-black-bread']??0}</button>
        <button className="context-button" disabled={disabled} onClick={onRead}>读故事</button>
      </div>
      {!view.heavyWork&&<p className="action-reason">今天不宜重活，吃顿正餐为明天做准备。</p>}
      {view.nextDayReady&&<p>明天可以做重活。</p>}
      {view.cookingProgress!==null&&<p role="status">煮汤中 · {Math.round(view.cookingProgress*100)}%</p>}
      <details className="context-details"><summary>煮汤</summary>
        {!pot?<p>在「改造与修缮」制作汤锅并挂上吊钩。</p>:FOOD_GRAINS.map(grain=><div className="recipe-row" key={grain}>
          <div><strong>菌菇{grainNames[grain]}汤</strong><small>菌类 {mushroom}/1 · {grainNames[grain]} {c[grain]??0}/1</small></div>
          <button className="context-button" disabled={disabled||view.cookingProgress!==null||!mushroom||!(c[grain]>0)} onClick={()=>onCook(grain)}>煮一碗</button>
        </div>)}
      </details>
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
