import {HOUSING,HOUSING_BLUEPRINTS,housingBlueprint,isHousingItem,isHousingFurniture} from '../content/housing.ts';
import {craftProfile} from '../content/parametric-crafting.ts';
import {WORKBENCH} from '../content/workshop.ts';
import type {GameState} from './state.ts';
import type {Collider} from '../world/layout.ts';
import {beginWorkshop,craftMaterialDebits} from './workshop.ts';
import {knowsBlueprint} from './blueprint-copies.ts';
import {ITEM_CATALOG} from './item-catalog.ts';
import {recognizedStack} from './inventory.ts';
import {isAvailableMaterial} from './transport-location.ts';
import {mountIndependentItem,unmountIndependentItem} from './item-attachments.ts';
import {interactionAccess} from './interaction-access.ts';
import {furnitureGeometry,furnitureRadius} from './furniture-placement.ts';
import {BENCH_SEATING,STUMP_SEATING} from '../content/seating.ts';
import {DINING_SEAT} from '../content/scene-props.ts';
import {canStand} from './navigation.ts';
import {heightAt} from '../world/surface.ts';

const busy=(s:GameState)=>!!s.forestry.active||!!s.workshop.job||
  (!!s.gathering.action&&['approaching','performing'].includes(s.gathering.action.phase))||
  (!!s.ritual&&['approaching','performing'].includes(s.ritual.phase));
const workbenchNear=(host:GameState)=>Math.hypot(host.player.x-WORKBENCH.stand.x,host.player.z-WORKBENCH.stand.z)<=.8;
const hostNear=(host:GameState)=>Math.hypot(host.player.x-HOUSING.doorbell.point.x,host.player.z-HOUSING.doorbell.point.z)<=HOUSING.doorbell.reach;

/** Explicit learning action: proximity is checked even if called without the UI. */
export function learnHousingBlueprint(host:GameState,id:string):string{
  const plan=housingBlueprint(id);if(!plan)return '这里没有这张基础图纸。';
  if(busy(host))return '先完成或取消当前动作。';
  if(!workbenchNear(host))return '先走近工作台，再展开基础手作图纸。';
  if(knowsBlueprint(host.inventory,host.workshop.blueprints,id))return '这张图纸已经学会了。';
  host.workshop={...host.workshop,blueprints:[...host.workshop.blueprints,id]};
  return `已学会「${plan.name}」图纸，备好材料即可动手。`;
}
export function beginHousingCraft(host:GameState,id:string,blockers:Collider[]):string{
  if(!housingBlueprint(id))return '这张图纸暂时不能制作。';
  if(busy(host))return '先完成或取消当前动作。';
  if(!workbenchNear(host))return '先走近工作台，再开始制作。';
  return beginWorkshop(host,'craft',blockers,id);
}
/** Shared preflight for mount, detach and ordinary use; visual callbacks do not grant resources. */
export function housingActionReason(host:GameState,instanceId:string):string{
  const item=host.inventory.instances?.find(item=>item.instanceId===instanceId);
  if(!item||!isHousingItem(item.definitionId))return '没有找到这件营地物品。';
  if(busy(host))return '先完成或取消当前动作。';
  if(item.definitionId===HOUSING.doorbell.definitionId&&!hostNear(host))return '先走近木屋门前，再操作门铃。';
  if(isHousingFurniture(item.definitionId)&&item.location.kind==='world'&&!interactionAccess(host,instanceId)?.near)return '先走近家具，再使用或移动它。';
  return '';
}
export function mountHousingItem(host:GameState,instanceId:string):string{
  const reason=housingActionReason(host,instanceId);if(reason)return reason;
  const item=host.inventory.instances?.find(item=>item.instanceId===instanceId)!;
  if(item.definitionId!==HOUSING.doorbell.definitionId||item.location.kind!=='inventory')return '请从仓库选择一只松果门铃。';
  if(host.inventory.instances?.some(other=>other.location.kind==='mounted'&&other.location.hostId===HOUSING.doorbell.hostId&&other.location.slotId===HOUSING.doorbell.slotId))return '门边已经挂着东西，请先拆下原来的挂件。';
  host.inventory=mountIndependentItem(host.inventory,instanceId,HOUSING.doorbell.hostId,HOUSING.doorbell.slotId);
  return '松果门铃已经挂在门前，轻拉短绳便会响。';
}
export function detachHousingItem(host:GameState,instanceId:string):string{
  const reason=housingActionReason(host,instanceId);if(reason)return reason;
  const item=host.inventory.instances?.find(item=>item.instanceId===instanceId)!;
  if(item.definitionId!==HOUSING.doorbell.definitionId||item.location.kind!=='mounted'||item.location.hostId!==HOUSING.doorbell.hostId||item.location.slotId!==HOUSING.doorbell.slotId)return '这只门铃没有挂在木屋上。';
  host.inventory=unmountIndependentItem(host.inventory,instanceId);
  if(host.selected===instanceId)host.selected=null;
  return '门铃已拆回仓库，还是原来那只。';
}
export function ringHousingBell(host:GameState,instanceId:string):string{
  const reason=housingActionReason(host,instanceId);if(reason)return reason;
  const item=host.inventory.instances?.find(item=>item.instanceId===instanceId)!;
  if(item.definitionId!==HOUSING.doorbell.definitionId||item.location.kind!=='mounted'||item.location.hostId!==HOUSING.doorbell.hostId||item.location.slotId!==HOUSING.doorbell.slotId)return '先把门铃挂在木屋门前。';
  return '叮咚——松果轻轻撞响了木铃。';
}
/** Only presentation borrows the seat; the collision-valid world position remains at stand. */
export function benchReadingSpot(host:GameState,instanceId:string){
  const item=host.inventory.instances?.find(item=>item.instanceId===instanceId);
  if(item?.definitionId!==HOUSING.guestBench.definitionId||item.location.kind!=='world')return null;
  const geometry=furnitureGeometry(item);if(!geometry)return null;
  const location=item.location,c=Math.cos(location.rotation),s=Math.sin(location.rotation);
  const transform=(point:{x:number;z:number})=>({x:location.x+c*point.x+s*point.z,z:location.z-s*point.x+c*point.z});
  const height=geometry.parameters.height as number;
  const width=geometry.parameters.width as number;
  return {stand:transform({x:0,z:furnitureRadius(item)+BENCH_SEATING.standMargin}),seat:{...transform({x:0,z:width/2+BENCH_SEATING.seatFrontOffset}),facing:location.rotation+HOUSING.guestBench.facingOffset,height,width,
    surfaceY:heightAt(location.x,location.z)+BENCH_SEATING.baseOffset+height}};
}
export type BenchReadingSpot=NonNullable<ReturnType<typeof benchReadingSpot>>;
export type BenchReadingAccess={spot:BenchReadingSpot|null;frontStand:{x:number;z:number}|null;code:'ready'|'approach'|'busy'|'blocked'|'invalid';requiresApproach:boolean;reason:string};
export function diningReadingSpot():BenchReadingSpot{
  const front={x:Math.sin(DINING_SEAT.facing),z:Math.cos(DINING_SEAT.facing)};
  return {stand:{x:DINING_SEAT.x+front.x*STUMP_SEATING.standDistance,z:DINING_SEAT.z+front.z*STUMP_SEATING.standDistance},
    seat:{x:DINING_SEAT.x+front.x*STUMP_SEATING.seatForward,z:DINING_SEAT.z+front.z*STUMP_SEATING.seatForward,
      facing:DINING_SEAT.facing,height:DINING_SEAT.height,width:STUMP_SEATING.radius*2,
      surfaceY:heightAt(DINING_SEAT.x,DINING_SEAT.z)+DINING_SEAT.height}};
}
/** The rendered reading stump is a real obstacle, independent of which seat is selected. */
export const seatingColliders=():Collider[]=>[{id:STUMP_SEATING.id,x:DINING_SEAT.x,z:DINING_SEAT.z,radius:STUMP_SEATING.radius}];
/** Oriented seated-body envelope against the same world colliders used for walking. */
function seatedBodyBlocked(seat:BenchReadingSpot['seat'],blockers:Collider[]){
  const c=Math.cos(seat.facing),s=Math.sin(seat.facing),centerZ=(BENCH_SEATING.frontZ+BENCH_SEATING.backZ)/2,halfZ=(BENCH_SEATING.frontZ-BENCH_SEATING.backZ)/2;
  const right={x:c,z:-s},front={x:s,z:c},center={x:seat.x+front.x*centerZ,z:seat.z+front.z*centerZ};
  return blockers.some(blocker=>{
    if('radius'in blocker){
      const dx=blocker.x-seat.x,dz=blocker.z-seat.z;
      const x=c*dx-s*dz,z=s*dx+c*dz;
      const nx=Math.max(0,Math.abs(x)-BENCH_SEATING.halfWidth),nz=Math.max(0,Math.abs(z-centerZ)-halfZ);
      return Math.hypot(nx,nz)<blocker.radius+BENCH_SEATING.bodyMargin;
    }
    return [{x:1,z:0},{x:0,z:1},right,front].every(axis=>{
      const distance=Math.abs((blocker.x-center.x)*axis.x+(blocker.z-center.z)*axis.z);
      const seatedRadius=BENCH_SEATING.halfWidth*Math.abs(right.x*axis.x+right.z*axis.z)+halfZ*Math.abs(front.x*axis.x+front.z*axis.z);
      const otherRadius=blocker.halfX*Math.abs(axis.x)+blocker.halfZ*Math.abs(axis.z);
      return distance<seatedRadius+otherRadius+BENCH_SEATING.bodyMargin;
    });
  });
}
/** Pure preflight shared by sitting, approaching and the eventual safe return to standing. */
function seatingAccess(host:GameState,spot:BenchReadingSpot|null,instanceId:string,sourceBlockers:Collider[]):BenchReadingAccess{
  const blockers=[...sourceBlockers,...seatingColliders().filter(c=>!sourceBlockers.some(existing=>existing.id===c.id))];
  const noun=instanceId===STUMP_SEATING.id?'木墩':'长凳';
  const response=(code:BenchReadingAccess['code'],reason:string):BenchReadingAccess=>({spot,frontStand:spot?.stand??null,code,requiresApproach:code==='approach',reason});
  if(!spot)return response('invalid','先把可坐的长凳摆好，再坐下读故事。');
  if(busy(host))return response('busy','先完成或取消当前动作，再坐下来。');
  if(!canStand(host.player,blockers))return response('blocked','你现在的站位被挡住了，请先走到空地。');
  if(!canStand(spot.stand,blockers))return response('blocked',`${noun}前的起身位置被挡住了，请挪开前方物品或移动家具。`);
  const otherBlockers=blockers.filter(c=>c.id!==instanceId);
  if(seatedBodyBlocked(spot.seat,otherBlockers))return response('blocked',`${noun}旁的物体挤到了坐位，请先留出身体和书本的空间。`);
  const c=Math.cos(spot.seat.facing),s=Math.sin(spot.seat.facing);
  for(let ix=0;ix<=4;ix++)for(let iz=0;iz<=4;iz++){
    const x=-BENCH_SEATING.footHalfWidth+BENCH_SEATING.footHalfWidth*2*ix/4;
    const z=BENCH_SEATING.footBackZ+(BENCH_SEATING.footFrontZ-BENCH_SEATING.footBackZ)*iz/4;
    const point={x:spot.seat.x+c*x+s*z,z:spot.seat.z-s*x+c*z};
    if(!canStand(point,[],0)||heightAt(point.x,point.z)>spot.seat.surfaceY-BENCH_SEATING.footDrop)return response('blocked',`${noun}前脚下的地面太高或不平，坐下会碰到地面，请调整家具位置。`);
  }
  const distance=Math.hypot(spot.stand.x-spot.seat.x,spot.stand.z-spot.seat.z),steps=Math.max(1,Math.ceil(distance/.15));
  for(let index=0;index<=steps;index++){
    const point={x:spot.seat.x+(spot.stand.x-spot.seat.x)*index/steps,z:spot.seat.z+(spot.stand.z-spot.seat.z)*index/steps};
    if(!canStand(point,otherBlockers))return response('blocked',`${noun}前的坐下与起身通道被挡住了，请先留出通路。`);
    if(heightAt(point.x,point.z)>spot.seat.surfaceY-BENCH_SEATING.minSeatGroundClearance)return response('blocked',`${noun}前的地面太高，坐下会碰到地面，请换一块较平的空地。`);
  }
  if(Math.hypot(host.player.x-spot.stand.x,host.player.z-spot.stand.z)>BENCH_SEATING.frontReach)return response('approach',`先走到${noun}前留空的一侧，再坐下来。`);
  return response('ready','');
}
export const safeBenchReadingSpot=(host:GameState,instanceId:string,blockers:Collider[]):BenchReadingAccess=>seatingAccess(host,benchReadingSpot(host,instanceId),instanceId,blockers);
export const safeDiningReadingSpot=(host:GameState,blockers:Collider[]):BenchReadingAccess=>seatingAccess(host,diningReadingSpot(),STUMP_SEATING.id,blockers);
export function housingSnapshot(host:GameState){
  const near=workbenchNear(host);
  const plans=HOUSING_BLUEPRINTS.map(plan=>{
    const learned=knowsBlueprint(host.inventory,host.workshop.blueprints,plan.id);
    const costs=craftProfile(plan.id)!.inputs.map(input=>({
      name:input.typeIds.includes('wood.branch')?'枝杈':'原木',quantity:input.quantity,
      available:host.inventory.stacks.filter(stack=>recognizedStack(stack)&&isAvailableMaterial(stack)&&!stack.wood?.reserved&&input.typeIds.includes(ITEM_CATALOG.items.get(stack.itemId)?.typeId??'')).reduce((sum,stack)=>sum+stack.quantity,0),
    }));
    const reason=busy(host)?'先完成或取消当前动作。':!near?'先走近工作台。':!learned?'先展开并学会图纸。':!craftMaterialDebits(host,plan.id)?'制作材料不足。':'';
    return {id:plan.id,name:plan.name,learned,canCraft:!reason,reason,costs};
  });
  return {plans,items:structuredClone((host.inventory.instances??[]).filter(item=>isHousingItem(item.definitionId))),hostNear:hostNear(host),workbenchNear:near};
}
export type HousingSnapshot=ReturnType<typeof housingSnapshot>;
