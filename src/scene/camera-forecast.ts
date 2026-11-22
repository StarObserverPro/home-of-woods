import * as THREE from 'three';
import {WORLD} from '../content/world.ts';
import {heightAt} from '../world/surface.ts';
import type {CameraPoint,OrbitPose} from './anchored-overlook.ts';

/** The same projection and terrain clearance as the ordinary outdoor rig. */
export function updateNavigationForecast(output:THREE.PerspectiveCamera,actual:THREE.PerspectiveCamera,
  pose:OrbitPose,target:CameraPoint,mobile:boolean){
  output.copy(actual);
  output.clearViewOffset();
  const distance=pose.distance,cos=Math.cos(pose.elevation);
  output.position.set(target.x+Math.sin(pose.yaw)*cos*distance,
    target.y+Math.sin(pose.elevation)*distance,target.z+Math.cos(pose.yaw)*cos*distance);
  if(output.position.x>WORLD.minX&&output.position.x<WORLD.maxX&&output.position.z>WORLD.minZ&&output.position.z<WORLD.maxZ)
    output.position.y=Math.max(output.position.y,heightAt(output.position.x,output.position.z)+3);
  output.lookAt(target.x,target.y,target.z);
  output.zoom=pose.zoom*(mobile?1.45:1);
  output.updateProjectionMatrix();
  output.updateMatrixWorld(true);
  return output;
}
