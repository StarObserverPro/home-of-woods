import {
  CABIN, DEFAULT_LOCATIONS, ENTRY_POINT, ITEM_DEFINITIONS, PORCH_POINT,
  STARTER_ITEMS, USE_DISTANCE, definitionFor, instanceIdFor,
} from './content.ts';
import type {CabinDefinitionId,CabinItem,CabinPreset,CabinState,FloorLocation,Point} from './content.ts';
export {definitionFor} from './content.ts';
export type {CabinDefinitionId,CabinDefinition,CabinItem,CabinPreset,CabinState,FloorLocation,ItemLocation,Point} from './content.ts';

export type ItemPose={x:number;y:number;z:number;yaw:number};
export type ItemBounds=ItemPose&{minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number;halfX:number;halfZ:number};
export type Placement={x:number;z:number;yaw:number};
export type Check={ok:boolean;reason?:string};
export type CommandResult=Check&{state:CabinState};
export type LayoutAudit={ok:boolean;issues:string[];activeCount:number;storedCount:number;reachableCount:number};
const EPS=1e-6;
const fail=(state:CabinState,reason:string):CommandResult=>({ok:false,reason,state});
const success=(state:CabinState):CommandResult=>({ok:true,state});
const itemFor=(state:CabinState,item:CabinItem|string)=>typeof item==='string'?state.items.find(i=>i.instanceId===item):item;
const finite=(...values:number[])=>values.every(Number.isFinite);
const yawNormal=(yaw:number)=>Math.atan2(Math.sin(yaw),Math.cos(yaw));
/** Same +Y rotation as THREE.Object3D. Positions are never duplicated in scene data. */
export function rotatePoint(point:Point,yaw:number):Point {
  const c=Math.cos(yaw),s=Math.sin(yaw);
  return {x:c*point.x+s*point.z,z:-s*point.x+c*point.z};
}

export function createCabinState(preset:CabinPreset='starter'):CabinState {
  const active=new Set(preset==='full'?ITEM_DEFINITIONS.map(d=>d.id):preset==='starter'?STARTER_ITEMS:[]);
  return {schemaVersion:1,preset,doorOpen:true,
    player:{...PORCH_POINT,facing:Math.PI,posture:'standing'},
    items:ITEM_DEFINITIONS.map(d=>({instanceId:instanceIdFor(d.id),definitionId:d.id,
      location:active.has(d.id)?{...DEFAULT_LOCATIONS[d.id]}:{kind:'stored'},open:false,lit:d.id==='lantern'})),
  };
}

export function itemPose(state:CabinState,itemOrId:CabinItem|string,seen=new Set<string>()):ItemPose|null {
  const item=itemFor(state,itemOrId);
  if(!item||item.location.kind==='stored'||seen.has(item.instanceId))return null;
  if(item.location.kind==='floor')return {x:item.location.x,y:CABIN.floorY,z:item.location.z,yaw:item.location.yaw};
  seen.add(item.instanceId);
  const location=item.location;
  const parent=state.items.find(i=>i.instanceId===location.hostId);
  if(!parent)return null;
  const slot=definitionFor(parent.definitionId).supports.find(s=>s.id===location.slotId);
  const pose=itemPose(state,parent,seen);
  if(!pose||!slot)return null;
  const offset=rotatePoint({x:slot.position[0],z:slot.position[2]},pose.yaw);
  return {x:pose.x+offset.x,y:pose.y+slot.position[1],z:pose.z+offset.z,yaw:pose.yaw};
}

export function itemBounds(state:CabinState,itemOrId:CabinItem|string):ItemBounds|null {
  const item=itemFor(state,itemOrId),pose=item&&itemPose(state,item);
  if(!item||!pose)return null;
  const [width,height,depth]=definitionFor(item.definitionId).dimensions;
  const c=Math.abs(Math.cos(pose.yaw)),s=Math.abs(Math.sin(pose.yaw));
  const halfX=(width*c+depth*s)/2,halfZ=(width*s+depth*c)/2;
  return {...pose,halfX:width/2,halfZ:depth/2,minX:pose.x-halfX,maxX:pose.x+halfX,
    minZ:pose.z-halfZ,maxZ:pose.z+halfZ,minY:pose.y,maxY:pose.y+height};
}

export function approachPoint(state:CabinState,itemOrId:CabinItem|string,seen=new Set<string>()):Point|null {
  const item=itemFor(state,itemOrId);
  if(!item||item.location.kind==='stored'||seen.has(item.instanceId))return null;
  seen.add(item.instanceId);
  if(item.location.kind==='surface')return approachPoint(state,item.location.hostId,seen);
  const pose=itemPose(state,item),offset=rotatePoint(definitionFor(item.definitionId).approach,item.location.yaw);
  return pose?{x:pose.x+offset.x,z:pose.z+offset.z}:null;
}

type Rect={x:number;z:number;halfX:number;halfZ:number;yaw:number};
const rectFor=(state:CabinState,item:CabinItem):Rect|null=>{
  const pose=itemPose(state,item);if(!pose)return null;
  const [w,,d]=definitionFor(item.definitionId).dimensions;
  return {...pose,halfX:w/2,halfZ:d/2};
};
function circleHitsRect(point:Point,radius:number,rect:Rect):boolean {
  const p=rotatePoint({x:point.x-rect.x,z:point.z-rect.z},-rect.yaw);
  const dx=Math.max(0,Math.abs(p.x)-rect.halfX),dz=Math.max(0,Math.abs(p.z)-rect.halfZ);
  return dx*dx+dz*dz<(radius-EPS)**2;
}
function rectsOverlap(a:Rect,b:Rect):boolean {
  for(const yaw of [a.yaw,b.yaw])for(const unit of [{x:1,z:0},{x:0,z:1}]){
    const axis=rotatePoint(unit,yaw),delta={x:b.x-a.x,z:b.z-a.z};
    const projected=(r:Rect)=>{
      const x=rotatePoint({x:1,z:0},r.yaw),z=rotatePoint({x:0,z:1},r.yaw);
      return r.halfX*Math.abs(axis.x*x.x+axis.z*x.z)+r.halfZ*Math.abs(axis.x*z.x+axis.z*z.z);
    };
    if(Math.abs(delta.x*axis.x+delta.z*axis.z)>=projected(a)+projected(b)-EPS)return false;
  }
  return true;
}
const wallRects=():Rect[]=>{
  const w=CABIN.width/2,d=CABIN.depth/2,t=CABIN.wallThickness,door=CABIN.doorWidth/2;
  return [
    {x:-w-t/2,z:0,halfX:t/2,halfZ:d+t,yaw:0},
    {x:w+t/2,z:0,halfX:t/2,halfZ:d+t,yaw:0},
    {x:0,z:-d-t/2,halfX:w+t,halfZ:t/2,yaw:0},
    {x:-(w+door)/2,z:d+t/2,halfX:(w-door)/2,halfZ:t/2,yaw:0},
    {x:(w+door)/2,z:d+t/2,halfX:(w-door)/2,halfZ:t/2,yaw:0},
  ];
};
function doorRect(open:boolean):Rect {
  return open
    ? {x:-CABIN.doorWidth/2,z:CABIN.depth/2+CABIN.doorWidth/2,halfX:CABIN.doorThickness/2,halfZ:CABIN.doorWidth/2,yaw:0}
    : {x:0,z:CABIN.depth/2,halfX:CABIN.doorWidth/2,halfZ:CABIN.doorThickness/2,yaw:0};
}
/** The floor and porch form one continuous supported surface at Y=0. */
function floorSupports(point:Point,radius:number):boolean {
  const w=CABIN.width/2,d=CABIN.depth/2,p=CABIN.porchWidth/2;
  if(!finite(point.x,point.z)||Math.abs(point.x)+radius>w+EPS||point.z-radius < -d-EPS||point.z+radius>d+CABIN.porchDepth+EPS)return false;
  if(point.z>=d)return Math.abs(point.x)+radius<=p+EPS;
  if(point.z>d-radius){
    const crossSection=Math.sqrt(Math.max(0,radius*radius-(d-point.z)**2));
    if(Math.abs(point.x)+crossSection>p+EPS)return false;
  }
  return true;
}
function standChecker(state:CabinState):(point:Point)=>boolean {
  const obstacles=[...wallRects(),doorRect(state.doorOpen)];
  for(const item of state.items){
    if(item.location.kind!=='floor'||!definitionFor(item.definitionId).blocksNavigation)continue;
    const rect=rectFor(state,item);if(rect)obstacles.push(rect);
  }
  return point=>floorSupports(point,CABIN.actorRadius)&&!obstacles.some(r=>circleHitsRect(point,CABIN.actorRadius,r));
}
export function canStand(state:CabinState,point:Point):boolean {return standChecker(state)(point);}

/** Routes end at the exact registered point. Invalid destinations are never replaced by nearby points. */
export function findPath(state:CabinState,from:Point,to:Point):Point[]|null {
  const legal=standChecker(state);
  if(!legal(from)||!legal(to))return null;
  const clear=(a:Point,b:Point)=>{
    const count=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.07));
    for(let i=1;i<=count;i++)if(!legal({x:a.x+(b.x-a.x)*i/count,z:a.z+(b.z-a.z)*i/count}))return false;
    return true;
  };
  if(clear(from,to))return [{x:from.x,z:from.z},{x:to.x,z:to.z}];
  const step=.2,key=(x:number,z:number)=>`${x},${z}`,decode=(key:string):Point=>{const [x,z]=key.split(',').map(Number);return {x:x*step,z:z*step};};
  const scores=new Map<string,number>(),parents=new Map<string,string>(),open=new Set<string>(),closed=new Set<string>();
  const sx=Math.round(from.x/step),sz=Math.round(from.z/step);
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){
    const k=key(sx+dx,sz+dz),p=decode(k);
    if(legal(p)&&clear(from,p)){scores.set(k,Math.hypot(p.x-from.x,p.z-from.z));open.add(k);}
  }
  let finish:string|null=null;
  for(let count=0;open.size&&count<5000;count++){
    let current='',best=Infinity;
    for(const k of open){const p=decode(k),score=(scores.get(k)??Infinity)+Math.hypot(to.x-p.x,to.z-p.z);if(score<best){best=score;current=k;}}
    if(!current)break;
    open.delete(current);closed.add(current);const p=decode(current);
    if(clear(p,to)){finish=current;break;}
    const [gx,gz]=current.split(',').map(Number);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      if(!dx&&!dz)continue;
      const k=key(gx+dx,gz+dz);if(closed.has(k))continue;
      const next=decode(k);if(!legal(next)||!clear(p,next))continue;
      const score=(scores.get(current)??Infinity)+Math.hypot(dx,dz)*step;
      if(score<(scores.get(k)??Infinity)){scores.set(k,score);parents.set(k,current);open.add(k);}
    }
  }
  if(!finish)return null;
  const reversed:Point[]=[{x:to.x,z:to.z}];
  for(let k:string|undefined=finish;k;k=parents.get(k))reversed.push(decode(k));
  reversed.push({x:from.x,z:from.z});reversed.reverse();
  // Shortcut only collision-checked segments; preserve the exact first and last points.
  const route:Point[]=[reversed[0]];
  for(let i=0;i<reversed.length-1;){let next=reversed.length-1;while(next>i+1&&!clear(reversed[i],reversed[next]))next--;route.push(reversed[next]);i=next;}
  return route;
}

const withItem=(state:CabinState,next:CabinItem):CabinState=>({...state,items:state.items.map(i=>i.instanceId===next.instanceId?next:i)});
type Volume={rect:Rect;minY:number;maxY:number};
/** Reserved motion is a separate 3D envelope, not a larger navigation collider. */
function itemVolume(state:CabinState,item:CabinItem,motion=false):Volume|null {
  const pose=itemPose(state,item);if(!pose)return null;
  const definition=definitionFor(item.definitionId),[w,h,d]=definition.dimensions;
  const envelope=motion?definition.motionEnvelope:undefined;
  const min=envelope?.min??[-w/2,0,-d/2],max=envelope?.max??[w/2,h,d/2];
  const centre=rotatePoint({x:(min[0]+max[0])/2,z:(min[2]+max[2])/2},pose.yaw);
  return {rect:{x:pose.x+centre.x,z:pose.z+centre.z,yaw:pose.yaw,halfX:(max[0]-min[0])/2,halfZ:(max[2]-min[2])/2},minY:pose.y+min[1],maxY:pose.y+max[1]};
}
function volumesOverlap(a:Volume,b:Volume):boolean {return a.minY<b.maxY-EPS&&b.minY<a.maxY-EPS&&rectsOverlap(a.rect,b.rect);}
function motionReason(state:CabinState,item:CabinItem):string|undefined {
  const definition=definitionFor(item.definitionId),motion=definition.motionEnvelope;
  if(motion){
    const swept=itemVolume(state,item,true)!;
    const r=swept.rect,c=Math.abs(Math.cos(r.yaw)),s=Math.abs(Math.sin(r.yaw));
    const halfX=r.halfX*c+r.halfZ*s,halfZ=r.halfX*s+r.halfZ*c;
    if(r.x-halfX < -CABIN.width/2+EPS||r.x+halfX>CABIN.width/2-EPS||r.z-halfZ < -CABIN.depth/2+EPS||r.z+halfZ>CABIN.depth/2-EPS||swept.maxY>CABIN.height-EPS)return '盖子或活动部件的开合范围会碰到墙面。';
    for(const other of state.items){
      if(other.instanceId===item.instanceId||other.location.kind==='stored'||other.definitionId==='rug')continue;
      const volume=itemVolume(state,other,!!definitionFor(other.definitionId).motionEnvelope);
      if(volume&&volumesOverlap(swept,volume))return `开合范围会碰到${definitionFor(other.definitionId).label}。`;
    }
  }else{
    // Moving another object must respect the chest's reserved sweep as well.
    const own=itemVolume(state,item)!;
    if(item.definitionId!=='rug')for(const other of state.items){
      if(other.instanceId===item.instanceId||other.location.kind==='stored'||!definitionFor(other.definitionId).motionEnvelope)continue;
      const swept=itemVolume(state,other,true);
      if(swept&&volumesOverlap(own,swept))return `这里占用了${definitionFor(other.definitionId).label}的开合空间。`;
    }
  }
}
function placementGeometryReason(state:CabinState,item:CabinItem):string|undefined {
  const bounds=itemBounds(state,item),rect=rectFor(state,item);
  if(!bounds||!rect)return '这个物件没有有效的落点。';
  if(!finite(rect.x,rect.z,rect.yaw))return '位置或朝向不是有效数字。';
  if(bounds.minX< -CABIN.width/2+EPS||bounds.maxX>CABIN.width/2-EPS||bounds.minZ< -CABIN.depth/2+EPS||bounds.maxZ>CABIN.depth/2-EPS)return '物件超出室内地板或碰到墙体。';
  const definition=definitionFor(item.definitionId);
  const motion=motionReason(state,item);if(motion)return motion;
  if(!definition.blocksNavigation)return;
  const entrance:Rect={x:0,z:CABIN.depth/2-.6,halfX:CABIN.doorWidth/2,halfZ:.6,yaw:0};
  if(rectsOverlap(rect,entrance))return '门口的通道和开门区域需要留空。';
  for(const other of state.items){
    if(other.instanceId===item.instanceId||other.location.kind!=='floor'||!definitionFor(other.definitionId).blocksNavigation)continue;
    const otherRect=rectFor(state,other);
    if(otherRect&&rectsOverlap(rect,otherRect))return `这里会碰到${definitionFor(other.definitionId).label}。`;
  }
}
function approachItems(state:CabinState):CabinItem[] {
  return state.items.filter(i=>i.location.kind!=='stored'&&(definitionFor(i.definitionId).blocksNavigation||definitionFor(i.definitionId).action!=='inspect'));
}
function connectivityReason(state:CabinState):string|undefined {
  // A deliberately closed door is an interaction state, not a permanently blocked floorplan.
  const openState=state.doorOpen?state:{...state,doorOpen:true};
  if(!findPath(openState,PORCH_POINT,ENTRY_POINT))return '入口到室内的通路被挡住了。';
  for(const item of approachItems(state)){
    const point=approachPoint(state,item);
    if(!point||!canStand(openState,point))return `${definitionFor(item.definitionId).label}的使用或起身位置被挡住了。`;
    if(!findPath(openState,ENTRY_POINT,point))return `无法从入口走到${definitionFor(item.definitionId).label}的使用位置。`;
  }
}
export function validatePlacement(state:CabinState,id:string,placement:Placement):Check {
  if(!finite(placement.x,placement.z,placement.yaw))return {ok:false,reason:'位置或朝向不是有效数字。'};
  const item=itemFor(state,id);
  if(!item)return {ok:false,reason:'没有找到这件物品。'};
  const definition=definitionFor(item.definitionId);
  if(!definition.movable||definition.placementKind!=='floor')return {ok:false,reason:'这件物品使用固定位置或登记的支撑面。'};
  if(item.location.kind==='stored')return {ok:false,reason:'先从样品架取出物品。'};
  if(state.player.posture!=='standing')return {ok:false,reason:'先起身，再调整家具。'};
  return checkFloorCandidate(state,{...item,location:{kind:'floor',...placement}});
}
function checkFloorCandidate(state:CabinState,item:CabinItem):Check {
  const candidate=withItem(state,item),reason=placementGeometryReason(candidate,item);
  if(reason)return {ok:false,reason};
  if(!canStand(candidate,candidate.player))return {ok:false,reason:'角色还站在这里，请先走开。'};
  const access=connectivityReason(candidate);
  return access?{ok:false,reason:access}:{ok:true};
}
export function moveItem(state:CabinState,id:string,placement:Placement):CommandResult {
  const check=validatePlacement(state,id,placement);if(!check.ok)return fail(state,check.reason!);
  const item=itemFor(state,id)!;
  return success(withItem(state,{...item,location:{kind:'floor',x:placement.x,z:placement.z,yaw:yawNormal(placement.yaw)}}));
}
function descendants(state:CabinState,id:string):Set<string> {
  const ids=new Set([id]);let changed=true;
  while(changed){changed=false;for(const item of state.items)if(item.location.kind==='surface'&&ids.has(item.location.hostId)&&!ids.has(item.instanceId)){ids.add(item.instanceId);changed=true;}}
  return ids;
}
export function storeItem(state:CabinState,id:string):CommandResult {
  const item=itemFor(state,id);if(!item)return fail(state,'没有找到这件物品。');
  if(item.location.kind==='stored')return fail(state,'这件物品已经在样品架上。');
  const ids=descendants(state,id);
  if(state.player.usingId&&ids.has(state.player.usingId))return fail(state,'先起身，再收回正在使用的家具。');
  return success({...state,items:state.items.map(i=>ids.has(i.instanceId)?{...i,location:{kind:'stored'}}:i)});
}
export function restoreItem(state:CabinState,id:string):CommandResult {
  const item=itemFor(state,id);if(!item)return fail(state,'没有找到这件物品。');
  if(item.location.kind!=='stored')return fail(state,'这件物品已经摆出来了。');
  const location={...DEFAULT_LOCATIONS[item.definitionId]},next:CabinItem={...item,location};
  if(location.kind==='floor'){
    const check=checkFloorCandidate(state,next);if(!check.ok)return fail(state,check.reason!);
  }else{
    const host=itemFor(state,location.hostId);
    if(!host||!itemPose(state,host))return fail(state,'先摆出它所需的桌子或置物架。');
    if(state.items.some(i=>i.instanceId!==id&&i.location.kind==='surface'&&i.location.hostId===location.hostId&&i.location.slotId===location.slotId))return fail(state,'这个支撑位置已有物品。');
    const slot=definitionFor(host.definitionId).supports.find(s=>s.id===location.slotId),definition=definitionFor(item.definitionId);
    if(!slot||definition.dimensions[0]/2>slot.halfSize[0]+EPS||definition.dimensions[2]/2>slot.halfSize[1]+EPS)return fail(state,'物件不能稳定放在这个支撑面上。');
    const candidate=withItem(state,next),motion=motionReason(candidate,next);if(motion)return fail(state,motion);
    const access=connectivityReason(candidate);if(access)return fail(state,access);
  }
  return success(withItem(state,next));
}
export function useItem(state:CabinState,id:string):CommandResult {
  const item=itemFor(state,id),point=item&&approachPoint(state,item);
  if(!item||!point)return fail(state,'先把物件摆出来。');
  if(state.player.posture!=='standing')return fail(state,'先起身，再使用另一件物品。');
  if(!canStand(state,point))return fail(state,'使用或起身的位置被挡住了。');
  if(Math.hypot(state.player.x-point.x,state.player.z-point.z)>USE_DISTANCE+EPS)return fail(state,'请先走到物件旁的使用位置。');
  const action=definitionFor(item.definitionId).action;
  if(action==='sit'||action==='rest'){
    const pose=itemPose(state,item)!;
    return success({...state,player:{...state.player,posture:action==='sit'?'seated':'resting',usingId:id,facing:pose.yaw}});
  }
  if(action==='open'){const reason=motionReason(state,item);if(reason)return fail(state,reason);return success(withItem(state,{...item,open:!item.open}));}
  if(action==='light')return success(withItem(state,{...item,lit:!item.lit}));
  return success(state);
}
export function standUp(state:CabinState):CommandResult {
  if(state.player.posture==='standing')return success(state);
  const point=state.player.usingId?approachPoint(state,state.player.usingId):null;
  if(!point||!canStand(state,point))return fail(state,'起身位置被挡住了，请先清出通道。');
  return success({...state,player:{x:point.x,z:point.z,facing:state.player.facing,posture:'standing'}});
}
/** Swept quarter-disc of the outward-opening leaf, enlarged by the visible actor envelope. */
function inDoorSweep(point:Point):boolean {
  const x=point.x+CABIN.doorWidth/2,z=point.z-CABIN.depth/2,r=CABIN.doorWidth;
  let distance:number;
  if(x>=0&&z>=0)distance=Math.max(0,Math.hypot(x,z)-r);
  else if(x<0&&z>=0)distance=Math.hypot(x,z-Math.min(z,r));
  else if(x>=0&&z<0)distance=Math.hypot(x-Math.min(x,r),z);
  else distance=Math.hypot(x,z);
  return distance<CABIN.actorRadius+CABIN.doorThickness/2-EPS;
}
export function setDoorOpen(state:CabinState,open:boolean):CommandResult {
  if(open===state.doorOpen)return success(state);
  if(inDoorSweep(state.player))return fail(state,'门扇会碰到角色，请先走到室内或让开门前。');
  const next={...state,doorOpen:open};
  if(!canStand(next,next.player))return fail(state,'门口有人，暂时不能开合。');
  return success(next);
}

function surfaceReason(state:CabinState,item:CabinItem):string|undefined {
  if(item.location.kind!=='surface')return;
  const location=item.location,host=itemFor(state,location.hostId);
  const definition=definitionFor(item.definitionId);
  if(definition.placementKind!=='surface')return '这件家具需要放在地板上。';
  if(!host||!itemPose(state,host))return '缺少有效支撑。';
  const hostDefinition=definitionFor(host.definitionId),slot=hostDefinition.supports.find(s=>s.id===location.slotId);
  if(!slot)return '没有登记这个支撑位置。';
  const [width,,depth]=definition.dimensions,[hostWidth,hostHeight,hostDepth]=hostDefinition.dimensions;
  if(width/2>slot.halfSize[0]+EPS||depth/2>slot.halfSize[1]+EPS)return '物件超出支撑面的边缘。';
  if(Math.abs(slot.position[0])+slot.halfSize[0]>hostWidth/2+EPS||Math.abs(slot.position[2])+slot.halfSize[1]>hostDepth/2+EPS||slot.position[1]<0||slot.position[1]>hostHeight+EPS)return '登记的支撑面超出宿主范围。';
  if(!itemPose(state,item))return '支撑关系存在循环或悬空。';
}

export function auditLayout(state:CabinState):LayoutAudit {
  const issues:string[]=[],ids=new Set<string>(),slots=new Set<string>();
  const active=state.items.filter(i=>i.location.kind!=='stored');
  for(const item of state.items){
    if(ids.has(item.instanceId))issues.push(`重复实例：${item.instanceId}`);ids.add(item.instanceId);
    try{definitionFor(item.definitionId);}catch{issues.push(`未注册的物品：${item.definitionId}`);}
  }
  if(issues.length)return {ok:false,issues,activeCount:active.length,storedCount:state.items.length-active.length,reachableCount:0};
  for(const item of state.items){
    if(item.location.kind==='floor'){
      if(definitionFor(item.definitionId).placementKind!=='floor')issues.push(`${definitionFor(item.definitionId).label}需要登记的支撑面。`);
      const reason=placementGeometryReason(state,item);if(reason)issues.push(`${definitionFor(item.definitionId).label}：${reason}`);
    }else if(item.location.kind==='surface'){
      const key=`${item.location.hostId}/${item.location.slotId}`;
      if(slots.has(key))issues.push(`支撑位被重复占用：${key}`);slots.add(key);
      const reason=surfaceReason(state,item)??motionReason(state,item);if(reason)issues.push(`${definitionFor(item.definitionId).label}：${reason}`);
    }
  }
  let reachableCount=0;
  if(!issues.length){
    const openState={...state,doorOpen:true};
    if(!canStand(state,state.player))issues.push('角色当前站位没有足够净空。');
    const connection=connectivityReason(state);if(connection)issues.push(connection);
    for(const item of approachItems(state)){const p=approachPoint(state,item);if(p&&findPath(openState,ENTRY_POINT,p))reachableCount++;}
  }
  return {ok:issues.length===0,issues:[...new Set(issues)],activeCount:active.length,storedCount:state.items.length-active.length,reachableCount};
}

/** Only this audit's explicit schema is accepted; production save formats are never read here. */
export function parseCabinSnapshot(value:unknown):CabinState|null {
  const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
  const keys=(v:Record<string,unknown>,required:string[],optional:string[]=[])=>required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
  const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
  if(!object(value)||!keys(value,['schemaVersion','preset','items','player','doorOpen'])||value.schemaVersion!==1||!['starter','full','empty'].includes(value.preset as string)||typeof value.doorOpen!=='boolean')return null;
  if(!Array.isArray(value.items)||value.items.length!==ITEM_DEFINITIONS.length||Object.keys(value.items).length!==ITEM_DEFINITIONS.length)return null;
  const items:CabinItem[]=[],definitions=new Set<string>();
  for(const source of value.items){
    if(!object(source)||!keys(source,['instanceId','definitionId','location','open','lit'])||typeof source.definitionId!=='string'||typeof source.instanceId!=='string'||typeof source.open!=='boolean'||typeof source.lit!=='boolean')return null;
    const definition=ITEM_DEFINITIONS.find(d=>d.id===source.definitionId);
    if(!definition||definitions.has(definition.id)||source.instanceId!==instanceIdFor(definition.id))return null;
    if(source.open&&definition.action!=='open'||source.lit&&definition.action!=='light')return null;
    definitions.add(definition.id);
    const location=source.location;let parsedLocation:CabinItem['location'];
    if(!object(location))return null;
    if(location.kind==='stored'){
      if(!keys(location,['kind']))return null;parsedLocation={kind:'stored'};
    }else if(location.kind==='floor'){
      if(!keys(location,['kind','x','z','yaw'])||definition.placementKind!=='floor'||!number(location.x)||!number(location.z)||!number(location.yaw))return null;
      parsedLocation={kind:'floor',x:location.x,z:location.z,yaw:location.yaw};
    }else if(location.kind==='surface'){
      if(!keys(location,['kind','hostId','slotId'])||definition.placementKind!=='surface'||typeof location.hostId!=='string'||typeof location.slotId!=='string')return null;
      parsedLocation={kind:'surface',hostId:location.hostId,slotId:location.slotId};
    }else return null;
    items.push({instanceId:source.instanceId,definitionId:definition.id,location:parsedLocation,open:source.open,lit:source.lit});
  }
  const player=value.player;
  if(!object(player)||!keys(player,['x','z','facing','posture'],['usingId'])||!number(player.x)||!number(player.z)||!number(player.facing)||!['standing','seated','resting'].includes(player.posture as string))return null;
  const parsedPlayer:CabinState['player']={x:player.x,z:player.z,facing:player.facing,posture:player.posture as CabinState['player']['posture']};
  if(parsedPlayer.posture==='standing'){
    if(Object.hasOwn(player,'usingId'))return null;
  }else{
    if(typeof player.usingId!=='string')return null;
    const used=items.find(i=>i.instanceId===player.usingId),action=used&&definitionFor(used.definitionId).action;
    if(!used||used.location.kind==='stored'||action!==(parsedPlayer.posture==='seated'?'sit':'rest'))return null;
    parsedPlayer.usingId=player.usingId;
  }
  const state:CabinState={schemaVersion:1,preset:value.preset as CabinPreset,items,player:parsedPlayer,doorOpen:value.doorOpen};
  if(parsedPlayer.usingId){const approach=approachPoint(state,parsedPlayer.usingId);if(!approach||Math.hypot(player.x-approach.x,player.z-approach.z)>USE_DISTANCE+EPS)return null;}
  return auditLayout(state).ok?state:null;
}
