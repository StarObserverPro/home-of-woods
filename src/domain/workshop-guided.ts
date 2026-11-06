import {WORKBENCH} from '../content/workshop.ts';
import {WORKBENCH_BRACING,WORKBENCH_BRACING_BLUEPRINT,WORKSHOP_SERIES_BLUEPRINTS,workshopSeries,guidedBlueprint,isGuidedBlueprint} from '../content/workshop-series.ts';
import {craftProfile} from '../content/parametric-crafting.ts';
import {rarityDefinition} from '../content/rarities.ts';
import {createGeometrySpec,verifiedGeometrySpec,geometryParts,assemblyGuides,assessAssembly} from './parametric-crafting.ts';
import type {GeometrySpec,GuidePlacement,AssemblyGuide} from './parametric-crafting.ts';
import type {GameState} from './state.ts';
import {craftMaterialDebits,craftMaterialCosts} from './craft-inputs.ts';
import {isRecord,exactKeys,inventoryTransaction} from './inventory.ts';
import {knowsBlueprint,consumeBlueprintUse} from './blueprint-copies.ts';
import {canonicalInstances} from './owned-items.ts';
import {resolveCraftOutcome} from './crafting-result.ts';
import {gatheringBusy} from './gathering.ts';
import {ritualBusy} from './ritual.ts';
import {upgradeSnapshot} from './upgrades.ts';

export type GuidedAssembly={
  phase:'preparing'|'fitting'|'finishing';geometry:GeometrySpec;
  /** Only accepted pieces are locked. The current candidate remains visibly adjustable. */
  placements:GuidePlacement[];activePartId:string|null;activePose:GuidePlacement|null;
};
export type GuidedPartAdjustment='left'|'right'|'forward'|'backward'|'raise'|'lower'|'turn-left'|'turn-right'|'align';
const near=(host:GameState)=>Math.hypot(host.player.x-WORKBENCH.stand.x,host.player.z-WORKBENCH.stand.z)<=.8;
const unlocked=(host:GameState)=>(host.workshop.upgrades[WORKBENCH_BRACING.id]?.level??0)>=1;
const foreignBusy=(host:GameState)=>!!host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host);
const workGuides=(geometry:GeometrySpec)=>assemblyGuides(geometry).sort((a,b)=>Number(a.role==='surface')-Number(b.role==='surface')||a.id.localeCompare(b.id));
const candidatePose=(guide:AssemblyGuide):GuidePlacement=>({id:guide.id,x:guide.target.x+.5,y:guide.target.y,z:guide.target.z,angle:.55});
const exactPose=(raw:unknown):GuidePlacement=>{
  if(!isRecord(raw))throw new Error('Invalid fitting placement');
  exactKeys(raw,['id','x','y','z','angle']);
  if(typeof raw.id!=='string'||![raw.x,raw.y,raw.z,raw.angle].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=10))throw new Error('Invalid fitting placement');
  return {id:raw.id,x:raw.x as number,y:raw.y as number,z:raw.z as number,angle:raw.angle as number};
};
function aligned(guide:AssemblyGuide,pose:GuidePlacement){
  const distance=Math.hypot(pose.x-guide.target.x,pose.y-guide.target.y,pose.z-guide.target.z);
  const angle=Math.abs(Math.atan2(Math.sin(pose.angle-guide.target.angle),Math.cos(pose.angle-guide.target.angle)));
  return distance<=guide.maxPositionError+1e-8&&angle<=guide.maxAngleError+1e-8;
}
/** Series limits are narrower than the shared geometry generator, not a second mesh format. */
export function guidedGeometry(blueprintId:string,overrides:Readonly<Record<string,unknown>>={}):GeometrySpec{
  const series=workshopSeries(blueprintId);if(!series)throw new Error('Unknown guided blueprint');
  for(const key of Object.keys(overrides))if(!Object.hasOwn(series.defaultParameters,key))throw new Error('Unknown series dimension');
  const parameters:Record<string,unknown>={...series.defaultParameters,...overrides};
  for(const [key,value] of Object.entries(parameters)){
    const rule=series.dimensions.find(d=>d.key===key);
    if(rule){
      if(typeof value!=='number'||!Number.isFinite(value)||value<rule.min-1e-8||value>rule.max+1e-8||Math.abs((value-rule.min)/rule.step-Math.round((value-rule.min)/rule.step))>1e-6)throw new Error('Series dimension out of range');
    }else if(value!==series.defaultParameters[key as keyof typeof series.defaultParameters])throw new Error('Fixed assembly dimension cannot change');
  }
  return createGeometrySpec('bench.supported',parameters);
}
/** In-progress work is saved inside the existing job, never in a parallel crafting owner. */
export function validateGuidedAssembly(raw:unknown,blueprintId:string):GuidedAssembly{
  if(!isRecord(raw))throw new Error('Invalid guided assembly');
  exactKeys(raw,['phase','geometry','placements','activePartId','activePose']);
  if(!['preparing','fitting','finishing'].includes(raw.phase as string)||!Array.isArray(raw.placements))throw new Error('Invalid guided assembly phase');
  const source=verifiedGeometrySpec(raw.geometry),geometry=guidedGeometry(blueprintId,source.parameters);
  if(source.templateId!==geometry.templateId||source.version!==geometry.version||source.family!==geometry.family)throw new Error('Wrong guided geometry');
  const guides=workGuides(geometry),placements=raw.placements.map(exactPose);
  if(placements.length>guides.length||placements.some((pose,index)=>pose.id!==guides[index].id||!aligned(guides[index],pose)))throw new Error('Invalid locked assembly evidence');
  const next=guides[placements.length]??null;
  const activePose=raw.activePose===null?null:exactPose(raw.activePose);
  if(raw.activePartId!==(next?.id??null)||activePose?.id!==(next?.id??undefined)){
    if(!(next===null&&raw.activePartId===null&&activePose===null))throw new Error('Invalid active assembly piece');
  }
  if(raw.phase==='preparing'&&placements.length)throw new Error('Assembly fitting precedes preparation');
  if(raw.phase==='finishing'&&(!assessAssembly(geometry,placements).valid||next!==null))throw new Error('Assembly is incomplete');
  return {phase:raw.phase as GuidedAssembly['phase'],geometry,placements,activePartId:next?.id??null,activePose};
}
function actionReason(host:GameState,blueprintId:string){
  if(!guidedBlueprint(blueprintId)||craftProfile(blueprintId)?.status!=='active')return '这张装配图纸暂时不能使用。';
  if(foreignBusy(host))return '先完成或取消当前劳动。';
  if(!near(host)||host.selected!==WORKBENCH.id)return '先走近并选中工作台，再继续装配。';
  if(!unlocked(host))return '先给工作台装好支架与定位靠山。';
  if(!knowsBlueprint(host.inventory,host.workshop.blueprints,blueprintId))return '先学会这张装配图纸。';
  return '';
}
export function learnWorkshopPlan(host:GameState,blueprintId:string):string{
  const plan=blueprintId===WORKBENCH_BRACING.blueprintId?WORKBENCH_BRACING_BLUEPRINT:guidedBlueprint(blueprintId);
  if(!plan)return '这里没有这张工坊图纸。';
  if(host.workshop.job||foreignBusy(host))return '先完成或取消当前动作。';
  if(!near(host))return '先走近工作台，再展开工坊图纸。';
  if(knowsBlueprint(host.inventory,host.workshop.blueprints,blueprintId))return '这张图纸已经学会了。';
  host.workshop={...host.workshop,blueprints:[...host.workshop.blueprints,blueprintId]};
  return `已学会「${plan.name}」图纸。`;
}
export function beginGuidedCraft(host:GameState,blueprintId:string,overrides:Readonly<Record<string,unknown>>={}):string{
  if(host.workshop.job)return '先完成或取消当前动作。';
  const reason=actionReason(host,blueprintId);if(reason)return reason;
  let geometry:GeometrySpec;try{geometry=guidedGeometry(blueprintId,overrides);}catch{return '尺寸超出图纸范围，未使用材料。';}
  if(!craftMaterialDebits(host,blueprintId))return '装配材料不足，请先备齐原木和枝杈。';
  if(!Number.isSafeInteger(host.workshop.nextAction+1))return '动作编号已用尽。';
  const first=workGuides(geometry)[0];
  host.workshop={...host.workshop,nextAction:host.workshop.nextAction+1,job:{
    id:`workshop-${host.workshop.nextAction}`,kind:'craft',blueprintId,phase:'working',startedAt:host.time,durationSeconds:WORKBENCH_BRACING.prepareSeconds,
    assembly:{phase:'preparing',geometry,placements:[],activePartId:first.id,activePose:candidatePose(first)},
  }};
  host.route=[];host.player.moving=false;host.player.facing=Math.atan2(WORKBENCH.x-host.player.x,WORKBENCH.z-host.player.z);
  return '开始备料，接下来先对齐支撑，再放上面板。完工前不会扣除材料。';
}
function activeAssembly(host:GameState){const job=host.workshop.job;return job?.kind==='craft'&&job.assembly&&job.blueprintId?{job,assembly:job.assembly,blueprintId:job.blueprintId}:null;}
export function setGuidedCraftDimensions(host:GameState,overrides:Readonly<Record<string,unknown>>):string{
  const work=activeAssembly(host);if(!work)return '当前没有进行中的装配。';
  const reason=actionReason(host,work.blueprintId);if(reason)return reason;
  if(work.assembly.phase==='finishing')return '正在收尾，尺寸已经确定。';
  let geometry:GeometrySpec;try{geometry=guidedGeometry(work.blueprintId,{...work.assembly.geometry.parameters,...overrides});}catch{return '尺寸超出图纸范围，原来的装配保留。';}
  const first=workGuides(geometry)[0];
  host.workshop={...host.workshop,job:{...work.job,assembly:{phase:work.assembly.phase,geometry,placements:[],activePartId:first.id,activePose:candidatePose(first)}}};
  return '尺寸已调整，支撑和面板需要按新位置重新对齐。';
}
export function adjustGuidedPart(host:GameState,action:GuidedPartAdjustment):string{
  const work=activeAssembly(host);if(!work||work.assembly.phase!=='fitting'||!work.assembly.activePose)return '先备好料，再调整当前部件。';
  const reason=actionReason(host,work.blueprintId);if(reason)return reason;
  const guide=workGuides(work.assembly.geometry).find(g=>g.id===work.assembly.activePartId)!;
  const pose={...work.assembly.activePose},round=(value:number)=>Math.round(value*1e6)/1e6;
  switch(action){
    case 'left':pose.x=round(pose.x-WORKBENCH_BRACING.adjustPositionStep);break;
    case 'right':pose.x=round(pose.x+WORKBENCH_BRACING.adjustPositionStep);break;
    case 'forward':pose.z=round(pose.z-WORKBENCH_BRACING.adjustPositionStep);break;
    case 'backward':pose.z=round(pose.z+WORKBENCH_BRACING.adjustPositionStep);break;
    case 'raise':pose.y=round(pose.y+WORKBENCH_BRACING.adjustHeightStep);break;
    case 'lower':pose.y=round(pose.y-WORKBENCH_BRACING.adjustHeightStep);break;
    case 'turn-left':pose.angle=round(pose.angle-WORKBENCH_BRACING.adjustAngleStep);break;
    case 'turn-right':pose.angle=round(pose.angle+WORKBENCH_BRACING.adjustAngleStep);break;
    case 'align':Object.assign(pose,{...guide.target,id:guide.id});break;
    default:return '没有这个对齐操作。';
  }
  try{exactPose(pose);}catch{return '部件偏离工作台太远，请先向导向线靠拢。';}
  host.workshop={...host.workshop,job:{...work.job,assembly:{...work.assembly,activePose:pose}}};
  return aligned(guide,pose)?'部件已进入导向范围，可以卡入。':'继续对着导向线移动或转动部件。';
}
export function submitGuidedPart(host:GameState,placement?:GuidePlacement):string{
  const work=activeAssembly(host);if(!work||work.assembly.phase!=='fitting'||!work.assembly.activePartId)return '当前没有待卡入的部件。';
  const reason=actionReason(host,work.blueprintId);if(reason)return reason;
  let pose:GuidePlacement;try{pose=exactPose(placement??work.assembly.activePose);}catch{return '试放位置无效，原来的装配保留。';}
  const guides=workGuides(work.assembly.geometry),guide=guides.find(g=>g.id===work.assembly.activePartId)!;
  if(pose.id!==guide.id)return '请先完成当前高亮的部件。';
  if(!aligned(guide,pose)){
    host.workshop={...host.workshop,job:{...work.job,assembly:{...work.assembly,activePose:pose}}};
    return '还没对齐：把部件移回导向范围，再试着卡入。';
  }
  const placements=[...work.assembly.placements,pose],next=guides[placements.length]??null;
  host.workshop={...host.workshop,job:{...work.job,assembly:{...work.assembly,placements,activePartId:next?.id??null,activePose:next?candidatePose(next):null}}};
  return next?'这一片已经卡好，继续对齐下一片。':'支撑与面板都已卡好，可以收尾完成。';
}
export function finishGuidedCraft(host:GameState):string{
  const work=activeAssembly(host);if(!work||work.assembly.phase!=='fitting')return '先把支撑与面板装好，再开始收尾。';
  const reason=actionReason(host,work.blueprintId);if(reason)return reason;
  if(!assessAssembly(work.assembly.geometry,work.assembly.placements).valid)return '还有部件没装好，材料尚未扣除。';
  if(!craftMaterialDebits(host,work.blueprintId))return '材料已不足，装配保留，备齐后再收尾。';
  host.workshop={...host.workshop,job:{...work.job,startedAt:host.time,durationSeconds:WORKBENCH_BRACING.finishSeconds,assembly:{...work.assembly,phase:'finishing'}}};
  return '开始收尾，片刻后把整件家具收入仓库。';
}
export function cancelGuidedCraft(host:GameState):string{
  if(!activeAssembly(host))return '当前没有进行中的装配。';
  host.workshop={...host.workshop,job:null};host.route=[];host.player.moving=false;
  return '装配已取消，原料没有扣除。';
}
function cancelInvalid(host:GameState,message:string){host.workshop={...host.workshop,job:null};host.route=[];host.player.moving=false;return message;}
/** Called only by the one workshop updater; animation never submits this transaction. */
export function advanceGuidedWorkshop(host:GameState):string|null{
  const work=activeAssembly(host);if(!work)return null;
  const reason=actionReason(host,work.blueprintId);if(reason)return cancelInvalid(host,reason+'装配已取消，材料未扣。');
  let assembly:GuidedAssembly;try{assembly=validateGuidedAssembly(work.assembly,work.blueprintId);}catch{return cancelInvalid(host,'装配资料不完整，已取消且未扣材料。');}
  if(assembly.phase==='preparing'){
    if(host.time-work.job.startedAt!<work.job.durationSeconds)return null;
    host.workshop={...host.workshop,job:{...work.job,assembly:{...assembly,phase:'fitting'}}};
    return '备料完成。先对齐支撑，再将面板卡入。';
  }
  if(assembly.phase==='fitting'||host.time-work.job.startedAt!<work.job.durationSeconds)return null;
  const debits=craftMaterialDebits(host,work.blueprintId);
  if(!debits)return cancelInvalid(host,'材料已不足，本次装配未扣料。');
  if(!Number.isSafeInteger(host.workshop.nextInstance+1))return cancelInvalid(host,'物品编号已用尽，材料未扣除。');
  const outcome=resolveCraftOutcome(work.blueprintId,host.seed,host.workshop.nextInstance,{mode:'guided',geometryParameters:assembly.geometry.parameters,placements:assembly.placements});
  const plan=guidedBlueprint(work.blueprintId)!,assessment=assessAssembly(assembly.geometry,assembly.placements);
  let inventory=inventoryTransaction(host.inventory,debits);
  inventory=consumeBlueprintUse(inventory,host.workshop.blueprints,work.blueprintId);
  const instanceId=`crafted-${host.seed}-${host.workshop.nextInstance}`;
  inventory.instances=canonicalInstances([...(inventory.instances??[]),{
    instanceId,definitionId:plan.definitionId,blueprintId:work.blueprintId,createdAt:host.time,
    rarityId:outcome.rarityId,traits:[],geometry:outcome.geometry,
    crafting:{...outcome.crafting,facilityId:WORKBENCH.id,facilityUpgrade:WORKBENCH_BRACING.id,processTier:2,
      assembly:{placements:structuredClone(assembly.placements),deviations:structuredClone(assessment.deviations)}},
    location:{kind:'inventory'},
  }]);
  const result=`「${rarityDefinition(outcome.rarityId).name} · ${plan.name}」已装配完成，收入仓库。`;
  Object.assign(host,{inventory,workshop:{...host.workshop,nextInstance:host.workshop.nextInstance+1,job:null,lastResponse:result}});
  return result;
}
export function guidedWorkshopSnapshot(host:GameState){
  const facilityReady=unlocked(host),isNear=near(host);
  const plans=WORKSHOP_SERIES_BLUEPRINTS.map(plan=>{
    const geometry=guidedGeometry(plan.id),series=workshopSeries(plan.id)!;
    const learned=knowsBlueprint(host.inventory,host.workshop.blueprints,plan.id);
    const reason=host.workshop.job?'先完成或取消当前动作。':actionReason(host,plan.id)||(!craftMaterialDebits(host,plan.id)?'先备齐装配材料。':'');
    return {id:plan.id,name:plan.name,definitionId:plan.definitionId,learned,canStart:!reason,reason,geometry,
      dimensions:series.dimensions.map(d=>({...d,value:geometry.parameters[d.key] as number})),presets:structuredClone(series.presets),costs:craftMaterialCosts(host,plan.id)};
  });
  const work=activeAssembly(host);
  const job=work?(()=>{
    const assembly=work.assembly,guides=workGuides(assembly.geometry),activeGuide=guides.find(g=>g.id===assembly.activePartId)??null;
    const reason=actionReason(host,work.blueprintId);
    const assessment=assessAssembly(assembly.geometry,assembly.placements);
    return {id:work.job.id,blueprintId:work.blueprintId,name:guidedBlueprint(work.blueprintId)!.name,
      phase:assembly.phase,phaseName:{preparing:'备料',fitting:'对齐装配',finishing:'收尾'}[assembly.phase],
      progress:assembly.phase==='fitting'?assembly.placements.length/guides.length:Math.min(1,Math.max(0,(host.time-work.job.startedAt!)/work.job.durationSeconds)),
      geometry:structuredClone(assembly.geometry),parts:geometryParts(assembly.geometry),guides,
      placements:structuredClone(assembly.placements),activePartId:assembly.activePartId,activePose:structuredClone(assembly.activePose),activeGuide,
      canSubmit:!reason&&assembly.phase==='fitting'&&!!activeGuide&&!!assembly.activePose&&aligned(activeGuide,assembly.activePose),
      canFinish:!reason&&assembly.phase==='fitting'&&assessment.valid&&!!craftMaterialDebits(host,work.blueprintId),assessment,reason};
  })():null;
  return {unlocked:facilityReady,near:isNear,plans,upgrade:upgradeSnapshot(host,WORKBENCH_BRACING.id),
    upgradeBlueprint:{id:WORKBENCH_BRACING.blueprintId,name:WORKBENCH_BRACING_BLUEPRINT.name,learned:knowsBlueprint(host.inventory,host.workshop.blueprints,WORKBENCH_BRACING.blueprintId)},job};
}
export type GuidedWorkshopSnapshot=ReturnType<typeof guidedWorkshopSnapshot>;
