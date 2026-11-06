import * as THREE from 'three';

export type SeatContact={x:number;z:number;facing:number;height?:number;surfaceY?:number;width?:number};
export const SEATED_SKIN_CLEARANCE=.012;

/** Aim the real cloned rig, preserving its authored twist and bone lengths. */
function aimJoint(player:THREE.Object3D,bone:THREE.Bone,child:THREE.Bone,worldDirection:THREE.Vector3){
  player.updateWorldMatrix(true,false);
  const from=bone.getWorldPosition(new THREE.Vector3()),to=child.getWorldPosition(new THREE.Vector3());
  const direction=to.sub(from);if(direction.lengthSq()<1e-10||worldDirection.lengthSq()<1e-10)return;
  const delta=new THREE.Quaternion().setFromUnitVectors(direction.normalize(),worldDirection.clone().normalize());
  const rotation=delta.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  const parent=bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();bone.quaternion.copy(parent.multiply(rotation));
}

/** Knees stay ahead of the seat edge; shins hang down instead of folding through the board. */
export function applySeatedLegPose(player:THREE.Object3D,bones:ReadonlyMap<string,THREE.Bone>){
  const rotation=player.getWorldQuaternion(new THREE.Quaternion());
  for(const side of ['l','r']){
    const thigh=bones.get('upperleg'+side),shin=bones.get('lowerleg'+side),foot=bones.get('foot'+side),toes=bones.get('toes'+side);
    if(!thigh||!shin||!foot||!toes)continue;
    aimJoint(player,thigh,shin,new THREE.Vector3(0,-.44,.90).applyQuaternion(rotation));
    aimJoint(player,shin,foot,new THREE.Vector3(0,-1,0));
    aimJoint(player,foot,toes,new THREE.Vector3(0,-.15,1).applyQuaternion(rotation));
  }
}

/** Two-bone reach to an explicit prop contact, rather than putting a prop inside resting arms. */
export function poseHandAt(player:THREE.Object3D,bones:ReadonlyMap<string,THREE.Bone>,side:'l'|'r',handContact:THREE.Vector3,gripContact:THREE.Vector3){
  const shoulder=bones.get('upperarm'+side),elbow=bones.get('lowerarm'+side),hand=bones.get('hand'+side),slot=bones.get('handslot'+side);
  if(!shoulder||!elbow||!hand)return;
  player.updateWorldMatrix(true,false);
  const start=shoulder.getWorldPosition(new THREE.Vector3()),middle=elbow.getWorldPosition(new THREE.Vector3()),end=hand.getWorldPosition(new THREE.Vector3());
  const upperLength=start.distanceTo(middle),lowerLength=middle.distanceTo(end),target=player.localToWorld(handContact.clone()),difference=target.clone().sub(start);
  const distance=THREE.MathUtils.clamp(difference.length(),Math.abs(upperLength-lowerLength)+1e-5,upperLength+lowerLength-1e-5),direction=difference.normalize();
  target.copy(start).addScaledVector(direction,distance);
  const along=(upperLength*upperLength-lowerLength*lowerLength+distance*distance)/(2*distance);
  const height=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));
  const bend=new THREE.Vector3(side==='l'?1:-1,-.15,0).applyQuaternion(player.getWorldQuaternion(new THREE.Quaternion()));
  bend.addScaledVector(direction,-bend.dot(direction)).normalize();
  const desiredElbow=start.clone().addScaledVector(direction,along).addScaledVector(bend,height);
  aimJoint(player,shoulder,elbow,desiredElbow.sub(start));
  aimJoint(player,elbow,hand,target.sub(elbow.getWorldPosition(new THREE.Vector3())));
  if(slot){
    const grip=player.localToWorld(gripContact.clone()).sub(hand.getWorldPosition(new THREE.Vector3()));aimJoint(player,hand,slot,grip);
  }
}
