import {isStored,isCarried} from '../domain/transport-location.ts';
import { WOODCRAFT, insideWoodcraft } from '../content/woodcraft.ts';
import type { Vec3 } from '../content/woodcraft.ts';
import type { GameState } from '../domain/state.ts';
import { placeableWood, availableWoodCount, collectWood, collectAllWood, transferWood, woodLabel } from '../domain/woodcraft.ts';
import {stackKey} from '../domain/inventory.ts';
import type { WoodPhysics } from '../physics/woodcraft.ts';
export type WoodStock={itemId:string;name:string;stored:number;carried:number;piled:number};
export type WoodcraftSnapshot={available:number;storedAvailable:number;count:number;queued:number;awake:number;near:boolean;ready:boolean;loading:boolean;error:string;dropping:boolean;materials:WoodStock[];items:{id:string;name:string;itemId:string;queued:boolean}[]};
export const emptyWoodcraftSnapshot = ():WoodcraftSnapshot=>({available:0,storedAvailable:0,count:0,queued:0,awake:0,near:false,ready:false,loading:false,error:'',dropping:false,materials:[],items:[]});
/** Runtime cache, not a second world or inventory. Loading never debits materials. */
export function createWoodcraftSession(state:GameState,notify:(message:string)=>void,loader=()=>import('../physics/woodcraft.ts').then(m=>m.createWoodPhysics())) {
  let engine:WoodPhysics|null=null, loading=false, error='', destroyed=false, generation=0, prepareRequested=false, dropping=false;
  let activationRequested=false;
  let dropKey:string|undefined;
  const distance=()=>Math.hypot(state.player.x-WOODCRAFT.x,state.player.z-WOODCRAFT.z);
  const near=()=>distance()<=WOODCRAFT.reach;
  function ensure(){
    if(engine||loading||destroyed)return;
    loading=true;error='';const token=generation;
    loader().then(value=>{if(destroyed||token!==generation){value.dispose();return;}engine=value;loading=false;})
      .catch(e=>{if(destroyed||token!==generation)return;loading=false;prepareRequested=false;error=e instanceof Error?e.message:'加载失败';notify('物理模块未能加载，库存没有扣除。可以重试。');});
  }
  function reset(){generation++;engine?.dispose();engine=null;loading=false;error='';prepareRequested=false;activationRequested=false;dropping=false;dropKey=undefined;}
  return {
    activate(){activationRequested=true;error='';if(distance()<=WOODCRAFT.activateRadius)ensure();},
    requestPrepare(){if(destroyed)return;dropping=false;prepareRequested=true;activationRequested=true;ensure();},
    beginDrop(key?:string){
      const reason=!near()?'先走近木料区。':!engine?'木料区尚未准备好，请走近后稍等或重试。':state.woodcraft.pieces.length>=WOODCRAFT.maxPieces?'木料区已满，先收回一些。':!placeableWood(state.inventory).some(s=>key===undefined||stackKey(s)===key)?'这批木料已用完或不能投放。':'';
      if(reason){notify(reason);return false;}dropKey=key;dropping=true;return true;
    },
    cancelDrop(){dropping=false;dropKey=undefined;},
    cancelRequest(){dropping=false;dropKey=undefined;prepareRequested=false;activationRequested=false;},
    isDropping:()=>dropping,
    drop(p:Vec3){
      if(!dropping||!near()||!engine)return false;
      if(!insideWoodcraft(p)){notify('请点木料围框里面，木头会从上方落下。');return false;}
      try {const count=transferWood(state,'one',p,dropKey);if(!count)return false;dropping=false;dropKey=undefined;notify('木料已放下，落稳后也可以拖回仓库。');return true;}
      catch(e){notify(e instanceof Error?e.message:'这里不能投放。');return false;}
    },
    collect(id:string){if(!near()||!engine)return false;try{const result=collectWood(state,id);if(result)notify('已收回仓库，原来的品质和规格都保留了。');return result;}catch{notify('这份木料的目录信息暂不可用，原物品已保留。');return false;}},
    transferAll(collect=false){
      if(!near()||!engine){notify('先走近木料堆，等待准备完成。');return false;}
      dropping=false;dropKey=undefined;prepareRequested=false;
      try{const count=collect?collectAllWood(state):transferWood(state,'all');notify(count?`已${collect?'收回仓库':'放入木料堆'} ${count} 份木料。`:collect?'木料堆已经收空。':'没有可放入的木料，或木料堆已满。');return count>0;}
      catch{notify('木料信息暂不可用，物品保持原样。');return false;}
    },
    step(dt:number){
      if(destroyed)return;
      if(distance()>WOODCRAFT.unloadRadius){engine?.dispose();engine=null;dropping=false;return;}
      if(!engine){if((state.woodcraft.pieces.length||prepareRequested||activationRequested)&&distance()<=WOODCRAFT.activateRadius&&!error)ensure();return;}
      if(prepareRequested&&near()) {
        prepareRequested=false;
        const count=transferWood(state,'prepare');
        notify(count?`搬入 ${count} 根木料，库存还留着 ${availableWoodCount(state.inventory)} 根；留给你亲手投放。`:'没有可批量搬入的木料；仅剩的一根留给你，或木料区已经装满。');
      }
      try {for(const id of engine.step(state.woodcraft,dt)){if(collectWood(state,id))notify('一根木料滚出了物理区，已完整收回仓库。');}}
      catch(e){engine.dispose();engine=null;error=e instanceof Error?e.message:'物理计算中断';dropping=false;notify('木料模拟已暂停，物品和最后有效姿态都已保留。可以重试。');}
    },
    snapshot():WoodcraftSnapshot {
      const materials=['wood','branch','scrap-fuel'].map(itemId=>({itemId,name:woodLabel({itemId,qualityId:'ordinary',quantity:1}),stored:state.inventory.stacks.filter(s=>s.itemId===itemId&&isStored(s)).reduce((n,s)=>n+s.quantity,0),carried:state.inventory.stacks.filter(s=>s.itemId===itemId&&isCarried(s)).reduce((n,s)=>n+s.quantity,0),piled:state.woodcraft.pieces.filter(p=>p.source.itemId===itemId).length}));
      return {materials,storedAvailable:availableWoodCount(state.inventory),available:placeableWood(state.inventory).reduce((n,s)=>n+s.quantity,0),count:state.woodcraft.pieces.length,queued:state.woodcraft.pieces.filter(p=>p.phase==='queued').length,awake:engine?.stats().awake??0,near:near(),ready:!!engine,loading,error,dropping,items:state.woodcraft.pieces.map(p=>({id:p.id,name:woodLabel(p.source),itemId:p.source.itemId,queued:p.phase==='queued'}))};},
    stats:()=>({loaded:!!engine,loading,...engine?.stats()}),reset,
    dispose(){if(destroyed)return;reset();destroyed=true;},
  };
}
