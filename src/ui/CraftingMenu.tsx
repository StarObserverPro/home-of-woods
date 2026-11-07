import {useState} from 'react';
import type {Runtime,Snapshot} from '../app/runtime.ts';
import {CRAFT_BLUEPRINTS,SEAT_DEFINITION,findBlueprint} from '../content/workshop.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {blueprintSubjectIcon} from './art-icons.ts';
import {IconTabs,ItemBrowser,ItemHeading,MaterialCounts,MenuAction,Pager} from './ItemBrowser.tsx';
import type {MaterialCount,MenuItem} from './ItemBrowser.tsx';
import type {GuidedWorkshopSnapshot} from '../domain/workshop-guided.ts';

type Recipe=MenuItem&{learned:boolean;costs:MaterialCount[];reason:string;blocked:boolean;actionLabel:string;run:(parameters?:Readonly<Record<string,unknown>>,mark?:boolean)=>void;preset?:GuidedWorkshopSnapshot['plans'][number]['presets'];mark?:boolean;note?:string};
const categories=[{id:'all',name:'全部',icon:'inventory'},{id:'furniture',name:'家具',icon:'stump-seat'},{id:'daily',name:'日用',icon:'branch-broom'},{id:'kitchen',name:'餐厨',icon:'soup-pot'}] as const;
function RecipeDetail({item,disabled}:{item:Recipe;disabled:boolean}){
  const [preset,setPreset]=useState('standard'),[mark,setMark]=useState(true);
  const dimensions=item.preset?.find(p=>p.id===preset)??item.preset?.[0];
  return <><ItemHeading name={item.name} icon={item.icon} subtitle={item.learned?'已掌握':'未学习'}/><MaterialCounts items={item.costs}/>
    {item.learned&&item.preset&&<IconTabs label="制作尺寸" tabs={item.preset.map(p=>({id:p.id,name:p.name}))} value={dimensions!.id} onChange={setPreset}/>}
    {item.learned&&item.mark&&<label className="wood-check"><input type="checkbox" checked={mark} disabled={disabled} onChange={e=>setMark(e.target.checked)}/>叶形印记</label>}
    {item.note&&<p className="wood-note">{item.note}</p>}
    {item.blocked&&item.reason&&<p className="wood-reason" role="status">{item.reason}</p>}
    <div className="wood-actions"><MenuAction icon={item.learned?'craft':'blueprint'} disabled={disabled||item.blocked} onClick={()=>item.run(dimensions?.parameters,mark)}>{item.actionLabel}</MenuAction></div>
  </>;
}
export function CraftingMenu({snapshot,runtime,disabled,onUpgrade}:{snapshot:Snapshot;runtime:Runtime|null;disabled:boolean;onUpgrade:()=>void}){
  const view=snapshot.workshop,busy=!!view.job;
  const recipes:Recipe[]=[
    ...CRAFT_BLUEPRINTS.filter(p=>p.definitionId===SEAT_DEFINITION).map(p=>{
      const learned=view.availableBlueprints.includes(p.id);
      return {id:p.id,name:p.name,icon:blueprintSubjectIcon(p.id),category:'furniture',learned,badge:learned?undefined:'◇',costs:[{name:'木料',quantity:1}],reason:'需要 1 份可用木料',blocked:learned&&!view.inputs.craft,actionLabel:learned?'制作':'查看行商',run:()=>learned?runtime?.craft(p.id):runtime?.select(CAMP_VISITOR.id)};
    }),
    ...snapshot.housing.plans.map(p=>({id:p.id,name:p.name,icon:blueprintSubjectIcon(p.id),category:p.id.includes('bell')?'daily':'furniture',learned:p.learned,badge:p.learned?undefined:'◇',costs:p.costs,reason:p.reason,blocked:p.learned&&!p.canCraft,actionLabel:p.learned?'制作':'学习',run:()=>p.learned?runtime?.craft(p.id):runtime?.learnHousing(p.id)})),
    ...snapshot.guidedWorkshop.plans.map(p=>({id:p.id,name:p.name,icon:blueprintSubjectIcon(p.id),category:'furniture',learned:p.learned,badge:p.learned?undefined:'◇',costs:p.costs,reason:p.reason,blocked:snapshot.guidedWorkshop.unlocked&&p.learned&&!p.canStart,actionLabel:!snapshot.guidedWorkshop.unlocked?'改良工作台':p.learned?'开始装配':'学习',preset:p.presets,run:(parameters?:Readonly<Record<string,unknown>>)=>!snapshot.guidedWorkshop.unlocked?onUpgrade():p.learned?runtime?.beginGuidedCraft(p.id,parameters??p.presets[0].parameters):runtime?.learnWorkshopPlan(p.id)})),
    {id:snapshot.broom.blueprint.id,name:'枝扫帚',icon:'branch-broom',category:'daily',learned:snapshot.broom.blueprint.learned,badge:snapshot.broom.blueprint.learned?undefined:'◇',costs:snapshot.broom.blueprint.costs,reason:snapshot.broom.blueprint.reason,blocked:snapshot.broom.blueprint.learned&&!snapshot.broom.blueprint.canCraft,actionLabel:snapshot.broom.blueprint.learned?'制作':'学习',mark:true,run:(_,mark)=>snapshot.broom.blueprint.learned?runtime?.craftBroom(mark??true):runtime?.learnBroom()},
    ...snapshot.mealVessels.plans.map(p=>({id:p.id,name:p.name,icon:blueprintSubjectIcon(p.id),category:'kitchen',learned:p.known,badge:p.known?undefined:'◇',costs:[{name:'原木',available:p.logs,quantity:1}],reason:p.reason,blocked:p.known?!p.canCraft:!p.canLearn,actionLabel:p.known?'制作':'学习',run:()=>p.known?runtime?.craftMealVessel(p.id):runtime?.learnMealVessel(p.id)})),
    ...snapshot.potFoundation.plans.map(p=>({id:p.id,name:p.name,icon:blueprintSubjectIcon(p.id),category:'kitchen',learned:p.known,badge:p.known?undefined:'◇',costs:p.materials.map(m=>({name:m.name,quantity:m.quantity})),reason:p.reason,blocked:!p.known&&!p.canLearn,actionLabel:p.known?'查看火塘':'学习',note:p.known?'到火塘安装':'',run:()=>p.known?runtime?.select(CAMP_PROPS.fire.id):runtime?.learnPotFoundation(p.id)})),
  ];
  if(snapshot.guidedWorkshop.job)return <AssemblyMenu view={snapshot.guidedWorkshop} runtime={runtime} disabled={disabled}/>;
  if(view.job)return <div className="wood-job"><ItemHeading icon="craft" name={findBlueprint(view.job.blueprintId??'')?.name??'正在制作'} subtitle={view.job.phase==='approaching'?'走向工作台':'制作中'}/><progress value={view.job.progress} max={1} aria-label="制作进度"/><MenuAction secondary onClick={()=>runtime?.cancelAction()}>取消</MenuAction></div>;
  return <ItemBrowser label="工作台配方" items={recipes} categories={categories} renderDetail={item=><RecipeDetail item={item} disabled={disabled||busy}/>}/>;
}

function AssemblyMenu({view,runtime,disabled}:{view:GuidedWorkshopSnapshot;runtime:Runtime|null;disabled:boolean}){
  const [tab,setTab]=useState('fit'),[page,setPage]=useState(0);
  const job=view.job!,plan=view.plans.find(p=>p.id===job.blueprintId);
  const dimensions=plan?.dimensions??[],pages=Math.max(1,Math.ceil(dimensions.length/2)),current=Math.min(page,pages-1);
  return <section className="wood-assembly" aria-label="家具装配"><ItemHeading name={job.name} icon={blueprintSubjectIcon(job.blueprintId)} subtitle={job.phaseName}/><progress aria-label="家具装配进度" value={job.progress} max={1}/>
    {job.phase==='fitting'?<>
      <IconTabs label="装配操作" tabs={[{id:'fit',name:'对齐',icon:'craft'},{id:'size',name:'尺寸',icon:'repair'}]} value={tab} onChange={setTab}/>
      {tab==='fit'?<><p className="wood-note">已装 {job.placements.length}/{job.guides.length} 片</p>{job.activePartId&&<>
        <div className="wood-adjust" role="group" aria-label="移动部件">{([['left','←','向左'],['right','→','向右'],['turn-left','↶','左转'],['turn-right','↷','右转']] as const).map(([action,symbol,name])=><button key={action} aria-label={`部件${name}`} disabled={disabled} onClick={()=>runtime?.adjustGuidedPart(action)}>{symbol}</button>)}</div>
        <div className="wood-actions"><MenuAction secondary disabled={disabled} onClick={()=>runtime?.adjustGuidedPart('align')}>贴合</MenuAction><MenuAction disabled={disabled||!job.canSubmit} onClick={()=>runtime?.fitGuidedPart()}>卡入</MenuAction></div>
      </>}{!job.activePartId&&<MenuAction icon="craft" disabled={disabled||!job.canFinish} onClick={()=>runtime?.finishGuidedCraft()}>收尾完成</MenuAction>}</>:<>
        <div className="wood-dimensions">{dimensions.slice(current*2,current*2+2).map(d=><label key={d.key}>{d.label}<output>{job.geometry.parameters[d.key] as number}</output><input aria-label={`装配${d.label}`} type="range" min={d.min} max={d.max} step={d.step} value={job.geometry.parameters[d.key] as number} disabled={disabled} onChange={e=>runtime?.setGuidedCraftDimensions({...job.geometry.parameters,[d.key]:Number(e.currentTarget.value)})}/></label>)}</div><Pager page={current} pages={pages} onChange={setPage} label="尺寸分页"/>
        <div className="wood-adjust" role="group" aria-label="部件前后高低">{([['forward','向前'],['backward','向后'],['raise','抬高'],['lower','放低']] as const).map(([action,name])=><button key={action} disabled={disabled||!job.activePartId} onClick={()=>runtime?.adjustGuidedPart(action)}>{name}</button>)}</div>
      </>}
    </>:<p className="wood-note">{job.phase==='preparing'?'整理木料中':'固定接点中'}</p>}
    {job.reason&&<p className="wood-reason">{job.reason}</p>}<MenuAction secondary disabled={disabled} onClick={()=>runtime?.cancelGuidedCraft()}>取消装配</MenuAction>
  </section>;
}
