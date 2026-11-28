import type {GLTF,GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {LOCAL_CHARACTER_PREFIX,LOCAL_PLAYER} from '../content/characters.ts';

/** Add the authored locomotion only to the fitted rig it was exported for. */
export async function loadJ01Locomotion(loader:GLTFLoader,model:GLTF){
  if(!model.scene.userData.fitBind)return;
  const motion=await loader.loadAsync('/sources/np120/j01-locomotion.glb');
  const {fitBind,j01Gait}=motion.scene.userData;
  if(fitBind!==model.scene.userData.fitBind)return;
  const clips=new Map(model.animations.map(clip=>[clip.name,clip]));
  for(const clip of motion.animations)clips.set(clip.name,clip);
  model.animations=[...clips.values()];
  model.scene.userData.j01Gait=j01Gait;
}

export async function loadLocalCharacter(loader:GLTFLoader,name:string,signal?:AbortSignal){
  if(!import.meta.env?.DEV)return null;
  const response=await fetch(`${LOCAL_CHARACTER_PREFIX}${name}.glb`,{signal});
  if(response.status===204)return null;
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const model=await loader.parseAsync(await response.arrayBuffer(),'');
  if(name===LOCAL_PLAYER.model){
    try{await loadJ01Locomotion(loader,model);}
    catch(error){if(!signal?.aborted)console.warn('Local J01 locomotion unavailable',error);}
  }
  return model;
}
