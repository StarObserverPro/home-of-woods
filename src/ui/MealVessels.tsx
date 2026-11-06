import {WORKBENCH} from '../content/workshop.ts';
import {GameIcon} from './GameIcon.tsx';
import type {MealVesselsSnapshot} from '../domain/meal-vessels.ts';

export function MealVessels({selected,view,disabled,onLearn,onCraft,onApproach}:{
  selected:string|null;view:MealVesselsSnapshot;disabled:boolean;
  onLearn:(id:string)=>void;onCraft:(id:string)=>void;onApproach:()=>void;
}){
  if(selected!==WORKBENCH.id)return null;
  return <details name="workbench-section" className="context-details" aria-label="日用木碗">
    <summary><GameIcon name="wooden-bowl" size={27}/>日用木碗</summary>
    {!view.nearWorkbench?<button className="context-button" disabled={disabled} onClick={onApproach}>走近工作台</button>:view.plans.map(plan=><div className="recipe-row" key={plan.id}>
      <div><strong>{plan.name}</strong><small>原木 {plan.logs}/1 · 做好后可以在火塘旁盛汤或粥。</small></div>
      {!plan.known?<button className="context-button" disabled={disabled||!plan.canLearn} onClick={()=>onLearn(plan.id)}>展开学习</button>:
        <button className="context-button" title={plan.reason} disabled={disabled||!plan.canCraft} onClick={()=>onCraft(plan.id)}>刻制木碗</button>}
    </div>)}
  </details>;
}
export function MealVesselsInventory({view}:{view:MealVesselsSnapshot}){
  if(!view.bowls.length)return null;
  return <section className="owned-furniture" aria-label="餐具"><h3>餐具</h3><div className="owned-grid">
    {view.bowls.map(bowl=><article className="owned-card" key={bowl.instanceId}><GameIcon name="wooden-bowl" size={64}/><strong>{bowl.name}</strong><small>{bowl.rarityName}物品</small>
      <p>{bowl.curtainCall?'饭后谢幕（史诗词条）':'日用餐碗'}</p><small>{bowl.available?'在库存 · 火塘旁用餐时可选':'请先收回库存再使用'}</small>
    </article>)}
  </div></section>;
}
