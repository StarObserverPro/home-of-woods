import * as THREE from 'three';
import {CHARACTER} from '../content/characters.ts';
import {NPC_VISIT} from '../content/npc-visit.ts';
import {RIDGE_NEIGHBOUR} from '../content/npcs/ridge-neighbour/profile.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {WORKBENCH} from '../content/workshop.ts';
import type {WardrobeLook} from '../content/wardrobe-preview.ts';
import type {Point} from '../content/world.ts';
import type {GameState} from '../domain/state.ts';
import {travelAccess} from '../world/regions.ts';
import {travelHeightAt} from '../world/traversal.ts';
import {createCharacterWardrobe} from './character-wardrobe.ts';
import type {Models} from './models.ts';
import type {Resources} from './resources.ts';

type Mode='idle'|'walk'|'wave';
const LOOK:WardrobeLook={hair:'cropped',headwear:'cap',top:'canvas-vest',bottom:'patched-trousers',footwear:'boots',back:'pack'};

/** The app owns visits and movement. This adapter only samples that state and unscaled scene seconds. */
export function createNeighbourPresentation(resources:Resources,models:Models){
  const group=new THREE.Group();group.name=RIDGE_NEIGHBOUR.id;group.visible=false;
  group.scale.setScalar(CHARACTER.worldScale);
  const body=models.clone(RIDGE_NEIGHBOUR.appearance.model);group.add(body);
  const wardrobe=createCharacterWardrobe(resources,body);wardrobe.apply(LOOK);
  // Replace this clone's accessory material references, never tint the shared model/material itself.
  body.getObjectByName('wardrobe:headwear:cap:head')?.traverse(object=>{
    if(object instanceof THREE.Mesh)object.material=resources.material(RIDGE_NEIGHBOUR.appearance.hatColour,.84);
  });
  const pack=body.getObjectByName('wardrobe:back:pack:chest');
  const packBody=pack?.children.find(object=>object instanceof THREE.Mesh);
  if(packBody instanceof THREE.Mesh)packBody.material=resources.material(RIDGE_NEIGHBOUR.appearance.packColour,.84);

  const clips=new Map((models.animations.get('motions')??[]).map(clip=>[clip.name,clip]));
  const need=(name:string)=>{const clip=clips.get(name);if(!clip)throw new Error('Missing neighbour animation: '+name);return clip;};
  const source={idle:need('Idle_A'),walk:need('Walking_A'),wave:need('Waving')};
  const mixer=new THREE.AnimationMixer(body);
  const actions={idle:mixer.clipAction(source.idle),walk:mixer.clipAction(source.walk),wave:mixer.clipAction(source.wave)};
  let mode:Mode='idle',disposed=false,visitId:string|null=null;
  let previous:{position:Point;seconds:number}|null=null,movementSeconds=0,physicalSpeed=0;
  let waveStartedAt:number|null=null,waved=false,phase:string|null=null;
  actions.idle.play();mixer.update(0);

  function setMode(next:Mode){
    if(mode===next)return;
    mixer.stopAllAction();mode=next;actions[mode].reset().play();
  }
  function update(state:GameState,reducedMotion:boolean,seconds:number){
    if(disposed)return;
    const visit=state.npcs?.['ridge-neighbour']?.visit.active;
    group.visible=!!visit;phase=visit?.phase??null;
    if(!visit){visitId=null;previous=null;waveStartedAt=null;waved=false;physicalSpeed=0;return;}
    if(visitId!==visit.id){
      visitId=visit.id;previous=null;movementSeconds=0;waveStartedAt=null;waved=false;
    }
    const elapsed=previous?Math.max(0,seconds-previous.seconds):0;
    const distance=previous?Math.hypot(visit.position.x-previous.position.x,visit.position.z-previous.position.z):0;
    // Position deltas keep blocked routes from walking in place and never use calendar-speed multipliers.
    const moving=elapsed>0&&distance>.0001;
    physicalSpeed=moving?distance/elapsed:0;
    if(moving)movementSeconds+=distance/NPC_VISIT.walkingSpeed;
    previous={position:{...visit.position},seconds};
    group.position.set(visit.position.x,travelHeightAt(visit.position.x,visit.position.z,travelAccess(state)),visit.position.z);
    group.rotation.y=visit.facing;

    const playerDistance=Math.hypot(state.player.x-visit.position.x,state.player.z-visit.position.z);
    if(!moving&&!waved&&visit.phase==='waiting'&&visit.attention!=='busy'&&playerDistance<NPC_VISIT.interactionReach*2){
      waveStartedAt=seconds;waved=true;
    }
    const waveTime=waveStartedAt===null?Infinity:Math.max(0,seconds-waveStartedAt);
    const waving=!moving&&visit.phase==='waiting'&&visit.attention!=='busy'&&waveTime<source.wave.duration;
    let lookAt:Point|null=null;
    if(!moving){
      if(visit.phase==='talking'||(visit.phase==='waiting'&&(visit.attention==='engaged'||waving)))lookAt=state.player;
      else if(visit.phase==='activity'&&visit.activity?.started){
        if(visit.activity.abilityId==='observe-workbench')lookAt=WORKBENCH;
        if(visit.activity.abilityId==='warm-fire')lookAt=CAMP_PROPS.fire;
      }
    }
    if(lookAt)group.rotation.y=Math.atan2(lookAt.x-visit.position.x,lookAt.z-visit.position.z);
    setMode(reducedMotion?'idle':moving?'walk':waving?'wave':'idle');
    actions[mode].time=reducedMotion?.01:mode==='walk'?movementSeconds%source.walk.duration:mode==='wave'?waveTime:seconds%source.idle.duration;
    mixer.update(0);wardrobe.update(seconds,moving,reducedMotion);
  }
  return {
    group,update,
    point:():Point|null=>!disposed&&group.visible?{x:group.position.x,z:group.position.z}:null,
    stats:()=>({npcId:RIDGE_NEIGHBOUR.id,name:RIDGE_NEIGHBOUR.name,model:RIDGE_NEIGHBOUR.appearance.model,visible:group.visible,visitId,phase,mode,physicalSpeed,wardrobe:wardrobe.stats(),disposed}),
    dispose(){
      if(disposed)return;disposed=true;
      mixer.stopAllAction();mixer.uncacheRoot(body);wardrobe.dispose();
      group.removeFromParent();group.clear();group.visible=false;previous=null;
      // Models/Resources own the cloned skeleton and cached geometry/materials.
    },
  };
}
