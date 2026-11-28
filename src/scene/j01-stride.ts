import * as THREE from 'three';
import {poseLimbAt} from './seated-pose.ts';

type Kind='stand'|'walk'|'run';
type Side='l'|'r';
type Point=[number,number,number];
type Terrain=(x:number,z:number)=>number;
type Gait={
  clips:Record<Kind,{name:string;stride:number;stance:number;contacts?:Record<Side,[number,number]>}>;
  worldScale:number;
  walkSpeed:number;runSpeed:number;
  support:Record<Side,Point[]>;
  neutral:Record<Side,Point>;
};

export type StrideSample={
  mode:'idle'|'walk'|'run';
  distance:number;
  seconds:number;
  reset?:boolean;
  groundAt?:Terrain;
};

const {clamp,lerp,smoothstep:ease}=THREE.MathUtils;
const sides=['l','r'] as const;
const up=new THREE.Vector3(0,1,0);
const footClearance=.0015;

export function createJ01Stride(actor:THREE.Object3D,root:THREE.Group,player:THREE.Group,
  mixer:THREE.AnimationMixer,clips:THREE.AnimationClip[],bones:ReadonlyMap<string,THREE.Bone>){
  const gait=actor.userData.j01Gait as Gait|undefined;
  if(!gait?.neutral||gait.walkSpeed<=0||gait.worldScale<=0)return null;
  const {clips:profiles,worldScale,walkSpeed,runSpeed}=gait;
  const stand=clips.find(clip=>clip.name===profiles.stand.name);
  const walk=clips.find(clip=>clip.name===profiles.walk.name);
  const run=clips.find(clip=>clip.name===profiles.run.name);
  if(!stand||!walk?.duration||!run?.duration)return null;
  const walkDuration=walk.duration,runDuration=run.duration;
  const standAction=mixer.clipAction(stand).setLoop(THREE.LoopOnce,1);
  const walkAction=mixer.clipAction(walk);
  const runAction=mixer.clipAction(run);
  const actions=[standAction,walkAction,runAction];
  const initialYaw=root.rotation.y;
  const hips=bones.get('Pelvis')!,spine=bones.get('spine_01')!;
  const legs=sides.map(side=>({
    thigh:bones.get('thigh_'+side)!,knee:bones.get('calf_'+side)!,foot:bones.get('foot_'+side)!,
    sole:gait.support[side].map(p=>new THREE.Vector3(...p)),neutral:new THREE.Vector3(...gait.neutral[side]),
    last:new THREE.Vector3(),lastClearance:0,planted:false,lastRotation:new THREE.Quaternion(),
    wanted:new THREE.Vector3(),raw:new THREE.Vector3(),pole:new THREE.Vector3(),scale:new THREE.Vector3(),
    standing:new THREE.Vector3(),stanceOffset:new THREE.Vector3(),
    rotation:new THREE.Quaternion(),
    start:new THREE.Vector3(),length:0,groundShift:0,load:0,contact:0,lift:0,socketRise:0,
  }));
  const poseBase=[hips,spine,...legs.flatMap(({thigh,knee,foot})=>[thigh,knee,foot])]
    .map(bone=>({bone,position:bone.position.clone(),rotation:bone.quaternion.clone()}));
  const point=new THREE.Vector3(),joint=new THREE.Vector3(),axis=new THREE.Vector3(),hip=new THREE.Vector3();
  const normal=new THREE.Vector3(),sideways=new THREE.Vector3(),forward=new THREE.Vector3();
  const tilt=new THREE.Quaternion(),rotation=new THREE.Quaternion(),chestBeforeTilt=new THREE.Quaternion();
  let phase=.13,amount=0,runAmount=0,heading=0,active=false;
  let wasMoving=false,poseAdjusted=false,speed=0,strideScale=1;
  let settle:{support:number;elapsed:number;duration:number;amount:number;phase:number;advance:number;hipY:number}|null=null;

  function restoreSample(){
    if(!poseAdjusted)return;
    // AnimationMixer may skip writing a repeated sample. Undo both IK and
    // follow-through before feeding it the next animation sample.
    for(const {bone,position,rotation} of poseBase){
      bone.position.copy(position);
      bone.quaternion.copy(rotation);
    }
    poseAdjusted=false;
  }

  function reset(){
    restoreSample();
    for(const action of actions)action.stop();
    root.rotation.y=initialYaw;
    active=false;
    phase=.13;
    amount=0;
    runAmount=0;
    speed=0;
    strideScale=1;
    wasMoving=false;
    settle=null;
  }

  function startSettle(){
    const [a,b]=legs;
    // A downhill shoe can be lower in world Y while still in its swing.
    // Pick stance first and compare the gap to ground under each boot.
    const support=a.planted!==b.planted?Number(b.planted):Number(a.lastClearance>b.lastClearance);
    const duration=lerp(.35,.42,runAmount);
    const stride=lerp(profiles.walk.stride,profiles.run.stride,runAmount)*worldScale*strideScale;
    settle={support,elapsed:0,duration,amount,phase,advance:Math.min(.14,speed*.063/stride),hipY:hips.getWorldPosition(hip).y};
  }

  function soleSpan(leg:typeof legs[number],position:THREE.Vector3,q:THREE.Quaternion,terrain?:Terrain){
    let clearance=Infinity;
    for(const anchor of leg.sole){
      point.copy(anchor).multiply(leg.scale).applyQuaternion(q).add(position);
      clearance=Math.min(clearance,point.y-(terrain?terrain(point.x,point.z):player.position.y));
    }
    return clearance;
  }

  function groundTilt(position:THREE.Vector3,terrain:Terrain,amount:number){
    const {x,z}=position,probe=.12;
    const sx=(terrain(x+probe,z)-terrain(x-probe,z))/(probe*2);
    const sz=(terrain(x,z+probe)-terrain(x,z-probe))/(probe*2);
    const scale=Math.min(1,.68/Math.max(.001,Math.hypot(sx,sz)));
    normal.set(-sx*scale,1,-sz*scale).normalize();
    return tilt.setFromUnitVectors(up,normal).slerp(rotation.identity(),1-amount);
  }

  function standingTargets(terrain?:Terrain){
    const [left,right]=legs;
    for(const leg of legs){
      actor.localToWorld(leg.standing.copy(leg.neutral));
      leg.stanceOffset.set(0,0,0);
    }
    if(!terrain)return;
    const a=left.standing,b=right.standing;
    const level=ease(Math.abs(terrain(a.x,a.z)-terrain(b.x,b.z)),.038,.18);
    if(level===0)return;
    // On a cross-slope a wide stance overflexes the uphill knee. Stagger the
    // boots as they move closer across the grade, preserving room for each toe.
    forward.set(Math.sin(heading),0,Math.cos(heading));
    sideways.set(Math.cos(heading),0,-Math.sin(heading));
    point.copy(a).sub(b);
    const narrower=(.112-point.dot(sideways))*.5*level;
    const stagger=(.335-point.dot(forward))*.5*level;
    left.stanceOffset.copy(sideways).multiplyScalar(narrower).addScaledVector(forward,stagger);
    right.stanceOffset.copy(left.stanceOffset).negate();
    a.add(left.stanceOffset);
    b.add(right.stanceOffset);
  }

  function placeFeet(terrain:Terrain|undefined,runBlend:number){
    const progress=settle?settle.elapsed/settle.duration:0;
    const tracking=ease(amount,0,1)*(settle?1-ease(progress,0,.44):1);
    const forwardLean=settle?Math.sin(Math.PI*ease(progress,0,1))*lerp(.046,.076,runBlend)*settle.amount:0;
    standingTargets(terrain);
    let changed=forwardLean>.0001,weightedShift=0,totalLoad=0;
    for(const [index,leg] of legs.entries()){
      const {thigh,knee,foot,raw,wanted,pole,start}=leg;
      foot.getWorldPosition(raw);
      foot.getWorldQuaternion(leg.rotation);
      foot.getWorldScale(leg.scale);
      thigh.getWorldPosition(start);
      knee.getWorldPosition(joint);
      leg.length=start.distanceTo(joint)+joint.distanceTo(raw)-.00002;
      axis.copy(raw).sub(start).normalize();
      pole.copy(joint).sub(start);
      pole.addScaledVector(axis,-pole.dot(axis));
      if(pole.lengthSq()<1e-8)pole.set(Math.sin(heading),0,Math.cos(heading));
      wanted.copy(raw);
      const authoredLift=Math.max(0,soleSpan(leg,raw,leg.rotation));
      leg.lift=authoredLift;
      const side=sides[index];
      const w=profiles.walk.contacts?.[side]??[index*.5,profiles.walk.stance];
      const r=profiles.run.contacts?.[side]??[index*.5,profiles.run.stance];
      const origin=lerp(w[0],r[0],runBlend),duration=lerp(w[1],r[1],runBlend);
      const age=(phase-origin+1.08)%1-.08;
      leg.contact=ease(age,-.055,.085)*(1-ease(age,duration-.15,duration+.025));
      let lift=authoredLift;
      if(settle){
        const primary=index===settle.support;
        const step=primary?ease(progress,.60,1):ease(progress,.06,.64);
        wanted.x=lerp(leg.last.x,leg.standing.x,step);
        wanted.z=lerp(leg.last.z,leg.standing.z,step);
        const travel=Math.hypot(leg.last.x-leg.standing.x,leg.last.z-leg.standing.z);
        const arc=(primary?clamp(travel*.19,0,.065):clamp(travel*.22,0,.105))*Math.sin(Math.PI*step)**2;
        lift=Math.max(0,leg.lastClearance)*(1-ease(progress,0,primary?.29:.58))+arc;
      }else{
        wanted.addScaledVector(leg.stanceOffset,1-ease(amount,0,1));
        const direction=forward.set(Math.sin(heading),0,Math.cos(heading));
        const reach=(wanted.x-player.position.x)*direction.x+(wanted.z-player.position.z)*direction.z;
        wanted.addScaledVector(direction,(strideScale-1)*reach*tracking);
      }
      if(terrain)leg.rotation.premultiply(groundTilt(wanted,terrain,1-ease(authoredLift,.012,.16)));
      if(settle)leg.rotation.slerp(leg.lastRotation,1-ease(progress,0,.48));
      const difference=soleSpan(leg,wanted,leg.rotation,terrain);
      wanted.y+=lift+footClearance-difference;
      leg.load=1-.82*ease(lift,.014,.14);
      leg.groundShift=terrain?terrain(wanted.x,wanted.z)-player.position.y:0;
      weightedShift+=leg.groundShift*leg.load;
      totalLoad+=leg.load;
      changed||=wanted.distanceToSquared(raw)>1e-7;
      changed||=foot.getWorldQuaternion(rotation).angleTo(leg.rotation)>.001;
    }
    // A level surface already has the captured support and swing baked into the clip.
    // Keep terminal extension and both flight intervals intact in steady locomotion.
    if(!settle && amount>=1 && legs.every(leg=>Math.abs(leg.groundShift)<.0001 &&
      Math.abs(soleSpan(leg,leg.raw,leg.foot.getWorldQuaternion(rotation),terrain)-soleSpan(leg,leg.raw,rotation))<.0001))return;
    if(!changed)return;
    for(const saved of poseBase){
      saved.position.copy(saved.bone.position);
      saved.rotation.copy(saved.bone.quaternion);
    }
    poseAdjusted=true;

    hips.getWorldPosition(hip);
    const base=hip.y;
    // On a cross-slope, the uphill hip rises while the rib cage keeps its
    // captured orientation. Read the grade in the actor's transverse direction.
    sideways.set(Math.cos(heading),0,-Math.sin(heading));
    if(terrain&&tracking>0){
      const probe=.19,x=hip.x,z=hip.z;
      const dx=sideways.x*probe,dz=sideways.z*probe;
      const across=(terrain(x+dx,z+dz)-terrain(x-dx,z-dz))/(2*probe);
      const roll=clamp(Math.atan(across)*.55,-.25,.25)*tracking;
      spine.getWorldQuaternion(chestBeforeTilt);
      tilt.setFromAxisAngle(forward.set(Math.sin(heading),0,Math.cos(heading)),roll);
      hips.getWorldQuaternion(rotation).premultiply(tilt);
      hips.quaternion.copy(hips.parent!.getWorldQuaternion(tilt).invert().multiply(rotation));
      spine.quaternion.copy(spine.parent!.getWorldQuaternion(tilt).invert().multiply(chestBeforeTilt));
    }
    let supportShift=0,supportLoad=0;
    for(const leg of legs){
      const y=leg.start.y;
      leg.thigh.getWorldPosition(leg.start);
      leg.socketRise=leg.start.y-y;
      supportShift+=leg.contact*(leg.wanted.y-leg.raw.y-leg.socketRise);
      supportLoad+=leg.contact;
    }
    const legacyShift=.48*weightedShift/totalLoad;
    const vertical=lerp(legacyShift,(supportShift+.07*legacyShift)/(supportLoad+.07),tracking);
    for(const leg of legs){
      // Follow the loaded boot with the pelvis. The unloaded boot clears the
      // surface under it and is free to follow the body over lower ground.
      const swing=Math.max(leg.wanted.y-leg.lift*.12,leg.raw.y+vertical+leg.socketRise);
      if(!settle)leg.wanted.y=lerp(leg.wanted.y,swing,tracking*(1-leg.contact));
    }
    const forwardX=forwardLean*Math.sin(heading),forwardZ=forwardLean*Math.cos(heading);
    let weightX=0,weightZ=0;
    if(settle){
      const supportingFoot=legs[settle.support].wanted;
      const weight=.16*Math.sin(Math.PI*ease(progress,0,.75));
      weightX=clamp(supportingFoot.x-hip.x,-.32,.32)*weight;
      weightZ=clamp(supportingFoot.z-hip.z,-.32,.32)*weight;
    }
    let maxHip=Infinity;
    for(const leg of legs){
      const horizontal=Math.hypot(leg.start.x+forwardX+weightX-leg.wanted.x,
        leg.start.z+forwardZ+weightZ-leg.wanted.z);
      const reach=Math.sqrt(Math.max(0,leg.length**2-horizontal**2));
      maxHip=Math.min(maxHip,base+leg.wanted.y+reach-leg.start.y);
    }
    hip.x+=forwardX+weightX;
    hip.z+=forwardZ+weightZ;
    const hipY=clamp(Math.min(base+vertical,maxHip),base-.165,base+lerp(.083,.20,tracking));
    hip.y=settle?lerp(settle.hipY,hipY,ease(progress,0,.29)):hipY;
    hips.position.copy(hips.parent!.worldToLocal(hip));
    for(const {thigh,knee,foot,wanted,pole,rotation:footRotation} of legs){
      poseLimbAt(player,thigh,knee,foot,wanted,pole);
      foot.quaternion.copy(foot.parent!.getWorldQuaternion(rotation).invert().multiply(footRotation));
    }
    if(settle){
      const recoil=lerp(.024,.046,runBlend)*Math.sin(Math.PI*ease(progress,.45,1));
      tilt.setFromAxisAngle(sideways.set(Math.cos(heading),0,-Math.sin(heading)),forwardLean*1.55-recoil);
      spine.getWorldQuaternion(rotation).premultiply(tilt);
      spine.quaternion.copy(spine.parent!.getWorldQuaternion(tilt).invert().multiply(rotation));
    }
  }

  function present(sample:StrideSample,snap:boolean){
    if(sample.reset&&active)reset();
    const facing=player.rotation.y;
    if(!active){
      for(const action of actions)action.reset().play();
      heading=facing;
      active=true;
    }
    const moving=sample.mode!=='idle'&&!snap;
    const seconds=clamp(sample.seconds,0,.1);
    if(moving||snap)settle=null;
    else if(wasMoving&&amount>.14)startSettle();
    restoreSample();
    wasMoving=moving;
    if(moving){
      amount=Math.min(1,amount+seconds/.22);
      const goal=sample.mode==='run'?1:0;
      runAmount=clamp(runAmount+clamp(goal-runAmount,-seconds/.21,seconds/.21),0,1);
      const probe=.30,dx=Math.sin(facing)*probe,dz=Math.cos(facing)*probe,{x,z}=player.position;
      const grade=sample.groundAt?(sample.groundAt(x+dx,z+dz)-sample.groundAt(x-dx,z-dz))/(2*probe):0;
      const goalStride=1-lerp(.38,.23,runAmount)*ease(Math.abs(grade),.12,.72);
      strideScale=lerp(strideScale,goalStride,1-Math.exp(-12*seconds));
      const stride=lerp(profiles.walk.stride,profiles.run.stride,ease(runAmount,0,1))*strideScale;
      phase=(phase+sample.distance/(stride*worldScale))%1;
      if(seconds>0)speed=lerp(speed,Math.min(sample.distance/seconds,runSpeed),1-Math.exp(-14*seconds));
    }else if(settle){
      settle.elapsed=Math.min(settle.duration,settle.elapsed+seconds);
      amount=settle.amount*(1-settle.elapsed/settle.duration);
      phase=(settle.phase+settle.advance*ease(settle.elapsed,0,settle.duration*.66))%1;
    }else{
      amount=0;
      speed=0;
      phase=(phase>=.5?.5:0)+.13;
    }
    const delta=Math.atan2(Math.sin(facing-heading),Math.cos(facing-heading));
    heading+=snap||Math.abs(delta)<.001?delta:delta*(1-Math.exp(-14*seconds));
    root.rotation.y=initialYaw+Math.atan2(Math.sin(heading-facing),Math.cos(heading-facing));
    const blend=ease(amount,0,1),runBlend=ease(runAmount,0,1);
    standAction.setEffectiveWeight(1-blend);
    walkAction.setEffectiveWeight(blend*(1-runBlend));
    runAction.setEffectiveWeight(blend*runBlend);
    standAction.time=0;
    walkAction.time=phase*walkDuration;
    runAction.time=phase*runDuration;
    mixer.update(0);
    if(sample.groundAt||settle)placeFeet(sample.groundAt,runBlend);
    if(moving){
      const stance=lerp(profiles.walk.stance,profiles.run.stance,runBlend);
      for(const [index,leg] of legs.entries()){
        leg.foot.getWorldPosition(leg.last);
        leg.foot.getWorldQuaternion(leg.lastRotation);
        leg.foot.getWorldScale(leg.scale);
        leg.lastClearance=soleSpan(leg,leg.last,leg.lastRotation,sample.groundAt);
        const contact=(runBlend>=.5?profiles.run:profiles.walk).contacts?.[sides[index]];
        leg.planted=(phase-(contact?.[0]??index*.5)+1)%1<(contact?.[1]??stance)&&leg.lastClearance<.095;
      }
    }
    if(settle&&settle.elapsed>=settle.duration)settle=null;
  }

  return {present,reset,walkSpeed,runSpeed,get inMotion(){return amount>0||settle!==null;},stats:()=>({
    phase,weight:ease(amount,0,1),runWeight:ease(runAmount,0,1),terrainStrideScale:strideScale,
    walkStride:profiles.walk.stride*worldScale,runStride:profiles.run.stride*worldScale,
    settling:settle?{seconds:settle.elapsed,support:sides[settle.support]}:null,
  })};
}
