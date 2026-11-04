import {CAMP_PROPS} from '../content/scene-props.ts';
import {FOOD_GRAINS} from '../content/food.ts';
import {MUSHROOM_DRYING} from '../content/processing.ts';
import type {FoodGrain} from '../content/food.ts';
import type {InteractionAccess} from '../domain/interaction-access.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';
import type {foodSnapshot} from '../domain/food.ts';

type FoodView=ReturnType<typeof foodSnapshot>;
export function FoodControls({selected,view,workshop,access,disabled,onApproach,onDry,onCook,onEat,onBread}:{
  selected:string|null;view:FoodView;workshop:WorkshopSnapshot;access:InteractionAccess|null;disabled:boolean;
  onApproach:()=>void;onDry:()=>void;onCook:(grain:FoodGrain)=>void;onEat:()=>void;onBread:()=>void;
}){
  const fire=selected===CAMP_PROPS.fire.id,dryer=selected===CAMP_PROPS.dryer.id;
  if(!fire&&!dryer)return null;
  if(access&&!access.near)return <section className="workshop-controls" aria-label="营地食物">
    <p>距你 {access.distance.toFixed(1)} · 走近后可以操作。</p>
    <button className="context-button" disabled={disabled} onClick={onApproach}>走近{access.name}</button>
  </section>;
  const c=view.counts;
  const pot=(workshop.upgrades['camp-fire:pot']?.level??0)>=1&&workshop.mounted['camp-fire:top']==='camp-fire:hook';
  const mushroom=(c.mushroom??0)+(c['dried-mushroom']??0);
  const rackBuilt=(workshop.upgrades[CAMP_PROPS.dryer.id]?.level??0)>0;
  const grainNames:Record<FoodGrain,string>={'food-oats':'燕麦','food-beans':'干豆','food-rice':'米'};
  return <section className="workshop-controls" aria-label="营地食物">
    {fire&&<>
      <h3>营地野炊 · 菌菇汤</h3>
      <p>基础汤锅装在吊钩上后，用一份鲜菌或干菌，加一份行商谷物做正餐；不需要菜谱。</p>
      <p>鲜菌 {c.mushroom??0} · 干菌 {c['dried-mushroom']??0} · 成品汤 {c['forest-soup']??0}</p>
      {!pot&&<p>先在火塘外部改造里安装「基础悬挂汤锅」，并挂上吊钩。</p>}
      {FOOD_GRAINS.map(grain=><div className="recipe-row" key={grain}>
        <div><strong>菌菇{grainNames[grain]}汤</strong><small>菌类 1 份 + {grainNames[grain]} 1 份 · 在库 {c[grain]??0}</small></div>
        <button className="context-button" disabled={disabled||!pot||view.cookingProgress!==null||!mushroom||!(c[grain]>0)} onClick={()=>onCook(grain)}>煮一碗</button>
      </div>)}
      {view.cookingProgress!==null&&<p>正在煮汤 · {Math.round(view.cookingProgress*100)}%</p>}
      <div className="recipe-row"><div><strong>吃一碗</strong><small>吃过正餐，下一游戏日可以正常采伐成熟树木</small></div>
        <button className="context-button" disabled={disabled||!(c['forest-soup']>0)} onClick={onEat}>享用正餐</button></div>
      <div className="recipe-row"><div><strong>简单吃一份干粮</strong><small>无需锅具 · 用掉一份行商硬黑面包，也能准备明天的重活</small></div><button className="context-button" disabled={disabled||!(c['food-black-bread']>0)} onClick={onBread}>吃黑面包</button></div>
      <p>{view.heavyWork?'今天可以正常进行重体力劳动。':'今天只适合散步、拾枝、采菌等轻活。'}{view.nextDayReady?' 明天的重体力劳动已准备好。':''}</p>
    </>}
    {dryer&&<>
      <h3>蘑菇晾晒</h3>
      <p>{MUSHROOM_DRYING.inputs[0].quantity} 份鲜菌 → {MUSHROOM_DRYING.outputs[0].quantity} 份干菌。使用同一个材料库存和世界时间，不另开加工背包。</p>
      <p>鲜菌 {c.mushroom??0} · 干菌 {c['dried-mushroom']??0}</p>
      {!rackBuilt&&<p>先在下方升级面板用基础图纸和两份枝杈搭建晾晒架。</p>}
      {view.dryingProgress!==null?<p>正在晾晒 · {Math.round(view.dryingProgress*100)}%</p>:<button className="context-button" disabled={disabled||!rackBuilt||(c.mushroom??0)<MUSHROOM_DRYING.inputs[0].quantity} onClick={onDry}>开始晾晒蘑菇</button>}
    </>}
  </section>;
}
