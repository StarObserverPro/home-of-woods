import {LOG_HARVEST_LENGTH_MM} from '../content/wood-uses.ts';
import {canStand} from './navigation.ts';
import {FORESTRY} from '../content/forestry.ts';
import type {Point} from '../content/world.ts';
import type {Tree,Collider} from '../world/layout.ts';
import { inventoryTransaction, woodBatch, inventoryTypeCount } from './inventory.ts';
import { ITEM_CATALOG } from './item-catalog.ts';
import type { ItemCatalog } from './item-catalog.ts';
import type { InventoryState, WoodBatch } from './inventory.ts';

export type TreeStatus='standing'|'chopping'|'falling'|'stump'|'sapling';
export type TreeLife={
  slotId:string; individualId:string; generation:number; status:TreeStatus;
  felledAt:number|null; regrowAt:number|null; bornAt:number|null; maturesAt:number|null;
  fallDirection:Point; actionId:string|null;
};
export type ChopAction={id:string;treeId:string;individualId:string;year:number;cost:number;yield:number;reward:{itemId:string;qualityId:string;wood?:WoodBatch};startedAt:number;committedAt:number|null;phase:'chopping'|'falling'};
export type ForestryState={
  ledger:{year:number;base:number;used:number;reserved:number};
  slots:Record<string,TreeLife>; active:ChopAction|null; nextAction:number; completedActions:string[];
};
export type ForestryHost={time:number;player:Point&{facing:number;moving:boolean};route:Point[];selected:string|null;forestry:ForestryState;inventory:InventoryState};
export type ForestrySnapshot={
  wood:number;points:{year:number;available:number;used:number;reserved:number};
  active:{treeId:string;phase:'chopping'|'falling';progress:number;hits:number;totalHits:number}|null;
  selectedTree:{id:string;individualId:string;status:TreeStatus;statusLabel:string;distance:number;canChop:boolean;canApproach:boolean;cost:number;yield:number;reason:string;progress:number}|null;
};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export const volumePoints=(tree:Tree)=>Math.max(1,Math.ceil(tree.scale*tree.scale*1.6));
export const availablePoints=(state:ForestryState)=>state.ledger.base-state.ledger.used-state.ledger.reserved;
export const chopRange=(tree:Tree)=>Math.min(FORESTRY.interactRange,(tree.kind==='pine'?.43:.66)*tree.scale+FORESTRY.reachBeyondTrunk);
export function createForestry(trees:Tree[]):ForestryState{
  const slots:Record<string,TreeLife>={};
  for(const t of trees)if(t.role!=='scenery')slots[t.id]={slotId:t.id,individualId:t.individualId,generation:t.generation,status:'standing',felledAt:null,regrowAt:null,bornAt:null,maturesAt:null,fallDirection:{x:0,z:1},actionId:null};
  return {ledger:{year:1,base:FORESTRY.basePoints,used:0,reserved:0},slots,active:null,nextAction:1,completedActions:[]};
}
export function treeScaleFactor(life:TreeLife|undefined,now:number){
  if(life?.status!=='sapling')return 1;
  return .22+.78*clamp((now-(life.bornAt??now))/FORESTRY.saplingSeconds);
}
export function chopReason(host:ForestryHost,tree:Tree|undefined):string{
  if(!tree)return '请先选一棵经营树。';
  if(tree.role==='landmark')return '巨木是永久保护的地标，不能砍伐。';
  if(tree.role!=='managed')return '远景林木暂不开放经营。';
  const life=host.forestry.slots[tree.id];
  if(!life)return '这棵树没有有效的个体记录。';
  if(life.status==='stump')return '树位保留，等待原位补生。';
  if(life.status==='sapling')return '幼树尚未成材，请让它继续生长。';
  if(host.forestry.active)return host.forestry.active.phase==='falling'?'树正在倒下，请稍候。':'正在挥斧，可取消或移动离开。';
  if(life.status!=='standing')return '这棵树当前无法砍伐。';
  if(Math.hypot(host.player.x-tree.x,host.player.z-tree.z)>chopRange(tree))return '先走近树干，再开始砍伐。';
  if(availablePoints(host.forestry)<volumePoints(tree))return '本年度可用体量点数不足。';
  return '';
}
export function startChop(host:ForestryHost,tree:Tree|undefined,blockers?:Collider[]):{ok:boolean;message:string}{
  const reason=chopReason(host,tree);if(reason||!tree)return{ok:false,message:reason};
  const state=host.forestry,life=state.slots[tree.id],cost=volumePoints(tree);
  const id=`chop-${state.nextAction++}-${life.individualId}`;
  const dx=tree.x-host.player.x,dz=tree.z-host.player.z,length=Math.hypot(dx,dz)||1;
  if(blockers){
    const others=blockers.filter(c=>c.id!==tree.id),width=.65*tree.scale;
    for(let distance=.6;distance<=5.5*tree.scale;distance+=.4)for(const side of [-width,0,width]){
      const point={x:tree.x+dx/length*distance-dz/length*side,z:tree.z+dz/length*distance+dx/length*side};
      if(!canStand(point,others)){state.nextAction--;return {ok:false,message:'这个倒向靠近障碍或水岸，请换一侧站稳再砍。'};}
    }
  }
  state.active={id,treeId:tree.id,individualId:life.individualId,year:state.ledger.year,cost,yield:cost,reward:{itemId:FORESTRY.harvestItemId,qualityId:FORESTRY.harvestQualityId,wood:woodBatch({lengthMm:LOG_HARVEST_LENGTH_MM,thicknessMm:Math.round((tree.kind==='pine'?500:560)*tree.scale),straightness:'straight'})},startedAt:host.time,committedAt:null,phase:'chopping'};
  state.ledger.reserved+=cost;life.status='chopping';life.actionId=id;life.fallDirection={x:dx/length,z:dz/length};
  host.route=[];host.player.moving=false;host.player.facing=Math.atan2(dx,dz);
  return{ok:true,message:'握稳斧头，沿着同一处切口挥斧。'};
}
export function cancelChop(host:ForestryHost,message='已放下斧头，预留点数已释放。'):{ok:boolean;message:string}{
  const state=host.forestry,a=state.active;if(!a||a.phase!=='chopping')return{ok:false,message:''};
  const life=state.slots[a.treeId];
  state.ledger.reserved=Math.max(0,state.ledger.reserved-a.cost);
  if(life?.individualId===a.individualId&&life.status==='chopping'){life.status='standing';life.actionId=null;}
  state.active=null;return{ok:true,message};
}
/** All due transitions run on GameState.time. Rendering callbacks never settle resources. */
export function advanceForestry(host:ForestryHost,trees:ReadonlyMap<string,Tree>):string|null{
  const state=host.forestry,a=state.active;
  let message:string|null=null;
  if(a?.phase==='chopping'&&host.time>=a.startedAt+FORESTRY.chopSeconds){
    const tree=trees.get(a.treeId),life=state.slots[a.treeId];
    const valid=tree?.role==='managed'&&life?.status==='chopping'&&life.individualId===a.individualId&&life.actionId===a.id&&state.ledger.year===a.year&&state.ledger.reserved>=a.cost&&Math.hypot(host.player.x-tree.x,host.player.z-tree.z)<=chopRange(tree);
    if(!valid)return cancelChop(host,'目标或距离已经变化，采伐已取消并释放预留。').message;
    if(!state.completedActions.includes(a.id)){
      // Validate inventory first. No point/tree changes survive a failed award.
      const inventory = inventoryTransaction(host.inventory, [{...a.reward, delta:a.yield}]);
      host.inventory = inventory;
      state.ledger.reserved-=a.cost;state.ledger.used+=a.cost;state.completedActions.push(a.id);
      life.status='falling';life.felledAt=a.startedAt+FORESTRY.chopSeconds;life.regrowAt=life.felledAt+FORESTRY.fallSeconds+FORESTRY.regrowDelay;
    }
    a.phase='falling';a.committedAt=life.felledAt;
    message=`切口已断开，收获 ${a.yield} 根原木；树位会原位补生。`;
  }
  if(a?.phase==='falling'&&host.time>=(a.committedAt??host.time)+FORESTRY.fallSeconds){
    const life=state.slots[a.treeId];if(life?.individualId===a.individualId)life.status='stump';state.active=null;
  }
  for(const life of Object.values(state.slots)){
    if(life.status==='stump'&&life.regrowAt!==null&&host.time>=life.regrowAt){
      life.generation++;life.individualId=`${life.slotId}:g${life.generation}`;life.status='sapling';life.bornAt=life.regrowAt;life.maturesAt=life.bornAt+FORESTRY.saplingSeconds;life.actionId=null;life.felledAt=null;life.regrowAt=null;
      message='一棵幼树在原来的树位冒出了新叶。';
    }
    if(life.status==='sapling'&&life.maturesAt!==null&&host.time>=life.maturesAt){life.status='standing';message='山坡上的幼树已经成材。';}
  }
  return message;
}
export function forestrySnapshot(host:ForestryHost,trees:ReadonlyMap<string,Tree>,catalog:ItemCatalog=ITEM_CATALOG):ForestrySnapshot{
  const s=host.forestry,a=s.active,t=host.selected?trees.get(host.selected):undefined,life=t?s.slots[t.id]:undefined;
  const progress=a?clamp((host.time-(a.phase==='chopping'?a.startedAt:a.committedAt??host.time))/(a.phase==='chopping'?FORESTRY.chopSeconds:FORESTRY.fallSeconds)):0;
  const statusLabel:Record<TreeStatus,string>={standing:'成熟树',chopping:'正在挥斧',falling:'正在倒下',stump:'树桩 · 等待补生',sapling:'幼树 · 生长中'};
  const reason=chopReason(host,t);
  return{wood:inventoryTypeCount(host.inventory,'wood.log',catalog),points:{year:s.ledger.year,available:availablePoints(s),used:s.ledger.used,reserved:s.ledger.reserved},active:a?{treeId:a.treeId,phase:a.phase,progress,hits:a.phase==='falling'?FORESTRY.hits:Math.min(FORESTRY.hits,Math.floor(progress*FORESTRY.hits+.42)),totalHits:FORESTRY.hits}:null,
    selectedTree:t&&life?{id:t.id,individualId:life.individualId,status:life.status,statusLabel:t.role==='landmark'?'永久保护地标':statusLabel[life.status],distance:Math.hypot(host.player.x-t.x,host.player.z-t.z),canChop:!reason,canApproach:!a&&t.role==='managed'&&life.status==='standing',cost:volumePoints(t),yield:volumePoints(t),reason,progress:a?.treeId===t.id?progress:0}:null};
}
export function forestryColliders(base:Collider[],trees:ReadonlyMap<string,Tree>,state:ForestryState,now:number):Collider[]{
  return base.map(c=>{
    const t=trees.get(c.id),life=state.slots[c.id];
    if(!t||!life||!('radius'in c))return c;
    return life.status==='sapling'?{...c,radius:c.radius*treeScaleFactor(life,now)}:c;
  });
}
