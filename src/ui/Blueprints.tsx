import {useState} from 'react';
import {BLUEPRINTS,WORKBENCH} from '../content/workshop.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';
import {findUpgradeProfile,upgradeHostId} from '../content/upgrades.ts';
import {GameIcon} from './GameIcon.tsx';
import {blueprintSubjectIcon} from './art-icons.ts';

export function BlueprintLibrary({view,onSelect}:{view:WorkshopSnapshot;onSelect:(id:string)=>void}){
  const [filter,setFilter]=useState('available'),[selectedId,setSelectedId]=useState(''),[detailOpen,setDetailOpen]=useState(false);
  const available=(id:string)=>view.availableBlueprints.includes(id);
  const plans=BLUEPRINTS.filter(p=>filter==='all'||filter==='available'&&available(p.id)||filter==='craft'&&p.kind==='craft'||filter==='upgrade'&&p.kind==='upgrade');
  const selected=BLUEPRINTS.find(p=>p.id===selectedId)??plans[0];
  const count=view.availableBlueprints.length;
  return <section className={'blueprint-library'+(detailOpen?' show-blueprint-detail':'')} aria-label="图纸收藏">
    <div className="menu-section-heading"><h3>图纸收藏</h3><span>可用 {count} 张</span></div>
    <nav className="menu-filter-tabs" aria-label="图纸筛选">{[['available','可使用'],['all','全部'],['craft','木作'],['upgrade','设施改造']].map(([id,name])=><button key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setSelectedId('');setDetailOpen(false);}}>{name}</button>)}</nav>
    <div className="blueprint-layout"><div className="blueprint-grid" role="group" aria-label="图纸列表">
      {plans.map(plan=>{const known=view.blueprints.includes(plan.id),uses=view.copyUses[plan.id]??[],ready=available(plan.id);return <button className={'blueprint-card'+(!ready?' is-unknown':'')} key={plan.id} aria-pressed={selected?.id===plan.id} onClick={()=>{setSelectedId(plan.id);setDetailOpen(true);}}>
        <span className="blueprint-subject"><GameIcon name={blueprintSubjectIcon(plan.id)} size={64}/><GameIcon name="blueprint" size={25} className="blueprint-badge"/></span><strong>{plan.name}</strong><small>{known?'已掌握 · 永久':uses.length?'可制作 '+uses.reduce((n,v)=>n+v,0)+' 次':'尚未获得'}</small>
      </button>;})}
      {!plans.length&&<div className="menu-empty"><GameIcon name="blueprint" size={60}/><h3>还没有可用图纸</h3><p>向行商换取，或在祭坛供奉蘑菇。</p><button className="context-button" onClick={()=>setFilter('all')}>看看全部图纸</button></div>}
    </div>{selected&&<section className="blueprint-detail" aria-label="图纸详情"><button className="item-detail-back subtle-button" onClick={()=>setDetailOpen(false)}>← 返回图纸列表</button><GameIcon name={blueprintSubjectIcon(selected.id)} size={64}/><span className="location-label">{selected.kind==='craft'?'木作图纸':'设施改造图纸'}</span><h3>{selected.name}</h3>
      {available(selected.id)?<button className="context-button primary-action" onClick={()=>onSelect(selected.kind==='upgrade'?upgradeHostId(selected.targetId):WORKBENCH.id)}>{selected.kind==='craft'?'查看工作台 · 去制作':'查看设施 · 去改造'}</button>:<p className="action-reason">尚未获得 · {selected.source}</p>}
      <p>{selected.description}</p><p className="blueprint-target">{selected.targetLabel}</p>
      {selected.kind==='upgrade'&&<p>{findUpgradeProfile(selected.targetId)?.paths.find(p=>p.blueprintId===selected.id)?.materials.map(m=>m.name+' '+m.quantity+' '+(m.unit??'份')).join(' · ')||'使用设施原有材料整理'}</p>}
      <details><summary>图纸使用说明</summary><p>永久图纸可反复使用。有限图纸仅在成功制作后消耗次数；材料也在实际制作时扣除。</p></details>
    </section>}</div>
  </section>;
}


export function UpgradeControls({view,remote=false,disabled,hasContextActions,mountReason='',onApproach,onUpgrade,onMount,onCancel}:{
  view:WorkshopSnapshot;remote?:boolean;disabled:boolean;hasContextActions:boolean;onApproach:(id:string)=>void;
  mountReason?:string;
  onUpgrade:(id:string)=>void;onMount:(id:string|null)=>void;onCancel:()=>void;
}){
  const upgrades=view.upgradeOptions.length?view.upgradeOptions:view.upgrade?[view.upgrade]:[];
  if(!upgrades.length)return null;
  return <section className="upgrade-controls" aria-label="外部升级与修缮">
    <header className="upgrade-heading"><h3>{view.upgradeOptions.length?'外部改造':'修缮与改良'}</h3><span>{view.upgradeOptions.filter(u=>u.status==='installed').length} 件已完成</span></header>

    <div className="upgrade-module-list">
      {upgrades.map(upgrade=>{
        const working=view.job?.kind==='upgrade'&&view.job.targetId===upgrade.targetId;
        const installed=upgrade.status==='installed';
        const hasWork=!!view.job;
        return <details key={upgrade.targetId} name="upgrade-part" className="upgrade-module" open={working||undefined}>
          <summary className="upgrade-heading"><strong>{upgrade.pathName}</strong><span>{installed?upgrade.mountSlot?(upgrade.mounted?'正在使用':'已制作 · 已收起'):'已安装':upgrade.status==='planned'?'尚未开放':upgrade.level>0?'待改良':'待制作'}</span></summary>
          <p>{upgrade.detail}</p>
          {upgrade.requiredBlueprint&&<p className="blueprint-requirement">图纸 · {upgrade.requiredBlueprint.name} <span>{upgrade.requiredBlueprint.known?'已收录':'尚未获得'}</span></p>}
          {!!upgrade.materials.length&&<ul className="upgrade-materials">{upgrade.materials.map(material=><li key={material.typeId}><span>{material.name}</span><strong className={material.available<material.required?'is-missing':''}>{material.available} / {material.required}</strong><small>{material.unit}</small></li>)}</ul>}
          {remote?null:working?<><p>正在安装「{upgrade.pathName}」…</p><progress aria-label="改装进度" value={view.job!.progress} max={1}/><button className="context-button" onClick={onCancel}>取消施工</button></>:
            installed&&upgrade.mountSlot?
              !upgrade.near?<button className="context-button" disabled={disabled||hasWork} onClick={()=>onApproach(upgrade.targetId)}>走到安装位置</button>:
              <button className="context-button" title={mountReason} disabled={disabled||hasWork||!!mountReason} onClick={()=>onMount(upgrade.mounted?null:upgrade.targetId)}>{upgrade.mounted?'收起这个配件':'装上这个配件'}</button>:
            installed?<p className="upgrade-installed">已安装在原有设施上</p>:
            upgrade.status==='planned'?(<>{!hasContextActions&&!upgrade.near&&<button className="context-button" disabled={disabled||hasWork} onClick={()=>onApproach(upgrade.targetId)}>走近{upgrade.title}</button>}</>):
            !upgrade.near?<button className="context-button" disabled={disabled||hasWork} onClick={()=>onApproach(upgrade.targetId)}>走到安装位置</button>:
            <button className="context-button" disabled={disabled||hasWork||!upgrade.canStart} onClick={()=>onUpgrade(upgrade.targetId)}>制作并安装</button>}
          {!working&&!installed&&upgrade.reason&&upgrade.status!=='planned'&&upgrade.near&&<p className="action-reason">{upgrade.reason}</p>}
          {!remote&&installed&&upgrade.mountSlot&&upgrade.near&&mountReason&&<p className="action-reason">{mountReason}</p>}
        </details>;
      })}
    </div>
  </section>;
}
