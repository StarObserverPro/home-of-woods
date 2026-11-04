import type {CarryingSnapshot,CarryIntent} from '../domain/carrying.ts';
import type {WarehouseView} from '../domain/warehouse-view.ts';
import './carrying.css';
export function CarryingSummary({view}:{view:CarryingSnapshot}){
  return <span>随身 {view.weight.toFixed(1)} / {view.weightLimit} 负重 · {view.bulk.toFixed(1)} / {view.bulkLimit} 空间 · 步速 {Math.round(view.speed*100)}%</span>;
}
export function CarryingControls({view,warehouse,message,onChange,onHome,onApproach}:{view:CarryingSnapshot;warehouse:WarehouseView;message:string;onChange:(intent:CarryIntent)=>void;onHome:()=>void;onApproach:(id:string)=>void}){
  return <section className="carrying-panel" aria-label="随身与搬运">
    <h3>随身材料</h3><CarryingSummary view={view}/>
    <label>负重<progress aria-label="随身负重" value={view.weight} max={view.weightLimit}/></label>
    <label>占用空间<progress aria-label="携带空间" value={view.bulk} max={view.bulkLimit}/></label>
    <p>重量与体积共用一副双手。超过舒适区会走慢；装满时仍能以三分之一的速度走动。</p>
    <div className="carrying-actions"><button aria-pressed={view.method==='hands'} onClick={()=>onChange({kind:'method',method:'hands'})}>散拿</button><button aria-pressed={view.method==='bundle'} onClick={()=>onChange({kind:'method',method:'bundle'})}>整理打捆</button></div>
    <p className="carrying-note">打捆后枝杈只占原来 55% 的空间，重量不变；蘑菇和原木不压缩。背包、筐和推车尚未开放。</p>
    {view.items.length?<div className="carrying-list">{view.items.map(item=><div key={item.key}><span>{item.name} × {item.quantity}</span><button onClick={()=>onChange({kind:'drop',key:item.key})}>放下一份</button>{item.quantity>1&&<button onClick={()=>onChange({kind:'drop',key:item.key,quantity:item.quantity})}>全部放下</button>}</div>)}</div>:<p>现在两手空空。采到的材料会先放在这里。</p>}
    <div className="carrying-actions">{view.storageNear?<button disabled={!view.items.length} onClick={()=>onChange({kind:'store'})}>全部存入营地</button>:<button onClick={onHome}>走近原木架存放</button>}</div>
    <h3>地上的材料</h3><p>放下的东西会留在原处，不会自动回仓库。</p>
    <div className="carrying-list">{view.ground.slice(0,12).map(item=><div key={item.id}><span>{item.name} × {item.quantity}<small>距你 {item.distance.toFixed(1)}</small></span>{item.near?<button disabled={!!item.takeReason} title={item.takeReason} onClick={()=>onChange({kind:'take',key:item.key})}>拿起一份</button>:<button onClick={()=>onApproach(item.id)}>走近</button>}</div>)}</div>
    {!view.ground.length&&<p>附近还没有放下的材料。</p>}
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
