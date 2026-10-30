import * as THREE from 'three';
import { CHARACTER } from '../content/characters.ts';
export function syncTwoHandedAxe(actor:THREE.Object3D,model:THREE.Object3D,tool:THREE.Object3D){
  actor.updateMatrixWorld(true);
  const right=model.getObjectByName('handslotr')!,left=model.getObjectByName('handslotl')!;
  const r=actor.worldToLocal(right.getWorldPosition(new THREE.Vector3()));
  const l=actor.worldToLocal(left.getWorldPosition(new THREE.Vector3()));
  const shaft=l.clone().sub(r).normalize();
  const rotation=actor.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(right.getWorldQuaternion(new THREE.Quaternion()));
  const edge=new THREE.Vector3(1,0,0).applyQuaternion(rotation);edge.addScaledVector(shaft,-edge.dot(shaft)).normalize();
  const normal=new THREE.Vector3().crossVectors(edge,shaft).normalize();
  tool.position.copy(r);tool.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(edge,shaft,normal));
  tool.scale.setScalar(CHARACTER.embeddedScale);tool.updateMatrixWorld(true);
  const local=tool.worldToLocal(left.getWorldPosition(new THREE.Vector3()));
  return {handSeparation:r.distanceTo(l),leftGripRadialGap:Math.hypot(local.x,local.z)*CHARACTER.embeddedScale,leftGripAlongHandle:local.y*CHARACTER.embeddedScale};
}
