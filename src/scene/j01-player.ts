import * as THREE from 'three';
import {LOCAL_PLAYER} from '../content/characters.ts';
import type {WardrobeLook} from '../content/wardrobe-preview.ts';
import type { InventoryState } from '../domain/inventory.ts';
import type { Models } from './models.ts';
import type { Resources } from './resources.ts';
import { poseHandAt,poseLimbAt } from './seated-pose.ts';
import {createCharacterLiveliness} from './character-liveliness.ts';
import {createJ01Stride} from './j01-stride.ts';
import type {StrideSample} from './j01-stride.ts';
import {createJ01ActionFeet} from './j01-action-feet.ts';
import type {ActionFooting} from './j01-action-feet.ts';

const BONE_MAP = [
  ['Pelvis','hips'], ['spine_01','spine'], ['spine_02','chest'], ['head','head'],
  ...(['l','r'] as const).flatMap(side=>[
    [`thigh_${side}`,`upperleg${side}`,`calf_${side}`,`lowerleg${side}`],
    [`calf_${side}`,`lowerleg${side}`,`foot_${side}`,`foot${side}`],
    [`foot_${side}`,`foot${side}`],
    [`upperarm_${side}`,`upperarm${side}`,`lowerarm_${side}`,`lowerarm${side}`],
    [`lowerarm_${side}`,`lowerarm${side}`,`hand_${side}`,`hand${side}`],
    [`hand_${side}`,`hand${side}`],
  ]),
] as const;

function bonesOf(root:THREE.Object3D) {
  const bones=new Map<string,THREE.Bone>();
  root.traverse(object=>{if(object instanceof THREE.Bone)bones.set(object.name.replaceAll('.',''),object);});
  return bones;
}

function accessoryMount(bone:THREE.Bone,center:THREE.Vector3,orientation:THREE.Quaternion,worldSize:THREE.Vector3){
  const mount=new THREE.Group();
  mount.position.copy(bone.worldToLocal(center));
  mount.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(orientation));
  mount.scale.copy(worldSize).divide(bone.getWorldScale(new THREE.Vector3()));
  bone.add(mount);
  return mount;
}

function fitWorkGloves(resources:Resources,skin:THREE.Object3D){
  const layers:Array<{attribute:THREE.BufferAttribute;bare:Float32Array;worn:Float32Array}>=[];
  const fabric=new THREE.Color('#a59069');
  skin.traverse(mesh=>{
    if(!(mesh instanceof THREE.SkinnedMesh))return;
    const source=mesh.geometry.getAttribute('color');
    const joints=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
    if(!source||source.itemSize<3||!joints||!weights)return;
    const handJoints=mesh.skeleton.bones.map(bone=>/^(hand|(?:thumb|index|middle|ring|pinky)_\d+)_[lr]$/.test(bone.name));
    const bare=new Float32Array(source.count*source.itemSize),worn=new Float32Array(bare.length);
    for(let vertex=0;vertex<source.count;vertex++){
      let handWeight=0;
      for(let channel=0;channel<joints.itemSize;channel++){
        if(handJoints[joints.getComponent(vertex,channel)])handWeight+=weights.getComponent(vertex,channel);
      }
      // Keep fingertip deformation and the existing skin normals at the wrist edge.
      const coverage=THREE.MathUtils.smoothstep(handWeight,.25,.75);
      const offset=vertex*source.itemSize;
      for(let channel=0;channel<source.itemSize;channel++)bare[offset+channel]=source.getComponent(vertex,channel);
      worn[offset]=bare[offset]*THREE.MathUtils.lerp(1,fabric.r,coverage);
      worn[offset+1]=bare[offset+1]*THREE.MathUtils.lerp(1,fabric.g,coverage);
      worn[offset+2]=bare[offset+2]*THREE.MathUtils.lerp(1,fabric.b,coverage);
      if(source.itemSize===4)worn[offset+3]=bare[offset+3];
    }
    const attribute=new THREE.BufferAttribute(bare.slice(),source.itemSize);
    mesh.geometry=resources.own(mesh.geometry.clone());
    mesh.geometry.setAttribute('color',attribute);
    layers.push({attribute,bare,worn});
  });
  let equipped=false;
  return (visible:boolean)=>{
    if(visible===equipped)return;
    equipped=visible;
    for(const {attribute,bare,worn} of layers){
      attribute.copyArray(visible?worn:bare);
      attribute.needsUpdate=true;
    }
  };
}

function faceBlink(resources:Resources,face:THREE.Object3D,atlas:THREE.Object3D) {
  const sample=atlas.getObjectByProperty('isMesh',true) as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>|undefined;
  const closed=sample?.material.map;
  const channels:Array<{values:number[];index:number}>=[];
  const materials:Array<{material:THREE.MeshStandardMaterial;open:THREE.Texture;closed:THREE.Texture}>=[];
  face.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const index=object.morphTargetDictionary?.blink;
    if(index!==undefined&&object.morphTargetInfluences)channels.push({values:object.morphTargetInfluences,index});
    if(!closed||!(object.material instanceof THREE.MeshStandardMaterial)||!object.material.map)return;
    const material=resources.own(object.material.clone());
    materials.push({material,open:object.material.map,closed});
    object.material=material;
  });
  atlas.visible=false;
  const kind=materials.length?(channels.length?'atlas+morph':'atlas'):(channels.length?'morph':'none');
  return {kind,apply(amount:number){
    for(const {material,open,closed} of materials)material.map=amount>=.5?closed:open;
    for(const {values,index} of channels)values[index]=amount;
  }} as const;
}

/** Native J01 walk and shared, scene-only retargeting for existing game actions. */
export function createJ01Player(resources:Resources,models:Pick<Models,'templates'|'animations'|'clone'>,player:THREE.Group,drivers:THREE.Object3D[]){
  const clips=models.animations.get(LOCAL_PLAYER.model)??[];
  const walk=clips[0];
  if(!walk||!models.templates.has(LOCAL_PLAYER.model))return null;
  const actor=models.clone(LOCAL_PLAYER.model);
  const root=new THREE.Group();
  root.name='J01 林工';
  root.rotation.y=-Math.PI/2; // Exported +X forward, gameplay +Z forward.
  root.scale.setScalar(1.55); // The same standing height as the existing action and camera rig.
  root.add(actor);
  player.add(root);
  root.updateWorldMatrix(true,true);
  for(const driver of drivers)driver.updateWorldMatrix(true,true);
  const bones=bonesOf(actor);
  const parts=new Map<string,THREE.Object3D[]>();
  actor.traverse(object=>{
    const key=object.userData.j01Part;
    if(typeof key!=='string')return;
    if(!parts.has(key))parts.set(key,[]);
    parts.get(key)!.push(object);
  });
  const face=parts.get('face')?.[0],atlas=parts.get('blink-atlas')?.[0],pelvis=bones.get('Pelvis');
  const chest=bones.get('spine_02');
  if(!face||!atlas||!pelvis||!chest||!parts.has('shirt-indigo')||!parts.has('trousers')){
    root.removeFromParent();
    console.warn('Local J01 player has an incomplete export');
    return null;
  }
  const hipBone=pelvis;
  const walkDuration=Number(actor.userData.j01WalkDuration)||walk.duration;
  const idleTime=Number(actor.userData.j01IdleTime);
  const blink=faceBlink(resources,face,atlas);
  const liveliness=createCharacterLiveliness(actor,{id:'player',frame:player,blink,assistClavicle:!!actor.userData.j01Gait});
  const calibrations=new Map(drivers.map(driver=>{
    const source=bonesOf(driver),hips=source.get('hips')!;
    const hipOrigin=player.worldToLocal(hips.getWorldPosition(new THREE.Vector3()));
    const links=BONE_MAP.flatMap(([to,from,toChild,fromChild])=>{
      const target=bones.get(to),origin=source.get(from);
      if(!target||!origin)return [];
      const end=toChild?bones.get(toChild):null,sourceEnd=fromChild?source.get(fromChild):null;
      const align=new THREE.Quaternion();
      if(end&&sourceEnd){
        const targetAxis=end.getWorldPosition(new THREE.Vector3()).sub(target.getWorldPosition(new THREE.Vector3())).normalize();
        const sourceAxis=sourceEnd.getWorldPosition(new THREE.Vector3()).sub(origin.getWorldPosition(new THREE.Vector3())).normalize();
        align.setFromUnitVectors(targetAxis,sourceAxis);
      }
      const offset=origin.getWorldQuaternion(new THREE.Quaternion()).invert()
        .multiply(align).multiply(target.getWorldQuaternion(new THREE.Quaternion()));
      return [{target,origin,offset}];
    });
    return [driver,{source,hips,hipOrigin,links}] as const;
  }));
  const contactBones=new Map<string,THREE.Bone>();
  for(const side of ['l','r'] as const){
    for(const id of ['upperarm','lowerarm','hand'])contactBones.set(id+side,bones.get(`${id}_${side}`)!);
    const hand=bones.get(`hand_${side}`)!,middle=bones.get(`middle_01_${side}`)!;
    const slot=new THREE.Bone();
    slot.name='J01-hand-contact-'+side;
    slot.position.copy(hand.worldToLocal(middle.getWorldPosition(new THREE.Vector3()))).multiplyScalar(.85);
    hand.add(slot);
    contactBones.set('handslot'+side,slot);
  }
  const playerSize=player.getWorldScale(new THREE.Vector3());
  const facing=player.getWorldQuaternion(new THREE.Quaternion());
  const turnBack=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
  const chestCenter=player.worldToLocal(chest.getWorldPosition(new THREE.Vector3()));
  // The existing rigid props have different proportions from the J01 clothing.
  // Fit their reference frames in the player's bind pose and let the native bones carry them.
  function chestMount(offset:THREE.Vector3,size:THREE.Vector3,rotation=facing){
    return accessoryMount(chest!,player.localToWorld(chestCenter.clone().add(offset)),rotation,size.multiply(playerSize));
  }
  const accessoryMounts={
    pack:chestMount(new THREE.Vector3(0,.07,-.02),new THREE.Vector3(.82,.74,.76)),
    scarf:chestMount(new THREE.Vector3(0,.055,-.013),new THREE.Vector3(.63,.70,.70)),
    setGloves:fitWorkGloves(resources,face),
  };
  const travelPackMount=chestMount(new THREE.Vector3(0,.13,-.024),new THREE.Vector3(.64,.69,.67),facing.clone().multiply(turnBack));
  const pose=[...bones.values()].map(bone=>({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()}));
  type TransitionPose={bone:THREE.Bone;position:THREE.Vector3;rotation:THREE.Quaternion;samplePosition:THREE.Vector3;sampleRotation:THREE.Quaternion};
  let previousKind='',transition:{start:number;seconds:number;root:THREE.Quaternion;sampleRoot:THREE.Quaternion;applied:boolean;joints:TransitionPose[]}|null=null;
  const hipNeutral=player.worldToLocal(pelvis.getWorldPosition(new THREE.Vector3()));
  const mixer=new THREE.AnimationMixer(actor);
  const walking=mixer.clipAction(walk);
  const stride=createJ01Stride(actor,root,player,mixer,clips,bones);
  const actionFeet=createJ01ActionFeet(player,actor,pelvis,bones,actor.userData.j01Gait?.support);
  const p=new THREE.Vector3(),q=new THREE.Quaternion(),inverse=new THREE.Quaternion();
  let nativePose:'idle'|'walk'|'run'|null=null,shirt='shirt-indigo',wearingTop=false,wearingLegs=false,wearingHat=false;
  let gripGap:number|null=null;
  const show=(part:string,visible:boolean)=>parts.get(part)?.forEach(object=>{object.visible=visible;});

  function clothes(inventory:Pick<InventoryState,'instances'>,look:WardrobeLook,inspection:boolean){
    const worn=inventory.instances??[];
    const equipped=(id:string)=>worn.some(item=>item.location.kind==='mounted'&&item.location.hostId==='player'&&item.location.slotId===id);
    const showTop=inspection||equipped('player:top');
    const showLegs=inspection||equipped('player:legs');
    wearingTop=showTop;wearingLegs=showLegs;
    shirt=look.top==='field-shirt'?'shirt-canvas':'shirt-indigo';
    show('shirt-indigo',showTop&&shirt==='shirt-indigo');
    show('shirt-canvas',showTop&&shirt==='shirt-canvas');
    show('trousers',showLegs);
    show('under-top',!showTop);
    show('under-legs',!showLegs);
    const hat=parts.has('beret')&&(look.headwear!=='none'||(!inspection&&equipped('player:head')));
    wearingHat=hat;
    show('beret',hat);show('hair-tucked',hat);show('hair',!hat);
  }

  function hold(source:Map<string,THREE.Bone>,seated:boolean,footing?:ActionFooting){
    const targets=(['l','r'] as const).map(side=>{
      const shoulder=contactBones.get('upperarm'+side)!.getWorldPosition(new THREE.Vector3());
      const elbow=contactBones.get('lowerarm'+side)!.getWorldPosition(new THREE.Vector3());
      const hand=contactBones.get('hand'+side)!.getWorldPosition(new THREE.Vector3());
      const slot=contactBones.get('handslot'+side)!;
      const length=hand.distanceTo(slot.getWorldPosition(new THREE.Vector3()));
      const grip=source.get('handslot'+side)!.getWorldPosition(new THREE.Vector3());
      const direction=source.get('hand'+side)!.getWorldPosition(new THREE.Vector3()).sub(grip).normalize();
      const wrist=grip.clone().addScaledVector(direction,length);
      return {side,shoulder,slot,grip,wrist,reach:shoulder.distanceTo(elbow)+elbow.distanceTo(hand)-.035};
    });
    if(!seated){
      const shift=new THREE.Vector3(),delta=new THREE.Vector3();
      for(let pass=0;pass<2;pass++)for(const {wrist,shoulder,reach} of targets){
        delta.copy(wrist).sub(shoulder).sub(shift);
        const excess=delta.length()-reach;
        if(excess>0)shift.addScaledVector(delta.normalize(),excess);
      }
      shift.clampLength(0,.48);
      if(shift.lengthSq()>1e-8){
        const feet=footing&&actionFeet?[]: (['l','r'] as const).map(side=>{
          const foot=bones.get('foot_'+side)!;
          return {side,foot,at:foot.getWorldPosition(new THREE.Vector3()),rotation:foot.getWorldQuaternion(new THREE.Quaternion())};
        });
        const moved=hipBone.getWorldPosition(p).add(shift);
        hipBone.position.copy(hipBone.parent!.worldToLocal(moved));
        const forward=new THREE.Vector3(0,0,1).applyQuaternion(player.getWorldQuaternion(q));
        for(const {side,foot,at,rotation} of feet){
          poseLimbAt(player,bones.get('thigh_'+side)!,bones.get('calf_'+side)!,foot,at,forward);
          foot.quaternion.copy(foot.parent!.getWorldQuaternion(inverse).invert().multiply(rotation));
        }
      }
    }
    if(footing)actionFeet?.place(footing,source);
    if(footing&&(footing.kind==='crouch'||footing.kind==='ground'||footing.kind==='sweep')){
      const spine=bones.get('spine_01')!;
      const lateral=new THREE.Vector3(1,0,0).applyQuaternion(player.getWorldQuaternion(q));
      const distanceError=()=>Math.max(...targets.map(({side,wrist,reach})=>
        contactBones.get('upperarm'+side)!.getWorldPosition(p).distanceTo(wrist)-reach));
      for(let pass=0;pass<6;pass++){
        const error=distanceError();
        if(error<=.003)break;
        const saved=spine.quaternion.clone();
        const tilt=new THREE.Quaternion().setFromAxisAngle(lateral,Math.min(.10,error*.76));
        spine.getWorldQuaternion(q).premultiply(tilt);
        spine.quaternion.copy(spine.parent!.getWorldQuaternion(inverse).invert().multiply(q));
        if(distanceError()>=error){spine.quaternion.copy(saved);break;}
      }
    }
    for(const {side,slot,grip,wrist} of targets){
      poseHandAt(player,contactBones,side,player.worldToLocal(wrist),player.worldToLocal(grip.clone()));
      gripGap=Math.max(gripGap??0,slot.getWorldPosition(p).distanceTo(grip));
    }
  }

  function present(driver:THREE.Object3D,walkTime:number|null,idle:boolean,time:number,reducedMotion:boolean,
      seated:boolean,pinHands:boolean,handsFree=true,sample?:StrideSample,footing?:ActionFooting,seatAmount=1){
    liveliness.beforeAnimation();
    const native=!!(stride&&sample)||walkTime!==null||idle&&Number.isFinite(idleTime);
    const kind=native?'locomotion':footing?.seat?.rising?'rising':footing?.kind??'action';
    const previousBlend=transition;
    if(kind!==previousKind){
      const immediate=footing?.inspection||sample?.reset;
      transition=previousKind&&!immediate&&!reducedMotion?{
        start:time,seconds:kind==='locomotion'?.32:kind==='cut'?.16:.25,root:root.quaternion.clone(),sampleRoot:new THREE.Quaternion(),applied:false,
        joints:pose.map(({bone})=>({bone,position:bone.position.clone(),rotation:bone.quaternion.clone(),samplePosition:new THREE.Vector3(),sampleRotation:new THREE.Quaternion()})),
      }:null;
      previousKind=kind;
    }
    actionFeet?.restoreFloor();
    if(previousBlend?.applied){
      root.quaternion.copy(previousBlend.sampleRoot);
      for(const {bone,samplePosition,sampleRotation} of previousBlend.joints){
        bone.position.copy(samplePosition);bone.quaternion.copy(sampleRotation);
      }
      previousBlend.applied=false;
    }
    gripGap=null;
    if(stride&&sample){
      stride.present(sample,reducedMotion);
      nativePose=sample.mode;
    }else if(walkTime!==null||(idle&&Number.isFinite(idleTime))){
      stride?.reset();
      if(!nativePose)walking.reset().play();
      nativePose=idle?'idle':'walk';
      walking.time=idle?idleTime:(walkTime??0)%walkDuration;
      mixer.update(0);
    }else{
      stride?.reset();
      if(nativePose){walking.stop();nativePose=null;}
      for(const saved of pose){
        saved.bone.position.copy(saved.position);saved.bone.quaternion.copy(saved.quaternion);saved.bone.scale.copy(saved.scale);
      }
      const {source,hips,hipOrigin,links}=calibrations.get(driver)!;
      const hip=player.worldToLocal(hips.getWorldPosition(p));
      const sit=seated?seatAmount:0;
      hip.addScaledVector(hipNeutral,1-sit).addScaledVector(hipOrigin,sit-1);
      hip.y+=.07*sit;
      hipBone.parent!.worldToLocal(player.localToWorld(hip));
      hipBone.position.copy(hip);
      for(const {target,origin,offset} of links){
        origin.getWorldQuaternion(q).multiply(offset);
        target.quaternion.copy(target.parent!.getWorldQuaternion(inverse).invert().multiply(q));
      }
      if(pinHands)hold(source,seated,footing);
      else if(footing)actionFeet?.place(footing,source);
    }
    if(transition){
      const weight=THREE.MathUtils.smoothstep(time-transition.start,0,transition.seconds);
      if(reducedMotion||weight===1||time<transition.start)transition=null;
      else{
        transition.applied=true;transition.sampleRoot.copy(root.quaternion);
        root.quaternion.slerp(transition.root,1-weight);
        for(const {bone,position,rotation,samplePosition,sampleRotation} of transition.joints){
          samplePosition.copy(bone.position);sampleRotation.copy(bone.quaternion);
          bone.quaternion.slerp(rotation,1-weight);bone.position.lerp(position,1-weight);
        }
        // During acquisition the palms are still travelling to their contacts.
        if(gripGap!==null){
          const source=calibrations.get(driver)!.source;
          gripGap=Math.max(...(['l','r'] as const).map(side=>contactBones.get('handslot'+side)!.getWorldPosition(p)
            .distanceTo(source.get('handslot'+side)!.getWorldPosition(new THREE.Vector3()))));
        }
      }
    }
    const floor=footing?.groundAt??sample?.groundAt;
    if(floor&&(!sample||sample.mode!=='idle'||stride?.inMotion||transition))actionFeet?.clearFloor(floor);
    liveliness.update(time,reducedMotion,idle&&!seated&&!pinHands,handsFree&&!pinHands);
    root.updateWorldMatrix(true,true);
  }
  function resetMotion(){
    liveliness.beforeAnimation();
    actionFeet?.restoreFloor();
    stride?.reset();walking.stop();
    previousKind='';transition=null;nativePose=null;
    root.rotation.set(0,-Math.PI/2,0);
  }
  return {root,clothes,present,resetMotion,accessoryMounts,travelPackMount,handContact:(side:'l'|'r',at:THREE.Vector3)=>contactBones.get('handslot'+side)!.getWorldPosition(at),walkSpeed:stride?.walkSpeed,runSpeed:stride?.runSpeed,stats:()=>({nativeWalk:nativePose==='walk',nativePose,stride:stride?.stats()??null,shirt,wearingTop,wearingLegs,wearingHat,gripGap,liveliness:liveliness.stats()}),dispose(){
    liveliness.dispose();
    mixer.stopAllAction();mixer.uncacheRoot(actor);root.removeFromParent();
  }};
}
