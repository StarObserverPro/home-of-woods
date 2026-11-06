import type {WorkshopSnapshot} from '../domain/workshop.ts';
import type {housingSnapshot} from '../domain/housing.ts';
import {WORKBENCH,findBlueprint} from '../content/workshop.ts';
import {itemRarity} from '../domain/item-properties.ts';
import {rarityStyle} from './rarity.ts';
import './housing.css';
import {GameIcon} from './GameIcon.tsx';
import {ownedIcon,blueprintSubjectIcon} from './art-icons.ts';

type HousingView=ReturnType<typeof housingSnapshot>;
const BELL='accessory.pinecone-doorbell',BENCH='furniture.guest-bench',TABLE='furniture.prep-side-table';
export const isHousingItem=(definitionId:string)=>[BELL,BENCH,TABLE].includes(definitionId);
const itemName=(definitionId:string)=>definitionId===BELL?'松果门铃':definitionId===TABLE?'备餐边桌':'会客长凳';
const ownedName=(item:HousingView['items'][number])=>findBlueprint(item.blueprintId)?.name??itemName(item.definitionId);

export function housingDetails(id:string|null,view:HousingView){
  const item=view.items.find(i=>i.instanceId===id);
  if(!item)return null;
  return {title:ownedName(item),tag:`${itemRarity(item).name} · ${item.location.kind==='mounted'?'旧木屋门前':item.location.kind==='world'?'营地家具':'在仓库'}`,
    detail:item.definitionId===BELL?'木舌轻撞松果，响一声清脆的木音。可以装在旧木屋门边，也可以完整拆回。':item.definitionId===TABLE?'对齐支撑和桌面做成的小边桌，给火边添一处备餐台面；可以移动或完整收回。':'木料搭成的长凳，坐下来读几页森林故事；想换个景致，可以移动或收回。'};
}

export function HousingControls({selected,view,workshop,disabled,onLearn,onCraft,onMount,onDetach,onRing,onPlace,onPack,onApproach,onRead}:{
  selected:string|null;view:HousingView;workshop:WorkshopSnapshot;disabled:boolean;
  onLearn:(id:string)=>void;onCraft:(id:string)=>void;onMount:(id:string)=>void;onDetach:(id:string)=>void;
  onRing:(id:string)=>void;onPlace:(id:string)=>void;onPack:(id:string)=>void;onApproach:(id:string)=>void;onRead:(id:string)=>void;
}){
  const item=view.items.find(i=>i.instanceId===selected),busy=!!workshop.job;
  if(selected===WORKBENCH.id){
    if(!view.workbenchNear)return null;
    return <section className="housing-controls" aria-label="营地手作">
      <details name="workbench-section" className="context-details"><summary><GameIcon name="pinecone-doorbell" size={27}/>门前与火边的手作</summary>
        {view.plans.map(plan=><article className="housing-recipe" key={plan.id}>
          <strong className="recipe-heading"><GameIcon name={blueprintSubjectIcon(plan.id)} size={36}/>{plan.name}</strong>
          <span>{plan.costs.map(c=>`${c.name} ${c.available}/${c.quantity}`).join(' · ')}</span>
          {plan.learned?<button className="context-button" disabled={disabled||busy||!plan.canCraft} title={plan.reason} onClick={()=>onCraft(plan.id)}>制作{plan.name}</button>:
            <button className="context-button" disabled={disabled||busy} onClick={()=>onLearn(plan.id)}>学会{plan.name}图纸</button>}
          {plan.learned&&!plan.canCraft&&plan.reason&&<small>{plan.reason}</small>}
        </article>)}
      </details>
    </section>;
  }
  const bells=view.items.filter(i=>i.definitionId===BELL&&(i.location.kind==='inventory'||i.location.kind==='mounted'));
  const renderBell=(bell:HousingView['items'][number])=><div className="housing-actions" key={bell.instanceId}>
    <span>{itemName(bell.definitionId)} · {bell.location.kind==='mounted'?'已挂上':'在库'}</span>
    {!view.hostNear?<button className="context-button" disabled={disabled||busy} onClick={()=>onApproach('cabin')}>走近木屋门口</button>:
      bell.location.kind==='mounted'?<><button className="context-button" disabled={disabled||busy} onClick={()=>onRing(bell.instanceId)}>轻摇门铃</button><button className="context-button" disabled={disabled||busy} onClick={()=>onDetach(bell.instanceId)}>拆回仓库</button></>:
      <button className="context-button" disabled={disabled||busy||bells.some(b=>b.location.kind==='mounted')} onClick={()=>onMount(bell.instanceId)}>挂到门边</button>}
  </div>;
  if(selected==='cabin')return <section className="housing-controls" aria-label="木屋门前挂件"><details open={bells.length>0}><summary>门前挂件</summary>{bells.map(renderBell)}{!bells.length&&<p>在工作台学会图纸，用两份枝杈做一只松果门铃。</p>}</details></section>;
  if(!item)return null;
  if(item.definitionId===BELL)return <section className="housing-controls" aria-label="门铃操作">{renderBell(item)}</section>;
  const noun=item.definitionId===TABLE?'边桌':'长凳';
  return <section className="housing-controls" aria-label={`${noun}操作`}><div className="tree-actions">
    {item.definitionId===BENCH&&item.location.kind==='world'&&<button className="context-button" disabled={disabled||busy} onClick={()=>onRead(item.instanceId)}>坐下读故事</button>}
    <button className="context-button" disabled={disabled||busy} onClick={()=>onPlace(item.instanceId)}>{item.location.kind==='world'?`移动${noun}`:`摆放${noun}`}</button>
    {item.location.kind==='world'&&<button className="context-button" disabled={disabled||busy} onClick={()=>onPack(item.instanceId)}>收回仓库</button>}
  </div></section>;
}

export function HousingInventory({view,onSelect}:{view:HousingView;onSelect:(id:string)=>void}){
  return <section className="owned-furniture" aria-label="营地生活物件"><h3>门前与火边</h3><div className="owned-grid">
    {view.items.map(item=><article className="owned-card" key={item.instanceId} style={rarityStyle(item)}>
      <div className="housing-icon"><GameIcon name={ownedIcon(item.definitionId,itemRarity(item).id)} size={64}/></div>
      <strong>{ownedName(item)}</strong><small>{itemRarity(item).name} · {item.location.kind==='inventory'?'在仓库':item.location.kind==='mounted'?'挂在旧木屋':'已摆放'}</small>
      <button className="context-button" onClick={()=>onSelect(item.instanceId)}>查看 · 选择用法</button>
    </article>)}
  </div>{!view.items.length&&<p>先去帐篷旁的工作台，学会门铃和长凳的基础手作图纸。</p>}</section>;
}
