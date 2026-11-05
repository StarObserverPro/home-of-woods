import type {WardrobeIntent,WardrobeView} from '../domain/wardrobe.ts';
import './wardrobe.css';

/** Equipment is mounted on the unique owned-item ledger, not copied into a second inventory. */
export function Wardrobe({view,onChange}:{view:WardrobeView;onChange:(intent:WardrobeIntent)=>void}){
  return <section className="wardrobe" aria-label="玩家服装与穿戴">
    <div className="wardrobe-intro">
      <strong>林间穿戴</strong>
      <p>八个位置可独立穿脱。脱下的衣物回到随身物品，换上新衣物时原件也不会消失。</p>
      <small>随身待穿：{view.carriedCount} 件</small>
    </div>
    <div className="wardrobe-grid">
      {view.slots.map(slot=><article className="wardrobe-slot" key={slot.slotId} data-wardrobe-slot={slot.slotId}>
        <div className="wardrobe-slot-top"><span>{slot.label}</span><span className="wardrobe-indicator" aria-hidden="true">{slot.equipped?'●':'○'}</span></div>
        <strong>{slot.equipped?.name??'空位'}</strong>
        {slot.equipped&&<button className="wardrobe-action" onClick={()=>onChange({kind:'unequip',slotId:slot.slotId})} aria-label={`脱下${slot.equipped.name}`}>脱下</button>}
        {slot.available.length>0&&<div className="wardrobe-choices">
          <span>可换上</span>
          {slot.available.map(item=><button key={item.instanceId} className="wardrobe-choice" onClick={()=>onChange({kind:'equip',slotId:slot.slotId,instanceId:item.instanceId})}>{item.name} · 穿上</button>)}
        </div>}
      </article>)}
    </div>
    <p className="wardrobe-note">上衣、裤装、鞋和腰带目前仍与人物基础网格合并：穿脱记录可用，但外观分离需要下一阶段重新蒙皮。软帽、背包、手套与领巾独立控制显示。背包目前不增加负重容量。</p>
  </section>;
}
