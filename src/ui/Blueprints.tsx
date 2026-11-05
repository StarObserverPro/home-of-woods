import {BLUEPRINTS,WORKBENCH} from '../content/workshop.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';
import {findUpgradeProfile,upgradeHostId} from '../content/upgrades.ts';

function PlanDrawing({subject}:{subject:'house'|'tent'|'fire'|'craft'}){
  return <svg className="blueprint-drawing" viewBox="0 0 240 130" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 20h212M14 45h212M14 70h212M14 95h212M14 120h212M30 10v110M65 10v110M100 10v110M135 10v110M170 10v110M205 10v110" opacity=".12" strokeWidth="1"/>
    {subject==='house'?<><path d="m46 64 74-46 74 46M59 56v58h122V56M88 114V77h32v23h-32zM137 77h26v23h-26z"/><path d="m73 47 18-11 15 9-19 12zm63-19 18 11-15 10-18-12" stroke="#f6d28e" strokeWidth="4"/></>:subject==='tent'?<><path d="M37 100 120 22 204 100ZM120 22v78M37 100l-15 14M204 100l15 14M82 100l38-78 38 78" strokeLinejoin="round"/><path d="M22 114h197M54 100v14m132-14v14" opacity=".5"/></>:subject==='fire'?<><ellipse cx="120" cy="89" rx="58" ry="25"/><path d="M62 89v10c0 14 116 14 116 0V89M75 78 120 66 165 78M84 67v-38m72 38v-38M84 29h72M120 29v27" strokeLinejoin="round"/><path d="m112 81 7-17 9 16" stroke="#f6d28e"/></>:<><ellipse cx="120" cy="50" rx="46" ry="24"/><path d="M74 50v47c0 13 92 13 92 0V50M96 72v29m46-30v31"/><ellipse cx="120" cy="50" rx="24" ry="12" opacity=".5"/></>}
  </svg>;
}

export function BlueprintLibrary({view,onSelect}:{view:WorkshopSnapshot;onSelect:(id:string)=>void}){
  return <section className="blueprint-library" aria-label="图纸收藏">
    <details className="warehouse-note"><summary>图纸如何使用？</summary>基础图纸永久掌握；复杂图纸可能只有有限制作次数。材料在实际制作时扣除。</details>
    {BLUEPRINTS.map(plan=>{
      const known=view.blueprints.includes(plan.id);
      const copies=view.copyUses[plan.id]??[];
      const available=known||copies.length>0;
      const upgrade=plan.kind==='upgrade';
      const host=upgrade?upgradeHostId(plan.targetId):'';
      const materials=upgrade?findUpgradeProfile(plan.targetId)?.paths.find(path=>path.blueprintId===plan.id)?.materials:[];
      const subject=host==='cabin'?'house':host==='tent'?'tent':host==='camp-fire'?'fire':'craft';
      return <article className={`blueprint-card${available?'':' is-unknown'}`} key={plan.id}>
        <PlanDrawing subject={subject}/>
        <div className="blueprint-heading"><h3>{plan.name}</h3><span>{known?'∞':copies.length?'剩 '+copies.join(' / '):'未获得'}</span></div>
        <small>{plan.targetLabel}</small><details><summary>图纸说明</summary><p>{plan.description}</p>
        {upgrade&&<p className="blueprint-cost">{materials?.length?materials.map(material=>`${material.name} ${material.quantity} ${material.unit??'份'}`).join(' · '):'使用原有材料原位整理，无额外耗材'}</p>}
        <p className="blueprint-source">{plan.source}</p></details>
        {available&&<button className="context-button" onClick={()=>onSelect(upgrade?host:WORKBENCH.id)}>{upgrade?'查看该设施的外部改造':'查看工作台'}</button>}
      </article>;
    })}
  </section>;
}

export function UpgradeControls({view,disabled,hasContextActions,onApproach,onUpgrade,onMount,onCancel}:{
  view:WorkshopSnapshot;disabled:boolean;hasContextActions:boolean;onApproach:(id:string)=>void;
  onUpgrade:(id:string)=>void;onMount:(id:string|null)=>void;onCancel:()=>void;
}){
  const upgrades=view.upgradeOptions.length?view.upgradeOptions:view.upgrade?[view.upgrade]:[];
  if(!upgrades.length)return null;
  return <section className="upgrade-controls" aria-label="外部升级与修缮">
    <header className="upgrade-heading"><h3>{view.upgradeOptions.length?'外部改造':'修缮与改良'}</h3><span>{view.upgradeOptions.filter(u=>u.status==='installed').length} 件已完成</span></header>
    {view.upgradeOptions.length>0&&<p>这些部件属于当前设施，可以分别制作、安装和保留。火塘上方的配件共用一个安装位置。</p>}
    <div className="upgrade-module-list">
      {upgrades.map(upgrade=>{
        const working=view.job?.kind==='upgrade'&&view.job.targetId===upgrade.targetId;
        const installed=upgrade.status==='installed';
        const hasWork=!!view.job;
        return <article key={upgrade.targetId} className="upgrade-module">
          <div className="upgrade-heading"><h4>{upgrade.pathName}</h4><span>{installed?upgrade.mountSlot?(upgrade.mounted?'正在使用':'已制作 · 已收起'):'已安装':upgrade.status==='planned'?'尚未开放':upgrade.level>0?'待改良':'待制作'}</span></div>
          <p>{upgrade.detail}</p>
          {upgrade.requiredBlueprint&&<p className="blueprint-requirement">图纸 · {upgrade.requiredBlueprint.name} <span>{upgrade.requiredBlueprint.known?'已收录':'尚未获得'}</span></p>}
          {!!upgrade.materials.length&&<ul className="upgrade-materials">{upgrade.materials.map(material=><li key={material.typeId}><span>{material.name}</span><strong className={material.available<material.required?'is-missing':''}>{material.available} / {material.required}</strong><small>需 {material.required} {material.unit}</small></li>)}</ul>}
          {working?<><p>正在安装「{upgrade.pathName}」…</p><progress aria-label="改装进度" value={view.job!.progress} max={1}/><button className="context-button" onClick={onCancel}>取消施工 · 不扣材料</button></>:
            installed&&upgrade.mountSlot?
              !upgrade.near?<button className="context-button" disabled={disabled||hasWork} onClick={()=>onApproach(upgrade.targetId)}>走近篝火切换配件</button>:
              <button className="context-button" disabled={disabled||hasWork} onClick={()=>onMount(upgrade.mounted?null:upgrade.targetId)}>{upgrade.mounted?'收起这个配件':'装上这个配件'}</button>:
            installed?<p className="upgrade-installed">已安装在原有设施上</p>:
            upgrade.status==='planned'?(<>{!hasContextActions&&!upgrade.near&&<button className="context-button" disabled={disabled||hasWork} onClick={()=>onApproach(upgrade.targetId)}>走近{upgrade.title}</button>}</>):
            !upgrade.near?<button className="context-button" disabled={disabled||hasWork} onClick={()=>onApproach(upgrade.targetId)}>走近后安装</button>:
            <button className="context-button" disabled={disabled||hasWork||!upgrade.canStart} onClick={()=>onUpgrade(upgrade.targetId)}>开始制作并安装</button>}
          {!working&&!installed&&upgrade.reason&&upgrade.status!=='planned'&&upgrade.near&&<p className="action-reason">{upgrade.reason}</p>}
        </article>;
      })}
    </div>
  </section>;
}
