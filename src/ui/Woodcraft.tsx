import { WOODCRAFT } from '../content/woodcraft.ts';
import type { WoodcraftSnapshot } from '../app/woodcraft-session.ts';
import './woodcraft.css';
export function woodcraftDetails(selected:string|null,view:WoodcraftSnapshot) {
  if(selected===WOODCRAFT.id)return {title:'营地木料堆',tag:'Woodcraft · 局部物理',detail:'搬来原木和枝杈，让它们自己落稳。仓库中的材料和地上的木料不会重复计算。'};
  const piece=view.items.find(p=>p.id===selected);
  return piece?{title:piece.name,tag:'地上的木料',detail:'这根木料可以收回仓库。抽走下面的木头，上面的木堆可能重新滑落。'}:null;
}
export function WoodcraftControls({selected,view,message,disabled,onOpen,onPrepare,onThrow,onCollect,onClose}:{selected:string|null;view:WoodcraftSnapshot;message:string;disabled:boolean;onOpen:()=>void;onPrepare:()=>void;onThrow:()=>void;onCollect:(id:string)=>void;onClose:()=>void}) {
  if(selected!==WOODCRAFT.id&&!view.items.some(p=>p.id===selected))return null;
  return <section className="woodcraft-controls" aria-label="营地木料堆操作">
    <p>库存可搬 {view.available} 根 · 木料区 {view.count}/{WOODCRAFT.maxPieces}{view.queued?` · 还有 ${view.queued} 根待放下`:''}</p>
    {!view.near&&<button className="context-button" disabled={disabled} onClick={onOpen}>走到木料堆</button>}
    {view.loading&&<p role="status">正在准备物理模块，尚未扣除材料。</p>}
    {view.error&&<><p role="alert">物理模块暂不可用，材料仍然保留。</p><button className="context-button" disabled={disabled} onClick={onOpen}>重试</button></>}
    <div className="woodcraft-buttons">
      <button className="context-button" disabled={disabled||!view.near||!view.ready||view.available<2||view.count>=WOODCRAFT.maxPieces-1} onClick={onPrepare}>搬入木料，留一根</button>
      <button className="context-button" disabled={disabled||!view.near||!view.ready||!view.available||view.count>=WOODCRAFT.maxPieces||view.queued>0} onClick={onThrow}>拿一根 · 点击投放</button>
      {selected!==WOODCRAFT.id&&<button className="context-button" disabled={disabled||!view.near||!view.ready} onClick={()=>onCollect(selected!)}>收回这根木料</button>}
      <button className="context-button" onClick={onClose}>回到行走</button>
    </div>
    <p className="action-message" role="status">{message}</p>
  </section>;
}
export function WoodDropControls({active,onCancel}:{active:boolean;onCancel:()=>void}) {
  return active?<aside className="wood-drop-panel" aria-label="投放木料"><strong>点围框里面，松开这根木头</strong><p>点木堆或空地都可以；拖动仍可转镜头。取消不会扣材料。</p><button className="context-button" onClick={onCancel}>取消投放</button></aside>:null;
}
