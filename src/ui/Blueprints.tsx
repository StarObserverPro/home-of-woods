import {BLUEPRINTS,WORKBENCH} from '../content/workshop.ts';
import type {WorkshopSnapshot} from '../domain/workshop.ts';
import {findUpgradeProfile,upgradeHostId} from '../content/upgrades.ts';
import {blueprintSubjectIcon} from './art-icons.ts';
import {ItemBrowser,ItemHeading,ItemNotes,MaterialCounts,MenuAction} from './ItemBrowser.tsx';

export function BlueprintLibrary({view,onSelect}:{view:WorkshopSnapshot;onSelect:(id:string)=>void}){
  const items=BLUEPRINTS.map(plan=>({id:plan.id,name:plan.name,icon:blueprintSubjectIcon(plan.id),category:plan.kind,plan,badge:view.availableBlueprints.includes(plan.id)?undefined:'◇'}));
  return <ItemBrowser label="图纸" items={items} categories={[{id:'all',name:'全部',icon:'blueprint'},{id:'craft',name:'制作',icon:'craft'},{id:'upgrade',name:'改造',icon:'repair'}]} renderDetail={({plan,icon})=>{
    const ready=view.availableBlueprints.includes(plan.id),known=view.blueprints.includes(plan.id),uses=(view.copyUses[plan.id]??[]).reduce((n,v)=>n+v,0);
    const materials=plan.kind==='upgrade'?findUpgradeProfile(plan.targetId)?.paths.find(p=>p.blueprintId===plan.id)?.materials??[]:[];
    return <><ItemHeading name={plan.name} icon={icon} subtitle={known?'已掌握':uses?`可用 ${uses} 次`:'未获得'}/><ItemNotes text={`${plan.description} ${plan.source} ${plan.targetLabel}`}>
      {!!materials.length&&<MaterialCounts items={materials.map(m=>({name:m.name,quantity:m.quantity}))}/>}
      {!ready&&<p className="wood-note">{plan.source}</p>}
      <MenuAction icon={plan.kind==='upgrade'?'repair':'workbench'} onClick={()=>onSelect(plan.kind==='upgrade'?upgradeHostId(plan.targetId):WORKBENCH.id)}>{plan.kind==='upgrade'?'查看设施':'查看工作台'}</MenuAction>
    </ItemNotes></>;
  }}/>;
}

export function UpgradeControls({view,disabled,mountReason='',onApproach,onUpgrade,onMount,onCancel,onLearn}:{
  view:WorkshopSnapshot;remote?:boolean;disabled:boolean;hasContextActions:boolean;onApproach:(id:string)=>void;
  mountReason?:string;onUpgrade:(id:string)=>void;onMount:(id:string|null)=>void;onCancel:()=>void;onLearn?:(id:string)=>void;
}){
  const upgrades=view.upgradeOptions.length?view.upgradeOptions:view.upgrade?[view.upgrade]:[];
  const items=upgrades.map(upgrade=>({id:upgrade.targetId,name:upgrade.pathName,icon:blueprintSubjectIcon(upgrade.requiredBlueprint?.id??upgrade.targetId),upgrade,badge:upgrade.status==='installed'?'✓':undefined}));
  return <ItemBrowser label="设施改造" items={items} empty="这里没有可用的改造" renderDetail={({upgrade,icon})=>{
    const working=view.job?.kind==='upgrade'&&view.job.targetId===upgrade.targetId,installed=upgrade.status==='installed',busy=!!view.job;
    const canLearn=upgrade.targetId==='camp-workbench:bracing'&&upgrade.requiredBlueprint&&!upgrade.requiredBlueprint.known&&onLearn;
    return <><ItemHeading name={upgrade.pathName} icon={icon} subtitle={installed?(upgrade.mountSlot?(upgrade.mounted?'使用中':'已收起'):'已安装'):upgrade.requiredBlueprint?.known?'已掌握图纸':'待制作'}/>
      <ItemNotes text={upgrade.detail}>
        {!installed&&<MaterialCounts items={upgrade.materials.map(m=>({name:m.name,available:m.available,quantity:m.required}))}/>}
        {working?<><progress aria-label="改装进度" value={view.job!.progress} max={1}/><MenuAction secondary onClick={onCancel}>取消施工</MenuAction></>:
          !upgrade.near?<MenuAction icon="route" disabled={disabled||busy} onClick={()=>onApproach(upgrade.targetId)}>走近</MenuAction>:
          canLearn?<MenuAction icon="blueprint" disabled={disabled||busy} onClick={()=>onLearn!(upgrade.requiredBlueprint!.id)}>学习</MenuAction>:
          installed&&upgrade.mountSlot?<MenuAction icon="repair" disabled={disabled||busy||!!mountReason} onClick={()=>onMount(upgrade.mounted?null:upgrade.targetId)}>{upgrade.mounted?'收起':'装上'}</MenuAction>:
          !installed?<MenuAction icon="repair" disabled={disabled||busy||!upgrade.canStart||upgrade.status==='planned'} onClick={()=>onUpgrade(upgrade.targetId)}>{upgrade.status==='planned'?'尚未开放':'制作安装'}</MenuAction>:null}
        {!working&&!installed&&!canLearn&&upgrade.reason&&upgrade.status!=='planned'&&upgrade.near&&<p className="wood-reason">{upgrade.reason}</p>}
        {installed&&upgrade.mountSlot&&upgrade.near&&mountReason&&<p className="wood-reason">{mountReason}</p>}
      </ItemNotes></>;
  }}/>;
}
