import type * as THREE from 'three';
import {CABIN,definitionFor} from '../content.ts';
import type {CabinState} from '../content.ts';
import {itemPose} from '../domain.ts';
import {SHELL_PLAN} from '../../../../src/scene/cabin/shell.ts';
import {cabinEnvelopeVolumes} from '../../../../src/scene/cabin/occlusion.ts';
import {createAmbientOcclusion} from '../../../../src/scene/lighting/ambient-occlusion.ts';
import {floorOccluder} from '../../../../src/world/occlusion.ts';
import type {OcclusionVolume} from '../../../../src/world/occlusion.ts';
import type {Resources} from '../../../../src/scene/resources.ts';

/** Same authored openings and item poses as the shell/domain; camera cuts are irrelevant. */
export function cabinOcclusionVolumes(state:CabinState):OcclusionVolume[]{
  const volumes=cabinEnvelopeVolumes(CABIN,SHELL_PLAN);
  for(const item of state.items){
    const pose=itemPose(state,item);if(!pose||item.definitionId==='rug')continue;
    const d=definitionFor(item.definitionId),[w,h,depth]=d.dimensions;
    volumes.push(...floorOccluder(item.instanceId,pose.x,pose.y,pose.z,w,h,depth,pose.yaw,item.definitionId==='table'||item.definitionId==='stool'));
  }
  return volumes;
}
export function createCabinOcclusion(resources:Resources,scene:THREE.Scene){
  const ao=createAmbientOcclusion(resources);let signature='';
  ao.bind(scene);
  return {
    sync(state:CabinState,night:boolean,enabled=true){
      const next=JSON.stringify(state.items.map(i=>[i.instanceId,i.definitionId,i.location]));
      if(next!==signature){signature=next;ao.setVolumes(cabinOcclusionVolumes(state));ao.bind(scene);}
      ao.setNight(night?1:0);ao.setEnabled(enabled);
    },
    bind:ao.bind,bindMaterial:ao.bindMaterial,stats:ao.stats,dispose:ao.dispose,
  };
}
