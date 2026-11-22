import * as THREE from 'three';
import {WORLD_STREAMING} from '../content/regions.ts';
import {FRAME_WORK_BUDGET} from '../content/frame-budget.ts';
import {chunkKey,chunkDistance} from '../world/regions.ts';
import {heightAt} from '../world/surface.ts';
import {treeScaleFactor} from '../domain/forestry.ts';
import type {GameState} from '../domain/state.ts';
import type {Tree} from '../world/layout.ts';
import type {Models} from './models.ts';
import {createFrameWorkQueue,type FrameWorkQueue} from './frame-work-queue.ts';

/** Residency is committed atomically; queued preparation never owns gameplay state. */
export function createStreamedForest(forest:ReturnType<Models['createForest']>,trees:Tree[],sharedQueue?:FrameWorkQueue){
  const queue=sharedQueue??createFrameWorkQueue(),managed=trees.filter(t=>t.role!=='scenery');
  const chunks=new Map<string,Tree[]>(),treeChunk=new Map<string,string>();
  const prototypes=new Map(managed.map(t=>[t.id,(forest.selections.get(t.id) as THREE.Mesh).geometry]));
  for(const tree of managed){const key=chunkKey(tree);treeChunk.set(tree.id,key);const members=chunks.get(key)??[];members.push(tree);chunks.set(key,members);}
  const activeChunks=new Set(chunks.keys()),desiredChunks=new Set(activeChunks),plans=new Map<string,boolean>();
  const batches=forest.sceneryBatches.map(batch=>({...batch,submitted:[] as Tree[],indices:new Map<string,number>()}));
  const batchFor=new Map<string,typeof batches[number]>();
  for(const batch of batches){
    batch.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.mesh.count=0;batch.mesh.visible=false;
    for(const tree of batch.members)batchFor.set(tree.id,batch);
  }
  const dummy=new THREE.Object3D(),matrix=new THREE.Matrix4();
  const lifeCache=new Map<string,{status:string;growth:number}>();
  let latest:GameState|undefined,slots:GameState['forestry']['slots']|undefined;
  let disposed=false,epoch=0,revision=0,loads=0,unloads=0,commits=0,preparedTrees=0;
  let lastX=NaN,lastZ=NaN;

  function writeTree(batch:typeof batches[number],tree:Tree,index:number){
    dummy.position.set(tree.x,heightAt(tree.x,tree.z),tree.z);
    dummy.rotation.set(0,tree.variant*Math.PI*2,0);
    dummy.scale.setScalar(tree.scale*(latest?treeScaleFactor(latest.forestry.slots[tree.id],latest.time):1));
    dummy.updateMatrix();batch.mesh.setMatrixAt(index,dummy.matrix);
    batch.mesh.instanceMatrix.addUpdateRange(index*16,16);batch.mesh.instanceMatrix.needsUpdate=true;
  }
  function setFar(tree:Tree,visible:boolean,refresh=false){
    const batch=batchFor.get(tree.id);if(!batch)return;
    const index=batch.indices.get(tree.id);
    if(visible){
      if(index===undefined){
        const next=batch.submitted.length;batch.submitted.push(tree);batch.indices.set(tree.id,next);writeTree(batch,tree,next);
      }else if(refresh)writeTree(batch,tree,index);
      else return;
    }else{
      if(index===undefined)return;
      const last=batch.submitted.length-1,tail=batch.submitted[last];
      if(index!==last){
        batch.submitted[index]=tail;batch.indices.set(tail.id,index);
        batch.mesh.getMatrixAt(last,matrix);batch.mesh.setMatrixAt(index,matrix);
        batch.mesh.instanceMatrix.addUpdateRange(index*16,16);batch.mesh.instanceMatrix.needsUpdate=true;
      }
      batch.submitted.pop();batch.indices.delete(tree.id);
    }
    batch.mesh.count=batch.submitted.length;batch.mesh.visible=batch.mesh.count>0;revision++;
    // Original all-members bounds stay conservative after swaps and re-appends.
  }
  function wantedFar(tree:Tree){
    if(!latest)return tree.role==='scenery';
    const life=latest.forestry.slots[tree.id];
    return (tree.role==='scenery'||!activeChunks.has(treeChunk.get(tree.id)!)&&life?.status!=='stump'&&life?.status!=='falling')
      &&Math.hypot(tree.x-latest.player.x,tree.z-latest.player.z)<=WORLD_STREAMING.sceneryDraw;
  }
  // Models initially contains both representations. Remove duplicates before
  // the first queued step, while keeping every scenery and gameplay tree.
  for(const batch of batches)for(const tree of batch.members)if(tree.role==='scenery')setFar(tree,true);

  function cancelPlans(){
    epoch++;
    for(const key of [...plans.keys()])queue.cancel(`forest:chunk:${key}`);
    plans.clear();
  }
  function plan(key:string,wanted:boolean,priority:number){
    const members=chunks.get(key)!,generation=epoch,prepared:THREE.Mesh[]=[];
    let next=0;
    plans.set(key,wanted);
    queue.enqueue({key:`forest:chunk:${key}`,priority,
      onCancel(){prepared.length=0;if(plans.get(key)===wanted)plans.delete(key);},
      step(){
        if(disposed||generation!==epoch||!latest||desiredChunks.has(key)!==wanted){plans.delete(key);prepared.length=0;return true;}
        if(wanted&&next<members.length){
          const tree=members[next++],mesh=new THREE.Mesh(prototypes.get(tree.id)!,forest.material);
          mesh.name=tree.id;mesh.position.set(tree.x,heightAt(tree.x,tree.z),tree.z);mesh.rotation.y=tree.variant*Math.PI*2;
          mesh.scale.setScalar(tree.scale);mesh.castShadow=mesh.receiveShadow=true;
          prepared.push(mesh);preparedTrees++;
          return false;
        }
        // Commit a bounded chunk before forestry and shadow binding run.
        if(wanted){
          activeChunks.add(key);
          members.forEach((tree,i)=>{setFar(tree,false);const mesh=prepared[i];forest.group.add(mesh);forest.selections.set(tree.id,mesh);forest.mappings.set(mesh,[tree.id]);});
          loads++;
        }else{
          activeChunks.delete(key);
          for(const tree of members){
            const object=forest.selections.get(tree.id);
            if(object){object.removeFromParent();forest.mappings.delete(object);forest.selections.delete(tree.id);}
            setFar(tree,wantedFar(tree));
          }
          unloads++;
        }
        prepared.length=0;plans.delete(key);commits++;revision++;return true;
      },
    });
  }
  return {
    activeChunks,
    get revision(){return revision;},
    update(state:GameState){
      if(disposed)return;
      latest=state;
      if(slots!==state.forestry.slots){cancelPlans();slots=state.forestry.slots;lifeCache.clear();lastX=lastZ=NaN;}
      for(const [key,members] of chunks){
        const distance=chunkDistance(key,state.player),loaded=activeChunks.has(key);
        const protectedChunk=members.some(t=>t.role==='landmark'||t.id===state.forestry.active?.treeId||state.gathering.action?.phase==='performing'&&state.gathering.action.sourceId===`gather.${t.id}.branches`);
        const wanted=protectedChunk||distance<=(loaded?WORLD_STREAMING.detailRelease:WORLD_STREAMING.detailLoad);
        if(wanted)desiredChunks.add(key);else desiredChunks.delete(key);
        if(plans.has(key)&&plans.get(key)!==wanted)queue.cancel(`forest:chunk:${key}`);
        if(wanted!==loaded&&!plans.has(key))plan(key,wanted,protectedChunk||distance<16?FRAME_WORK_BUDGET.priority.interaction:wanted?FRAME_WORK_BUDGET.priority.load:FRAME_WORK_BUDGET.priority.release);
      }
      // In-place lifecycle changes and restored worlds invalidate far copies
      // immediately, never behind low-priority speculative work.
      for(const tree of managed){
        const life=state.forestry.slots[tree.id],status=life?.status??'standing';
        const growth=Math.round(treeScaleFactor(life,state.time)*FRAME_WORK_BUDGET.growthSteps),old=lifeCache.get(tree.id);
        if(old?.status!==status||old.growth!==growth){
          lifeCache.set(tree.id,{status,growth});setFar(tree,wantedFar(tree),true);
        }
      }
      if(Math.hypot(state.player.x-lastX,state.player.z-lastZ)>=1||!Number.isFinite(lastX)){
        lastX=state.player.x;lastZ=state.player.z;
        for(const batch of batches)for(const tree of batch.members)setFar(tree,wantedFar(tree));
      }
      // Standalone users retain a synchronous adapter. The game supplies its
      // shared queue and drains it once with the per-frame allowance.
      if(!sharedQueue)while(queue.stats().pending)queue.run({budgetMs:FRAME_WORK_BUDGET.desktopMs,maxSteps:FRAME_WORK_BUDGET.maxSteps});
    },
    reset(){cancelPlans();slots=undefined;lifeCache.clear();},
    stats:()=>({chunkSize:WORLD_STREAMING.chunkSize,detailLoad:WORLD_STREAMING.detailLoad,detailRelease:WORLD_STREAMING.detailRelease,
      simulation:WORLD_STREAMING.simulation,loadedChunks:activeChunks.size,totalChunks:chunks.size,detailTrees:forest.selections.size,
      coarseBatches:batches.length,sceneryInstances:batches.reduce((sum,b)=>sum+b.mesh.count,0),loads,unloads,commits,preparedTrees,
      pendingChunks:plans.size,revision,epoch}),
    dispose(){if(disposed)return;disposed=true;cancelPlans();if(!sharedQueue)queue.dispose();activeChunks.clear();desiredChunks.clear();
      prototypes.clear();chunks.clear();treeChunk.clear();lifeCache.clear();batchFor.clear();batches.forEach(b=>b.mesh.removeFromParent());},
  };
}
