import {BLUEPRINTS,WORKBENCH,WORKBENCH_STOOL,SEAT_DEFINITION,findBlueprint,traitLabel} from '../content/workshop.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';
import type {PlacementDraft} from '../domain/furniture-placement.ts';
import {CLOCK_SPEEDS} from '../domain/local-clock.ts';
import type {ClockSpeed} from '../domain/local-clock.ts';
import './workshop.css';
export function workshopDetails(selected:string|null,view:WorkshopSnapshot){
  if(selected===WORKBENCH.id)return {title:'粗木工作台',tag:'营地木作 · 一级',detail:'学会图纸后，在这里把一份木料做成木墩。工作台与旁边的小凳以后可以升级。'};
  if(selected===WORKBENCH_STOOL.id)return {title:'工作台小凳',tag:'营地家具 · 一级',detail:'几块粗木搭成的小凳，先陪着工作台使用。升级和坐下动作以后开放。'};
  if(selected===CAMP_VISITOR.id)return {title:'林间行商',tag:'图纸交换',detail:'暖木墩图纸常备；另外一份图纸，有时会随当天的货物一起带来。每张先用一份木料交换。'};
  const item=view.items.find(i=>i.instanceId===selected&&i.location.kind==='world');
  return item?{title:findBlueprint(item.blueprintId)?.name??'待识别家具',tag:'已摆放的木作',detail:item.traits.map(t=>`${traitLabel(t.id)} ${t.value}`).join(' · ')}:null;
}
export function Hourglass({view,onSpeed,disabled}:{view:WorkshopSnapshot;onSpeed:(s:ClockSpeed)=>void;disabled:boolean}){
  return <div className="hourglass" role="group" aria-label="本地沙漏"><span aria-hidden="true">⌛</span>{CLOCK_SPEEDS.map(s=><button key={s} disabled={disabled} aria-pressed={view.speed===s} aria-label={`沙漏 ${s} 倍速`} onClick={()=>onSpeed(s)}>{s}×</button>)}</div>;
}
export function WorkshopControls({selected,view,message,disabled,onOffer,onCraft,onTrade,onApproach,onCancel,onPlace,onPack}:{selected:string|null;view:WorkshopSnapshot;message:string;disabled:boolean;onOffer:()=>void;onCraft:(id:string)=>void;onTrade:(id:string)=>void;onApproach:()=>void;onCancel:()=>void;onPlace:(id:string)=>void;onPack:(id:string)=>void}){
  const altar=['grove-altar','grove-altar:oracle'].includes(selected??''),bench=selected===WORKBENCH.id,merchant=selected===CAMP_VISITOR.id,item=view.items.find(i=>i.instanceId===selected);
  if(!altar&&!bench&&!merchant&&!item)return null;
  const busy=!!view.job;
  return <section className="workshop-controls" aria-label="木作与图纸">
    {altar&&<><p>献上一份蘑菇，森林之母会随机回应；不一定带来新图纸。</p><button className="context-button" disabled={disabled||busy} onClick={onOffer}>献上蘑菇 · 祈求神谕</button></>}
    {bench&&<>{BLUEPRINTS.map(p=><div className="recipe-row" key={p.id}><div><strong>{p.name}</strong><small>{p.traitName} {p.value} · 消耗木料 1 份</small></div><button className="context-button" disabled={disabled||busy||!view.blueprints.includes(p.id)} onClick={()=>onCraft(p.id)}>{view.blueprints.includes(p.id)?`制作${p.name}`:'尚未学会'}</button></div>)}{!view.blueprints.length&&<p>先向行商换图纸，或在祭坛献上蘑菇。</p>}</>}
    {merchant&&<><button className="context-button" disabled={disabled||busy} onClick={onApproach}>走到行商身边</button>{view.offers.map(id=>{const p=findBlueprint(id)!;return <div className="recipe-row" key={id}><div><strong>{p.name}</strong><small>{id===BLUEPRINTS[0].id?'常备图纸':'今日随身货'} · 木料 1 份</small></div><button className="context-button" disabled={disabled||busy||view.blueprints.includes(id)} onClick={()=>onTrade(id)}>{view.blueprints.includes(id)?'已经学会':`交换${p.name}图纸`}</button></div>;})}</>}
    {item&&<div className="tree-actions"><button className="context-button" disabled={disabled||busy||item.definitionId!==SEAT_DEFINITION} onClick={()=>onPlace(item.instanceId)}>移动摆放</button><button className="context-button" disabled={disabled||busy||item.definitionId!==SEAT_DEFINITION} onClick={()=>onPack(item.instanceId)}>收回仓库</button></div>}
    {view.job&&<><p>{view.job.phase==='approaching'?'正在走到操作位置…':view.job.kind==='offering'?'正在祈求神谕…':'正在制作木墩…'}</p><progress aria-label="木作或供奉进度" value={view.job.progress} max={1}/><button className="context-button" onClick={onCancel}>取消 · 不扣材料</button></>}
    <p className="action-message" role="status">{message}</p>
  </section>;
}
export function OwnedFurniture({view,onPlace,onPack}:{view:WorkshopSnapshot;onPlace:(id:string)=>void;onPack:(id:string)=>void}){
  return <section className="owned-furniture" aria-label="木作家具"><h3>木作家具 <small>{view.items.filter(i=>i.location.kind==='inventory').length} 件在库 · {view.items.filter(i=>i.location.kind==='world').length} 件已摆放</small></h3><p>每件家具单独保管；摆放、移动和收回不会改变它的词条。当前词条用于区分物品，还不提供制作加速等增益。</p>
    <div className="owned-grid">{view.items.map(item=><article className="owned-card" key={item.instanceId}><div className="stump-icon" aria-hidden="true">▰</div><strong>{findBlueprint(item.blueprintId)?.name??item.definitionId}</strong><p>{item.traits.map(t=>`${traitLabel(t.id)} ${t.value}`).join(' · ')}</p><small>{item.location.kind==='inventory'?'在仓库':`已摆放 (${item.location.x.toFixed(1)}, ${item.location.z.toFixed(1)})`} · 编号 {item.instanceId.split('-').at(-1)}</small><div><button className="context-button" disabled={!!view.job||item.definitionId!==SEAT_DEFINITION} onClick={()=>onPlace(item.instanceId)}>{item.location.kind==='inventory'?'摆放到地上':'移动位置'}</button>{item.location.kind==='world'&&<button className="context-button" disabled={!!view.job||item.definitionId!==SEAT_DEFINITION} onClick={()=>onPack(item.instanceId)}>收回</button>}</div></article>)}</div>
    {!view.items.length&&<p>还没有木作。拿到图纸后，去帐篷前的工作台做第一件。</p>}
  </section>;
}
export function PlacementControls({draft,onRotate,onConfirm,onCancel}:{draft:PlacementDraft|null;onRotate:()=>void;onConfirm:()=>void;onCancel:()=>void}){
  if(!draft)return null;
  return <aside className="placement-panel" aria-label="摆放木墩"><h2>选一处地方放木墩</h2><p>点地面选位置，绿色预览可以摆放；拖动仍可转镜头。</p><p role="status">{draft.point?draft.reason||`位置 (${draft.point.x.toFixed(1)}, ${draft.point.z.toFixed(1)}) 可以摆放。`:'还没有选位置。'}</p><div><button onClick={onRotate}>转 45°</button><button disabled={!draft.point||!!draft.reason} onClick={onConfirm}>确认摆放</button><button onClick={onCancel}>取消</button></div></aside>;
}
