import {WoodStock} from './WoodStock.tsx';
import { WOODCRAFT } from '../content/woodcraft.ts';
import type { WoodcraftSnapshot } from '../app/woodcraft-session.ts';
import './woodcraft.css';
export function woodcraftDetails(selected:string|null,view:WoodcraftSnapshot) {
  if(selected===WOODCRAFT.id)return {title:'营地木料堆',tag:'枝料与碎柴收纳区',detail:'把随身或营地的原木、枝杈和碎柴放进围框，看它们慢慢落稳。需要用料时，随时收回仓库。'};
  const piece=view.items.find(p=>p.id===selected);
  return piece?{title:piece.name,tag:'地上的木料',detail:`这份${piece.name}可以收回营地仓库。收回支撑物后，上面的木堆可能重新滑落。`}:null;
}
export function WoodcraftControls({selected,view,message,disabled,onOpen,onWarehouse,onPrepare,onCollectAll,onThrow,onCollect,onClose}:{selected:string|null;view:WoodcraftSnapshot;message:string;disabled:boolean;onOpen:()=>void;onWarehouse:()=>void;onPrepare:()=>void;onCollectAll:()=>void;onThrow:()=>void;onCollect:(id:string)=>void;onClose:()=>void}) {
  if(selected!==WOODCRAFT.id&&!view.items.some(p=>p.id===selected))return null;
  return <section className="woodcraft-controls" aria-label="营地木料堆操作">
    <p>随身与营地可投放 {view.available} 份 · 木料区 {view.count}/{WOODCRAFT.maxPieces}{view.queued?` · 还有 ${view.queued} 份待放下`:''}</p>
    <WoodStock view={view}/>
    {!view.near&&<button className="context-button" disabled={disabled} onClick={onOpen}>走近木料堆</button>}
    {view.loading&&<p role="status">正在准备木料堆…</p>}
    {view.error&&<><p role="alert">木料堆暂不可用，请重试。</p><button className="context-button" disabled={disabled} onClick={onOpen}>重试</button></>}
    {view.near&&<div className="woodcraft-buttons">
      <button className="context-button" disabled={disabled} onClick={onWarehouse}>打开仓库</button>
      <button className="context-button" disabled={disabled||!view.near||!view.ready||!view.available||view.count>=WOODCRAFT.maxPieces} onClick={onPrepare}>全部放入</button>
      <button className="context-button" disabled={disabled||!view.ready||!view.count} onClick={onCollectAll}>全部收回仓库</button>
      <button className="context-button" disabled={disabled||!view.near||!view.ready||!view.available||view.count>=WOODCRAFT.maxPieces} onClick={onThrow}>放下一根</button>
      {selected!==WOODCRAFT.id&&<button className="context-button" disabled={disabled||!view.near||!view.ready} onClick={()=>onCollect(selected!)}>收回这根木料</button>}
    </div>}
    {view.near&&!view.available&&<p>随身和营地没有可投放的木料。</p>}
    {view.near&&view.count>=WOODCRAFT.maxPieces&&<p>木料堆已满，先收回几根再放。</p>}
  </section>;
}
export function WoodDropControls({active,onCancel}:{active:boolean;onCancel:()=>void}) {
  return active?<aside className="wood-drop-panel" aria-label="投放木料"><strong>点围框里面，松开这根木头</strong><p>点木堆或空地都可以；拖动仍可转镜头。取消不会扣材料。</p><button className="context-button" onClick={onCancel}>取消投放</button></aside>:null;
}
