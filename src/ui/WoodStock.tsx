import type {WoodcraftSnapshot} from '../app/woodcraft-session.ts';
import {GameIcon} from './GameIcon.tsx';
import {itemIcon} from './art-icons.ts';
export function WoodStock({view}:{view:WoodcraftSnapshot}){
  return <div className="wood-stock" aria-label="木料分项数量">{view.materials.map(item=><div key={item.itemId} className="wood-stock-item"><GameIcon name={itemIcon(item.itemId)} size={30}/><div><strong>{item.name} · 堆中 {item.piled}</strong><small>营地 {item.stored} · 随身 {item.carried}</small></div></div>)}</div>;
}
