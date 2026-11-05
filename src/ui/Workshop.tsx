import {rarityStyle} from './rarity.ts';
import {itemProperties,itemRarity} from '../domain/item-properties.ts';
import {CRAFT_BLUEPRINTS,CAMP_EXTERIOR_BLUEPRINTS,WORKBENCH,WORKBENCH_STOOL,SEAT_DEFINITION,findBlueprint,traitLabel} from '../content/workshop.ts';
import type {PointerEvent} from 'react';
import {ITEM_REACH} from '../domain/interaction-access.ts';
import type {InteractionAccess,ItemTransferIntent} from '../domain/interaction-access.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';
import type {PlacementDraft} from '../domain/furniture-placement.ts';
import {CLOCK_SPEEDS} from '../domain/local-clock.ts';
import type {ClockSpeed} from '../domain/local-clock.ts';
import './workshop.css';
export function workshopDetails(selected:string|null,view:WorkshopSnapshot){
  if(selected===WORKBENCH.id)return {title:'粗木工作台',tag:'营地木作 · 一级',detail:'学会图纸后，在这里把一份木料做成木墩。工作台与旁边的小凳以后可以升级。'};
  if(selected===WORKBENCH_STOOL.id)return {title:'工作台小凳',tag:'营地家具 · 一级',detail:'几块粗木搭成的小凳，先陪着工作台使用。升级和坐下动作以后开放。'};
  if(selected===CAMP_VISITOR.id)return {title:'林间行商',tag:'图纸与材料',detail:'行商带着外装图纸、五金和混合干粮。换一麻袋食品即可一次补充几种谷物与少量调味品。'};
  const item=view.items.find(i=>i.instanceId===selected&&i.location.kind==='world');
  return item?{title:findBlueprint(item.blueprintId)?.name??'待识别家具',tag:`${itemRarity(item).name} · 已摆放的木作`,detail:itemProperties(item).traits.map(t=>`${traitLabel(t.id)} ${t.value}`).join(' · ')}:null;
}
export function Hourglass({view,onSpeed,disabled}:{view:WorkshopSnapshot;onSpeed:(s:ClockSpeed)=>void;disabled:boolean}){
  return <details className="clock-menu" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus();}}}><summary aria-label="沙漏速度"><svg width="18" height="20" viewBox="0 0 18 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 2h12M3 18h12M4 2v3l10 10v3M14 2v3L4 15v3"/></svg> {view.speed===0?'已停':`${view.speed}×`}</summary><div className="hourglass" role="group" aria-label="沙漏速度">{CLOCK_SPEEDS.map(s=><button key={s} disabled={disabled} aria-pressed={view.speed===s} aria-label={s===0?'停住沙漏':`沙漏 ${s} 倍速`} onClick={event=>{onSpeed(s);const menu=event.currentTarget.closest('details');if(menu)menu.open=false;}}>{s===0?'停':`${s}×`}</button>)}</div></details>;
}
export function WorkshopControls({selected,view,access,message,disabled,onOffer,onCraft,onTrade,onSupply,onApproach,onCancel,onPlace,onPack}:{selected:string|null;view:WorkshopSnapshot;access:InteractionAccess|null;message:string;disabled:boolean;onOffer:()=>void;onCraft:(id:string)=>void;onTrade:(id:string)=>void;onSupply:(id:string)=>void;onApproach:()=>void;onCancel:()=>void;onPlace:(id:string)=>void;onPack:(id:string)=>void}){
  const altar=['grove-altar','grove-altar:oracle'].includes(selected??''),bench=selected===WORKBENCH.id,merchant=selected===CAMP_VISITOR.id,item=view.items.find(i=>i.instanceId===selected);
  if(!altar&&!bench&&!merchant&&!item)return null;
  const busy=!!view.job;
  if(access&&!access.near&&!busy)return <section className="workshop-controls" aria-label="木作与图纸"><p>距你 {access.distance.toFixed(1)} · 走近后可以操作。</p><button className="context-button" disabled={disabled} onClick={onApproach}>走近{access.name}</button></section>;
  return <section className="workshop-controls" aria-label="木作与图纸">
    {altar&&<><p>献上一份蘑菇，森林之母会随机回应；不一定带来新图纸。</p><button className="context-button" disabled={disabled||busy||!view.inputs.offering} onClick={onOffer}>献上蘑菇 · 祈求神谕</button>{!view.inputs.offering&&<p>需要一份蘑菇。</p>}</>}
    {bench&&<>{CRAFT_BLUEPRINTS.map(p=><div className="recipe-row" key={p.id}><div><strong>{p.name}</strong><small>{p.traitName} {p.value} · 消耗木料 1 份</small></div><button className="context-button" disabled={disabled||busy||!view.availableBlueprints.includes(p.id)||!view.inputs.craft} onClick={()=>onCraft(p.id)}>{view.availableBlueprints.includes(p.id)?`制作${p.name}`:'尚未学会'}</button></div>)}{!CRAFT_BLUEPRINTS.some(p=>view.availableBlueprints.includes(p.id))&&<p>先向行商换图纸，或在祭坛献上蘑菇。</p>}{!view.inputs.craft&&<p>需要一份未预留的木料。</p>}</>}
    {merchant&&null}
    {item&&<div className="tree-actions"><button className="context-button" disabled={disabled||busy||item.definitionId!==SEAT_DEFINITION} onClick={()=>onPlace(item.instanceId)}>移动摆放</button><button className="context-button" disabled={disabled||busy||item.definitionId!==SEAT_DEFINITION} onClick={()=>onPack(item.instanceId)}>收回仓库</button></div>}
    {view.job&&<><p>{view.job.phase==='approaching'?'正在走到操作位置…':view.job.kind==='offering'?'正在祈求神谕…':'正在制作木墩…'}</p><progress aria-label="木作或供奉进度" value={view.job.progress} max={1}/><button className="context-button" onClick={onCancel}>取消</button></>}

  </section>;
}
export function OwnedFurniture({view,player,onPlace,onPack,onApproach,onDragStart}:{view:WorkshopSnapshot;player:{x:number;z:number};onPlace:(id:string)=>void;onPack:(id:string)=>void;onApproach:(id:string)=>void;onDragStart:(event:PointerEvent<HTMLElement>,item:ItemTransferIntent)=>void}){
  const furniture=view.items.filter(item=>item.definitionId===SEAT_DEFINITION);
  return <section className="owned-furniture" aria-label="木作家具">
    <h3>木作家具 <small>{furniture.filter(i=>i.location.kind==='inventory').length} 件在库 · {furniture.filter(i=>i.location.kind==='world').length} 件已摆放</small></h3>

    <div className="owned-grid">{furniture.map(item=>{
      const rarity=itemRarity(item),traits=itemProperties(item).traits,near=item.location.kind==='inventory'||item.location.kind==='world'&&Math.hypot(player.x-item.location.x,player.z-item.location.z)<=ITEM_REACH;
      return <article className="owned-card" key={item.instanceId} data-rarity={rarity.id} style={rarityStyle(item)}>
        <div className="rarity-icon-row"><button className={`stump-icon${near?' is-draggable':''}`} aria-label={`拖动${findBlueprint(item.blueprintId)?.name??'家具'}`} onPointerDown={event=>{if(near)onDragStart(event,{kind:'furniture',id:item.instanceId,name:findBlueprint(item.blueprintId)?.name??'家具'});}}>▰</button><span className="rarity-label">{rarity.name}</span></div>
        <strong className="rarity-name">{findBlueprint(item.blueprintId)?.name??item.definitionId}</strong>
        <p>{traits.length?traits.map(t=>`${traitLabel(t.id)} ${t.value}`).join(' · '):'暂无额外词条'}</p>
        <small>{item.location.kind==='inventory'?'在仓库':item.location.kind==='world'?'已摆放':`已安装在 ${item.location.hostId}`}</small>
        <div>{item.location.kind==='mounted'?<small>此处不能对宿主附件进行家具摆放操作。</small>:!near?<button className="context-button" disabled={!!view.job} onClick={()=>onApproach(item.instanceId)}>走近这件家具</button>:<><button className="context-button" disabled={!!view.job||item.definitionId!==SEAT_DEFINITION} onClick={()=>onPlace(item.instanceId)}>{item.location.kind==='inventory'?'摆放到地上':'移动位置'}</button>
          {item.location.kind==='world'&&<button className="context-button" disabled={!!view.job||item.definitionId!==SEAT_DEFINITION} onClick={()=>onPack(item.instanceId)}>收回</button>}</>}</div>
      </article>;
    })}</div>
    {!furniture.length&&<p>还没有木作。拿到图纸后，去帐篷前的工作台做第一件。</p>}
  </section>;
}
export function PlacementControls({draft,onRotate,onConfirm,onCancel}:{draft:PlacementDraft|null;onRotate:()=>void;onConfirm:()=>void;onCancel:()=>void}){
  if(!draft)return null;
  return <aside className="placement-panel" aria-label="摆放木墩"><h2>选一处地方放木墩</h2><p>点地面选位置，绿色预览可以摆放；拖动仍可转镜头。</p><p role="status">{draft.point?draft.reason||`位置 (${draft.point.x.toFixed(1)}, ${draft.point.z.toFixed(1)}) 可以摆放。`:'还没有选位置。'}</p><div><button onClick={onRotate}>转 45°</button><button disabled={!draft.point||!!draft.reason} onClick={onConfirm}>确认摆放</button><button onClick={onCancel}>取消</button></div></aside>;
}
