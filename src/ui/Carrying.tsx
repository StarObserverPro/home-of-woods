import {TransferQuantity,transferAmount} from './TransferQuantity.tsx';
import type {TransferAmount} from './TransferQuantity.tsx';
import {useState} from 'react';
import type {PointerEvent} from 'react';
import type {ItemTransferIntent} from '../domain/interaction-access.ts';
import {ItemBrowser,ItemHeading,MenuAction} from './ItemBrowser.tsx';
import type {WoodcraftSnapshot} from '../app/woodcraft-session.ts';
import {woodcraftItem} from '../domain/woodcraft.ts';
import {WOODCRAFT} from '../content/woodcraft.ts';
import type {CarryingSnapshot,CarryIntent} from '../domain/carrying.ts';
import type {WarehouseView} from '../domain/warehouse-view.ts';
import './carrying.css';
import {GameIcon} from './GameIcon.tsx';
import {itemIcon} from './art-icons.ts';
export function CarryingSummary({view}:{view:CarryingSnapshot}){
  return <span>随身 {view.weight.toFixed(1)} / {view.weightLimit} 负重 · {view.bulk.toFixed(1)} / {view.bulkLimit} 空间 · 步速 {Math.round(view.speed*100)}%</span>;
}
export function CarryingControls({view,warehouse,woodcraft,message,onChange,onHome,onApproach,onWood,onThrow,onDragStart}:{woodcraft:WoodcraftSnapshot;onWood:()=>void;onThrow:(key:string)=>void;view:CarryingSnapshot;warehouse:WarehouseView;message:string;onChange:(intent:CarryIntent)=>void;onHome:()=>void;onApproach:(id:string)=>void;onDragStart?:(event:PointerEvent<HTMLElement>,item:ItemTransferIntent)=>void}){
  const [place,setPlace]=useState('pack');
  const [amount,setAmount]=useState<TransferAmount>('max');
  return <section className="carrying-panel" aria-label="随身与搬运">
    <div className="wood-actions"><MenuAction secondary onClick={()=>onChange({kind:'method',method:view.method==='hands'?'bundle':'hands'})}>{view.method==='hands'?'整理打捆':'改为散拿'}</MenuAction><MenuAction icon="log-rack" disabled={view.storageNear&&!view.items.length} onClick={()=>view.storageNear?onChange({kind:'store'}):onHome()}>{view.storageNear?'全部存入':'走近仓库'}</MenuAction><MenuAction secondary onClick={()=>setPlace(place==='pack'?'ground':'pack')}>{place==='pack'?'地上材料':'随身材料'}</MenuAction></div>
    <TransferQuantity value={amount} onChange={setAmount}/>{place==='pack'?<ItemBrowser items={view.items.map(item=>({...item,id:item.key,icon:itemIcon(item.itemId)}))} label="随身材料" canDragItem={item=>woodcraftItem(item.itemId)} onItemPointerDown={onDragStart?(event,item)=>onDragStart(event,{kind:'material',key:item.key,name:item.name}):undefined} renderDetail={item=><>
      <ItemHeading name={item.name} icon={item.icon} subtitle={`×${item.quantity}`}/><div className="wood-actions">
      <MenuAction onClick={()=>view.storageNear?onChange({kind:'store',key:item.key}):onHome()}>{view.storageNear?'存入营地':'走近仓库'}</MenuAction>
      <MenuAction secondary onClick={()=>onChange({kind:'drop',key:item.key,quantity:transferAmount(amount,item.quantity)})}>放下所选数量</MenuAction>
      {woodcraftItem(item.itemId)&&<MenuAction disabled={woodcraft.count>=WOODCRAFT.maxPieces} onClick={()=>woodcraft.near&&woodcraft.ready?onThrow(item.key):onWood()}>投放木料</MenuAction>}
      </div></>}/>:<ItemBrowser items={view.ground.map(item=>({...item,icon:itemIcon(item.itemId)}))} label="地上材料" renderDetail={item=><><ItemHeading name={item.name} icon={item.icon} subtitle={`距离 ${item.distance.toFixed(1)}`}/><MenuAction disabled={item.near&&!!item.takeReason} onClick={()=>item.near?onChange({kind:'take',key:item.key,quantity:transferAmount(amount,item.quantity)}):onApproach(item.id)}>{item.near?'拿起所选数量':'走近'}</MenuAction>{item.takeReason&&<p className="wood-reason">{item.takeReason}</p>}</>}/>}
  </section>;
}

export function carryingDetails(id:string|null,view:CarryingSnapshot){
  const item=view.ground.find(s=>s.id===id);
  return item?{title:`${item.name} × ${item.quantity}`,tag:'待搬运材料',detail:`距你 ${item.distance.toFixed(1)}。拿起后随身携带，回到原木架旁才能存入营地。`}:null;
}
export function GroundCarryControls({id,view,onChange,onApproach}:{id:string|null;view:CarryingSnapshot;onChange:(intent:CarryIntent)=>void;onApproach:(id:string)=>void}){
  const item=view.ground.find(s=>s.id===id);if(!item)return null;
  return <div className="tree-actions">{item.near?<button className="context-button" disabled={!!item.takeReason} title={item.takeReason} onClick={()=>onChange({kind:'take',key:item.key,quantity:'max'})}>尽量拿起</button>:<button className="context-button" onClick={()=>onApproach(item.id)}>走近材料</button>}{item.near&&item.takeReason&&<p>{item.takeReason}</p>}</div>;
}
