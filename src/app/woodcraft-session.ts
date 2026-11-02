import { WOODCRAFT, insideWoodcraft } from '../content/woodcraft.ts';
import type { Vec3 } from '../content/woodcraft.ts';
import type { GameState } from '../domain/state.ts';
import { availableWoodCount, collectWood, transferWood, woodLabel } from '../domain/woodcraft.ts';
import type { WoodPhysics } from '../physics/woodcraft.ts';
export type WoodcraftSnapshot={available:number;count:number;queued:number;awake:number;near:boolean;ready:boolean;loading:boolean;error:string;dropping:boolean;items:{id:string;name:string}[]};
export const emptyWoodcraftSnapshot = ():WoodcraftSnapshot=>({available:0,count:0,queued:0,awake:0,near:false,ready:false,loading:false,error:'',dropping:false,items:[]});
/** Runtime cache, not a second world or inventory. Loading never debits materials. */
export function createWoodcraftSession(state:GameState,notify:(message:string)=>void,loader=()=>import('../physics/woodcraft.ts').then(m=>m.createWoodPhysics())) {
  let engine:WoodPhysics|null=null, loading=false, error='', destroyed=false, generation=0, prepareRequested=false, dropping=false;
  const distance=()=>Math.hypot(state.player.x-WOODCRAFT.x,state.player.z-WOODCRAFT.z);
  const near=()=>distance()<=WOODCRAFT.reach;
  function ensure(){
    if(engine||loading||destroyed)return;
    loading=true;error='';const token=generation;
    loader().then(value=>{if(destroyed||token!==generation){value.dispose();return;}engine=value;loading=false;})
      .catch(e=>{if(destroyed||token!==generation)return;loading=false;prepareRequested=false;error=e instanceof Error?e.message:'加载失败';notify('物理模块未能加载，库存没有扣除。可以重试。');});
  }
  function reset(){generation++;engine?.dispose();engine=null;loading=false;error='';prepareRequested=false;dropping=false;}
  return {
    activate(){ensure();},
    requestPrepare(){if(destroyed)return;dropping=false;prepareRequested=true;ensure();},
    beginDrop(){if(!near()||!engine||!availableWoodCount(state.inventory)||state.woodcraft.pieces.length>=WOODCRAFT.maxPieces)return false;dropping=true;return true;},
    cancelDrop(){dropping=false;},
    cancelRequest(){dropping=false;prepareRequested=false;},
    isDropping:()=>dropping,
    drop(p:Vec3){
      if(!dropping||!near()||!engine)return false;
      if(!insideWoodcraft(p)){notify('请点木料围框里面，木头会从上方落下。');return false;}
      try {const count=transferWood(state,'one',p);if(!count)return false;dropping=false;notify('松手了。看看这根木头会停在哪里。');return true;}
      catch(e){notify(e instanceof Error?e.message:'这里不能投放。');return false;}
    },
    collect(id:string){if(!near()||!engine)return false;try{const result=collectWood(state,id);if(result)notify('已收回仓库，原来的品质和规格都保留了。');return result;}catch{notify('这份木料的目录信息暂不可用，原物品已保留。');return false;}},
    step(dt:number){
      if(destroyed)return;
      if(distance()>WOODCRAFT.unloadRadius){engine?.dispose();engine=null;dropping=false;return;}
      if(!engine){if((state.woodcraft.pieces.length||prepareRequested)&&distance()<=WOODCRAFT.activateRadius&&!error)ensure();return;}
      if(prepareRequested&&near()) {
        prepareRequested=false;
        const count=transferWood(state,'prepare');
        notify(count?`搬入 ${count} 根木料，库存还留着 ${availableWoodCount(state.inventory)} 根；留给你亲手投放。`:'没有可批量搬入的木料；仅剩的一根留给你，或木料区已经装满。');
      }
      try {for(const id of engine.step(state.woodcraft,dt)){if(collectWood(state,id))notify('一根木料滚出了物理区，已完整收回仓库。');}}
      catch(e){engine.dispose();engine=null;error=e instanceof Error?e.message:'物理计算中断';dropping=false;notify('木料模拟已暂停，物品和最后有效姿态都已保留。可以重试。');}
    },
    snapshot():WoodcraftSnapshot {return {available:availableWoodCount(state.inventory),count:state.woodcraft.pieces.length,queued:state.woodcraft.pieces.filter(p=>p.phase==='queued').length,awake:engine?.stats().awake??0,near:near(),ready:!!engine,loading,error,dropping,items:state.woodcraft.pieces.map(p=>({id:p.id,name:woodLabel(p.source)}))};},
    stats:()=>({loaded:!!engine,loading,...engine?.stats()}),reset,
    dispose(){if(destroyed)return;reset();destroyed=true;},
  };
}
