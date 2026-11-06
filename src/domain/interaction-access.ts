import {CAMP_PROPS} from '../content/scene-props.ts';
import {HOUSING,housingItemName} from '../content/housing.ts';
import {CAMP_VISITOR} from '../content/characters.ts';
import {WORKBENCH,WORKBENCH_STOOL} from '../content/workshop.ts';
import {WOODCRAFT} from '../content/woodcraft.ts';
import type {Point} from '../content/world.ts';
import type {GameState} from './state.ts';
import {canStand,findPath,navigationGridPoint} from './navigation.ts';
import type {Collider} from '../world/layout.ts';
import {benchReadingSpot,diningReadingSpot} from './housing.ts';
import {BENCH_SEATING} from '../content/seating.ts';

export const ITEM_REACH=4;
export type InteractionAccess={id:string;name:string;near:boolean;distance:number;reach:number;point:Point;stand:Point};
/** Distance is independent of inventory/recipe eligibility, so distant targets remain approachable. */
export function interactionAccess(state:GameState,id:string|null):InteractionAccess|null{
  let target:{name:string;point:Point;stand:Point;reach:number}|null=null;
  if(id===WOODCRAFT.id||state.woodcraft.pieces.some(p=>p.id===id))target={name:'木料堆',point:WOODCRAFT,stand:WOODCRAFT.stand,reach:WOODCRAFT.reach};
  else if(id===CAMP_PROPS.fire.id)target={name:'营地火塘',point:CAMP_PROPS.fire,stand:{x:CAMP_PROPS.fire.x,z:CAMP_PROPS.fire.z+3},reach:3.9};
  else if(id===CAMP_PROPS.dryer.id)target={name:'蘑菇晾晒架',point:CAMP_PROPS.dryer,stand:{x:CAMP_PROPS.dryer.x,z:CAMP_PROPS.dryer.z+2.5},reach:3.2};
  else if(id===CAMP_PROPS.logs.id)target={name:'原木架',point:CAMP_PROPS.logs,stand:{x:CAMP_PROPS.logs.x-3.3,z:CAMP_PROPS.logs.z+1},reach:4.2};
  else if(id===WORKBENCH.id)target={name:'工作台',point:WORKBENCH.stand,stand:WORKBENCH.stand,reach:.8};
  else if(id==='cabin')target={name:'木屋门前',point:HOUSING.doorbell.point,stand:HOUSING.doorbell.stand,reach:HOUSING.doorbell.reach};
  else if(id===WORKBENCH_STOOL.id)target={name:'小凳',point:WORKBENCH_STOOL,stand:{x:WORKBENCH_STOOL.x,z:WORKBENCH_STOOL.z+1.5},reach:ITEM_REACH};
  else if(id===CAMP_VISITOR.id)target={name:'行商',point:CAMP_VISITOR,stand:{x:CAMP_VISITOR.x+2,z:CAMP_VISITOR.z+1},reach:3};
  else if(id===CAMP_PROPS.altar.id||id==='grove-altar:oracle'){
    const stand={x:CAMP_PROPS.altar.x,z:CAMP_PROPS.altar.z+5};
    target={name:'祭坛',point:stand,stand,reach:.8};
  }else{
    const item=state.inventory.instances?.find(i=>i.instanceId===id);
    if(item?.location.kind==='world'){
      const point={x:item.location.x,z:item.location.z};
      target={name:housingItemName(item.definitionId),point,stand:point,reach:ITEM_REACH};
    }else if(item?.definitionId===HOUSING.doorbell.definitionId&&item.location.kind==='mounted'&&item.location.hostId===HOUSING.doorbell.hostId){
      target={name:'松果门铃',point:HOUSING.doorbell.point,stand:HOUSING.doorbell.stand,reach:HOUSING.doorbell.reach};
    }
  }
  if(!target||!id)return null;
  const distance=Math.hypot(state.player.x-target.point.x,state.player.z-target.point.z);
  return {id,...target,distance,near:distance<=target.reach};
}
/** Search around an occupied prop when its preferred standing place is obstructed. */
export function approachInteraction(state:GameState,id:string,blockers:Collider[],purpose:'interact'|'sit'='interact'):string{
  const ordinary=interactionAccess(state,id);if(!ordinary)return '这里暂时没有可操作的目标。';
  const seat=purpose==='sit'?(id===CAMP_PROPS.fire.id?diningReadingSpot():benchReadingSpot(state,id)):null;
  if(purpose==='sit'&&!seat)return '先把可坐的长凳摆好，再走近座位。';
  const seatDistance=seat?Math.hypot(state.player.x-seat.stand.x,state.player.z-seat.stand.z):0;
  const access=seat?{...ordinary,name:id===CAMP_PROPS.fire.id?'火边木墩前的空位':'长凳前的空位',point:seat.stand,stand:seat.stand,reach:BENCH_SEATING.frontReach,distance:seatDistance,near:seatDistance<=BENCH_SEATING.frontReach}:ordinary;
  if(access.near){state.route=[];return `已经走到${access.name}旁。`;}
  const candidates=[access.stand];
  if(seat){
    const c=Math.cos(seat.seat.facing),s=Math.sin(seat.seat.facing);
    for(const [x,z] of [[.45,0],[-.45,0],[0,.45],[0,-.45],[.3,.3],[-.3,.3]])candidates.push({x:seat.stand.x+c*x+s*z,z:seat.stand.z-s*x+c*z});
  }
  if(access.reach>=2){
    const angle=Math.atan2(state.player.z-access.point.z,state.player.x-access.point.x),radius=access.reach-.5;
    for(const offset of [0,.7,-.7,1.4,-1.4,Math.PI])candidates.push({x:access.point.x+Math.cos(angle+offset)*radius,z:access.point.z+Math.sin(angle+offset)*radius});
  }
  for(const point of candidates){
    if(!canStand(point,blockers))continue;
    if(seat){
      const distance=Math.hypot(point.x-state.player.x,point.z-state.player.z),steps=Math.max(1,Math.ceil(distance/.15));
      let direct=true;
      for(let index=0;index<=steps;index++)if(!canStand({x:state.player.x+(point.x-state.player.x)*index/steps,z:state.player.z+(point.z-state.player.z)*index/steps},blockers)){direct=false;break;}
      if(direct){state.route=[point];return `正在走近${access.name}。到达后再选择操作。`;}
      if(!canStand(navigationGridPoint(point),blockers))continue;
    }
    const route=findPath(state.player,point,blockers);
    if(route.length){state.route=route;return `正在走近${access.name}。到达后再选择操作。`;}
  }
  state.route=[];return `暂时无法走到${access.name}旁，请先留出通路。`;
}

export type ItemTransferIntent=
  |{kind:'material';key:string;name:string}
  |{kind:'furniture';id:string;name:string}
  |{kind:'loose-wood';id:string;name:string};
export type TransferCheck={valid:boolean;reason:string};
