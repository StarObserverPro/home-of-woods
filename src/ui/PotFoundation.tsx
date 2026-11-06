import {WORKBENCH} from '../content/workshop.ts';
import {GameIcon} from './GameIcon.tsx';
import {blueprintSubjectIcon} from './art-icons.ts';
import type {PotFoundationSnapshot} from '../domain/pot-foundation.ts';

export function PotFoundation({selected,view,disabled,onLearn,onApproach}:{
  selected:string|null;view:PotFoundationSnapshot;disabled:boolean;
  onLearn:(blueprintId:string)=>void;onApproach:()=>void;
}){
  if(selected!==WORKBENCH.id)return null;
  return <details name="workbench-section" className="context-details" aria-label="基础炊具图纸">
    <summary><GameIcon name="soup-pot" size={27}/>基础炊具图纸</summary>
    {!view.near?<button className="context-button" disabled={disabled} onClick={onApproach}>走近工作台</button>:<>
      <p>学会做法后，再带木料和行商五金到火塘旁安装。</p>
      {view.plans.map(plan=><div className="recipe-row" key={plan.id}>
        <div className="recipe-heading"><GameIcon name={blueprintSubjectIcon(plan.id)} size={42}/><div><strong>{plan.name}</strong><small>{plan.materials.map(material=>`${material.name} ${material.quantity} ${material.unit??'份'}`).join(' · ')}</small></div></div>
        <button className="context-button" title={plan.reason} disabled={disabled||!plan.canLearn} onClick={()=>onLearn(plan.id)}>{plan.known?'已收录':'展开学习'}</button>
      </div>)}
    </>}
  </details>;
}
