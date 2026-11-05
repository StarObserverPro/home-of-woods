import * as THREE from 'three';
import {ramp} from './actions/motion.js';
import {canStand} from '../domain/navigation.ts';
import {makeColliders} from '../world/layout.ts';
import {createActor} from './actions/actor.js';
import { CHARACTER, CAMP_VISITOR } from '../content/characters.ts';
import {TENT} from '../content/world.ts';
import {DINING_SEAT} from '../content/scene-props.ts';
import {calendarAt} from '../domain/local-clock.ts';
import { FORESTRY } from '../content/forestry.ts';
import type { GameState } from '../domain/state.ts';
import type { Tree } from '../world/layout.ts';
import { heightAt } from '../world/surface.ts';
import type { Models } from './models.ts';
import type { Resources } from './resources.ts';
import { syncTwoHandedAxe } from './character-grip.ts';
import { axeHeadSamples, geometryContactTarget, contactClearance, findAxeStop, stoppedStrokeFraction } from './axe-contact.ts';
import type { AxeTarget, AxeStop } from './axe-contact.ts';

export type CharacterInspection = 'horizontal'|'vertical'|null;
type Mode='idle'|'walk'|'gather'|'horizontal'|'vertical';
export type CharacterImpact={treeId:string;point:THREE.Vector3};

/** One scene adapter; samples the app's game time and never schedules frames or settles actions. */
export function createCharacters(r:Resources,models:Models,trees:Tree[],selections:Map<string,THREE.Object3D>){
  const blockers=makeColliders(trees);
  const player=new THREE.Group(),visitor=new THREE.Group();player.name='player';visitor.name=CAMP_VISITOR.id;
  player.scale.setScalar(CHARACTER.worldScale);visitor.scale.setScalar(CHARACTER.worldScale);
  visitor.position.set(CAMP_VISITOR.x,heightAt(CAMP_VISITOR.x,CAMP_VISITOR.z),CAMP_VISITOR.z);visitor.rotation.y=.5;
  const body=models.clone('ranger'),npc=models.clone('visitor'),tool=models.clone('axe');
  tool.name='forestry-hand-axe';tool.visible=false;player.add(body,tool);visitor.add(npc);
  const clips=new Map((models.animations.get('motions')??[]).map(c=>[c.name,c]));
  const need=(name:string)=>{const clip=clips.get(name);if(!clip)throw new Error(`Missing character animation: ${name}`);return clip;};
  const mixer=new THREE.AnimationMixer(body),npcMixer=new THREE.AnimationMixer(npc);
  const sourceClips={idle:need('Idle_A'),walk:need('Walking_A'),gather:need('PickUp'),horizontal:need('Melee_2H_Attack_Slice'),vertical:need('Melee_2H_Attack_Chop')};
  const actions=Object.fromEntries(Object.entries(sourceClips).map(([key,c])=>[key,mixer.clipAction(c)])) as Record<Mode,THREE.AnimationAction>;
  let mode:Mode='idle',disposed=false,inspection:CharacterInspection=null,cutKey='',stop:AxeStop|null=null;
  let lastContact=Infinity,planMs=0,grip:ReturnType<typeof syncTwoHandedAxe>|null=null,impact:CharacterImpact|null=null;
  actions.idle.play();mixer.update(0);
  npcMixer.clipAction(sourceClips.idle).play();npcMixer.setTime(.01);
  const basePose:{bone:THREE.Bone;p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}[]=[];
  npc.traverse(o=>{if(o instanceof THREE.Bone)basePose.push({bone:o,p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()});});
  npcMixer.stopAllAction();for(const {bone,p,q,s} of basePose){bone.position.copy(p);bone.quaternion.copy(q);bone.scale.copy(s);}
  const waving=need('Waving');
  const partial=new THREE.AnimationClip('Visitor_ArmsAndHead',waving.duration,waving.tracks.filter(t=>/^(upperarm|lowerarm|wrist|hand|head)/.test(t.name)).map(t=>t.clone()));
  const wave=npcMixer.clipAction(partial);wave.play();
  const procedural=createActor(models.templates.get('ranger')!,models.animations.get('motions')!);procedural.root.scale.setScalar(1);player.add(procedural.root);procedural.root.visible=false;
  const readingBowl=new THREE.Group();readingBowl.name='reading-bowl';readingBowl.visible=false;player.add(readingBowl);
  const bowlBody=new THREE.Mesh(r.geometry('reading-wooden-bowl',()=>new THREE.CylinderGeometry(.23,.16,.16,9)),r.material('#bc8b53',.9));readingBowl.add(bowlBody);
  const bowlRim=new THREE.Mesh(r.geometry('reading-bowl-rim',()=>new THREE.TorusGeometry(.23,.035,4,9)),r.material('#ead0a0',.92));bowlRim.rotation.x=Math.PI/2;bowlRim.position.y=.09;readingBowl.add(bowlRim);
  readingBowl.position.set(0,.89,.42);
  const seatBones=new Map<string,THREE.Bone>();body.traverse(o=>{if(o instanceof THREE.Bone)seatBones.set(o.name.replaceAll('.',''),o);});
  const bodyY=body.position.y;
  let reading=false;
  const pickedScrap=new THREE.Mesh(r.geometry('held-scrap',()=>new THREE.CylinderGeometry(.025,.04,.38,5)),r.material('#92704a',.9));pickedScrap.rotation.z=Math.PI/2;pickedScrap.visible=false;player.add(pickedScrap);
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
  function update(state:GameState,reducedMotion=false,ambientTime=state.time){
    if(disposed)return;
    player.position.set(state.player.x,heightAt(state.player.x,state.player.z),state.player.z);player.rotation.y=state.player.facing;
    inspectionProps.visible=inspection!==null;impact=null;body.visible=true;pickedScrap.visible=false;readingBowl.visible=false;body.position.y=bodyY;cutHeight=null;chest.position.y=chestY;procedural.root.visible=false;
    if(inspection){
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
      player.position.set(tree.x+dx/len*(radius+1),heightAt(state.player.x,state.player.z),tree.z+dz/len*(radius+1));
      cutHeight=heightAt(tree.x,tree.z)+.88*tree.scale;
      const cycle=FORESTRY.chopSeconds/FORESTRY.hits,phase=((state.time-a.startedAt)/cycle)%1;
      cut('horizontal',models.trunkContact(tree,root),phase,a.id,reducedMotion);
      if(stop?.found&&stop.point)impact={treeId:tree.id,point:stop.point.clone()};
    }else{
      cutKey='';stop=null;lastContact=Infinity;grip=null;tool.visible=false;
      const gather=state.gathering.action;
      const secondsFromDawn=state.dayCycle.wokeAt===null?Infinity:state.time-state.dayCycle.wokeAt;
      const emerging=!reading&&!state.player.moving&&!reducedMotion&&secondsFromDawn>=0&&secondsFromDawn<2.25;
      const next:Mode=gather?.phase==='performing'?'gather':(state.player.moving||emerging)&&!reducedMotion?'walk':'idle';setMode(next);
      const clip=sourceClips[mode];
      actions[mode].time=mode==='gather'?Math.min(.999,gather!.progress)*clip.duration:reducedMotion?.01:(ambientTime*(mode==='walk'?1.6:1))%clip.duration;
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
        player.position.set(DINING_SEAT.x,heightAt(DINING_SEAT.x,DINING_SEAT.z),DINING_SEAT.z);
        player.rotation.y=2.85;body.position.y=bodyY-.19;
        const turn=(id:string,axis:'x'|'y'|'z',angle:number)=>{const bone=seatBones.get(id);if(bone)bone.rotation[axis]+=angle;};
        const hips=seatBones.get('hips');if(hips)hips.position.y-=.12;
        for(const side of ['l','r']){
          turn('upperleg'+side,'x',-1.03);turn('lowerleg'+side,'x',1.29);
          turn('upperarm'+side,'x',-.42);turn('lowerarm'+side,'x',-.39);
        }
        turn('head','x',.10);
        readingBowl.visible=state.food.lastMealDay===calendarAt(state.time).day;
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
          if(canStand({x:px,z:pz},blockers))player.position.set(px,heightAt(px,pz),pz);
        }
        procedural.update(action,t,{radius:.3});const lift=procedural.root.position.y;
        procedural.root.position.set(0,lift/CHARACTER.worldScale,0);procedural.root.rotation.set(0,0,0);
        if(action==='pickup'&&t>=1.15&&t<2.85){player.updateMatrixWorld(true);pickedScrap.position.copy(player.worldToLocal(procedural.bones.handslotr.getWorldPosition(new THREE.Vector3())));pickedScrap.visible=true;}
        body.visible=false;procedural.root.visible=true;
        if(action==='climb'){
          const hostId=gather.sourceId.replace(/^gather\./,'').replace(/\.branches$/,'');const tree=byId.get(hostId);
          if(tree){const radius=(tree.role==='landmark'?1.2:tree.kind==='pine'?.25:.28)*tree.scale,dx=state.player.x-tree.x,dz=state.player.z-tree.z,len=Math.hypot(dx,dz)||1;
            const px=THREE.MathUtils.lerp(state.player.x,tree.x+dx/len*(radius+.48),approach),pz=THREE.MathUtils.lerp(state.player.z,tree.z+dz/len*(radius+.48),approach);player.position.set(px,heightAt(px,pz),pz);player.rotation.y=Math.atan2(-dx,-dz);
          }
        }
      }
    }
    if(state.forestry.active?.phase==='falling'){
      const a=state.forestry.active,dir=state.forestry.slots[a.treeId].fallDirection,step=.7*ramp(state.time-a.committedAt!,0,.75);
      const x=state.player.x-dir.x*step,z=state.player.z-dir.z*step;
      if(canStand({x,z},blockers))player.position.set(x,heightAt(x,z),z);
    }
    const near=Math.hypot(state.player.x-CAMP_VISITOR.x,state.player.z-CAMP_VISITOR.z)<CAMP_VISITOR.waveRange;
    const localTime=ambientTime%CAMP_VISITOR.waveInterval;
    wave.enabled=true;wave.setEffectiveWeight(near&&!reducedMotion&&localTime<partial.duration?1:0);wave.time=Math.min(localTime,partial.duration*.999);npcMixer.update(0);
  }
  return {
    player,visitor,update,
    setReading(value:boolean){reading=value;},
    setInspection(value:CharacterInspection){inspection=value;cutKey='';stop=null;},
    getInspection:()=>inspection,
    getImpact:()=>impact,
    stats:()=>({model:'KayKit R3',mode,inspection,stopFound:stop?.found??null,stopFraction:stop?.fraction??null,contactClearance:Number.isFinite(lastContact)?lastContact:null,grip,planMs,disposed}),
    dispose(){
      if(disposed)return;disposed=true;
      for(const m of [mixer,npcMixer]){m.stopAllAction();m.uncacheRoot(m.getRoot());}
      procedural.dispose();
      player.removeFromParent();visitor.removeFromParent();player.clear();visitor.clear();byId.clear();
      // Shared geometry, textures/materials and each cloned skeleton belong to Resources.
    },
  };
}
