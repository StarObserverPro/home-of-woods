import type {CarryingSnapshot,CarryIntent} from '../domain/carrying.ts';
import type {WarehouseView} from '../domain/warehouse-view.ts';
import './carrying.css';
import {GameIcon} from './GameIcon.tsx';
import {itemIcon} from './art-icons.ts';
export function CarryingSummary({view}:{view:CarryingSnapshot}){
  return <span>随身 {view.weight.toFixed(1)} / {view.weightLimit} 负重 · {view.bulk.toFixed(1)} / {view.bulkLimit} 空间 · 步速 {Math.round(view.speed*100)}%</span>;
}
export function CarryingControls({view,warehouse,message,onChange,onHome,onApproach}:{view:CarryingSnapshot;warehouse:WarehouseView;message:string;onChange:(intent:CarryIntent)=>void;onHome:()=>void;onApproach:(id:string)=>void}){
  return <section className="carrying-panel" aria-label="随身与搬运">
    <h3>随身材料</h3>
    <label>负重<progress aria-label="随身负重" value={view.weight} max={view.weightLimit}/></label>
    <label>占用空间<progress aria-label="携带空间" value={view.bulk} max={view.bulkLimit}/></label>
    <div className="carrying-actions"><button aria-pressed={view.method==='hands'} onClick={()=>onChange({kind:'method',method:'hands'})}>散拿</button><button aria-pressed={view.method==='bundle'} onClick={()=>onChange({kind:'method',method:'bundle'})}>整理打捆</button></div>
    <details className="context-details"><summary>搬运说明</summary><p>负重和空间占用越高，走得越慢。打捆可节省枝杈占用的空间；放下的材料留在原地。</p></details>
    {view.items.length?<div className="carrying-list">{view.items.map(item=><div key={item.key}><span className="carrying-item-label"><GameIcon name={itemIcon(item.itemId)} size={36}/>{item.name} × {item.quantity}</span><button onClick={()=>onChange({kind:'drop',key:item.key})}>放地上 1 份</button>{item.quantity>1&&<button onClick={()=>onChange({kind:'drop',key:item.key,quantity:item.quantity})}>全部放地上</button>}</div>)}</div>:<div className="menu-empty"><GameIcon name="small-pack" size={64}/><h3>现在两手空空</h3><p>采到的材料先随身携带，回到原木架旁再存入营地。</p></div>}
    <div className="carrying-actions">{view.storageNear?<button className="context-button primary-action" disabled={!view.items.length} onClick={()=>onChange({kind:'store'})}><GameIcon name="log-rack" size={28}/>全部存入营地仓库</button>:<button className="context-button" onClick={onHome}>走到原木架 · 再存入</button>}</div>
    {view.ground.length>0&&<details className="context-details"><summary>地上的材料 · {view.ground.length}</summary>
    <div className="carrying-list">{view.ground.slice(0,12).map(item=><div key={item.id}><span>{item.name} × {item.quantity}<small>距你 {item.distance.toFixed(1)}</small></span>{item.near?<button disabled={!!item.takeReason} title={item.takeReason} onClick={()=>onChange({kind:'take',key:item.key})}>拿起一份</button>:<button onClick={()=>onApproach(item.id)}>走近</button>}</div>)}</div>
    </details>}
    <details><summary>从营地取出材料</summary>{!view.storageNear?<button onClick={onHome}>先走近原木架</button>:<div className="carrying-list">{warehouse.items.filter(item=>item.quantity>0).map(item=><div key={item.key}><span>{item.name} × {item.quantity}</span><button disabled={!item.recognized} onClick={()=>onChange({kind:'withdraw',key:item.key})}>取出一份</button></div>)}</div>}</details>
    <p className="carrying-notice" role="status" aria-live="polite">{message}</p>
  </section>;
}
export function carryingDetails(id:string|null,view:CarryingSnapshot){
  const item=view.ground.find(s=>s.id===id);
  return item?{title:`${item.name} × ${item.quantity}`,tag:'待搬运材料',detail:`距你 ${item.distance.toFixed(1)}。拿起后随身携带，回到原木架旁才能存入营地。`}:null;
}
export function GroundCarryControls({id,view,onChange,onApproach}:{id:string|null;view:CarryingSnapshot;onChange:(intent:CarryIntent)=>void;onApproach:(id:string)=>void}){
  const item=view.ground.find(s=>s.id===id);if(!item)return null;
  return <div className="tree-actions">{item.near?<button className="context-button" disabled={!!item.takeReason} title={item.takeReason} onClick={()=>onChange({kind:'take',key:item.key})}>拿起一份</button>:<button className="context-button" onClick={()=>onApproach(item.id)}>走近材料</button>}{item.near&&item.takeReason&&<p>{item.takeReason}</p>}</div>;
}
