import {WoodStock} from './WoodStock.tsx';
import {TransferQuantity,transferAmount} from './TransferQuantity.tsx';
import type {TransferAmount} from './TransferQuantity.tsx';
import {ItemBrowser,IconTabs,WoodHeading,ItemHeading,ItemNotes,MenuAction} from './ItemBrowser.tsx';
import {useEffect,useRef,useState} from 'react';
import type {ReactNode,PointerEvent} from 'react';
import type {WarehouseView} from '../domain/warehouse-view.ts';
import type {ItemTransferIntent} from '../domain/interaction-access.ts';
import type {WoodcraftSnapshot} from '../app/woodcraft-session.ts';
import {woodcraftItem} from '../domain/woodcraft.ts';
import {WOODCRAFT} from '../content/woodcraft.ts';
import {GameIcon} from './GameIcon.tsx';
import {itemIcon} from './art-icons.ts';
import type {ArtIconName} from './art-icons.ts';
import './warehouse.css';

const TABS:{id:string;name:string;icon:ArtIconName}[]=[{id:'carrying',name:'随身',icon:'small-pack'},{id:'all',name:'营地',icon:'log-rack'},{id:'furniture',name:'家具',icon:'stump-seat'},{id:'blueprints',name:'图纸',icon:'blueprint'},{id:'wardrobe',name:'穿戴',icon:'wardrobe'}];
export function Warehouse({open,view,woodcraft,onClose,onApproach,onFocus,onThrow,onCollect,onDragStart,dragging,notice,furniture,blueprints,wardrobe,carrying,carrySummary,storageNear,onWithdraw,onApproachStore,onCollectAll}:{
  open:boolean;view:WarehouseView;woodcraft:WoodcraftSnapshot;onClose:()=>void;onApproach:()=>void;onFocus:()=>void;
  onThrow:(key:string)=>void;onCollect:(id:string)=>void;onDragStart:(event:PointerEvent<HTMLElement>,item:ItemTransferIntent)=>void;
  dragging:boolean;notice:string;furniture:ReactNode;blueprints:ReactNode;wardrobe:ReactNode;carrying:ReactNode;carrySummary:ReactNode;
  onCollectAll:()=>void;storageNear:boolean;onWithdraw:(key:string,quantity:number|'max')=>void;onApproachStore:()=>void;
}) {
  const panel=useRef<HTMLElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
  const [amount,setAmount]=useState<TransferAmount>('max');
  const [category,setCategory]=useState('carrying'),[materialFilter,setMaterialFilter]=useState('all');
  useEffect(()=>{if(!open)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();closeRef.current();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open]);
  const items=view.items.filter(i=>i.quantity>0&&(materialFilter==='all'||i.category===materialFilter)).map(item=>({...item,id:item.key,icon:itemIcon(item.itemId),badge:item.qualityName}));
  if(!open)return null;
  return <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="false" className={'warehouse-dialog warehouse-dock'+(dragging?' is-dragging':'')} aria-label="物品与仓库" data-transfer-target="warehouse">
    <WoodHeading title="物品" icon="inventory" onClose={onClose} closeLabel="关闭仓库"/>
    <IconTabs tabs={[...TABS,{id:'ground',name:'木料堆',icon:'wood-log'}]} value={category} onChange={setCategory} label="物品位置"/>
    {category==='carrying'&&<><div className="warehouse-carry-summary">{carrySummary}</div>{carrying}</>}
    {category==='all'&&<div className="warehouse-tools"><TransferQuantity value={amount} onChange={setAmount}/><select aria-label="材料分类" value={materialFilter} onChange={e=>setMaterialFilter(e.target.value)}><option value="all">全部类别</option>{view.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
    {category==='all'&&<ItemBrowser items={items} label="营地材料" canDragItem={item=>!!item.movableWood} onItemPointerDown={(event,item)=>onDragStart(event,{kind:'material',key:item.key,name:item.name})} renderDetail={item=><>
      <ItemHeading name={item.name} icon={item.icon} subtitle={`${item.qualityName} · ${item.quantity} 份`}/>
      <ItemNotes text={`${item.description} ${item.specification??''} ${item.uses.join('、')}`}><div className="wood-actions">
      {item.recognized&&<MenuAction icon="small-pack" onClick={()=>storageNear?onWithdraw(item.key,transferAmount(amount,item.quantity)):onApproachStore()}>{storageNear?'取出所选数量':'走近取出'}</MenuAction>}
      {woodcraftItem(item.itemId)&&<MenuAction icon={item.icon??undefined} disabled={woodcraft.near&&(!item.movableWood||!woodcraft.ready||woodcraft.count>=WOODCRAFT.maxPieces)} onClick={()=>woodcraft.near?onThrow(item.key):onApproach()}>{woodcraft.near?'投放 1 份':'走近木料区'}</MenuAction>}
      </div></ItemNotes>
    </>}/>}
    {category==='ground'&&<div className="wood-pile-toolbar"><WoodStock view={woodcraft}/><MenuAction disabled={!woodcraft.items.length||(woodcraft.near&&!woodcraft.ready)} onClick={()=>woodcraft.near?onCollectAll():onApproach()}>{woodcraft.near?'全部收回仓库':'走近木料区'}</MenuAction></div>}
    {category==='ground'&&<ItemBrowser items={woodcraft.items.map(item=>({...item,icon:itemIcon(item.itemId),quantity:1,badge:item.queued?'待落稳':undefined}))} label="木料堆材料" canDragItem={()=>woodcraft.near&&woodcraft.ready} onItemPointerDown={(event,item)=>onDragStart(event,{kind:'loose-wood',id:item.id,name:item.name})} renderDetail={item=><><ItemHeading name={item.name} icon={item.icon} subtitle={item.queued?'待落稳 · 1 份':'木料堆中 · 1 份'}/><MenuAction onClick={()=>woodcraft.near?onCollect(item.id):onApproach()}>{woodcraft.near?'收回仓库':'走近木料区'}</MenuAction></>}/>}
    {category==='furniture'&&furniture}{category==='blueprints'&&blueprints}{category==='wardrobe'&&wardrobe}
    <footer className="wood-status" role="status" aria-live="polite">{notice||'按住木料或家具图标拖动，松手放下。'}</footer>
  </aside>;
}
