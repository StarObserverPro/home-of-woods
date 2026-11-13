import * as THREE from 'three';
import {WORLD_STREAMING} from '../content/regions.ts';
import {chunkKey,chunkDistance} from '../world/regions.ts';
import {heightAt} from '../world/surface.ts';
import {treeScaleFactor} from '../domain/forestry.ts';
import type {GameState} from '../domain/state.ts';
import type {Tree} from '../world/layout.ts';
import type {Models} from './models.ts';

/** Detailed objects and hit mappings are disposable; the world roster and shared caches aren't. */
export function createStreamedForest(forest:ReturnType<Models['createForest']>,trees:Tree[]){
  const managed=trees.filter(t=>t.role!=='scenery'),chunks=new Map<string,Tree[]>();
  const prototypes=new Map(managed.map(t=>[t.id,(forest.selections.get(t.id) as THREE.Mesh).geometry]));
  for(const tree of managed){const key=chunkKey(tree);chunks.set(key,[...(chunks.get(key)??[]),tree]);}
  const activeChunks=new Set(chunks.keys());
  // Scenery and distant managed trees share the existing species batches.
  const batches=forest.sceneryBatches;
  batches.forEach(batch=>batch.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage));
  let signature='',loads=0,unloads=0;
  const dummy=new THREE.Object3D();
  return {
    activeChunks,
    update(state:GameState){
      let changed=false;
      for(const [key,members] of chunks){
        const distance=chunkDistance(key,state.player),loaded=activeChunks.has(key);
        // Keep the protected giant as one cheap landmark; all ordinary forest objects stream.
        const wanted=members.some(t=>t.role==='landmark')||distance<=(loaded?WORLD_STREAMING.detailRelease:WORLD_STREAMING.detailLoad);
        if(wanted===loaded)continue;changed=true;
        if(wanted){
          activeChunks.add(key);loads++;
          for(const tree of members){
            const mesh=new THREE.Mesh(prototypes.get(tree.id)!,forest.material);
            mesh.name=tree.id;mesh.position.set(tree.x,heightAt(tree.x,tree.z),tree.z);mesh.rotation.y=tree.variant*Math.PI*2;mesh.scale.setScalar(tree.scale);mesh.castShadow=mesh.receiveShadow=true;
            forest.group.add(mesh);forest.selections.set(tree.id,mesh);forest.mappings.set(mesh,[tree.id]);
          }
        }else{
          activeChunks.delete(key);unloads++;
          for(const tree of members){const object=forest.selections.get(tree.id);if(object){object.removeFromParent();forest.mappings.delete(object);forest.selections.delete(tree.id);}}
        }
      }
      const next=chunkKey(state.player)+[...activeChunks].sort().join('|')+managed.map(t=>{const life=state.forestry.slots[t.id];return `${life?.status}:${Math.round(treeScaleFactor(life,state.time)*20)}`;}).join('|');
      if(!changed&&signature===next)return;
      signature=next;
      for(const batch of batches){
        let count=0;
        batch.members.forEach(tree=>{
          const life=state.forestry.slots[tree.id],visible=tree.role==='scenery'||!activeChunks.has(chunkKey(tree))&&life?.status!=='stump'&&life?.status!=='falling';
          if(!visible||Math.hypot(tree.x-state.player.x,tree.z-state.player.z)>WORLD_STREAMING.sceneryDraw)return;
          dummy.position.set(tree.x,heightAt(tree.x,tree.z),tree.z);dummy.rotation.set(0,tree.variant*Math.PI*2,0);dummy.scale.setScalar(tree.scale*treeScaleFactor(life,state.time));dummy.updateMatrix();batch.mesh.setMatrixAt(count++,dummy.matrix);
        });
        batch.mesh.count=count;batch.mesh.visible=count>0;batch.mesh.instanceMatrix.needsUpdate=true;
      }
    },
    stats:()=>({chunkSize:WORLD_STREAMING.chunkSize,detailLoad:WORLD_STREAMING.detailLoad,detailRelease:WORLD_STREAMING.detailRelease,simulation:WORLD_STREAMING.simulation,loadedChunks:activeChunks.size,totalChunks:chunks.size,detailTrees:forest.selections.size,coarseBatches:batches.length,sceneryInstances:batches.reduce((sum,batch)=>sum+batch.mesh.count,0),loads,unloads}),
    dispose(){activeChunks.clear();prototypes.clear();chunks.clear();batches.forEach(b=>b.mesh.removeFromParent());batches.length=0;},
  };
}
