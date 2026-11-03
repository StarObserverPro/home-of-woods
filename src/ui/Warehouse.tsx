import { useEffect, useRef, useState } from 'react';
import type {ReactNode,PointerEvent} from 'react';
import type { WarehouseView } from '../domain/warehouse-view.ts';
import type {ItemTransferIntent} from '../domain/interaction-access.ts';
import type {WoodcraftSnapshot} from '../app/woodcraft-session.ts';
import {WOODCRAFT} from '../content/woodcraft.ts';
import './warehouse.css';

function ItemSymbol({ symbol }: { symbol: 'branch' | 'mushroom' | 'wood' | 'bundle' | 'unknown' }) {
  return <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    {symbol === 'mushroom' ? <><path d="M9 25C10 7 37 7 39 25Z" fill="#d2a268"/><path d="M20 25h9l3 14H17Z" fill="#f0dbaf"/><path d="M10 25h28" stroke="#765c3c" strokeWidth="2"/></> : symbol === 'wood' ? <><path d="m10 31 7-18 23 8-7 18Z" fill="#a77d50"/><ellipse cx="14" cy="22" rx="7" ry="10" transform="rotate(20 14 22)" fill="#e2c08a"/><ellipse cx="14" cy="22" rx="3" ry="5" transform="rotate(20 14 22)" stroke="#957041" strokeWidth="2"/></> : symbol === 'bundle' ? <><rect x="11" y="16" width="26" height="23" rx="3" fill="#ad8960"/><path d="M11 22h26M18 16v23M30 16v23" stroke="#f0d8ae" strokeWidth="2"/><path d="m15 16 7-7h12l-6 7" fill="#bac9a1"/></> : symbol === 'unknown' ? <><rect x="9" y="10" width="30" height="29" rx="6" stroke="#d3caae" strokeWidth="2"/><text x="24" y="31" textAnchor="middle" fill="#d3caae" fontSize="23">?</text></> : <><path d="m10 35 25-23M18 27l-4-13M26 20l13 4M13 36l19-4" stroke="#bd9462" strokeWidth="5" strokeLinecap="round"/></>}
  </svg>;
}

export function Warehouse({open,view,woodcraft,onClose,onApproach,onFocus,onThrow,onCollect,onDragStart,dragging,notice,furniture,blueprints}:{
  open:boolean;view:WarehouseView;woodcraft:WoodcraftSnapshot;onClose:()=>void;onApproach:()=>void;onFocus:()=>void;
  onThrow:(key:string)=>void;onCollect:(id:string)=>void;onDragStart:(event:PointerEvent<HTMLElement>,item:ItemTransferIntent)=>void;
  dragging:boolean;notice:string;furniture:ReactNode;blueprints:ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  const [category,setCategory] = useState('all');
  const [selectedKey,setSelectedKey] = useState('');
  useEffect(()=>{if(!open)return;const previous=document.activeElement as HTMLElement|null;panel.current?.focus();return()=>previous?.focus?.({preventScroll:true});},[open]);
  useEffect(()=>{if(!open)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();closeRef.current();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open]);
  const items = view.items.filter(i => category === 'all' || i.category === category);
  const selected = items.find(i=>i.key===selectedKey) ?? items[0];
  if(!open)return null;
  const materialTab=!['furniture','blueprints'].includes(category);
  return <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="false" className={`warehouse-dialog warehouse-dock${dragging?' is-dragging':''}`} aria-labelledby="warehouse-title" data-transfer-target="warehouse">
    <header className="warehouse-heading"><div><span className="eyebrow">林间所得，慢慢积攒</span><h2 id="warehouse-title">仓库</h2><p>{view.occupiedKinds} 类物品 · 合计 {view.total} 份</p></div><button aria-label="关闭仓库" onClick={onClose}>×</button></header>
    <nav className="warehouse-categories" aria-label="仓库分类">
      {[{id:'all',name:'全部材料'},...view.categories,{id:'furniture',name:'家具'},{id:'blueprints',name:'图纸'},...(view.items.some(i=>!i.recognized)?[{id:'unknown',name:'待识别'}]:[])].map(({id,name})=><button key={id} aria-pressed={category===id} onClick={()=>setCategory(id)}>{name}</button>)}
    </nav>
    {materialTab&&<div className="warehouse-context"><span>木料堆 {woodcraft.count} / {WOODCRAFT.maxPieces}</span><button className="context-button" onClick={woodcraft.near?onFocus:onApproach}>{woodcraft.near?'看向木料堆':'走近木料堆'}</button></div>}
    <div className="warehouse-scroll">
    {materialTab&&<><div className="warehouse-content">
      <div className="warehouse-grid" role="group" aria-label="仓库物品">
        {items.map(item=><button className={`warehouse-item${item.movableWood&&woodcraft.near?' is-draggable':''}`} key={item.key} aria-pressed={selected?.key===item.key} onClick={()=>setSelectedKey(item.key)} onPointerDown={event=>{if(item.movableWood&&woodcraft.near)onDragStart(event,{kind:'material',key:item.key,name:item.name});}} aria-label={`${item.name} · ${item.qualityName} ${item.quantity} 份`}><ItemSymbol symbol={item.symbol}/><span>{item.name}</span><small className={`warehouse-quality${item.qualityId==='fine'?' is-fine':''}`}>{item.qualityName}</small><strong>{item.quantity}<small>份</small></strong>{item.movableWood&&woodcraft.near&&<span className="drag-affordance" aria-hidden="true">⠿</span>}</button>)}
        {!items.length && <p>这一类物品还没有入库。</p>}
      </div>
      {selected && <section className="warehouse-detail" aria-label="物品详情">
        <div className="warehouse-detail-title"><ItemSymbol symbol={selected.symbol}/><div><h3>{selected.name}</h3><span>{selected.qualityName} · 库存 {selected.quantity} 份</span></div></div>
        {!selected.recognized && <p className="warehouse-identity">物品：{selected.itemId}<br/>品质：{selected.qualityId}</p>}
        <p>{selected.description}</p>{selected.specification && <p>{selected.specification}</p>}<div className="warehouse-tags">{selected.tags.map(tag=><span key={tag}>{tag}</span>)}</div>
        <h4>来源</h4><p>{selected.source}</p>
        {['wood','branch'].includes(selected.itemId)&&<div className="warehouse-transfer-action">{!woodcraft.near?<p>走近木料堆后，就可以拖放这批材料。</p>:<><p>按住物品卡，拖到围框里放下一根；也可以点按钮选位置。</p><button className="context-button" disabled={!selected.movableWood||!woodcraft.ready||woodcraft.count>=WOODCRAFT.maxPieces} onClick={()=>onThrow(selected.key)}>放下一根</button>{!selected.quantity&&<p>这批材料已经用完了。</p>}</>}</div>}
        {selected.recognized && <details><summary>用途与加工</summary><p>{selected.typeName} · {selected.materialName}</p><p>{selected.uses.join('、') || '用途待登记'}</p>
        {selected.processing.length>0 && <><h4>加工方向</h4>{selected.processing.map(p=><div className="warehouse-processing" key={p.id}><div><strong>{p.name}</strong><span>{p.status}</span></div><p>可制成{p.outputs.join('、')} · {p.station}</p><small>{p.parametersReady ? '加工条件已登记。' : '配比与耗时待定。'}</small></div>)}</>}
        </details>}
      </section>}
    </div>
    <section className="warehouse-nearby" aria-label="附近的木料">
      <h3>地上的木料 <small>{woodcraft.count} / {WOODCRAFT.maxPieces}</small></h3>
      {woodcraft.near?<><p>地上的木料可以拖回这个面板，也可以点“收回”。</p><div className="nearby-wood-grid">{woodcraft.items.map(item=><div className="nearby-wood-card" key={item.id}><button className="is-draggable" onPointerDown={event=>onDragStart(event,{kind:'loose-wood',id:item.id,name:item.name})} aria-label={`拖回${item.name} ${item.id}`}><ItemSymbol symbol="wood"/><span>{item.name}</span><small>#{item.id.split('-').at(-1)}</small></button><button className="context-button" onClick={()=>onCollect(item.id)}>收回</button></div>)}</div>{!woodcraft.items.length&&<p>这里还没有木料。从仓库拖一根进去试试。</p>}</>:<p>远处可以查看库存，走近后取放木料。</p>}
    </section></>}
    {category==='furniture'&&furniture}
    {category==='blueprints'&&blueprints}
    </div>
    <footer className="warehouse-return-zone"><span>{dragging?'拖到这里，收回仓库':'B / Esc 收起 · 拖拽只在松手时移动物品'}</span><p role="status" aria-live="polite">{notice}</p></footer>
  </aside>;
}
