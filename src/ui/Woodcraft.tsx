import { WOODCRAFT } from '../content/woodcraft.ts';
import type { WoodcraftSnapshot } from '../app/woodcraft-session.ts';
import './woodcraft.css';
export function woodcraftDetails(selected:string|null,view:WoodcraftSnapshot) {
  if(selected===WOODCRAFT.id)return {title:'营地木料堆',tag:'原木与枝杈',detail:'把原木和枝杈放进围框，看它们慢慢落稳。需要用料时，随时收回仓库。'};
  const piece=view.items.find(p=>p.id===selected);
  return piece?{title:piece.name,tag:'地上的木料',detail:'这根木料可以收回仓库。抽走下面的木头，上面的木堆可能重新滑落。'}:null;
}
export function WoodcraftControls({selected,view,message,disabled,onOpen,onWarehouse,onPrepare,onThrow,onCollect,onClose}:{selected:string|null;view:WoodcraftSnapshot;message:string;disabled:boolean;onOpen:()=>void;onWarehouse:()=>void;onPrepare:()=>void;onThrow:()=>void;onCollect:(id:string)=>void;onClose:()=>void}) {
  if(selected!==WOODCRAFT.id&&!view.items.some(p=>p.id===selected))return null;
  return <section className="woodcraft-controls" aria-label="营地木料堆操作">
    <p>库存可搬 {view.available} 根 · 木料区 {view.count}/{WOODCRAFT.maxPieces}{view.queued?` · 还有 ${view.queued} 根待放下`:''}</p>
    {!view.near&&<button className="context-button" disabled={disabled} onClick={onOpen}>走近木料堆</button>}
    {view.loading&&<p role="status">正在准备木料堆…</p>}
    {view.error&&<><p role="alert">木料堆暂不可用，请重试。</p><button className="context-button" disabled={disabled} onClick={onOpen}>重试</button></>}
    {view.near&&<div className="woodcraft-buttons">
      <button className="context-button" disabled={disabled} onClick={onWarehouse}>打开仓库</button>
      <details className="context-details"><summary>批量搬入</summary><button className="context-button" disabled={disabled||!view.near||!view.ready||view.available<2||view.count>=WOODCRAFT.maxPieces-1} onClick={onPrepare}>搬入木料，留一根</button></details>
      <button className="context-button" disabled={disabled||!view.near||!view.ready||!view.available||view.count>=WOODCRAFT.maxPieces||view.queued>0} onClick={onThrow}>放下一根</button>
      {selected!==WOODCRAFT.id&&<button className="context-button" disabled={disabled||!view.near||!view.ready} onClick={()=>onCollect(selected!)}>收回这根木料</button>}
    </div>}
    {view.near&&!view.available&&<p>仓库里没有可搬的原木或枝杈。</p>}
    {view.near&&view.count>=WOODCRAFT.maxPieces&&<p>木料堆已满，先收回几根再放。</p>}
  </section>;
}
export function WoodDropControls({active,onCancel}:{active:boolean;onCancel:()=>void}) {
  return active?<aside className="wood-drop-panel" aria-label="投放木料"><strong>点围框里面，松开这根木头</strong><p>点木堆或空地都可以；拖动仍可转镜头。取消不会扣材料。</p><button className="context-button" onClick={onCancel}>取消投放</button></aside>:null;
}
