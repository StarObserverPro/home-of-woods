import {BLUEPRINTS,WORKBENCH} from '../content/workshop.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';
import {findUpgradeProfile} from '../content/upgrades.ts';

function PlanDrawing({house}:{house:boolean}){
  return <svg className="blueprint-drawing" viewBox="0 0 240 130" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 20h212M14 45h212M14 70h212M14 95h212M14 120h212M30 10v110M65 10v110M100 10v110M135 10v110M170 10v110M205 10v110" opacity=".12" strokeWidth="1"/>
    {house?<><path d="m46 64 74-46 74 46M59 56v58h122V56M88 114V77h32v37M137 77h26v23h-26z"/><path d="m73 47 18-11 15 9-19 12zm63-19 18 11-15 10-18-12M80 78v36m47-36v36" stroke="#f6d28e" strokeWidth="4"/><path d="M44 122h152M44 118v8m152-8v8" opacity=".55"/></>:<><ellipse cx="120" cy="50" rx="46" ry="24"/><path d="M74 50v47c0 13 92 13 92 0V50M96 72v29m46-30v31"/><ellipse cx="120" cy="50" rx="24" ry="12" opacity=".5"/></>}
  </svg>;
}
export function BlueprintLibrary({view,onSelect}:{view:WorkshopSnapshot;onSelect:(id:string)=>void}){
  return <section className="blueprint-library" aria-label="图纸收藏">
    <p className="warehouse-note">图纸学会后会一直保留。制作和修缮消耗材料，图纸可以重复使用。</p>
    {BLUEPRINTS.map(plan=>{const known=view.blueprints.includes(plan.id);return <article className={`blueprint-card${known?'':' is-unknown'}`} key={plan.id}>
      <PlanDrawing house={plan.kind==='upgrade'}/><div className="blueprint-heading"><h3>{plan.name}</h3><span>{known?'已收录':'未获得'}</span></div>
      <small>{plan.targetLabel}</small><p>{plan.description}</p>
      {plan.kind==='upgrade'&&<p className="blueprint-cost">{findUpgradeProfile(plan.targetId)?.paths.find(path=>path.blueprintId===plan.id)?.materials.map(material=>`${material.name} ${material.quantity} ${material.typeId==='wood.log'?'根':'份'}`).join(' · ')}</p>}
      <p className="blueprint-source">{plan.source}</p>
      {known&&<button className="context-button" onClick={()=>onSelect(plan.kind==='upgrade'?plan.targetId:WORKBENCH.id)}>{plan.kind==='upgrade'?'查看木屋修缮':'查看工作台'}</button>}
    </article>;})}
  </section>;
}
export function UpgradeControls({view,disabled,hasContextActions,onApproach,onUpgrade,onCancel}:{view:WorkshopSnapshot;disabled:boolean;hasContextActions:boolean;onApproach:(id:string)=>void;onUpgrade:(id:string)=>void;onCancel:()=>void}){
  const upgrade=view.upgrade;if(!upgrade)return null;
  const working=view.job?.kind==='upgrade'&&view.job.targetId===upgrade.targetId;
  return <section className="upgrade-controls" aria-label="升级与修缮">
    <div className="upgrade-heading"><h3>{upgrade.pathName}</h3><span>{upgrade.level===0?'待修缮':`阶段 ${upgrade.level}`}</span></div>
    <p>{upgrade.detail}</p>
    {upgrade.requiredBlueprint&&<p className="blueprint-requirement">图纸 · {upgrade.requiredBlueprint.name} <span>{upgrade.requiredBlueprint.known?'已收录':'尚未获得'}</span></p>}
    {!!upgrade.materials.length&&<ul className="upgrade-materials">{upgrade.materials.map(material=><li key={material.typeId}><span>{material.name}</span><strong className={material.available<material.required?'is-missing':''}>{material.available} / {material.required}</strong></li>)}</ul>}
    {working?<><p>正在修缮木屋…</p><progress aria-label="木屋修缮进度" value={view.job!.progress} max={1}/><button className="context-button" onClick={onCancel}>取消 · 保留材料</button></>:
      upgrade.status==='planned'?<>{!hasContextActions&&!upgrade.near&&<button className="context-button" disabled={disabled} onClick={()=>onApproach(upgrade.targetId)}>走近{upgrade.title}</button>}</>:
      !upgrade.near?<button className="context-button" disabled={disabled} onClick={()=>onApproach(upgrade.targetId)}>走近{upgrade.title}</button>:
      <><button className="context-button" disabled={disabled||!upgrade.canStart} onClick={()=>onUpgrade(upgrade.targetId)}>开始修缮</button>{upgrade.reason&&<p className="action-reason">{upgrade.reason}</p>}</>}
  </section>;
}
