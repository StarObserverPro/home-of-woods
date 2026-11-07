import * as THREE from 'three';
import {createTree} from './actions/tree.js';
import type {Tree} from '../world/layout.ts';
import type {Models} from './models.ts';
import {heightAt} from '../world/surface.ts';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
export type WoodSegment={a:number[];b:number[];radius:number};
/** Read the same composed tree geometry used by the visible forest. No guessed world-height anchor. */
export function branchAttachment(tree:Tree,models:Models){
  const composed=createTree(models.sourceForTree(tree),tree.kind);
  const segments=composed.root.userData.woodSegments as WoodSegment[];
  const lateral=segments.filter(s=>Math.hypot(s.b[0]-s.a[0],s.b[2]-s.a[2])>.15&&s.a[1]>1.65);
  const joints=lateral.filter(s=>Math.hypot(s.a[0],s.a[2])>.2&&segments.some(other=>other!==s&&new THREE.Vector3().fromArray(other.b).distanceTo(new THREE.Vector3().fromArray(s.a))<.001));
  const segment=(joints.length?joints:lateral).sort((a,b)=>a.a[1]-b.a[1])[0];
  if(!segment){composed.dispose();throw new Error(`Tree has no branch attachment: ${tree.id}`);}
  const local=new THREE.Vector3().fromArray(segment.a),heading=Math.atan2(-(segment.b[2]-segment.a[2]),segment.b[0]-segment.a[0]);
  const treeMatrix=new THREE.Matrix4().compose(new THREE.Vector3(tree.x,heightAt(tree.x,tree.z),tree.z),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),tree.variant*Math.PI*2),new THREE.Vector3().setScalar(tree.scale));
  const matrix=treeMatrix.clone().multiply(new THREE.Matrix4().makeTranslation(...local.toArray())).multiply(new THREE.Matrix4().makeRotationY(heading+.48));
  const root=local.clone().applyMatrix4(treeMatrix);composed.dispose();return {matrix,root,local,segment,treeMatrix};
}
/** A single attached tapered twig with one fork, rooted at (0,0,0). */
export function attachedBranchGeometry(){
  const parts:THREE.BufferGeometry[]=[];
  for(const [a,b,r] of [ [[0,0,0],[.48,-.11,0],.065],[[.48,-.11,0],[1,-.27,.04],.042],[[.48,-.11,0],[.8,.12,-.12],.029] ] as [number[],number[],number][]){
    const start=new THREE.Vector3().fromArray(a),end=new THREE.Vector3().fromArray(b),dir=end.clone().sub(start);
    const g=new THREE.CylinderGeometry(r*.48,r,dir.length(),7);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize()));g.translate(...start.add(end).multiplyScalar(.5).toArray());parts.push(g);
  }
  const geometry=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());return geometry;
}
