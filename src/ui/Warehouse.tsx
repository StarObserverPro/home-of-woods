import { useEffect, useRef, useState } from 'react';
import type { WarehouseView } from '../domain/warehouse-view.ts';
import './warehouse.css';

function ItemSymbol({ symbol }: { symbol: 'branch' | 'mushroom' | 'wood' | 'unknown' }) {
  return <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    {symbol === 'mushroom' ? <><path d="M9 25C10 7 37 7 39 25Z" fill="#d2a268"/><path d="M20 25h9l3 14H17Z" fill="#f0dbaf"/><path d="M10 25h28" stroke="#765c3c" strokeWidth="2"/></> : symbol === 'wood' ? <><path d="m10 31 7-18 23 8-7 18Z" fill="#a77d50"/><ellipse cx="14" cy="22" rx="7" ry="10" transform="rotate(20 14 22)" fill="#e2c08a"/><ellipse cx="14" cy="22" rx="3" ry="5" transform="rotate(20 14 22)" stroke="#957041" strokeWidth="2"/></> : symbol === 'unknown' ? <><rect x="9" y="10" width="30" height="29" rx="6" stroke="#d3caae" strokeWidth="2"/><text x="24" y="31" textAnchor="middle" fill="#d3caae" fontSize="23">?</text></> : <><path d="m10 35 25-23M18 27l-4-13M26 20l13 4M13 36l19-4" stroke="#bd9462" strokeWidth="5" strokeLinecap="round"/></>}
  </svg>;
}

export function Warehouse({ open, view, onClose }: { open: boolean; view: WarehouseView; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [category,setCategory] = useState('all');
  const [selectedKey,setSelectedKey] = useState('');
  useEffect(() => { if(open && !dialog.current?.open) dialog.current?.showModal(); else if(!open) dialog.current?.close(); },[open]);
  const items = view.items.filter(i => category === 'all' || i.category === category);
  const selected = items.find(i=>i.key===selectedKey) ?? items[0];
  return <dialog ref={dialog} className="warehouse-dialog" aria-labelledby="warehouse-title" onCancel={e=>{e.preventDefault();onClose();}}>
    <header className="warehouse-heading"><div><span className="eyebrow">林间所得，慢慢积攒</span><h2 id="warehouse-title">仓库</h2><p>{view.occupiedKinds} 类物品 · 合计 {view.total} 份</p></div><button aria-label="关闭仓库" onClick={onClose}>×</button></header>
    <nav className="warehouse-categories" aria-label="仓库分类">
      {[{id:'all',name:'全部'},...view.categories,{id:'unknown',name:'待识别'}].map(({id,name})=><button key={id} aria-pressed={category===id} onClick={()=>setCategory(id)}>{name}</button>)}
    </nav>
    <div className="warehouse-content">
      <div className="warehouse-grid" role="group" aria-label="仓库物品">
        {items.map(item=><button className="warehouse-item" key={item.key} aria-pressed={selected?.key===item.key} onClick={()=>setSelectedKey(item.key)} aria-label={`${item.name} · ${item.qualityName} ${item.quantity} 份`}><ItemSymbol symbol={item.symbol}/><span>{item.name}</span><small className={`warehouse-quality${item.qualityId==='fine'?' is-fine':''}`}>{item.qualityName}</small><strong>{item.quantity}<small>份</small></strong></button>)}
        {!items.length && <p>这一类物品还没有入库。</p>}
      </div>
      {selected && <section className="warehouse-detail" aria-label="物品详情">
        <div className="warehouse-detail-title"><ItemSymbol symbol={selected.symbol}/><div><h3>{selected.name}</h3><span>{selected.qualityName} · 库存 {selected.quantity} 份</span></div></div>
        {!selected.recognized && <p className="warehouse-identity">物品：{selected.itemId}<br/>品质：{selected.qualityId}</p>}
        <p>{selected.description}</p><div className="warehouse-tags">{selected.tags.map(tag=><span key={tag}>{tag}</span>)}</div>
        <h4>来源</h4><p>{selected.source}</p>
        {selected.recognized && <><h4>类型与通用去处</h4><p>{selected.typeName} · {selected.materialName}</p><p>{selected.uses.join('、') || '用途待登记'}</p><small>相关经营用途后续开放。</small></>}
        {selected.processing.length>0 && <><h4>加工方向</h4>{selected.processing.map(p=><div className="warehouse-processing" key={p.id}><div><strong>{p.name}</strong><span>{p.status}</span></div><p>可制成{p.outputs.join('、')} · {p.station}</p><small>{p.parametersReady ? '加工条件已登记。' : '配比与耗时待定。'}</small></div>)}</>}
      </section>}
    </div>
    <footer>采集所得直接入库。按 B 或 Esc 收起，继续巡林。</footer>
  </dialog>;
}
