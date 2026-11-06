import {useRef,useState} from 'react';
import type {WardrobeIntent,WardrobeView} from '../domain/wardrobe.ts';
import {GameIcon} from './GameIcon.tsx';
import {itemIcon,slotIcon} from './art-icons.ts';
import './wardrobe.css';

/** Selection is local UI state; equip/unequip still use the unique ownership ledger. */
export function Wardrobe({view,onChange}:{view:WardrobeView;onChange:(intent:WardrobeIntent)=>void}){
  const [slotId,setSlotId]=useState('player:top'),[detailOpen,setDetailOpen]=useState(false);
  const slots=useRef<HTMLDivElement>(null);
  const slot=view.slots.find(s=>s.slotId===slotId)??view.slots[0];
  return <section className={'wardrobe'+(detailOpen?' show-wardrobe-detail':'')} aria-label="玩家服装与穿戴">
    <div className="menu-section-heading"><h3>我的穿戴</h3><span>随身待穿 {view.carriedCount} 件</span></div>
    <div className="wardrobe-layout"><div ref={slots} className="wardrobe-grid" role="group" aria-label="穿戴位置">{view.slots.map(s=><button className="wardrobe-slot" key={s.slotId} data-wardrobe-slot={s.slotId} aria-pressed={slot?.slotId===s.slotId} aria-label={s.label+' · '+(s.equipped?.name??'未穿戴')} onClick={()=>{setSlotId(s.slotId);setDetailOpen(true);}}>
      <span className="wardrobe-slot-top">{s.label}<span className="item-selected-mark" aria-hidden="true">{slot?.slotId===s.slotId?'✓':''}</span></span><GameIcon name={s.equipped?itemIcon(s.equipped.definitionId):slotIcon(s.slotId)} size={58} className={s.equipped?'':'empty-slot-icon'}/><strong>{s.equipped?.name??'未穿戴'}</strong><small>{s.equipped?'穿戴中':'空位'}</small>
    </button>)}</div>
    {slot&&<section className="wardrobe-detail" aria-label="穿戴详情"><button className="item-detail-back subtle-button" onClick={()=>{setDetailOpen(false);requestAnimationFrame(()=>slots.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus());}}>← 返回穿戴位置</button>
      <span className="location-label">{slot.label} · 当前穿戴</span><GameIcon name={slot.equipped?itemIcon(slot.equipped.definitionId):slotIcon(slot.slotId)} size={88}/><h3>{slot.equipped?.name??'尚未穿戴'}</h3>
      {slot.equipped&&<><button className="context-button" onClick={()=>onChange({kind:'unequip',slotId:slot.slotId})} aria-label={'脱下'+slot.equipped.name}>脱下 · 放入随身衣物</button>{['player:top','player:legs','player:feet','player:waist'].includes(slot.slotId)&&<p className="wardrobe-appearance-note">这件基础衣物暂不随穿脱改变外形。</p>}</>}
      <div className="wardrobe-choices"><h4>随身可换上的衣物</h4>{slot.available.length?slot.available.map(item=><button key={item.instanceId} className="wardrobe-choice" onClick={()=>onChange({kind:'equip',slotId:slot.slotId,instanceId:item.instanceId})}><GameIcon name={itemIcon(item.definitionId)} size={36}/><span>{item.name}</span><strong>穿上</strong></button>):<p>随身没有适合这个位置的衣物。</p>}</div>
    </section>}</div>
  </section>;
}
