import * as THREE from 'three';
import {poseLimbAt} from './seated-pose.ts';
import {createShoeSoles} from './character-soles.ts';

type Side='l'|'r';
export type ActionStep={phase:number;slide:number;dx:number;dz:number};
export type ActionFooting={
  kind:'ground'|'crouch'|'cut'|'seated'|'climb'|'sweep';
  groundAt:(x:number,z:number)=>number;
  lift:number;
  seat?:ActionStep & {rising:boolean};
  step?:ActionStep;
  inspection?:boolean;
};

/** Solve the original J01 leg lengths to shoe contacts after the work pose/hand reach. */
export function createJ01ActionFeet(player:THREE.Group,body:THREE.Object3D,pelvis:THREE.Bone,
    bones:ReadonlyMap<string,THREE.Bone>,anchors?:Record<Side,[number,number,number][]>){
  if(!anchors)return null;
  const frameRotation=player.getWorldQuaternion(new THREE.Quaternion()).invert();
  const chains=(['l','r'] as const).map(side=>{
    const thigh=bones.get('thigh_'+side)!,knee=bones.get('calf_'+side)!,foot=bones.get('foot_'+side)!;
    return {
      side,thigh,knee,foot,
      rest:[thigh,knee,foot].map(bone=>[bone,bone.quaternion.clone()] as const),
      neutralPosition:player.worldToLocal(foot.getWorldPosition(new THREE.Vector3())),
      neutralRotation:frameRotation.clone().multiply(foot.getWorldQuaternion(new THREE.Quaternion())),
      anchors:anchors[side].map(point=>new THREE.Vector3(...point)),
      target:new THREE.Vector3(),rotation:new THREE.Quaternion(),
    };
  });
  const orientation=new THREE.Quaternion(),inverse=new THREE.Quaternion();
  const hips=new THREE.Vector3(),localHips=new THREE.Vector3(),first=new THREE.Vector3(),joint=new THREE.Vector3(),sole=new THREE.Vector3();
  const scale=new THREE.Vector3(),forward=new THREE.Vector3(),airPosition=new THREE.Vector3();
  const airRotation=new THREE.Quaternion();
  const readSoles=createShoeSoles(body,'ball');
  const beforeClearance=chains.flatMap(({thigh,knee,foot})=>[thigh,knee,foot])
    .map(bone=>({bone,q:bone.quaternion.clone()}));
  let floorAdjusted=false;
  function restoreFloor(){
    if(!floorAdjusted)return;
    for(const {bone,q} of beforeClearance)bone.quaternion.copy(q);
    floorAdjusted=false;
  }

  function place(footing:ActionFooting,source:ReadonlyMap<string,THREE.Bone>){
    const seated=footing.kind==='seated',cut=footing.kind==='cut',crouch=footing.kind==='crouch';
    const air=footing.kind==='climb'?THREE.MathUtils.smoothstep(footing.lift,.02,.37):0;
    player.getWorldQuaternion(orientation);
    forward.set(0,0,1).applyQuaternion(orientation);
    pelvis.getWorldPosition(hips);
    // Keep a deep crouch behind its support. An overreaching pelvis beyond the
    // ankles makes a forward knee pole drive the knees through the ground.
    if(crouch){
      player.worldToLocal(localHips.copy(hips));
      localHips.z=Math.min(localHips.z,.19);
      player.localToWorld(hips.copy(localHips));
      pelvis.position.copy(pelvis.parent!.worldToLocal(localHips.copy(hips)));
    }
    let minimum=-Infinity,maximum=Infinity;
    for(const chain of chains){
      const {side,thigh,knee,foot,rest,neutralPosition,neutralRotation,target,rotation}=chain;
      foot.getWorldQuaternion(airRotation);
      for(const [bone,quaternion] of rest)bone.quaternion.copy(quaternion);
      target.copy(neutralPosition);
      const step=footing.seat??footing.step;
      const fraction=step?THREE.MathUtils.smoothstep(step.phase,side==='r'?.04:.29,side==='r'?.49:.91):1;
      if(seated){
        target.x*=THREE.MathUtils.lerp(1.08,.85,fraction);
        target.z+=THREE.MathUtils.lerp(.04,.39,fraction);
      }
      else if(cut){target.x*=1.16;target.z+=side==='l'?.10:-.08;}
      else{target.x*=crouch?1.15:1.08;target.z+=crouch?.18:.04;}
      player.localToWorld(target);
      if(step){
        target.x+=step.dx*(fraction-step.slide);
        target.z+=step.dz*(fraction-step.slide);
      }
      rotation.copy(orientation).multiply(neutralRotation);
      foot.getWorldScale(scale);
      let raise=-Infinity;
      for(const anchor of chain.anchors){
        sole.copy(anchor).multiply(scale).applyQuaternion(rotation).add(target);
        raise=Math.max(raise,footing.groundAt(sole.x,sole.z)-sole.y);
      }
      target.y+=raise;
      if(step)target.y+=.095*Math.sin(Math.PI*fraction);
      if(air>0){
        const driverFoot=source.get('foot'+side);
        if(driverFoot){
          driverFoot.getWorldPosition(airPosition);
          target.lerp(airPosition,air);
          rotation.slerp(airRotation,air);
        }
      }
      thigh.getWorldPosition(first);knee.getWorldPosition(joint);foot.getWorldPosition(sole);
      const leg=first.distanceTo(joint)+joint.distanceTo(sole);
      const horizontal=Math.hypot(first.x-target.x,first.z-target.z);
      const upper=Math.sqrt(Math.max(0,(leg-.009)**2-horizontal**2));
      maximum=Math.min(maximum,hips.y+target.y+upper-first.y);
      if(!seated){
        const support=footing.kind==='ground'?upper*.955:footing.kind==='sweep'?upper*.93:leg*(crouch?.23:.41)*(1-air);
        minimum=Math.max(minimum,hips.y+target.y+support-first.y);
      }
    }
    hips.y=THREE.MathUtils.clamp(hips.y,Math.min(minimum,maximum),maximum);
    pelvis.position.copy(pelvis.parent!.worldToLocal(hips));
    for(const {thigh,knee,foot,target,rotation} of chains){
      poseLimbAt(player,thigh,knee,foot,target,forward);
      foot.quaternion.copy(foot.parent!.getWorldQuaternion(inverse).invert().multiply(rotation));
    }
  }
  // Blending two valid joint rotations can arc a sole through the terrain.
  function clearFloor(groundAt:ActionFooting['groundAt']){
    const {clearance}=readSoles(groundAt);
    if(!clearance.some(height=>height<-.003))return;
    for(const {bone,q} of beforeClearance)q.copy(bone.quaternion);
    floorAdjusted=true;
    for(const [index,{thigh,knee,foot,target,rotation}] of chains.entries()){
      const raise=.001-clearance[index];
      if(raise<.004)continue;
      foot.getWorldPosition(target);foot.getWorldQuaternion(rotation);
      target.y+=raise;
      thigh.getWorldPosition(first);knee.getWorldPosition(joint);forward.subVectors(joint,first).normalize();
      poseLimbAt(player,thigh,knee,foot,target,forward);
      foot.quaternion.copy(foot.parent!.getWorldQuaternion(inverse).invert().multiply(rotation));
    }
  }
  return {place,clearFloor,restoreFloor};
}
