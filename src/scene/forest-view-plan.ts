import * as THREE from 'three';
import {heightAt} from '../world/surface.ts';
import {treeScaleFactor} from '../domain/forestry.ts';
import type {GameState} from '../domain/state.ts';
import type {Tree} from '../world/layout.ts';

type ForestBatch={mesh:THREE.InstancedMesh;members:readonly Tree[]};
export type ForestViewInput={
  camera:THREE.Camera;
  state?:GameState;
  /** Actual rig projections along a bounded lookahead, including intermediate turns. */
  forecastCameras?:readonly THREE.Camera[];
  /** The current solid-shadow camera, after sun.shadow.updateMatrices(sun). */
  shadowCamera?:THREE.Camera;
  /** Horizontal planar reflection: reflect the world sphere, not a stale mirror camera. */
  mirrorY?:number;
  /** World-space safety margin around the complete transformed tree bounds. */
  guard?:number;
};

/** Visibility affects existing far presenters only; it never edits the forest roster. */
export function createForestViewPlanner(batches:readonly ForestBatch[]) {
  const transform=new THREE.Object3D(),world=new THREE.Matrix4(),sphere=new THREE.Sphere(),mirror=new THREE.Sphere(),growth=new THREE.Vector3();
  const entries=batches.flatMap(batch=>{
    if(!batch.mesh.geometry.boundingSphere)batch.mesh.geometry.computeBoundingSphere();
    return batch.members.map(tree=>{
      // Same transform as streamed-forest.writeTree, including terrain height,
      // authored rotation and scale. A stem point cannot stand in for a crown.
      transform.position.set(tree.x,heightAt(tree.x,tree.z),tree.z);
      transform.rotation.set(0,tree.variant*Math.PI*2,0);transform.scale.setScalar(tree.scale);transform.updateMatrix();
      return {tree,mesh:batch.mesh,local:batch.mesh.geometry.boundingSphere!.clone(),matrix:transform.matrix.clone()};
    });
  });
  const projection=new THREE.Matrix4();
  function frustum(camera:THREE.Camera) {
    // The owner commits camera projection/pose before asking for a plan. Only
    // refresh world matrices here; do not invent a different camera trajectory.
    camera.updateWorldMatrix(true,false);
    return new THREE.Frustum().setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),camera.coordinateSystem,camera.reversedDepth);
  }
  return {
    plan(input:ForestViewInput) {
      const guard=Number.isFinite(input.guard)?Math.max(0,input.guard!):5;
      const current=frustum(input.camera),future=(input.forecastCameras??[]).map(frustum);
      const shadow=input.shadowCamera?frustum(input.shadowCamera):undefined,hasMirror=Number.isFinite(input.mirrorY);
      const currentIDs=new Set<string>(),wantedIDs=new Set<string>();
      let directCount=0,reflectionCount=0,shadowCount=0;
      for(const batch of batches)batch.mesh.updateWorldMatrix(true,false);
      for(const entry of entries){
        const {tree}=entry,life=input.state?.forestry.slots[tree.id];
        if(tree.role!=='scenery'&&(life?.status==='falling'||life?.status==='stump'))continue;
        const factor=input.state?treeScaleFactor(life,input.state.time):1;
        world.copy(entry.matrix).scale(growth.setScalar(factor)).premultiply(entry.mesh.matrixWorld);
        sphere.copy(entry.local).applyMatrix4(world);sphere.radius+=guard;
        if(hasMirror){mirror.copy(sphere);mirror.center.y=2*input.mirrorY!-sphere.center.y;}
        const direct=current.intersectsSphere(sphere),reflected=hasMirror&&current.intersectsSphere(mirror);
        const casts=!!shadow&&entry.mesh.castShadow&&shadow.intersectsSphere(sphere);
        if(direct)directCount++;if(reflected)reflectionCount++;if(casts)shadowCount++;
        if(direct||reflected||casts){currentIDs.add(tree.id);wantedIDs.add(tree.id);continue;}
        for(const view of future)if(view.intersectsSphere(sphere)||hasMirror&&view.intersectsSphere(mirror)){wantedIDs.add(tree.id);break;}
      }
      return {currentIDs,wantedIDs,stats:{sourceCount:entries.length,current:currentIDs.size,wanted:wantedIDs.size,
        forecastOnly:wantedIDs.size-currentIDs.size,direct:directCount,reflection:reflectionCount,shadow:shadowCount,guard}};
    },
  };
}
