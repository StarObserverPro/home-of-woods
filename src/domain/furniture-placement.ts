import type {GameState} from './state.ts';
import type {Point} from '../content/world.ts';
import type {Collider} from '../world/layout.ts';
import {WORKSHOP_RULES,WORKBENCH,WORKBENCH_STOOL,SEAT_DEFINITION} from '../content/workshop.ts';
import {canStand} from './navigation.ts';
import {heightAt,slopeAt} from '../world/surface.ts';
import {canonicalInstances,withItemLocation} from './owned-items.ts';
import {inventoryTransaction} from './inventory.ts';
import {ITEM_REACH,interactionAccess} from './interaction-access.ts';
import {HOUSING,housingItemName,isHousingFurniture} from '../content/housing.ts';
import {WORKSHOP_SERIES} from '../content/workshop-series.ts';
import {createGeometrySpec,verifiedGeometrySpec} from './parametric-crafting.ts';
import type {GeometrySpec} from './parametric-crafting.ts';
import type {OwnedItem} from './owned-items.ts';
import {BROOM} from '../content/broom.ts';
const furnitureDefinition=(id:string)=>id===SEAT_DEFINITION||isHousingFurniture(id)||id===BROOM.definitionId;
/** Missing old geometry has an explicit default; unsupported saved geometry is never guessed. */
export function furnitureGeometry(item:OwnedItem):GeometrySpec|null{
  if(!furnitureDefinition(item.definitionId))return null;
  if(Object.hasOwn(item,'geometry')){
    try{
      const geometry=verifiedGeometrySpec(item.geometry);
      const expected=item.definitionId===SEAT_DEFINITION?'stump.round':item.definitionId===BROOM.definitionId?'broom.bundle':'bench.supported';
      if(geometry.templateId!==expected)return null;
      return geometry;
    }catch{return null;}
  }
  return item.definitionId===SEAT_DEFINITION?createGeometrySpec('stump.round'):item.definitionId===BROOM.definitionId?createGeometrySpec('broom.bundle',BROOM.geometry):
    createGeometrySpec('bench.supported',item.definitionId===HOUSING.guestBench.definitionId?HOUSING.guestBench.geometry:WORKSHOP_SERIES['blueprint.prep-side-table'].defaultParameters);
}
export function furnitureRadius(item:OwnedItem):number{
  if(item.definitionId===SEAT_DEFINITION)return WORKSHOP_RULES.seatRadius;
  if(item.definitionId===BROOM.definitionId)return BROOM.radius;
  const geometry=furnitureGeometry(item);if(!geometry)return HOUSING.guestBench.radius;
  const length=geometry.parameters.length as number,width=geometry.parameters.width as number;
  return Math.round((Math.ceil(Math.hypot(length/2,width/2)*20)/20+.1)*100)/100;
}
const busy=(s:GameState)=>!!s.forestry.active||!!s.workshop.job||
  (!!s.gathering.action&&['approaching','performing'].includes(s.gathering.action.phase))||
  (!!s.ritual&&['approaching','performing'].includes(s.ritual.phase));
export type PlacementDraft={instanceId:string;point:Point|null;rotation:number;reason:string};
export const workstationColliders=():Collider[]=>[
  {id:WORKBENCH.id,x:WORKBENCH.x,z:WORKBENCH.z,halfX:WORKBENCH.halfX,halfZ:WORKBENCH.halfZ},
  {...WORKBENCH_STOOL},
];
export function furnitureColliders(state:GameState):Collider[]{
  return (state.inventory.instances??[]).flatMap(item=>furnitureDefinition(item.definitionId)&&item.location.kind==='world'?[{id:item.instanceId,x:item.location.x,z:item.location.z,radius:furnitureRadius(item)}]:[]);
}
export function placementReason(state:GameState,id:string,p:Point,blockers:Collider[]){
  const item=state.inventory.instances?.find(i=>i.instanceId===id);
  if(!item||!furnitureDefinition(item.definitionId)||!['inventory','world'].includes(item.location.kind))return '这件物品暂时不能摆放。';
  if(!furnitureGeometry(item))return '这件家具的形体暂时不能识别，请保留原物。';
  if(busy(state))return '先完成或取消当前动作，再摆放家具。';
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z))return '请选择有效的位置。';
  if(Math.hypot(p.x-state.player.x,p.z-state.player.z)>ITEM_REACH)return '这里离你太远，请先走近再摆放。';
  if(item.location.kind==='world'&&!interactionAccess(state,id)?.near)return '先走近这件家具，再移动它。';
  const r=furnitureRadius(item);
  if(!canStand(p,blockers.filter(c=>c.id!==id),r)||slopeAt(p.x,p.z)>WORKSHOP_RULES.maxPlacementSlope)return '这里有障碍、水面或坡度太陡，请换一块空地。';
  const samples=[...Array(8)].map((_,i)=>({x:p.x+Math.cos(i*Math.PI/4)*r,z:p.z+Math.sin(i*Math.PI/4)*r}));
  if(samples.some(q=>!canStand(q,[],0))||Math.max(...samples.map(q=>heightAt(q.x,q.z)))-Math.min(...samples.map(q=>heightAt(q.x,q.z)))>.2)return '家具底面需要较平整的地面。';
  if(Math.hypot(p.x-state.player.x,p.z-state.player.z)<r+.5)return '这里会挡住你，请稍微挪开一点。';
  // Keep the starter crafting/prayer approach usable; no physics simulation is involved.
  if(Math.hypot(p.x-WORKBENCH.stand.x,p.z-WORKBENCH.stand.z)<r+.8)return '请为工作台留出操作位置。';
  return '';
}
/** Seed a reachable preview, leaving the actual placement to explicit confirmation. */
export function suggestFurniturePlacement(state:GameState,id:string,blockers:Collider[]):Point|null{
  for(const radius of [2.4,2.8,3.2,3.6,3.85])for(let index=0;index<96;index++){
    const angle=index*Math.PI*2/96;
    const point={x:state.player.x+Math.cos(angle)*radius,z:state.player.z+Math.sin(angle)*radius};
    if(!placementReason(state,id,point,blockers))return point;
  }
  return null;
}
export function placeFurniture(state:GameState,id:string,p:Point,rotation:number,blockers:Collider[]){
  const reason=placementReason(state,id,p,blockers);if(reason)return reason;
  if(!Number.isFinite(rotation))return '朝向无效。';
  const inventory=inventoryTransaction(state.inventory,[]);
  inventory.instances=canonicalInstances((inventory.instances??[]).map(i=>i.instanceId===id?withItemLocation(i,{kind:'world',x:p.x,z:p.z,rotation:((rotation%(Math.PI*2))+Math.PI*2)%(Math.PI*2)}):i));
  state.inventory=inventory;state.route=[];return `${housingItemName(inventory.instances!.find(i=>i.instanceId===id)!.definitionId)}已经摆好。`;
}
export function packFurniture(state:GameState,id:string){
  const item=state.inventory.instances?.find(i=>i.instanceId===id);
  if(!item||!furnitureDefinition(item.definitionId)||item.location.kind!=='world')return '这件物品不在场景中。';
  if(busy(state))return '先完成或取消当前动作，再收回家具。';
  if(!interactionAccess(state,id)?.near)return '先走近这件家具，再收回仓库。';
  const inventory=inventoryTransaction(state.inventory,[]);
  inventory.instances=canonicalInstances((inventory.instances??[]).map(i=>i.instanceId===id?withItemLocation(i,{kind:'inventory'}):i));
  state.inventory=inventory;if(state.selected===id)state.selected=null;state.route=[];return '已收回仓库，原来的词条和身份都保留了。';
}
