import * as THREE from 'three';
import {createShoeSoles} from './character-soles.ts';
import type {GroundHeight} from './character-soles.ts';
import {poseLimbAt} from './seated-pose.ts';

/** Terrain support for the KayKit fallback and its original motion library. */
export function createRangerFooting(player:THREE.Group,body:THREE.Object3D){
  const bones=new Map<string,THREE.Bone>();
  body.traverse(o=>{if(o instanceof THREE.Bone)bones.set(o.name.replaceAll('.',''),o);});
  const pelvis=bones.get('hips');
  if(!pelvis)return null;
  const hips=pelvis;
  const chains=(['l','r'] as const).map(side=>({
    top:bones.get('upperleg'+side)!,knee:bones.get('lowerleg'+side)!,foot:bones.get('foot'+side)!,
    start:new THREE.Vector3(),end:new THREE.Vector3(),rotation:new THREE.Quaternion(),pole:new THREE.Vector3(),
  }));
  if(chains.some(({top,knee,foot})=>!top||!knee||!foot))return null;
  const readSoles=createShoeSoles(body);
  const raw=[hips,...chains.flatMap(({top,knee,foot})=>[top,knee,foot])].map(bone=>({
    bone,q:bone.quaternion.clone(),p:bone.position.clone(),
  }));
  const hip=new THREE.Vector3(),middle=new THREE.Vector3(),axis=new THREE.Vector3(),normal=new THREE.Vector3();
  const up=new THREE.Vector3(0,1,0);
  const slope=new THREE.Quaternion(),inverse=new THREE.Quaternion();
  let adjusted=false;
  function restore(){
    if(!adjusted)return;
    for(const {bone,q,p} of raw){bone.position.copy(p);bone.quaternion.copy(q);}
    adjusted=false;
  }
  function place(groundAt:GroundHeight,motion:number){
    restore();
    const posed=readSoles(groundAt,player.position.y);
    if(posed.clearance.some(value=>!Number.isFinite(value)))return;
    for(const {bone,q,p} of raw){q.copy(bone.quaternion);p.copy(bone.position);}
    adjusted=true;
    for(const [index,leg] of chains.entries()){
      const {x,z}=leg.foot.getWorldPosition(leg.end),probe=.14;
      const gx=(groundAt(x+probe,z)-groundAt(x-probe,z))/(probe*2);
      const gz=(groundAt(x,z+probe)-groundAt(x,z-probe))/(probe*2);
      const turn=1-THREE.MathUtils.smoothstep(posed.level[index]*motion,.012,.15);
      normal.set(-gx,1,-gz).normalize();
      normal.lerp(up,1-turn).normalize();
      leg.foot.getWorldQuaternion(leg.rotation).premultiply(slope.setFromUnitVectors(up,normal));
      leg.foot.quaternion.copy(leg.foot.parent!.getWorldQuaternion(inverse).invert().multiply(leg.rotation));
    }
    const level=posed.level.slice(),{clearance}=readSoles(groundAt,player.position.y);
    hips.getWorldPosition(hip);
    let upper=Infinity,shift=0;
    for(const [index,{top,knee,foot,start,end,pole}] of chains.entries()){
      top.getWorldPosition(start);knee.getWorldPosition(middle);foot.getWorldPosition(end);
      const length=start.distanceTo(middle)+middle.distanceTo(end)-.001;
      axis.subVectors(end,start).normalize();
      pole.subVectors(middle,start).addScaledVector(axis,-pole.dot(axis));
      if(pole.lengthSq()<1e-8)pole.set(Math.sin(player.rotation.y),0,Math.cos(player.rotation.y));
      const lift=Math.max(0,level[index])*motion;
      const correction=lift+.002-clearance[index];
      end.y+=correction;shift+=correction*.4;
      upper=Math.min(upper,end.y-start.y+Math.sqrt(Math.max(0,length**2-(end.x-start.x)**2-(end.z-start.z)**2)));
    }
    hip.y+=Math.min(upper,THREE.MathUtils.clamp(shift,-.16,.035));
    hips.position.copy(hips.parent!.worldToLocal(hip));
    const plant=({top,knee,foot,end,rotation,pole}:typeof chains[number])=>{
      poseLimbAt(player,top,knee,foot,end,pole);
      foot.quaternion.copy(foot.parent!.getWorldQuaternion(inverse).invert().multiply(rotation));
    };
    chains.forEach(plant);
    // The toe and ankle can share vertices. Check the sole again after bending.
    for(let pass=0;pass<3;pass++){
      const height=readSoles(groundAt).clearance;
      if(height.every(value=>value>=-.003))break;
      for(const [index,leg] of chains.entries())if(height[index]<-.003){
        leg.foot.getWorldPosition(leg.end);leg.end.y+=(.001-height[index])*1.18;
        plant(leg);
      }
    }
  }
  return {restore,place};
}
