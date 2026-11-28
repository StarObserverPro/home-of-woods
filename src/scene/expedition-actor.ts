import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {CHARACTER,LOCAL_PLAYER} from '../content/characters.ts';
import {starterWardrobeItems} from '../content/wardrobe.ts';
import {DEFAULT_WARDROBE,wardrobeForMountedItems} from '../content/wardrobe-preview.ts';
import type {InventoryState} from '../domain/inventory.ts';
import type {Resources} from './resources.ts';
import {createFootContactAnchors} from './lighting/foot-contact-anchors.ts';
import {createJ01Player} from './j01-player.ts';
import {createRangerFooting} from './ranger-footing.ts';
import {createWardrobeVisual} from './wardrobe-visual.ts';
import {loadLocalCharacter} from './local-character-model.ts';
import type {GroundHeight} from './character-soles.ts';

type ExpeditionActorFrame={
  x:number;y:number;z:number;facing:number;speed:number;
  gathering:number|null;carryingWood:boolean;groundAt:GroundHeight;
};
export type ExpeditionAppearance=Pick<InventoryState,'instances'>&{reducedMotion?:boolean};

function ownModel(owner:Resources,asset:GLTF){
  asset.scene.traverse(object=>{
    if(object instanceof THREE.SkinnedMesh)owner.own(object.skeleton);
    if(!(object instanceof THREE.Mesh))return;
    owner.own(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
      owner.own(material);
      for(const value of Object.values(material))if(value instanceof THREE.Texture)owner.own(value);
    }
    object.castShadow=true;object.receiveShadow=true;
  });
  return asset;
}

/** Use the same admitted local player and authored motion as the camp, with KayKit as fallback. */
export async function createExpeditionActor(owner:Resources,appearance?:ExpeditionAppearance){
  const loader = new GLTFLoader();
  const get=(url:string)=>loader.loadAsync(url).then(asset=>ownModel(owner,asset));
  const local=loadLocalCharacter(loader,LOCAL_PLAYER.model).then(asset=>asset&&ownModel(owner,asset))
    .catch(error=>{console.warn('Local expedition character unavailable',error);return null;});
  const [player,motions,mushrooms,branches,j01]=await Promise.all([
    get('/assets/characters/player.glb'),get('/assets/characters/motions.glb'),
    get('/assets/gathering/mushrooms.glb'),get('/assets/gathering/branches.glb'),local,
  ]);
  if (owner.disposed) throw new Error('林地已关闭');
  return buildExpeditionActor(owner,{player,motions,mushrooms,branches,j01},appearance);
}

export function buildExpeditionActor(owner:Resources,assets:{player:GLTF;motions:GLTF;mushrooms:GLTF;branches:GLTF;j01:GLTF|null},
    appearance?:ExpeditionAppearance){
  const root = new THREE.Group(); root.name = 'expedition-player';
  root.scale.setScalar(CHARACTER.worldScale);
  const body = assets.player.scene; root.add(body);
  const asset=assets.j01;
  const configured=asset?.scene.userData.j01Gait?createJ01Player(owner,{
    templates:new Map([[LOCAL_PLAYER.model,asset.scene]]),animations:new Map([[LOCAL_PLAYER.model,asset.animations]]),
    clone:()=>asset.scene,
  },root,[body]):null;
  const local=configured?.walkSpeed&&configured?.runSpeed?configured:null;
  if(configured&&!local)configured.dispose();
  const walkSpeed=local?.walkSpeed??3.8,runSpeed=local?.runSpeed??6.08;
  const reducedMotion=appearance?.reducedMotion??globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  const footing=local?null:createRangerFooting(root,body);
  const footAnchors=createFootContactAnchors(local?.root??body,{idPrefix:'expedition-player',toePrefix:local?'ball':'toes'});
  const wardrobe=local?createWardrobeVisual(owner,body,local.accessoryMounts):null;
  if(local&&wardrobe){
    const inventory={instances:appearance?.instances??starterWardrobeItems()};
    const look=wardrobeForMountedItems(DEFAULT_WARDROBE,inventory.instances);
    local.clothes(inventory,look,false);wardrobe.update(inventory,look.back==='pack');
  }
  const mixer = new THREE.AnimationMixer(body);
  const clips = new Map(assets.motions.animations.map(clip => [clip.name, clip]));
  const actions = new Map<string, THREE.AnimationAction>();
  for (const name of ['Idle_A', 'Walking_A', 'Running_A', 'PickUp']) {
    const clip = clips.get(name);
    if (!clip) throw new Error(`缺少角色动作：${name}`);
    actions.set(name, mixer.clipAction(clip));
  }
  let mode = '', facing = 0,seconds=0,first=true,motion=0;
  const bundle = new THREE.Group(); bundle.name = 'carried-wood-bundle';
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(owner.geometry('expedition-held-branch', () => new THREE.CylinderGeometry(.07, .09, 1.6, 7)), owner.material('#8b6748', .85));
    log.rotation.z = Math.PI / 2; log.position.set(0, 1.12 + i * .12, .53 + (i % 2) * .13); bundle.add(log);
  }
  bundle.scale.setScalar(1/CHARACTER.worldScale);bundle.visible=false;root.add(bundle);
  body.visible=!local;
  return {
    root, feet:footAnchors.update, footStats:footAnchors.stats,
    walkSpeed,runSpeed,
    templates:{mushrooms:assets.mushrooms.scene,branches:assets.branches.scene},
    stats:()=>({model:local?'J01 林工':'KayKit R3',mode,local:local?.stats()??null}),
    reset(){footing?.restore();mixer.stopAllAction();local?.resetMotion();mode='';first=true;seconds=motion=0;},
    update(view:ExpeditionActorFrame,dt:number){
      const distance=first?0:Math.hypot(view.x-root.position.x,view.z-root.position.z);
      const gathering=view.gathering!==null;
      root.position.set(view.x, view.y, view.z);
      root.rotation.y=view.facing;
      const delta = Math.atan2(Math.sin(view.facing - facing), Math.cos(view.facing - facing));
      facing+=delta*(first||reducedMotion?1:1-Math.exp(-14*dt));
      body.rotation.y=facing-view.facing;bundle.rotation.y=facing-view.facing;
      const moving=view.speed>.03&&!reducedMotion;
      const running=view.speed>(local?walkSpeed*1.12:4.4);
      const next=gathering?'PickUp':moving?(running?'Running_A':'Walking_A'):'Idle_A';
      footing?.restore();
      if (next !== mode) {
        const previous = actions.get(mode), action = actions.get(next)!;
        action.reset().play();
        if(previous&&!local&&!reducedMotion)action.crossFadeFrom(previous,.16,false);
        else previous?.stop();
        mode=next;
      }
      const action = actions.get(next)!;
      if(gathering)action.time=Math.min(.999,view.gathering!)*action.getClip().duration;
      else if(!moving)action.time=.01;
      action.timeScale=next==='Walking_A'?Math.max(.35,view.speed/3.3):next==='Running_A'?view.speed/5.6:0;
      mixer.update(dt);
      seconds+=dt;
      if(local){
        const sample=gathering?undefined:{mode:moving?(running?'run':'walk'):'idle',distance,seconds:dt,reset:first,groundAt:view.groundAt} as const;
        local.present(body,null,!gathering&&!moving,seconds,reducedMotion,false,gathering,!view.carryingWood,sample,
          gathering?{kind:'crouch',groundAt:view.groundAt,lift:0}:undefined);
      }else{
        motion=moving||gathering?1:Math.max(0,motion-dt/.16);
        footing?.place(view.groundAt,motion);
      }
      bundle.visible=view.carryingWood&&!gathering;first=false;
    },
    dispose(){wardrobe?.dispose();local?.dispose();mixer.stopAllAction();mixer.uncacheRoot(body);root.removeFromParent();},
  };
}
