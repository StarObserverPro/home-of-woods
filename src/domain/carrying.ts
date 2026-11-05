import type {RegionalHost} from '../world/regions.ts';
import {travelAccess} from '../world/regions.ts';
import {CARRY_ITEMS,CARRY_PROFILES,CARRY_RULES} from '../content/carrying.ts';
import {heavyLaborAllowed} from './food.ts';
import type {FoodState} from './food.ts';
import type {CarryMethod,CarryProfile} from '../content/carrying.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import type {Point} from '../content/world.ts';
import {ITEM_CATALOG} from './item-catalog.ts';
import {inventoryTransaction,stackIdentity,stackKey,recognizedStack} from './inventory.ts';
import type {InventoryState,InventoryStack,StackIdentity} from './inventory.ts';
import {carryMethod,isCarried,isStored,transportLocation} from './transport-location.ts';
import type {TransportLocation} from './transport-location.ts';
import {canInteract} from './gathering.ts';
import {canStand,findPath} from './navigation.ts';
import type {Collider} from '../world/layout.ts';

const ramp=(n:number,soft:number,hard:number)=>Math.max(0,Math.min(1,(n-soft)/(hard-soft)));
export function carryingLoad(stacks:readonly InventoryStack[], profile:CarryProfile=CARRY_PROFILES.hands, terrainEffort=1) {
  if(!Number.isFinite(terrainEffort)||terrainEffort<=0)throw new Error('Invalid transport effort');
  let weight=profile.tare,bulk=0,unknown=false,unsupported=false,bundled=false;
  for(const s of stacks){
    if(!Number.isSafeInteger(s.quantity)||s.quantity<0)throw new Error('Invalid carrying quantity');
    const size=CARRY_ITEMS[s.itemId];
    if(!size||!recognizedStack(s)){unknown=true;continue;}
    unsupported ||= profile.excludes.includes(s.itemId);
    weight+=s.quantity*size.weight;
    const factor=profile.bundle?size.bundleFactor:1;
    bulk+=s.quantity*size.bulk*factor;
    bundled ||= factor<1&&s.quantity>0;
  }
  const effort=weight*profile.effortFactor*terrainEffort;
  const severity=Math.max(ramp(effort,profile.comfortWeight,profile.effortLimit),ramp(bulk,profile.comfortBulk,profile.bulkLimit));
  const handling=profile.bundle&&!bundled?1:profile.handling;
  const speed=unknown?CARRY_RULES.minSpeed:Math.max(CARRY_RULES.minSpeed,handling*(1-(1-CARRY_RULES.minSpeed)*severity));
  const reason=unknown?'这件物品的搬运规格尚未登记。':unsupported?'这种携具放不下这类长木料。':weight>profile.weightLimit+1e-8?'太重了，先放下一些材料。':bulk>profile.bulkLimit+1e-8?'手里放不下了，先打捆、放下或回营存放。':'';
  return {weight,bulk,effort,speed,reason,weightLimit:profile.weightLimit,bulkLimit:profile.bulkLimit};
}
export const carriedStacks=(inventory:InventoryState)=>inventory.stacks.filter(isCarried);
export function currentLoad(inventory:InventoryState){return carryingLoad(carriedStacks(inventory),CARRY_PROFILES[carryMethod(inventory.carryMode)]);}
export function carryAdditionReason(inventory:InventoryState,item:StackIdentity,quantity:number){
  if(!Number.isSafeInteger(quantity)||quantity<=0)return '搬运数量无效。';
  return carryingLoad([...carriedStacks(inventory),{...item,quantity}],CARRY_PROFILES[carryMethod(inventory.carryMode)]).reason;
}
export function atLocation(item:StackIdentity,location?:TransportLocation):StackIdentity{
  const result=stackIdentity(item);delete result.transport;
  if(location)result.transport=structuredClone(location);
  else delete result.harvest; // Arrival at camp completes this harvest; later withdrawals are ordinary stock.
  return result;
}
export function awardCarried(inventory:InventoryState,item:StackIdentity,quantity:number){
  const reason=carryAdditionReason(inventory,item,quantity);if(reason)throw new Error(reason);
  return inventoryTransaction(inventory,[{...atLocation(item,{kind:'carried'}),delta:quantity}]);
}
export function awardGround(inventory:InventoryState,item:StackIdentity,quantity:number,point:Point){
  return inventoryTransaction(inventory,[{...atLocation(item,{kind:'ground',x:point.x,z:point.z}),delta:quantity}]);
}
export const groundId=(stack:StackIdentity)=>`haul:${stackKey(stack)}`;
export const groundStacks=(inventory:InventoryState)=>inventory.stacks.filter(s=>transportLocation(s)?.kind==='ground');
export function groundItem(inventory:InventoryState,id:string|null){return id?groundStacks(inventory).find(s=>groundId(s)===id):undefined;}
export const storageNear=(point:Point)=>Math.hypot(point.x-CAMP_PROPS.logs.x,point.z-CAMP_PROPS.logs.z)<=CARRY_RULES.storageReach;
export type CarryHost=RegionalHost&{inventory:InventoryState;player:Point;selected:string|null;route:Point[];food?:FoodState;time?:number};
export type CarryIntent={kind:'take'|'withdraw'|'drop';key:string;quantity?:number}|{kind:'store'}|{kind:'method';method:CarryMethod};
/** No mutations until every delta, capacity and distance check has succeeded. */
export function changeCarrying(host:CarryHost,intent:CarryIntent,blockers:Collider[]):string{
  const inventory=host.inventory;
  if(intent.kind==='method'){
    const method=carryMethod(intent.method),load=carryingLoad(carriedStacks(inventory),CARRY_PROFILES[method]);
    if(load.reason)return load.reason;
    if(!Number.isSafeInteger(inventory.revision+1))return '库存版本已用尽。';
    host.inventory={...inventory,revision:inventory.revision+1,carryMode:method};
    return method==='bundle'?'已把随身枝料整理成束，重量没有减少。':'已改为双手散拿。';
  }
  if(intent.kind==='store'){
    if(!storageNear(host.player)||!canInteract(host.player,CAMP_PROPS.logs,blockers.filter(c=>c.id!==CAMP_PROPS.logs.id),travelAccess(host)))return '先走近原木架，再把随身材料存入营地。';
    const carried=carriedStacks(inventory);if(!carried.length)return '手里没有需要存放的材料。';
    host.inventory=inventoryTransaction(inventory,carried.flatMap(s=>[{...s,delta:-s.quantity},{...atLocation(s),delta:s.quantity}]));
    return '随身材料已全部存入营地。';
  }
  const item=inventory.stacks.find(s=>stackKey(s)===intent.key);
  if(!item||!recognizedStack(item)||item.wood?.reserved)return '这份材料已经变化或暂不能搬动。';
  const quantity=intent.quantity??1;
  if(!Number.isSafeInteger(quantity)||quantity<=0||quantity>item.quantity)return '搬运数量已变化，请重新选择。';
  if(intent.kind!=='drop'&&item.itemId==='wood'&&host.food&&host.time!==undefined&&!heavyLaborAllowed(host.food,host.time))return '昨天没有吃饱，今天只能搬轻料，先留原木在这里。';
  let location:TransportLocation;
  if(intent.kind==='drop'){
    if(!isCarried(item))return '只能放下随身材料。';
    if(!canStand(host.player,blockers,undefined,travelAccess(host)))return '这里不能放下材料，请先走到空地。';
    location={kind:'ground',x:host.player.x,z:host.player.z};
  }else{
    if(intent.kind==='withdraw'){
      if(!isStored(item))return '这份材料不在营地。';
      if(!storageNear(host.player)||!canInteract(host.player,CAMP_PROPS.logs,blockers.filter(c=>c.id!==CAMP_PROPS.logs.id),travelAccess(host)))return '先走近原木架，再取出材料。';
    }else{
      const p=transportLocation(item);
      if(p?.kind!=='ground')return '这份材料不在地上。';
      if(Math.hypot(p.x-host.player.x,p.z-host.player.z)>CARRY_RULES.pickupReach||!canInteract(host.player,p,blockers,travelAccess(host)))return '先走近这堆材料，隔着障碍不能拿取。';
    }
    const reason=carryAdditionReason(inventory,item,quantity);if(reason)return reason;
    location={kind:'carried'};
  }
  host.inventory=inventoryTransaction(inventory,[{...item,delta:-quantity},{...atLocation(item,location),delta:quantity}]);
  if(host.selected?.startsWith('haul:')&&!groundItem(host.inventory,host.selected))host.selected=null;
  return intent.kind==='drop'?'材料已放在脚边，稍后可以回来拿。':`已拿起 ${quantity} 份${ITEM_CATALOG.items.get(item.itemId)!.name}。`;
}
export function approachGround(host:CarryHost,id:string,blockers:Collider[]){
  const item=groundItem(host.inventory,id),p=item&&transportLocation(item);
  if(p?.kind!=='ground')return '这堆材料已经移走。';
  host.selected=id;
  if(Math.hypot(p.x-host.player.x,p.z-host.player.z)<=CARRY_RULES.pickupReach&&canInteract(host.player,p,blockers,travelAccess(host)))return '已走近，选择拿取的数量。';
  const candidates=[p,...Array.from({length:12},(_,i)=>({x:p.x+1.8*Math.cos(i*Math.PI/6),z:p.z+1.8*Math.sin(i*Math.PI/6)}))];
  for(const candidate of candidates){
    if(!canStand(candidate,blockers,undefined,travelAccess(host))||!canInteract(candidate,p,blockers,travelAccess(host)))continue;
    const route=findPath(host.player,candidate,blockers,travelAccess(host));if(route.length){host.route=route;return '正在走近地上的材料。';}
  }
  return '这堆材料暂时没有可达的拿取位置。';
}
export function carryingSnapshot(host:CarryHost){
  const load=currentLoad(host.inventory),items=carriedStacks(host.inventory);
  const describe=(s:InventoryStack)=>({key:stackKey(s),name:ITEM_CATALOG.items.get(s.itemId)?.name??s.itemId,quantity:s.quantity});
  const ground=groundStacks(host.inventory).map(s=>{
    const p=transportLocation(s)! as {kind:'ground';x:number;z:number};
    const distance=Math.hypot(host.player.x-p.x,host.player.z-p.z);
    return {...describe(s),id:groundId(s),distance,near:distance<=CARRY_RULES.pickupReach,takeReason:s.itemId==='wood'&&host.food&&host.time!==undefined&&!heavyLaborAllowed(host.food,host.time)?'昨天没有吃饱，今天只适合搬轻料。':carryAdditionReason(host.inventory,s,1)};
  }).sort((a,b)=>a.distance-b.distance);
  const visual=items.some(s=>s.itemId==='wood')?'shoulder-log':items.some(s=>s.itemId==='branch')?'wood-bundle':items.length?'backpack':null;
  return {...load,method:carryMethod(host.inventory.carryMode),items:items.map(describe),ground,storageNear:storageNear(host.player),visual};
}
export type CarryingSnapshot=ReturnType<typeof carryingSnapshot>;
