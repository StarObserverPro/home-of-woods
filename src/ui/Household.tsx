import {useState} from 'react';
import {GameIcon} from './GameIcon.tsx';
import {WORKBENCH} from '../content/workshop.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {ALTAR_LAYOUT} from '../content/altar.ts';
import type {BroomSnapshot} from '../domain/broom.ts';
import {broomHasMark,broomHasWillful} from '../domain/broom.ts';
import type {ItemOracleSnapshot} from '../domain/item-oracle.ts';
import {itemRarity} from '../domain/item-properties.ts';
import {rarityStyle} from './rarity.ts';
import {rarityDefinition} from '../content/rarities.ts';

export function broomDetails(id:string|null,view:BroomSnapshot){
  const patch=view.patches.find(patch=>patch.id===id);
  if(patch)return {title:patch.name,tag:patch.swept?'已经扫拢':'营地一角',detail:'这些落叶可以用枝扫帚扫到一旁，原来的叶堆也能拨向另一侧。扫帚可在工作台学习制作。'};
  const item=view.items.find(item=>item.instanceId===id);if(!item)return null;
  const traits=[broomHasMark(item)?'叶形手作印记（普通词条）':'',broomHasWillful(item)?'扫帚不听话（史诗词条）':''].filter(Boolean);
  return {title:'枝扫帚',tag:`${itemRarity(item).name}物品 · ${traits.join(' · ')||'日常手作'}`,
    detail:'把营地的一小片落叶扫拢到一旁，也能将原来的叶堆拨到另一边。用过后可以摆在营地，或收回留待下次。'};
}
function BroomIcon(){return <GameIcon name="branch-broom" size={64}/>;}
export function BroomInventory({view,onSelect}:{view:BroomSnapshot;onSelect:(id:string)=>void}){
  if(!view.items.length)return null;
  return <section className="owned-furniture" aria-label="日常扫帚"><h3>日常扫帚</h3><div className="owned-grid">
    {view.items.map(item=><article className="owned-card" key={item.instanceId} style={rarityStyle(item)}>
      <BroomIcon/><strong>枝扫帚</strong><small>{itemRarity(item).name} · {item.location.kind==='inventory'?'在仓库':'已摆放'}</small>
      {(broomHasMark(item)||broomHasWillful(item))&&<p>{[broomHasMark(item)?'叶形印记（普通词条）':'',broomHasWillful(item)?'不听话（史诗词条）':''].filter(Boolean).join(' · ')}</p>}
      <button className="context-button" onClick={()=>onSelect(item.instanceId)}>查看扫帚 · 选择用法</button>
    </article>)}
  </div></section>;
}
type BroomProps={
  selected:string|null;view:BroomSnapshot;disabled:boolean;busy:boolean;playing:boolean;
  onLearn:()=>void;onCraft:(mark:boolean)=>void;onApproach:(patchId:string)=>void;
  onSweep:(instanceId:string,patchId:string)=>void;onPlace:(id:string)=>void;onPack:(id:string)=>void;
};
export function BroomControls({selected,view,disabled,busy,playing,onLearn,onCraft,onApproach,onSweep,onPlace,onPack}:BroomProps){
  const [mark,setMark]=useState(true);
  if(selected===WORKBENCH.id){
    if(!view.workbenchNear)return null;
    return <details name="workbench-section" className="context-details" aria-label="枝扫帚手作"><summary><GameIcon name="branch-broom" size={27}/>日常扫帚</summary>
      <div className="housing-recipe"><strong>枝扫帚</strong><span>{view.blueprint.costs.map(c=>`${c.name} ${c.available}/${c.quantity}`).join(' · ')}</span>
        {view.blueprint.learned?<>
          <label className="reduced"><input type="checkbox" checked={mark} disabled={disabled||busy} onChange={e=>setMark(e.currentTarget.checked)}/>留下叶形手作印记</label>
          <button className="context-button" disabled={disabled||busy||!view.blueprint.canCraft} title={view.blueprint.reason} onClick={()=>onCraft(mark)}>制作枝扫帚</button>
          {!view.blueprint.canCraft&&<small>{view.blueprint.reason}</small>}
        </>:<button className="context-button" disabled={disabled||busy} onClick={onLearn}>学会枝扫帚图纸</button>}
      </div>
    </details>;
  }
  const selectedPatch=view.patches.find(patch=>patch.id===selected);
  const item=view.items.find(item=>item.instanceId===(selectedPatch?view.selectedItemId:selected));
  if(!item)return selectedPatch?<p>先到营地工作台做一把枝扫帚，再来扫叶。</p>:null;
  if(item.location.kind!=='inventory')return <section className="housing-controls" aria-label="扫帚摆放"><div className="tree-actions">
    <button className="context-button" disabled={disabled||busy||playing} onClick={()=>onPlace(item.instanceId)}>移动扫帚</button>
    <button className="context-button" disabled={disabled||busy||playing} onClick={()=>onPack(item.instanceId)}>收回扫帚</button>
  </div><p>收回原来的扫帚，就能带去扫叶。</p></section>;
  return <section className="housing-controls" aria-label="扫叶">
    {playing&&<p role="status">正在扫叶。移动可以放下手头的动作。</p>}
    {(selectedPatch?[selectedPatch]:view.patches).map(patch=><article className="housing-recipe" key={patch.id}>
      <strong>{patch.name}</strong><small>{patch.swept?'落叶已成堆，可以拨到另一侧。':'把这小片落叶扫拢。'}</small>
      {patch.requiresApproach?<button className="context-button" disabled={disabled||busy||playing} onClick={()=>onApproach(patch.id)}>走到落叶旁</button>:
        <button className="context-button" disabled={disabled||busy||playing||!patch.canUse} onClick={()=>onSweep(item.instanceId,patch.id)}>{patch.swept?'拨一拨原来的叶堆':'扫拢落叶'}</button>}
      {!patch.requiresApproach&&!patch.canUse&&<small>{patch.reason}</small>}
    </article>)}
    <button className="context-button" disabled={disabled||busy||playing} onClick={()=>onPlace(item.instanceId)}>把扫帚摆在营地</button>
  </section>;
}

export function ItemOracleControls({selected,view,disabled,onApproach,onOffer}:{selected:string|null;view:ItemOracleSnapshot;disabled:boolean;onApproach:()=>void;onOffer:(id:string,riteId:string)=>void}){
  if(![CAMP_PROPS.altar.id,ALTAR_LAYOUT.oracle.id].includes(selected as typeof CAMP_PROPS.altar.id))return null;
  if(!view.targets.length)return null;
  return <details className="context-details" aria-label="原物神谕"><summary>让原物得到回应</summary>
    {!view.near?<button className="context-button" disabled={disabled} onClick={onApproach}>带着原物走近祭坛</button>:view.targets.map(target=><article className="housing-recipe" key={target.instanceId}>
      <strong>{target.name} · {target.riteName}</strong>
      {target.hasTrait?<small>这份{rarityDefinition(target.grade).name}词条回应已经留在原物身上。</small>:<>
        <small>{rarityDefinition(target.grade).name}词条 · 供奉{target.cost.name} {target.cost.quantity} 份</small>
        <button className="context-button" disabled={disabled||!target.canStart} title={target.reason} onClick={()=>onOffer(target.instanceId,target.riteId)}>请神谕回应这件原物</button>
        {!target.canStart&&<small>{target.reason}</small>}
      </>}
    </article>)}
  </details>;
}
