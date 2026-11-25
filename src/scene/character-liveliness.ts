import * as THREE from 'three';
import {CHARACTER_MOTION as M} from '../content/character-motion.ts';

type Gesture='none'|'adjust-collar'|'touch-hair';
type Arm={upper:THREE.Bone;lower:THREE.Bone;hand:THREE.Bone};
type BlinkAdapter={apply:(amount:number)=>void;kind:'atlas+morph'|'atlas'|'morph'|'none'};
const canonical=(name:string)=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
const smooth=(value:number)=>{const t=THREE.MathUtils.clamp(value,0,1);return t*t*(3-2*t);};
const unit=(seed:number,index:number)=>{
  let n=Math.imul(seed^(index|0),2246822507);n=Math.imul(n^(n>>>13),3266489909);
  return ((n^(n>>>16))>>>0)/4294967296;
};
export function characterMotionSeed(id:string){
  let seed=2166136261;
  for(let i=0;i<id.length;i++)seed=Math.imul(seed^id.charCodeAt(i),16777619);
  return seed>>>0;
}
function blinkPulse(seconds:number){
  const b=M.blink;
  if(seconds<0||seconds>b.close+b.closed+b.open)return 0;
  return seconds<b.close?smooth(seconds/b.close):1-smooth((seconds-b.close-b.closed)/b.open);
}
/** Seeded held-open intervals and rare double blinks, as in the existing animal expression adapter. */
export function characterBlinkAt(seconds:number,seed:number){
  const time=(Number.isFinite(seconds)?Math.max(0,seconds):0)+unit(seed,91)*M.blink.window;
  const window=Math.floor(time/M.blink.window),local=time-window*M.blink.window;
  const start=.6+unit(seed,window)*1.65;
  return Math.max(blinkPulse(local-start),unit(seed,window+131)<M.blink.doubleChance?blinkPulse(local-start-M.blink.doubleDelay):0);
}

/**
 * Additive upper-body layer for admitted rigs. The caller must restore before
 * sampling its mixer/IK, then update after all action/contact owners. No pelvis,
 * feet, root position, scale, geometry, materials or gameplay state are written.
 * J01 passes its existing atlas/morph blink function. The other current faces
 * are painted; their eyes stay unchanged while the head makes small glances.
 */
export function createCharacterLiveliness(body:THREE.Object3D,options:{id:string;frame?:THREE.Object3D;blink?:BlinkAdapter}){
  const frame=options.frame??body,seed=characterMotionSeed(options.id);
  const bones=new Map<string,THREE.Bone>();
  body.traverse(object=>{if(object instanceof THREE.Bone)bones.set(canonical(object.name),object);});
  const find=(...names:string[])=>names.map(name=>bones.get(name)).find(Boolean);
  const spine=find('spine','spine01'),chest=find('chest','spine02'),head=find('head');
  function arm(side:'l'|'r'):Arm|null{
    const upper=find('upperarm'+side),lower=find('lowerarm'+side),hand=find('hand'+side);
    return upper&&lower&&hand?{upper,lower,hand}:null;
  }
  const arms={l:arm('l'),r:arm('r')};
  const tracked=[...new Set([spine,chest,head,
    ...Object.values(arms).flatMap(value=>value?[value.upper,value.lower,value.hand]:[])])]
    .filter((bone):bone is THREE.Bone=>!!bone).map(bone=>({bone,base:bone.quaternion.clone()}));
  const eyeSupport={blink:options.blink?.kind??'none',gaze:'none'};
  // Reused scratch storage, including the two-bone gesture solve.
  const orientation=new THREE.Quaternion(),inverse=new THREE.Quaternion(),delta=new THREE.Quaternion(),world=new THREE.Quaternion();
  const up=new THREE.Vector3(),right=new THREE.Vector3(),forward=new THREE.Vector3(),axis=new THREE.Vector3();
  const start=new THREE.Vector3(),joint=new THREE.Vector3(),tip=new THREE.Vector3(),target=new THREE.Vector3();
  const direction=new THREE.Vector3(),pole=new THREE.Vector3(),jointTarget=new THREE.Vector3();
  const aimStart=new THREE.Vector3(),aimCurrent=new THREE.Vector3(),aimWanted=new THREE.Vector3();
  let applied=false,disposed=false,wasIdle=false,wereHandsFree=false,idleSince=0,handsFreeSince=0,lastSeconds=-Infinity;
  let seconds=0,idleWeight=0,chestPitch=0,swayRoll=0,headYaw=0,headPitch=0,blink=0,gazeX=0,gazeY=0;
  let gesture:Gesture='none',gestureWeight=0,suppressed:'reduced-motion'|'action-or-locomotion'|'hands-busy'|null=null;

  function beforeAnimation(){
    if(!applied)return;
    for(const saved of tracked)saved.bone.quaternion.copy(saved.base);
    options.blink?.apply(0);
    applied=false;
  }
  function turn(bone:THREE.Bone|undefined,pitch:number,yaw:number,roll:number){
    if(!bone)return;
    // Convert semantic actor axes into this rig's current bone frame; J01 and
    // KayKit have different local bone axes but share the same gameplay facing.
    bone.getWorldQuaternion(inverse).invert();
    if(pitch)bone.quaternion.multiply(delta.setFromAxisAngle(axis.copy(right).applyQuaternion(inverse),pitch));
    if(yaw)bone.quaternion.multiply(delta.setFromAxisAngle(axis.copy(up).applyQuaternion(inverse),yaw));
    if(roll)bone.quaternion.multiply(delta.setFromAxisAngle(axis.copy(forward).applyQuaternion(inverse),roll));
    bone.quaternion.normalize();
  }
  function aim(bone:THREE.Bone,child:THREE.Bone,at:THREE.Vector3){
    bone.getWorldPosition(aimStart);child.getWorldPosition(aimCurrent).sub(aimStart);
    aimWanted.copy(at).sub(aimStart);
    if(aimCurrent.lengthSq()<1e-10||aimWanted.lengthSq()<1e-10)return;
    delta.setFromUnitVectors(aimCurrent.normalize(),aimWanted.normalize());
    bone.getWorldQuaternion(world);world.premultiply(delta);
    bone.parent!.getWorldQuaternion(inverse).invert();bone.quaternion.copy(inverse.multiply(world));
  }
  function reach(limb:Arm,side:number,amount:number,kind:Gesture){
    limb.upper.getWorldPosition(start);limb.lower.getWorldPosition(joint);limb.hand.getWorldPosition(tip);
    const a=start.distanceTo(joint),b=joint.distanceTo(tip),length=a+b;
    if(Math.min(a,b)<1e-6)return;
    if(kind==='touch-hair'&&head){
      head.getWorldPosition(target).addScaledVector(right,side*length*.24)
        .addScaledVector(up,length*.26).addScaledVector(forward,length*.15);
    }else{
      (chest??spine??limb.upper).getWorldPosition(target).addScaledVector(right,side*length*.14)
        .addScaledVector(up,length*.10).addScaledVector(forward,length*.24);
    }
    target.lerpVectors(tip,target,amount);
    direction.copy(target).sub(start);
    const distance=THREE.MathUtils.clamp(direction.length(),Math.abs(a-b)+1e-5,length-1e-5);
    direction.normalize();target.copy(start).addScaledVector(direction,distance);
    const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
    pole.copy(right).multiplyScalar(side).addScaledVector(forward,.25).addScaledVector(up,-.25);
    pole.addScaledVector(direction,-pole.dot(direction)).normalize();
    jointTarget.copy(joint).sub(start);
    jointTarget.addScaledVector(direction,-jointTarget.dot(direction)).normalize();
    pole.lerpVectors(jointTarget,pole,amount).normalize();
    jointTarget.copy(start).addScaledVector(direction,along).addScaledVector(pole,height);
    aim(limb.upper,limb.lower,jointTarget);aim(limb.lower,limb.hand,target);
    turn(limb.hand,-.12*amount,0,side*.12*amount);
  }
  function update(time:number,reducedMotion:boolean,idle:boolean,handsFree=true){
    if(disposed)return;
    beforeAnimation();
    seconds=Number.isFinite(time)?Math.max(0,time):0;
    if(!idle||!wasIdle||seconds<lastSeconds)idleSince=seconds;
    if(!handsFree||!wereHandsFree||seconds<lastSeconds)handsFreeSince=seconds;
    wereHandsFree=handsFree;
    wasIdle=idle;lastSeconds=seconds;
    for(const saved of tracked)saved.base.copy(saved.bone.quaternion);
    applied=true;
    idleWeight=idle&&!reducedMotion?smooth((seconds-idleSince)/M.idleEaseSeconds):0;
    suppressed=reducedMotion?'reduced-motion':!idle?'action-or-locomotion':!handsFree?'hands-busy':null;
    chestPitch=0;swayRoll=0;headYaw=0;headPitch=0;gazeX=0;gazeY=0;gesture='none';gestureWeight=0;
    blink=reducedMotion||eyeSupport.blink==='none'?0:characterBlinkAt(seconds,seed);
    frame.getWorldQuaternion(orientation);
    up.set(0,1,0).applyQuaternion(orientation);right.set(1,0,0).applyQuaternion(orientation);forward.set(0,0,1).applyQuaternion(orientation);
    if(idleWeight>0){
      const phase=unit(seed,11)*Math.PI*2;
      const breath=Math.sin(seconds*Math.PI*2/(M.breathing.periodMin+unit(seed,12)*M.breathing.periodSpread)+phase);
      const sway=seconds*Math.PI*2/(M.sway.periodMin+unit(seed,13)*M.sway.periodSpread)+phase*.7;
      chestPitch=idleWeight*(breath*M.breathing.pitch+Math.sin(sway*.81)*M.sway.pitch);
      swayRoll=idleWeight*Math.sin(sway)*M.sway.roll;
      const lookTime=seconds+unit(seed,77)*M.glance.period,lookIndex=Math.floor(lookTime/M.glance.period);
      const blend=smooth((lookTime-lookIndex*M.glance.period)/M.glance.transition);
      gazeX=THREE.MathUtils.lerp(unit(seed,lookIndex+511)-.5,unit(seed,lookIndex+512)-.5,blend)*1.2*idleWeight;
      gazeY=THREE.MathUtils.lerp(unit(seed,lookIndex+913)-.5,unit(seed,lookIndex+914)-.5,blend)*.55*idleWeight;
      headYaw=gazeX*M.glance.yaw;headPitch=-gazeY*M.glance.pitch-chestPitch*.3;
      turn(spine,chestPitch*.35,0,swayRoll*.6);
      turn(chest,chestPitch*.65,0,swayRoll*.4);
      turn(head,headPitch,headYaw,-swayRoll*.35);
      if(handsFree){
        const shift=unit(seed,37)*M.gesture.window,window=Math.floor((seconds+shift)/M.gesture.window);
        const startsAt=window*M.gesture.window+M.gesture.earliest+unit(seed,window+171)*M.gesture.spread-shift;
        const elapsed=seconds-startsAt;
        const side=unit(seed,window+313)<.5?1:-1,limb=side>0?arms.l:arms.r;
        if(limb&&startsAt>=Math.max(idleSince,handsFreeSince)+M.gesture.settleAfterIdle&&elapsed>=0&&elapsed<M.gesture.duration){
          gestureWeight=smooth(elapsed/.85)*(1-smooth((elapsed-1.7)/(M.gesture.duration-1.7)))*idleWeight;
          gesture=head&&unit(seed,window+419)<.45?'touch-hair':'adjust-collar';
          reach(limb,side,gestureWeight,gesture);
        }
      }
    }
    options.blink?.apply(blink);
  }
  return {beforeAnimation,update,
    reset(){beforeAnimation();wasIdle=false;wereHandsFree=false;lastSeconds=-Infinity;idleWeight=0;gesture='none';gestureWeight=0;},
    // gaze is the normalized head-glance target, not a moving pupil.
    stats:()=>({id:options.id,seconds,idleWeight,chestPitch,swayRoll,headYaw,headPitch,blink,gaze:[gazeX,gazeY],
      gesture,gestureWeight,suppressed,eyeSupport,bones:{upperBody:Number(!!spine)+Number(!!chest)+Number(!!head),arms:Number(!!arms.l)+Number(!!arms.r)},disposed}),
    dispose(){if(disposed)return;beforeAnimation();disposed=true;wasIdle=false;wereHandsFree=false;lastSeconds=-Infinity;},
  };
}
