import {useState} from 'react';
import type {GuidedWorkshopSnapshot,GuidedPartAdjustment} from '../domain/workshop-guided.ts';
import './guided-craft.css';
import {GameIcon} from './GameIcon.tsx';
import {blueprintSubjectIcon} from './art-icons.ts';

type Parameters=Readonly<Record<string,unknown>>;
type Plan=GuidedWorkshopSnapshot['plans'][number];
type Props={
  view:GuidedWorkshopSnapshot;disabled:boolean;busy:boolean;
  onLearn:(id:string)=>void;onUpgrade:()=>void;onBegin:(id:string,parameters:Parameters)=>void;
  onDimensions:(parameters:Parameters)=>void;onAdjust:(action:GuidedPartAdjustment)=>void;
  onFit:()=>void;onFinish:()=>void;onCancel:()=>void;
};
const pieceName=(id:string|null)=>id==='surface'?'面板':id?.startsWith('support-')?`支撑 ${Number(id.slice(8))+1}`:'各片部件';

function SeriesRecipe({plan,disabled,busy,onBegin,onLearn}:{plan:Plan;disabled:boolean;busy:boolean;onBegin:Props['onBegin'];onLearn:Props['onLearn']}){
  const [presetId,setPresetId]=useState('standard');
  const preset=plan.presets.find(p=>p.id===presetId)??plan.presets[0];
  return <article className="housing-recipe">
    <strong className="recipe-heading"><GameIcon name={blueprintSubjectIcon(plan.id)} size={38}/>{plan.name}</strong>
    <span>{plan.costs.map(c=>`${c.name} ${c.available}/${c.quantity}`).join(' · ')}</span>
    {plan.learned?<>
      <div className="guided-presets" role="group" aria-label={`${plan.name}尺寸`}>
        {plan.presets.map(p=><button className="context-button" key={p.id} aria-pressed={p.id===presetId} disabled={disabled||busy} onClick={()=>setPresetId(p.id)}>{p.name}</button>)}
      </div>
      <button className="context-button" disabled={disabled||busy||!plan.canStart} title={plan.reason} onClick={()=>onBegin(plan.id,preset.parameters)}>开始装配{plan.name}</button>
      {!plan.canStart&&<small>{plan.reason}</small>}
    </>:<button className="context-button" disabled={disabled||busy} onClick={()=>onLearn(plan.id)}>学会{plan.name}图纸</button>}
  </article>;
}

/** Every fitting control sends an intent to the existing workshop job. */
export function GuidedCraftControls(props:Props){
  const {view,disabled,busy,onLearn,onUpgrade,onDimensions,onAdjust,onFit,onFinish,onCancel}=props;
  if(!view.near)return null;
  const job=view.job,plan=job?view.plans.find(p=>p.id===job.blueprintId):null;
  return <section className="housing-controls guided-craft" aria-label="工坊装配">
    <details name="workbench-section" className="context-details" open={!!job||undefined}><summary><GameIcon name="workbench" size={27}/>{view.unlocked?'按尺寸做家具':'改良工作台'}</summary>
      {!view.unlocked?<article className="housing-recipe">
        <strong>支架与定位靠山</strong>
        <span>{view.upgrade?.materials.map(m=>`${m.name} ${m.available}/${m.required}`).join(' · ')}</span>
        {view.upgradeBlueprint.learned?<>
          <button className="context-button" disabled={disabled||busy||!view.upgrade?.canStart} title={view.upgrade?.reason} onClick={onUpgrade}>加固工作台</button>
          {view.upgrade?.reason&&<small>{view.upgrade.reason}</small>}
        </>:<button className="context-button" disabled={disabled||busy} onClick={()=>onLearn(view.upgradeBlueprint.id)}>展开支架改良图纸</button>}
      </article>:job?<div className="guided-job" role="group" aria-label="正在装配">
        <strong>{job.name} · {job.phaseName}</strong>
        <progress aria-label="家具装配进度" value={job.progress} max={1}/>
        {job.phase==='fitting'?<>
          <p>{job.activePartId?`对齐${pieceName(job.activePartId)} · 已卡好 ${job.placements.length}/${job.guides.length} 片`:'部件都已装好，可以收尾了。'}</p>
          {job.activePartId&&<>
            <div className="guided-adjust" role="group" aria-label="移动当前部件">
              <button className="context-button" disabled={disabled} onClick={()=>onAdjust('left')} aria-label="部件向左">←</button>
              <button className="context-button" disabled={disabled} onClick={()=>onAdjust('right')} aria-label="部件向右">→</button>
              <button className="context-button" disabled={disabled} onClick={()=>onAdjust('turn-left')} aria-label="部件向左转">↶</button>
              <button className="context-button" disabled={disabled} onClick={()=>onAdjust('turn-right')} aria-label="部件向右转">↷</button>
            </div>
            <div className="tree-actions">
              <button className="context-button" disabled={disabled} onClick={()=>onAdjust('align')}>贴合导向</button>
              <button className="context-button" disabled={disabled||!job.canSubmit} onClick={onFit}>卡入这片</button>
            </div>
            <small role="status">{job.canSubmit?'已在导向范围内，可以卡入。':'看着高亮的部件，移到虚线导向里；也可以直接贴合。'}</small>
          </>}
          {plan&&<details><summary>调整尺寸与位置</summary>
            <small>更改尺寸后，需要重新对齐各片。</small>
            <div className="guided-dimensions">{plan.dimensions.map(d=><label key={d.key}>{d.label}
              <input type="range" aria-label={`装配${d.label}`} min={d.min} max={d.max} step={d.step} value={job.geometry.parameters[d.key] as number} disabled={disabled} onChange={e=>onDimensions({...job.geometry.parameters,[d.key]:Number(e.currentTarget.value)})}/>
            </label>)}</div>
            {job.activePartId&&<div className="guided-adjust" role="group" aria-label="部件前后高低">
              {([['forward','向前'],['backward','向后'],['raise','抬高'],['lower','放低']] as const).map(([action,label])=><button className="context-button" key={action} disabled={disabled} onClick={()=>onAdjust(action)}>{label}</button>)}
            </div>}
          </details>}
          <button className="context-button" disabled={disabled||!job.canFinish} onClick={onFinish}>收尾完成</button>
        </>:<p>{job.phase==='preparing'?'正在整理木料，接下来对齐支撑和面板。':'正在固定接点，完成后整件收入仓库。'}</p>}
        {job.reason&&<small role="status">{job.reason}</small>}
        <button className="context-button" disabled={disabled} onClick={onCancel}>取消装配</button>
      </div>:view.plans.map(p=><SeriesRecipe key={p.id} plan={p} disabled={disabled} busy={busy} onLearn={props.onLearn} onBegin={props.onBegin}/>)}
    </details>
  </section>;
}
