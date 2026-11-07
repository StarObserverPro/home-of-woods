import {useState} from 'react';
import type {WardrobeIntent,WardrobeView} from '../domain/wardrobe.ts';
import {itemIcon,slotIcon} from './art-icons.ts';
import {ItemBrowser,ItemHeading,MenuAction,Pager} from './ItemBrowser.tsx';
export function Wardrobe({view,onChange}:{view:WardrobeView;onChange:(intent:WardrobeIntent)=>void}){
  const [choice,setChoice]=useState(0);
  return <ItemBrowser items={view.slots.map(s=>({...s,id:s.slotId,name:s.label,icon:s.equipped?itemIcon(s.equipped.definitionId):slotIcon(s.slotId)}))} label="穿戴位置" renderDetail={slot=>{
    const current=Math.min(choice,Math.max(0,slot.available.length-1)),item=slot.available[current];
    return <><ItemHeading name={slot.label} icon={slot.icon} subtitle={slot.equipped?.name??'未穿戴'}/>
      {slot.equipped&&<MenuAction onClick={()=>onChange({kind:'unequip',slotId:slot.slotId})}>脱下</MenuAction>}
      {item?<><MenuAction onClick={()=>onChange({kind:'equip',slotId:slot.slotId,instanceId:item.instanceId})}>穿上{item.name}</MenuAction><Pager page={current} pages={slot.available.length} onChange={setChoice} label="可换衣物"/></>:<p className="wood-note">没有可换衣物</p>}
    </>;
  }}/>;
}
