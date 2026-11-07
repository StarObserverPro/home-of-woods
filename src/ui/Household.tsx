import {ItemBrowser,ItemHeading,MenuAction,MaterialCounts} from './ItemBrowser.tsx';
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
    <ItemBrowser label="扫叶位置" items={(selectedPatch?[selectedPatch]:view.patches).map(patch=>({...patch,icon:'branch-broom' as const}))} renderDetail={patch=><><ItemHeading name={patch.name} icon="branch-broom" subtitle={patch.swept?'已成堆':'散落的叶片'}/><MenuAction disabled={disabled||busy||playing||!patch.requiresApproach&&!patch.canUse} onClick={()=>patch.requiresApproach?onApproach(patch.id):onSweep(item.instanceId,patch.id)}>{patch.requiresApproach?'走近':patch.swept?'拨到另一侧':'扫拢'}</MenuAction>{!patch.requiresApproach&&!patch.canUse&&<p className="wood-reason">{patch.reason}</p>}</>}/>

    <button className="context-button" disabled={disabled||busy||playing} onClick={()=>onPlace(item.instanceId)}>把扫帚摆在营地</button>
  </section>;
}

export function ItemOracleControls({selected,view,disabled,onApproach,onOffer}:{selected:string|null;view:ItemOracleSnapshot;disabled:boolean;onApproach:()=>void;onOffer:(id:string,riteId:string)=>void}){
  if(![CAMP_PROPS.altar.id,ALTAR_LAYOUT.oracle.id].includes(selected as typeof CAMP_PROPS.altar.id))return null;
  if(!view.targets.length)return null;
  return <ItemBrowser label="原物神谕" items={view.targets.map(target=>({...target,id:target.instanceId+target.riteId,icon:'oracle' as const}))} renderDetail={target=><><ItemHeading name={target.name} icon="oracle" subtitle={target.riteName}/><MaterialCounts items={[{name:target.cost.name,quantity:target.cost.quantity}]}/>{target.hasTrait?<p className="wood-note">已获得回应</p>:<MenuAction disabled={disabled||view.near&&!target.canStart} onClick={()=>view.near?onOffer(target.instanceId,target.riteId):onApproach()}>{view.near?'供奉':'走近祭坛'}</MenuAction>}</>}/>;
}
