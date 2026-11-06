import {POT_FOUNDATION_TARGETS} from '../content/food.ts';
import {WORKBENCH,findBlueprint} from '../content/workshop.ts';
import {findUpgradeProfile} from '../content/upgrades.ts';
import type {GameState} from './state.ts';
import {gatheringBusy} from './gathering.ts';
import {ritualBusy} from './ritual.ts';

const near=(host:GameState)=>Math.hypot(host.player.x-WORKBENCH.stand.x,host.player.z-WORKBENCH.stand.z)<=.8;
const plans=()=>POT_FOUNDATION_TARGETS.map(targetId=>{
  const path=findUpgradeProfile(targetId)!.paths[0],plan=findBlueprint(path.blueprintId)!;
  return {id:plan.id,targetId,name:plan.name,materials:path.materials};
});
function learningReason(host:GameState,id:string):string{
  if(!plans().some(plan=>plan.id===id))return '这里没有这张基础炊具图纸。';
  if(host.workshop.job||host.forestry.active||gatheringBusy(host.gathering)||ritualBusy(host))return '先完成或取消当前动作，再展开图纸。';
  if(!near(host))return '先走近工作台，再展开基础炊具图纸。';
  if(host.workshop.blueprints.includes(id))return '这张图纸已经学会了。';
  return '';
}
/** Knowledge shares the existing workshop ledger; no item, fitting or material is granted. */
export function learnPotFoundation(host:GameState,blueprintId:string):string{
  const reason=learningReason(host,blueprintId);if(reason)return reason;
  const plan=plans().find(plan=>plan.id===blueprintId)!;
  const message=`已学会「${plan.name}」。备好材料后，到火塘旁按顺序安装。`;
  host.workshop={...host.workshop,blueprints:[...host.workshop.blueprints,blueprintId],lastResponse:message};
  return message;
}
export function potFoundationSnapshot(host:GameState){
  return {near:near(host),plans:plans().map(plan=>{
    const reason=learningReason(host,plan.id);
    return {...plan,known:host.workshop.blueprints.includes(plan.id),canLearn:!reason,reason};
  })};
}
export type PotFoundationSnapshot=ReturnType<typeof potFoundationSnapshot>;
