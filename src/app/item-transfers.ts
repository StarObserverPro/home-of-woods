import {WOODCRAFT,insideWoodcraft} from '../content/woodcraft.ts';
import {availableWood} from '../domain/woodcraft.ts';
import {stackKey} from '../domain/inventory.ts';
import {interactionAccess} from '../domain/interaction-access.ts';
import type {ItemTransferIntent,TransferCheck} from '../domain/interaction-access.ts';
import {placementReason,placeFurniture,packFurniture} from '../domain/furniture-placement.ts';
import type {GameState} from '../domain/state.ts';
import type {Collider} from '../world/layout.ts';
import type {createWoodcraftSession} from './woodcraft-session.ts';
import type {createScene} from '../scene/create-scene.ts';

type TransferScene=Pick<Awaited<ReturnType<typeof createScene>>,'transferPoint'|'transferItemAt'|'setWoodcraftDrop'>;
/** All UI transfer gestures converge here, then reuse the existing ownership transactions. */
export function createItemTransfers(state:GameState,woodcraft:ReturnType<typeof createWoodcraftSession>,view:TransferScene,
  blockers:()=>Collider[],blocked:()=>boolean){
  function preview(item:ItemTransferIntent,x:number,y:number,toWarehouse:boolean):TransferCheck{
    if(blocked())return {valid:false,reason:'先完成或取消当前动作。'};
    if(toWarehouse){
      if(item.kind==='material')return {valid:false,reason:'这份材料已经在仓库里。'};
      if(item.kind==='furniture'&&!state.inventory.instances?.some(i=>i.instanceId===item.id&&i.location.kind==='world'))return {valid:false,reason:'这件家具已经在仓库里。'};
      if(item.kind==='loose-wood'&&!state.woodcraft.pieces.some(p=>p.id===item.id))return {valid:false,reason:'这根木料已经收回。'};
      if(!interactionAccess(state,item.id)?.near)return {valid:false,reason:'先走近物品，再收回仓库。'};
      if(item.kind==='loose-wood'&&!woodcraft.snapshot().ready)return {valid:false,reason:'木料堆正在准备，请稍等。'};
      return {valid:true,reason:'松手，收回仓库'};
    }
    if(item.kind==='loose-wood')return {valid:false,reason:'把这根木料拖回仓库。'};
    const point=view.transferPoint(x,y,item.kind==='material');
    if(!point)return {valid:false,reason:'拖到场景中的空地上。'};
    if(item.kind==='material'){
      const status=woodcraft.snapshot();
      if(!status.near)return {valid:false,reason:'先走近木料堆，再放下木料。'};
      if(!status.ready)return {valid:false,reason:status.error?'木料堆暂不可用，请重试。':'木料堆正在准备，请稍等。'};
      if(status.count>=WOODCRAFT.maxPieces)return {valid:false,reason:'木料堆已满，先收回几根。'};
      if(!availableWood(state.inventory).some(s=>stackKey(s)===item.key))return {valid:false,reason:'这批木料已用完或已被预留。'};
      if(!insideWoodcraft(point))return {valid:false,reason:'把木料拖进木料堆的围框。'};
      return {valid:true,reason:'松手，放下一根'};
    }
    const reason=placementReason(state,item.id,point,blockers());
    return {valid:!reason,reason:reason||'松手，摆在这里'};
  }
  function worldItem(x:number,y:number):ItemTransferIntent|null{
    const hit=view.transferItemAt(x,y);if(!hit)return null;
    if(hit.kind==='loose-wood'){const p=woodcraft.snapshot().items.find(p=>p.id===hit.id);return p?{...hit,name:p.name}:null;}
    return state.inventory.instances?.some(i=>i.instanceId===hit.id)?{...hit,name:'木作家具'}:null;
  }
  function commit(item:ItemTransferIntent,x:number,y:number,toWarehouse:boolean):TransferCheck{
    const check=preview(item,x,y,toWarehouse);if(!check.valid)return check;
    let success=false,reason='物品没有移动，请重新选择位置。';
    if(toWarehouse&&item.kind==='loose-wood'){
      success=woodcraft.collect(item.id);if(success)reason='木料已收回仓库。';
    }else if(toWarehouse&&item.kind==='furniture'){
      reason=packFurniture(state,item.id);success=state.inventory.instances?.find(i=>i.instanceId===item.id)?.location.kind==='inventory';
    }else if(!toWarehouse&&item.kind==='material'){
      const point=view.transferPoint(x,y,true);
      if(point&&woodcraft.beginDrop(item.key))success=woodcraft.drop(point);
      woodcraft.cancelDrop();view.setWoodcraftDrop(false);
      if(success)reason='木料已放下，落稳后也可以拖回仓库。';
    }else if(!toWarehouse&&item.kind==='furniture'){
      const point=view.transferPoint(x,y,false),owned=state.inventory.instances?.find(i=>i.instanceId===item.id);
      if(point&&owned){reason=placeFurniture(state,item.id,point,owned.location.kind==='world'?owned.location.rotation:0,blockers());success=owned.location!==state.inventory.instances?.find(i=>i.instanceId===item.id)?.location;}
    }
    return {valid:success,reason};
  }
  return {preview,worldItem,commit};
}
