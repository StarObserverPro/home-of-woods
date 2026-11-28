import * as THREE from 'three';
import {CHARACTER,VILLAGER_MODELS} from '../content/characters.ts';
import {NPC_VISIT} from '../content/npc-visit.ts';
import {HOME} from '../content/world.ts';
import {canStand,findPath} from '../domain/navigation.ts';
import {scheduledVillager,villagePose,villageRoute} from '../domain/village-visit.ts';
import type { GameState } from '../domain/state.ts';
import type { Collider } from '../world/layout.ts';
import {travelAccess} from '../world/regions.ts';
import {travelHeightAt} from '../world/traversal.ts';
import {createFootContactAnchors} from './lighting/foot-contact-anchors.ts';
import {createCharacterLiveliness} from './character-liveliness.ts';
import type { Models } from './models.ts';

const CAMP_STOPS=[{x:-30,z:3},{x:-33,z:3},{x:-35,z:6}];
const SCALE=1.5*CHARACTER.worldScale;

export function createVillagers(models:Models,colliders:()=>Collider[]){
  const group=new THREE.Group();
  group.name='passing-villagers';
  const roster=VILLAGER_MODELS.flatMap(id=>{
    const template=models.templates.get(id),clip=models.animations.get(id)?.[0];
    if(!template||!clip)return [];
    const walk=Number(template.userData.np120WalkDuration);
    const idle=Number(template.userData.np120IdleTime);
    const stride=Number(template.userData.np120Stride)*SCALE;
    if(!(walk>0&&stride>0&&idle>=walk&&idle<clip.duration))return [];
    const pivot=new THREE.Group(),actor=models.clone(id);
    pivot.name=id;
    pivot.scale.setScalar(SCALE);
    actor.rotation.y=-Math.PI/2;
    pivot.add(actor);
    const liveliness=createCharacterLiveliness(actor,{id,frame:pivot});
    const feet=createFootContactAnchors(pivot,{idPrefix:id,toePrefix:'ball'});
    const mixer=new THREE.AnimationMixer(actor);
    const action=mixer.clipAction(clip).play();
    pivot.visible=false;
    group.add(pivot);
    return [{id,pivot,actor,mixer,action,feet,idle,walk,stride,liveliness}];
  });
  let active:typeof roster[number]|null=null;
  let day=0,moving=false;
  let path:ReturnType<typeof villageRoute>|null=null;
  const hide=()=>{if(active){active.liveliness.reset();active.pivot.visible=false;}active=null;moving=false;};
  return {
    group,
    update(state:GameState,reducedMotion:boolean,seconds=state.time){
      if(!roster.length)return;
      const visit=scheduledVillager(state.time);
      if(!visit||Math.hypot(state.player.x-HOME.x,state.player.z-HOME.z)>40){hide();return;}
      const next=roster.find(entry=>entry.id===visit.model);
      if(!next){hide();return;}
      const access=travelAccess(state),blockers=colliders();
      if(day!==visit.day){
        day=visit.day;
        path=null;
        for(const stop of CAMP_STOPS){
          if(!canStand(stop,blockers,undefined,access))continue;
          const points=findPath(NPC_VISIT.entry,stop,blockers,access);
          if(points.length){path=villageRoute([NPC_VISIT.entry,...points]);break;}
        }
      }
      const pose=path&&villagePose(path,visit.elapsed,next.stride/next.walk);
      if(!pose||!canStand(pose,blockers,undefined,access)){hide();return;}
      if(active&&active!==next)hide();
      active=next;
      moving=pose.moving;
      next.liveliness.beforeAnimation();
      next.pivot.visible=true;
      next.pivot.position.set(pose.x,travelHeightAt(pose.x,pose.z,access),pose.z);
      next.pivot.rotation.y=pose.facing;
      next.action.time=moving&&!reducedMotion?(pose.walked/next.stride%1)*next.walk:next.idle;
      next.mixer.update(0);
      next.liveliness.update(seconds,reducedMotion,!moving);
    },
    footContacts:()=>active?.feet.update()??[],
    stats:()=>({available:roster.map(entry=>entry.id),model:active?.id??null,moving,position:active?.pivot.position.toArray()??null,liveliness:active?.liveliness.stats()??null}),
    dispose(){
      hide();
      for(const entry of roster){
        entry.liveliness.dispose();
        entry.mixer.stopAllAction();entry.mixer.uncacheRoot(entry.actor);
      }
      group.removeFromParent();group.clear();
    },
  };
}
