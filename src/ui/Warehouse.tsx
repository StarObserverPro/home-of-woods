import {useEffect,useRef,useState} from 'react';
import type {ReactNode,PointerEvent} from 'react';
import type {WarehouseView} from '../domain/warehouse-view.ts';
import type {ItemTransferIntent} from '../domain/interaction-access.ts';
import type {WoodcraftSnapshot} from '../app/woodcraft-session.ts';
import {WOODCRAFT} from '../content/woodcraft.ts';
import {GameIcon} from './GameIcon.tsx';
import {itemIcon} from './art-icons.ts';
import type {ArtIconName} from './art-icons.ts';
import './warehouse.css';

const TABS:{id:string;name:string;icon:ArtIconName}[]=[{id:'carrying',name:'随身',icon:'small-pack'},{id:'all',name:'营地',icon:'log-rack'},{id:'furniture',name:'家具',icon:'stump-seat'},{id:'blueprints',name:'图纸',icon:'blueprint'},{id:'wardrobe',name:'穿戴',icon:'wardrobe'}];
export function Warehouse({open,view,woodcraft,onClose,onApproach,onFocus,onThrow,onCollect,onDragStart,dragging,notice,furniture,blueprints,wardrobe,carrying,carrySummary,storageNear,onWithdraw,onApproachStore}:{
  open:boolean;view:WarehouseView;woodcraft:WoodcraftSnapshot;onClose:()=>void;onApproach:()=>void;onFocus:()=>void;
  onThrow:(key:string)=>void;onCollect:(id:string)=>void;onDragStart:(event:PointerEvent<HTMLElement>,item:ItemTransferIntent)=>void;
  dragging:boolean;notice:string;furniture:ReactNode;blueprints:ReactNode;wardrobe:ReactNode;carrying:ReactNode;carrySummary:ReactNode;
  storageNear:boolean;onWithdraw:(key:string)=>void;onApproachStore:()=>void;
}) {
  const panel=useRef<HTMLElement>(null),scroll=useRef<HTMLDivElement>(null);
  const closeRef=useRef(onClose);closeRef.current=onClose;
  const [category,setCategory]=useState('all'),[selectedKey,setSelectedKey]=useState(''),[materialFilter,setMaterialFilter]=useState('all');
  const [query,setQuery]=useState(''),[showEmpty,setShowEmpty]=useState(false),[detailOpen,setDetailOpen]=useState(false);
  useEffect(()=>{if(!open)return;const previous=document.activeElement as HTMLElement|null;panel.current?.focus();return()=>{if(previous?.isConnected)previous.focus({preventScroll:true});};},[open]);
  useEffect(()=>{if(!open)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();closeRef.current();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open]);
  const categoryOrder=new Map(view.categories.map((c,index)=>[c.id,index]));
  const items=view.items.filter(i=>(showEmpty||i.quantity>0)&&(materialFilter==='all'||i.category===materialFilter)&&(i.name+' '+i.qualityName).includes(query.trim())).sort((a,b)=>(categoryOrder.get(a.category)??999)-(categoryOrder.get(b.category)??999)||a.name.localeCompare(b.name,'zh-CN')||a.qualityName.localeCompare(b.qualityName,'zh-CN'));
  const selected=view.items.find(i=>i.key===selectedKey)??items[0];
  const materialTab=category==='all';
  function changeCategory(id:string){setCategory(id);setDetailOpen(false);scroll.current?.scrollTo({top:0});}
  function selectItem(key:string){setSelectedKey(key);setDetailOpen(true);if(window.matchMedia('(max-width:700px)').matches)scroll.current?.scrollTo({top:0});}
  if(!open)return null;
  return <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="false" className={'warehouse-dialog warehouse-dock'+(dragging?' is-dragging':'')+(detailOpen?' show-item-detail':'')} aria-labelledby="warehouse-title" data-transfer-target="warehouse">
    <header className="warehouse-heading"><div className="menu-title"><GameIcon name="inventory" size={38}/><div><h2 id="warehouse-title">物品与仓库</h2><p>{storageNear?'原木架旁 · 可存入、取出':'可远处查看 · 到原木架旁存取'}</p></div></div><button className="menu-close" aria-label="关闭仓库" onClick={onClose}>×</button></header>
    <nav className="warehouse-categories" aria-label="仓库分类">{TABS.map(({id,name,icon})=><button key={id} aria-label={id==='all'?'营地材料':name} aria-pressed={category===id} onClick={()=>changeCategory(id)}><GameIcon name={icon} size={30}/><span>{name}</span></button>)}</nav>
    {category==='carrying'&&<div className="warehouse-carry-summary">{carrySummary}</div>}
    {materialTab&&<div className="warehouse-filters"><label className="menu-search"><span className="sr-only">搜索营地材料</span><input type="search" placeholder="搜索物品或品质" value={query} onChange={e=>{setQuery(e.target.value);setSelectedKey('');setDetailOpen(false);}}/></label><label className="material-filter"><span className="sr-only">材料分类</span><select aria-label="材料分类" value={materialFilter} onChange={e=>{setMaterialFilter(e.target.value);setSelectedKey('');setDetailOpen(false);}}><option value="all">全部类别</option>{view.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}{view.items.some(i=>!i.recognized)&&<option value="unknown">待识别</option>}</select></label><div className="warehouse-filter-meta"><span>{items.length} 个条目 · 点选查看</span><button className="subtle-button" aria-pressed={showEmpty} onClick={()=>{setShowEmpty(v=>!v);setSelectedKey('');setDetailOpen(false);}}>{showEmpty?'✓ 包含未持有':'显示未持有'}</button></div></div>}
    <div ref={scroll} className="warehouse-scroll">
      {materialTab&&<><div className="warehouse-content">
        <div className="warehouse-grid" role="group" aria-label="仓库物品">
          {items.map(item=><button className={'warehouse-item'+(!item.quantity?' is-empty':'')} key={item.key} aria-pressed={selected?.key===item.key} onClick={()=>selectItem(item.key)} aria-label={item.name+' · '+item.qualityName+' '+item.quantity+' 份'}><span className="item-selected-mark" aria-hidden="true">{selected?.key===item.key?'✓':''}</span><GameIcon name={itemIcon(item.itemId)} size={64}/><span className="item-card-name">{item.name}</span><small className={'warehouse-quality'+(item.qualityId==='fine'?' is-fine':'')}>{item.qualityName}</small><strong className="item-quantity">×{item.quantity}</strong></button>)}
          {!items.length&&<div className="menu-empty"><GameIcon name="log-rack" size={64}/><h3>{query||materialFilter!=='all'?'没有匹配的物品':'营地还没有存放材料'}</h3><p>{query||materialFilter!=='all'?'换个名称或类别再看看。':'采到的材料先随身携带，到原木架旁即可存入。'}</p>{!query&&materialFilter==='all'&&<button className="context-button" onClick={()=>changeCategory('carrying')}>查看随身材料</button>}</div>}
        </div>
        {selected&&<section className="warehouse-detail" aria-label="物品详情">
          <button className="item-detail-back subtle-button" onClick={()=>{setDetailOpen(false);requestAnimationFrame(()=>panel.current?.querySelector<HTMLButtonElement>('.warehouse-item[aria-pressed=true]')?.focus());}}>← 返回物品列表</button>
          <div className="warehouse-detail-title"><GameIcon name={itemIcon(selected.itemId)} size={68}/><div><span className="location-label">营地仓库</span><h3>{selected.name}</h3><span>{selected.qualityName} · {selected.quantity>0?'存放 '+selected.quantity+' 份':'当前未持有'}</span></div></div>
          {selected.quantity>0&&selected.recognized&&<div className="warehouse-transfer-action"><span className="location-label">营地 → 随身</span>{storageNear?<button className="context-button primary-action" onClick={()=>onWithdraw(selected.key)}><GameIcon name="small-pack" size={26}/>取出 1 份 · 随身携带</button>:<button className="context-button primary-action" onClick={onApproachStore}>走到原木架 · 再取出</button>}</div>}
          {['wood','branch'].includes(selected.itemId)&&selected.quantity>0&&<div className="warehouse-transfer-action"><span className="location-label">营地 → 场景</span>{woodcraft.near?<><button className="context-button is-draggable" disabled={!selected.movableWood||!woodcraft.ready||woodcraft.count>=WOODCRAFT.maxPieces} onPointerDown={event=>{if(selected.movableWood&&woodcraft.ready&&woodcraft.count<WOODCRAFT.maxPieces)onDragStart(event,{kind:'material',key:selected.key,name:selected.name});}} onClick={()=>onThrow(selected.key)}><GameIcon name="wood-log" size={26}/>摆放 1 根木料</button><small>点击后选落点，或按住拖到场景。</small>{woodcraft.count>=WOODCRAFT.maxPieces&&<p>木料堆已满，先收回一些。</p>}</>:<button className="context-button" onClick={onApproach}>走近木料堆 · 再摆放</button>}</div>}
          {!selected.recognized&&<p className="warehouse-identity">暂不可使用，原有数量已保留。</p>}
          <details className="warehouse-item-notes"><summary>物品说明与用途</summary><p className="item-description">{selected.description}</p>{selected.specification&&<p className="item-specification">{selected.specification}</p>}<div className="warehouse-tags">{selected.tags.map(tag=><span key={tag}>{tag}</span>)}</div><p>来源：{selected.source}</p>{selected.recognized&&<p>{selected.uses.join('、')||'用途待登记'}</p>}{selected.processing.map(p=><p key={p.id}>{p.name} → {p.outputs.join('、')}<small> · {p.status}</small></p>)}</details>
        </section>}
      </div>
      <details className="warehouse-nearby"><summary>地上的木料 <span>{woodcraft.count} / {WOODCRAFT.maxPieces}</span></summary>{woodcraft.near?<div className="nearby-wood-grid">{woodcraft.items.map(item=><div className="nearby-wood-card" key={item.id}><GameIcon name="wood-log" size={44}/><span>{item.name}</span><button className="context-button is-draggable" onPointerDown={event=>onDragStart(event,{kind:'loose-wood',id:item.id,name:item.name})} onClick={()=>onCollect(item.id)} aria-label={'收回'+item.name+' '+item.id}>收回仓库</button></div>)}{!woodcraft.items.length&&<p>这里还没有木料。</p>}</div>:<button className="context-button" onClick={onApproach}>走近木料堆查看</button>}</details></>}
      {category==='carrying'&&carrying}{category==='furniture'&&furniture}{category==='blueprints'&&blueprints}{category==='wardrobe'&&wardrobe}
    </div>
    <footer className="warehouse-return-zone"><p role="status" aria-live="polite">{notice|| (dragging?'拖到这里，收回仓库':'')}</p><span>{dragging?'松手前可取消':'B / Esc 收起'}</span></footer>
  </aside>;
}
