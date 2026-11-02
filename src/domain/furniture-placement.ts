import type {GameState} from './state.ts';
import type {Point} from '../content/world.ts';
import type {Collider} from '../world/layout.ts';
import {WORKSHOP_RULES,WORKBENCH,WORKBENCH_STOOL,SEAT_DEFINITION} from '../content/workshop.ts';
import {canStand} from './navigation.ts';
import {heightAt,slopeAt} from '../world/surface.ts';
import {canonicalInstances,withItemLocation} from './owned-items.ts';
import {inventoryTransaction} from './inventory.ts';
export type PlacementDraft={instanceId:string;point:Point|null;rotation:number;reason:string};
export const workstationColliders=():Collider[]=>[
  {id:WORKBENCH.id,x:WORKBENCH.x,z:WORKBENCH.z,halfX:WORKBENCH.halfX,halfZ:WORKBENCH.halfZ},
  {...WORKBENCH_STOOL},
];
export function furnitureColliders(state:GameState):Collider[]{
  return (state.inventory.instances??[]).flatMap(item=>item.definitionId===SEAT_DEFINITION&&item.location.kind==='world'?[{id:item.instanceId,x:item.location.x,z:item.location.z,radius:WORKSHOP_RULES.seatRadius}]:[]);
}
export function placementReason(state:GameState,id:string,p:Point,blockers:Collider[]){
  const item=state.inventory.instances?.find(i=>i.instanceId===id);
  if(!item||item.definitionId!==SEAT_DEFINITION)return '这件物品暂时不能摆放。';
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return '请选择有效的位置。';
  const r=WORKSHOP_RULES.seatRadius;
  if(!canStand(p,blockers.filter(c=>c.id!==id),r)||slopeAt(p.x,p.z)>WORKSHOP_RULES.maxPlacementSlope)return '这里有障碍、水面或坡度太陡，请换一块空地。';
  const samples=[...Array(8)].map((_,i)=>({x:p.x+Math.cos(i*Math.PI/4)*r,z:p.z+Math.sin(i*Math.PI/4)*r}));
  if(samples.some(q=>!canStand(q,[],0))||Math.max(...samples.map(q=>heightAt(q.x,q.z)))-Math.min(...samples.map(q=>heightAt(q.x,q.z)))>.2)return '木墩底面需要较平整的地面。';
  if(Math.hypot(p.x-state.player.x,p.z-state.player.z)<r+.5)return '这里会挡住你，请稍微挪开一点。';
  // Keep the starter crafting/prayer approach usable; no physics simulation is involved.
  if(Math.hypot(p.x-WORKBENCH.stand.x,p.z-WORKBENCH.stand.z)<r+.8)return '请为工作台留出操作位置。';
  return '';
}
export function placeFurniture(state:GameState,id:string,p:Point,rotation:number,blockers:Collider[]){
  const reason=placementReason(state,id,p,blockers);if(reason)return reason;
  if(!Number.isFinite(rotation))return '朝向无效。';
  const inventory=inventoryTransaction(state.inventory,[]);
  inventory.instances=canonicalInstances((inventory.instances??[]).map(i=>i.instanceId===id?withItemLocation(i,{kind:'world',x:p.x,z:p.z,rotation:((rotation%(Math.PI*2))+Math.PI*2)%(Math.PI*2)}):i));
  state.inventory=inventory;state.route=[];return '木墩已经摆好。';
}
export function packFurniture(state:GameState,id:string){
  const item=state.inventory.instances?.find(i=>i.instanceId===id);
  if(!item||item.definitionId!==SEAT_DEFINITION||item.location.kind!=='world')return '这件物品不在场景中。';
  const inventory=inventoryTransaction(state.inventory,[]);
  inventory.instances=canonicalInstances((inventory.instances??[]).map(i=>i.instanceId===id?withItemLocation(i,{kind:'inventory'}):i));
  state.inventory=inventory;if(state.selected===id)state.selected=null;state.route=[];return '已收回仓库，原来的词条和身份都保留了。';
}
