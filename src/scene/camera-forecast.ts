import * as THREE from 'three';
import {exteriorHeight} from '../world/horizon.js';
import type {CameraPoint,OrbitPose} from './anchored-overlook.ts';
import {navigationOpticsProjection} from './overlook-optics-rules.ts';

/** Shared actual/forecast placement, including the decorative valley shoulders. */
export function positionNavigationCamera(output:THREE.PerspectiveCamera,pose:OrbitPose,target:CameraPoint){
  const distance=pose.distance,cos=Math.cos(pose.elevation);
  output.position.set(target.x+Math.sin(pose.yaw)*cos*distance,
    target.y+Math.sin(pose.elevation)*distance,target.z+Math.cos(pose.yaw)*cos*distance);
  output.position.y=Math.max(output.position.y,exteriorHeight(output.position.x,output.position.z)+3);
  output.lookAt(target.x,target.y,target.z);
  return output;
}

/** The same projection, radius and terrain clearance as the ordinary outdoor rig. */
export function updateNavigationForecast(output:THREE.PerspectiveCamera,actual:THREE.PerspectiveCamera,
  pose:OrbitPose,target:CameraPoint,mobile:boolean){
  output.copy(actual);
  output.clearViewOffset();
  positionNavigationCamera(output,pose,target);
  const lens=navigationOpticsProjection(pose,output.aspect,mobile);
  output.fov=lens.fov;output.zoom=lens.zoom;
  output.updateProjectionMatrix();
  output.updateMatrixWorld(true);
  return output;
}
