import {scrapGeometry,scrapMaterial} from './scrap-geometry.ts';
import {travelAccess} from '../world/regions.ts';
import {travelHeightAt} from '../world/traversal.ts';
import * as THREE from 'three';
import {ramp} from './actions/motion.js';
import {canStand} from '../domain/navigation.ts';
import {makeColliders} from '../world/layout.ts';
import {createActor} from './actions/actor.js';
import { CHARACTER, CAMP_VISITOR } from '../content/characters.ts';
import {merchantVisitAt,MERCHANT_SCENE} from '../content/merchant.ts';
import {TENT,MOVEMENT} from '../content/world.ts';
import {diningReadingSpot} from '../domain/housing.ts';
import {applySeatedLegPose,SEATED_SKIN_CLEARANCE} from './seated-pose.ts';
import type {SeatContact} from './seated-pose.ts';
import {calendarAt} from '../domain/local-clock.ts';
import { FORESTRY } from '../content/forestry.ts';
import type { GameState } from '../domain/state.ts';
import type { CabinPlayer } from '../domain/cabin.ts';
import type { Tree } from '../world/layout.ts';
import { heightAt } from '../world/surface.ts';
import type { Models } from './models.ts';
import type { Resources } from './resources.ts';
import { syncTwoHandedAxe } from './character-grip.ts';
import { createCharacterWardrobe } from './character-wardrobe.ts';
import { DEFAULT_WARDROBE, resolveWardrobe, wardrobeForMountedItems } from '../content/wardrobe-preview.ts';
import type { WardrobeLook } from '../content/wardrobe-preview.ts';
import { createWardrobeVisual } from './wardrobe-visual.ts';
import { createJ01Player } from './j01-player.ts';
import {createCharacterLiveliness} from './character-liveliness.ts';
import {isCarried} from '../domain/transport-location.ts';
import { createFootContactAnchors } from './lighting/foot-contact-anchors.ts';
import { axeHeadSamples, geometryContactTarget, contactClearance, findAxeStop, stoppedStrokeFraction } from './axe-contact.ts';
import type { AxeTarget, AxeStop } from './axe-contact.ts';

export type CharacterInspection = 'horizontal'|'vertical'|'wardrobe'|null;
type Mode='idle'|'walk'|'run'|'gather'|'horizontal'|'vertical';
export type CharacterImpact={treeId:string;point:THREE.Vector3};

/** One scene adapter; samples the app's game time and never schedules frames or settles actions. */
export function createCharacters(r:Resources,models:Models,trees:Tree[],selections:Map<string,THREE.Object3D>){
  const blockers=makeColliders(trees);
  const player=new THREE.Group(),visitor=new THREE.Group();player.name='player';visitor.name=CAMP_VISITOR.id;
  player.scale.setScalar(CHARACTER.worldScale);visitor.scale.setScalar(CHARACTER.worldScale);
  visitor.position.set(CAMP_VISITOR.x,heightAt(CAMP_VISITOR.x,CAMP_VISITOR.z),CAMP_VISITOR.z);visitor.rotation.y=.5;
  const body=models.clone('ranger'),npc=models.clone('visitor'),tool=models.clone('axe');
  tool.name='forestry-hand-axe';tool.visible=false;player.add(body,tool);visitor.add(npc);
  const walkingFeet=createFootContactAnchors(body,{idPrefix:'player'});
  const visitorFeet=createFootContactAnchors(npc,{idPrefix:CAMP_VISITOR.id});
  const clips=new Map((models.animations.get('motions')??[]).map(c=>[c.name,c]));
  const need=(name:string)=>{const clip=clips.get(name);if(!clip)throw new Error(`Missing character animation: ${name}`);return clip;};
  const mixer=new THREE.AnimationMixer(body),npcMixer=new THREE.AnimationMixer(npc);
  const sourceClips={idle:need('Idle_A'),walk:need('Walking_A'),run:need('Running_A'),gather:need('PickUp'),horizontal:need('Melee_2H_Attack_Slice'),vertical:need('Melee_2H_Attack_Chop')};
  const actions=Object.fromEntries(Object.entries(sourceClips).map(([key,c])=>[key,mixer.clipAction(c)])) as Record<Mode,THREE.AnimationAction>;
  let mode:Mode='idle',disposed=false,inspection:CharacterInspection=null,cutKey='',stop:AxeStop|null=null;
  let reviewSeconds:number|null=null;
  let lastContact=Infinity,planMs=0,grip:ReturnType<typeof syncTwoHandedAxe>|null=null,impact:CharacterImpact|null=null;
  npcMixer.clipAction(sourceClips.idle).play();npcMixer.setTime(.01);
  const basePose:{bone:THREE.Bone;p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}[]=[];
  npc.traverse(o=>{if(o instanceof THREE.Bone)basePose.push({bone:o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()});});
  npcMixer.stopAllAction();for(const {bone,p,q,s} of basePose){bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);}
  const waving=need('Waving');
  const partial=new THREE.AnimationClip('Visitor_ArmsAndHead',waving.duration,waving.tracks.filter(t=>/^(upperarm|lowerarm|wrist|hand|head)/.test(t.name)).map(t=>t.clone()));
  const wave=npcMixer.clipAction(partial);wave.play();
  const npcWalk=npcMixer.clipAction(sourceClips.walk);npcWalk.play();
  const procedural=createActor(models.templates.get('ranger')!,models.animations.get('motions')!);procedural.root.scale.setScalar(1);player.add(procedural.root);procedural.root.visible=false;
  const localPlayer=createJ01Player(r,models,player,[body,procedural.body]);
  const playerLiveliness=createCharacterLiveliness(body,{id:'player',frame:player});
  const visitorLiveliness=createCharacterLiveliness(npc,{id:CAMP_VISITOR.id,frame:visitor});
  const localFeet=localPlayer&&createFootContactAnchors(localPlayer.root,{idPrefix:'player',toePrefix:'ball'});
  actions.idle.play();mixer.update(0);
  const actionFeet=createFootContactAnchors(procedural.body,{idPrefix:'player:action'});
  const standardClothes=createCharacterWardrobe(r,body,localPlayer?.travelPackMount);
  const actionClothes=createCharacterWardrobe(r,procedural.body);
  const clothing=createWardrobeVisual(r,body,localPlayer?.accessoryMounts);
  const actionClothing=createWardrobeVisual(r,procedural.body);
  let previewLook:WardrobeLook={...DEFAULT_WARDROBE},lastLookKey='';
  function updateWardrobe(state:GameState,reducedMotion:boolean,moving:boolean){
    const next=wardrobeForMountedItems(previewLook,state.inventory.instances??[]);
    const key=JSON.stringify(next);
    if(key!==lastLookKey){standardClothes.apply(next);actionClothes.apply(next);lastLookKey=key;}
    clothing.update(state.inventory,localPlayer!==null&&next.back==='pack');
    actionClothing.update(state.inventory);
    localPlayer?.clothes(state.inventory,next,inspection==='wardrobe');
    standardClothes.update(state.time,moving,reducedMotion);
    actionClothes.update(state.time,moving,reducedMotion);
  }
  const seatBones=new Map<string,THREE.Bone>();body.traverse(o=>{if(o instanceof THREE.Bone)seatBones.set(o.name.replaceAll('.',''),o);});
  const readingPoseBase=new Map<THREE.Bone,{p:THREE.Vector3;q:THREE.Quaternion}>();
  const bodyY=body.position.y;
  let reading=false,playerHandsBusy=false,playerTalking=false;
  let lastMoveSample:{x:number;z:number;time:number}|null=null;
  let movementTime=0,locomotionSpeed=0;
  let localWalkTime:number|null=null;
  let readingSeat:SeatContact|null=null;
  const pickedScrap=new THREE.Mesh(r.geometry('held-split-scrap',scrapGeometry),scrapMaterial(r));pickedScrap.scale.setScalar(.68);pickedScrap.rotation.z=Math.PI/2;pickedScrap.visible=false;player.add(pickedScrap);
  const blade=axeHeadSamples(tool),byId=new Map(trees.map(t=>[t.id,t]));
  // Inspector-only solids demonstrate both constraints without inventing a crafting transaction.
  const inspectionProps=new THREE.Group();inspectionProps.name='character-inspection-solids';inspectionProps.visible=false;player.add(inspectionProps);
  const trunk=new THREE.Mesh(r.geometry('character-inspect-trunk',()=>new THREE.CylinderGeometry(.17,.17,.78,12)),r.material('#92745a',.9));
  trunk.position.set(0,.39,.87);trunk.castShadow=true;inspectionProps.add(trunk);
  const stump=new THREE.Mesh(r.geometry('character-inspect-support',()=>new THREE.CylinderGeometry(.29,.29,.35,12)),r.material('#b38c5d',.85));
  stump.position.set(0,.175,.85);stump.castShadow=true;inspectionProps.add(stump);
  const block=new THREE.Mesh(r.geometry('character-inspect-block',()=>new THREE.CylinderGeometry(.14,.16,.37,10)),r.material('#c8a774',.9));
  block.position.set(0,.54,.85);block.castShadow=true;inspectionProps.add(block);
  function setMode(next:Mode){
    if(mode===next)return;
    mixer.stopAllAction();mode=next;actions[mode].reset().play();
  }
  let cutHeight:number|null=null;const chest=body.getObjectByName('chest')!,chestY=chest.position.y;
  function sample(fraction:number){
    chest.position.y=chestY;
    actions[mode].time=sourceClips[mode].duration*fraction;mixer.update(0);
    grip=syncTwoHandedAxe(player,body,tool);
    if(cutHeight!==null){
      const center=new THREE.Box3().setFromObject(blade.head).getCenter(new THREE.Vector3());
      chest.position.y+=(cutHeight-center.y)/CHARACTER.worldScale;
      grip=syncTwoHandedAxe(player,body,tool);
    }
  }
  function cut(kind:'horizontal'|'vertical',target:AxeTarget,phase:number,key:string,reducedMotion:boolean){
    setMode(kind);tool.visible=true;
    const start=kind==='horizontal'?CHARACTER.horizontalWindup:CHARACTER.verticalWindup;
    if(cutKey!==key||!stop){
      const before=performance.now();stop=findAxeStop(sample,blade,target,start,CHARACTER.strokeEnd);planMs=performance.now()-before;cutKey=key;
    }
    const desired=stoppedStrokeFraction(reducedMotion?CHARACTER.strikePhase:phase,start,stop.fraction);
    sample(desired);let actual=contactClearance(blade,target);
    // Small trunk recoil can change the solid after the original plan: tighten the whole pose.
    if(actual.clearance< -1e-7){
      const tightened=findAxeStop(sample,blade,target,start,desired);
      if(tightened.found){stop=tightened;sample(tightened.fraction);actual=contactClearance(blade,target);}
    }
    lastContact=actual.clearance;
  }
  function sampleLocomotion(pose:CabinPlayer,ambientTime:number){
    const distance=lastMoveSample?Math.hypot(pose.x-lastMoveSample.x,pose.z-lastMoveSample.z):0;
    const sampleSeconds=lastMoveSample?Math.max(0,ambientTime-lastMoveSample.time):0;
    const moveSpeed=sampleSeconds>0&&pose.moving?Math.min(MOVEMENT.speed*MOVEMENT.runMultiplier,distance/sampleSeconds):0;
    lastMoveSample={x:pose.x,z:pose.z,time:ambientTime};
    locomotionSpeed=pose.moving?THREE.MathUtils.lerp(locomotionSpeed,moveSpeed,Math.min(1,sampleSeconds*14)):0;
    const running=locomotionSpeed>MOVEMENT.speed*1.12;
    movementTime+=distance*(running?1.15/(MOVEMENT.speed*MOVEMENT.runMultiplier):1.6/MOVEMENT.speed);
    return running;
  }
  function updatePlayerBase(state:GameState,pose:CabinPlayer,height:number,reducedMotion:boolean){
    playerLiveliness.beforeAnimation();
    localWalkTime=null;
    for(const [bone,base] of readingPoseBase){bone.position.copy(base.p);bone.quaternion.copy(base.q);}readingPoseBase.clear();
    player.position.set(pose.x,height,pose.z);player.rotation.y=pose.facing;
    body.position.y=bodyY;
    updateWardrobe(state,reducedMotion,pose.moving);
    playerHandsBusy=state.inventory.stacks.some(stack=>stack.quantity>0&&isCarried(stack));
    playerTalking=state.npcs?.['ridge-neighbour']?.visit.active?.phase==='talking';
    impact=null;body.visible=true;pickedScrap.visible=false;cutHeight=null;chest.position.y=chestY;procedural.root.visible=false;
  }
  function update(state:GameState,reducedMotion=false,ambientTime=state.time){
    if(disposed)return;
    const running=sampleLocomotion(state.player,ambientTime);
    updatePlayerBase(state,state.player,travelHeightAt(state.player.x,state.player.z,travelAccess(state)),reducedMotion);
    const visit=merchantVisitAt(state.time);
    visitor.visible=visit.active;
    if(visit.active){const eased=visit.travel*visit.travel*(3-2*visit.travel);
      const vx=CAMP_VISITOR.x+MERCHANT_SCENE.entryOffset.x*(1-eased),vz=CAMP_VISITOR.z+MERCHANT_SCENE.entryOffset.z*(1-eased);
      visitor.position.set(vx,heightAt(vx,vz),vz);
    }
    inspectionProps.visible=inspection!==null&&inspection!=='wardrobe';
    if(inspection==='wardrobe'){
      cutKey='';stop=null;grip=null;lastContact=Infinity;tool.visible=false;
      setMode('idle');actions.idle.time=0;mixer.update(0);
    }else if(inspection){
      trunk.visible=inspection==='horizontal';stump.visible=block.visible=inspection==='vertical';player.updateMatrixWorld(true);
      let target:AxeTarget;
      if(inspection==='horizontal')target=geometryContactTarget(trunk.geometry,trunk.matrixWorld);
      else{
        const top=stump.localToWorld(new THREE.Vector3(0,.175,0));
        target={kind:'support',x:top.x,z:top.z,y:top.y,radius:.29*CHARACTER.worldScale};
      }
      cut(inspection,target,CHARACTER.strikePhase,'inspection-'+inspection,reducedMotion);
    }else if(state.forestry.active?.phase==='chopping'){
      const a=state.forestry.active,tree=byId.get(a.treeId)!,root=selections.get(a.treeId)!;
      const dx=state.player.x-tree.x,dz=state.player.z-tree.z,len=Math.hypot(dx,dz)||1,radius=(tree.kind==='pine'?.25:.28)*tree.scale;
      player.position.set(tree.x+dx/len*(radius+1),travelHeightAt(state.player.x,state.player.z,travelAccess(state)),tree.z+dz/len*(radius+1));
      cutHeight=heightAt(tree.x,tree.z)+.88*tree.scale;
      const cycle=FORESTRY.chopSeconds/FORESTRY.hits,phase=((state.time-a.startedAt)/cycle)%1;
      cut('horizontal',models.trunkContact(tree,root),phase,a.id,reducedMotion);
      if(stop?.found&&stop.point)impact={treeId:tree.id,point:stop.point.clone()};
    }else{
      cutKey='';stop=null;lastContact=Infinity;grip=null;tool.visible=false;
      const gather=state.gathering.action;
      const secondsFromDawn=state.dayCycle.wokeAt===null?Infinity:state.time-state.dayCycle.wokeAt;
      const emerging=!reading&&!state.player.moving&&!reducedMotion&&secondsFromDawn>=0&&secondsFromDawn<2.25;
      const next:Mode=gather?.phase==='performing'?'gather':(state.player.moving||emerging)&&!reducedMotion?(running?'run':'walk'):'idle';setMode(next);
      const clip=sourceClips[mode];
      const animationTime=mode==='walk'||mode==='run'?emerging?ambientTime*1.6:movementTime:ambientTime;
      if(mode==='walk')localWalkTime=animationTime;
      actions[mode].time=mode==='gather'?Math.min(.999,gather!.progress)*clip.duration:reducedMotion||mode==='idle'?.01:animationTime%clip.duration;
      mixer.update(0);
      // Render-only doorway emergence after sleep. Gameplay position is already at the tent exit.
      if(emerging){
        const t=THREE.MathUtils.smoothstep(secondsFromDawn,0,2.25);
        const fromX=TENT.x+2.1,fromZ=TENT.z+3.3;
        const wx=THREE.MathUtils.lerp(fromX,state.player.x,t),wz=THREE.MathUtils.lerp(fromZ,state.player.z,t);
        player.position.set(wx,heightAt(wx,wz),wz);
        player.rotation.y=Math.atan2(state.player.x-fromX,state.player.z-fromZ);
      }
      // A local, render-only sitting pose; the world player remains at the camp interaction point.
      if(reading){
        for(const bone of seatBones.values())readingPoseBase.set(bone,{p:bone.position.clone(),q:bone.quaternion.clone()});
        const seat=readingSeat??diningReadingSpot().seat;
        const surfaceY=seat.surfaceY??heightAt(seat.x,seat.z)+(seat.height??0);
        player.position.set(seat.x,surfaceY+SEATED_SKIN_CLEARANCE,seat.z);
        player.rotation.y=seat.facing;body.position.y=bodyY-.19;
        const turn=(id:string,axis:'x'|'y'|'z',angle:number)=>{const bone=seatBones.get(id);if(bone)bone.rotation[axis]+=angle;};
        const hips=seatBones.get('hips');if(hips)hips.position.y-=.12;
        for(const side of ['l','r']){
          turn('upperarm'+side,'x',-.42);turn('lowerarm'+side,'x',-.39);
        }
        applySeatedLegPose(player,seatBones);
        turn('head','x',.10);
      }
      if(state.workshop.job?.phase==='working'){
        const job=state.workshop.job;procedural.update(job.kind==='offering'?'pray':'pickup',job.kind==='offering'?(state.time-job.startedAt!)*2:1.35);procedural.root.position.set(0,0,0);procedural.root.rotation.set(0,0,0);body.visible=false;procedural.root.visible=true;
      }else if(state.ritual?.phase==='performing'){
        procedural.update('pray',state.time-state.ritual.startedAt!);procedural.root.position.set(0,0,0);procedural.root.rotation.set(0,0,0);body.visible=false;procedural.root.visible=true;
      }
      if(gather?.phase==='performing'){
        const action=gather.motionTag==='gather.climb'?'climb':gather.motionTag==='gather.pluck'?'gather':'pickup';
        const t=gather.progress*gather.durationSeconds;
        const approach=ramp(t,0,.65)*(1-ramp(t,gather.durationSeconds-.65,gather.durationSeconds));
        if(action!=='climb'){
          const targetX=gather.targetAnchor.x-Math.sin(player.rotation.y)*1.05,targetZ=gather.targetAnchor.z-Math.cos(player.rotation.y)*1.05;
          const px=THREE.MathUtils.lerp(state.player.x,targetX,approach),pz=THREE.MathUtils.lerp(state.player.z,targetZ,approach);
          if(canStand({x:px,z:pz},blockers,undefined,travelAccess(state)))player.position.set(px,travelHeightAt(px,pz,travelAccess(state)),pz);
        }
        procedural.update(action,t,{radius:.3});const lift=procedural.root.position.y;
        procedural.root.position.set(0,lift/CHARACTER.worldScale,0);procedural.root.rotation.set(0,0,0);
        if(action==='pickup'&&t>=1.15&&t<2.85){player.updateMatrixWorld(true);pickedScrap.position.copy(player.worldToLocal(procedural.bones.handslotr.getWorldPosition(new THREE.Vector3())));pickedScrap.visible=true;}
        body.visible=false;procedural.root.visible=true;
        if(action==='climb'){
          const hostId=gather.sourceId.replace(/^gather\./,'').replace(/\.branches$/,'');const tree=byId.get(hostId);
          if(tree){const radius=(tree.role==='landmark'?1.2:tree.kind==='pine'?.25:.28)*tree.scale,dx=state.player.x-tree.x,dz=state.player.z-tree.z,len=Math.hypot(dx,dz)||1;
            const px=THREE.MathUtils.lerp(state.player.x,tree.x+dx/len*(radius+.48),approach),pz=THREE.MathUtils.lerp(state.player.z,tree.z+dz/len*(radius+.48),approach);player.position.set(px,travelHeightAt(px,pz,travelAccess(state)),pz);player.rotation.y=Math.atan2(-dx,-dz);
          }
        }
      }
    }
    if(state.forestry.active?.phase==='falling'){
      const a=state.forestry.active,dir=state.forestry.slots[a.treeId].fallDirection,step=.7*ramp(state.time-a.committedAt!,0,.75);
      const x=state.player.x-dir.x*step,z=state.player.z-dir.z*step;
      if(canStand({x,z},blockers,undefined,travelAccess(state)))player.position.set(x,travelHeightAt(x,z,travelAccess(state)),z);
    }
    const near=visit.parked&&Math.hypot(state.player.x-CAMP_VISITOR.x,state.player.z-CAMP_VISITOR.z)<CAMP_VISITOR.waveRange;
    const localTime=ambientTime%CAMP_VISITOR.waveInterval;
    const waving=near&&!reducedMotion&&localTime<partial.duration;
    visitorLiveliness.beforeAnimation();
    wave.enabled=true;wave.setEffectiveWeight(waving?1:0);wave.time=Math.min(localTime,partial.duration*.999);
    npcWalk.setEffectiveWeight(visit.active&&!visit.parked&&!reducedMotion?1:0);npcWalk.time=state.time%sourceClips.walk.duration;
    npcMixer.update(0);
    visitorLiveliness.update(ambientTime,reducedMotion,visit.active&&visit.parked&&!waving,!waving&&state.selected!==CAMP_VISITOR.id);
  }
  function presentAt(ambientTime:number,reducedMotion:boolean,holding:boolean){
    const action=procedural.root.visible;
    const special=action||reading||holding||tool.visible;
    const idle=!special&&mode==='idle';
    if(!localPlayer){playerLiveliness.update(ambientTime,reducedMotion,idle,!playerHandsBusy&&!playerTalking);return;}
    localPlayer.present(action?procedural.body:body,special?null:localWalkTime,idle,
      ambientTime,reducedMotion,reading,special,!playerHandsBusy&&!playerTalking);
    body.visible=false;procedural.root.visible=false;
  }
  function present(ambientTime:number,reducedMotion:boolean,holding:boolean){
    if(reviewSeconds!==null){
      // A paused inspection samples the same adapter from its idle origin;
      // this does not advance either the game clock or the scene clock.
      presentAt(0,reducedMotion,holding);
      presentAt(reviewSeconds,reducedMotion,holding);
    }else presentAt(ambientTime,reducedMotion,holding);
  }
  return {
    player,visitor,update,present,
    sampleIdle(seconds:number){
      if(disposed||inspection!=='wardrobe'||!Number.isFinite(seconds)||seconds<0||seconds>60)
        throw Error('Character sample requires wardrobe inspection and 0..60 seconds');
      reviewSeconds=seconds;
    },
    resetLocomotion(){lastMoveSample=null;movementTime=0;locomotionSpeed=0;},
    updateInCabin(state:GameState,pose:CabinPlayer,height:number,reducedMotion:boolean,ambientTime:number){
      const running=sampleLocomotion(pose,ambientTime);
      updatePlayerBase(state,pose,height,reducedMotion);
      inspectionProps.visible=false;tool.visible=false;
      setMode(pose.moving&&!reducedMotion?(running?'run':'walk'):'idle');
      const time=mode==='idle'?ambientTime:movementTime;
      actions[mode].time=reducedMotion||mode==='idle'?.01:time%sourceClips[mode].duration;
      mixer.update(0);
      if(mode==='walk')localWalkTime=time;
      present(ambientTime,reducedMotion,false);
    },
    setReading(value:boolean,seat?:SeatContact){reading=value;readingSeat=value&&seat?seat:null;},
    setInspection(value:CharacterInspection){inspection=value;reviewSeconds=null;cutKey='';stop=null;},
    setWardrobe(value:Partial<WardrobeLook>){previewLook=resolveWardrobe(value,previewLook);lastLookKey='';},
    getInspection:()=>inspection,
    getImpact:()=>impact,
    // Read after life/broom/housing finish posing; alternate rigs never cast duplicate contacts.
    footContacts:()=>[
      ...(player.visible?(localFeet?localFeet.update():procedural.root.visible?actionFeet.update():body.visible?walkingFeet.update():[]):[]),
      ...(visitor.visible?visitorFeet.update():[]),
    ],
    stats:()=>({model:localPlayer?'J01 林工':'KayKit R3',mode,inspection,reviewSeconds,localPlayer:localPlayer?.stats()??null,liveliness:{player:localPlayer?.stats().liveliness??playerLiveliness.stats(),visitor:visitorLiveliness.stats()},footAnchors:{walking:walkingFeet.stats(),action:actionFeet.stats(),visitor:visitorFeet.stats(),local:localFeet?.stats()??null},wardrobe:{standard:standardClothes.stats(),action:actionClothes.stats()},stopFound:stop?.found??null,stopFraction:stop?.fraction??null,contactClearance:Number.isFinite(lastContact)?lastContact:null,grip,planMs,disposed}),
    dispose(){
      if(disposed)return;disposed=true;
      playerLiveliness.dispose();visitorLiveliness.dispose();
      for(const m of [mixer,npcMixer]){m.stopAllAction();m.uncacheRoot(m.getRoot());}
      standardClothes.dispose();actionClothes.dispose();
      clothing.dispose();actionClothing.dispose();
      procedural.dispose();
      localPlayer?.dispose();
      player.removeFromParent();visitor.removeFromParent();player.clear();visitor.clear();byId.clear();
      // Shared geometry, textures/materials and each cloned skeleton belong to Resources.
    },
  };
}
