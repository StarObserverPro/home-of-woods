import * as THREE from 'three';
import {CABIN,definitionFor} from '../content.ts';
import type {CabinState} from '../content.ts';
import {itemPose} from '../domain.ts';
import {SHELL_PLAN} from './shell.ts';
import {createAmbientOcclusion} from '../../../../src/scene/lighting/ambient-occlusion.ts';
import {floorOccluder} from '../../../../src/world/occlusion.ts';
import type {OcclusionVolume} from '../../../../src/world/occlusion.ts';
import type {Resources} from '../../../../src/scene/resources.ts';

/** Same authored openings and item poses as the shell/domain; camera cuts are irrelevant. */
export function cabinOcclusionVolumes(state:CabinState):OcclusionVolume[]{
  const volumes:OcclusionVolume[]=[{id:'cabin:enclosure',center:[0,1.2,-.1],halfSize:[CABIN.width/2-.32,1.2,CABIN.depth/2-.32],yaw:0,softness:.45,strength:.18,detail:false}];
  for(const wall of SHELL_PLAN){
    const gaps=wall.openings.filter(o=>o.kind==='door').sort((a,b)=>a.left-b.left);
    let start=0;
    for(const gap of [...gaps,{left:wall.length,width:0}]){
      const length=gap.left-start;
      if(length>.01){const along=start+length/2,c=Math.cos(wall.yaw),s=Math.sin(wall.yaw);
        volumes.push({id:`cabin:wall-root:${wall.id}:${start}`,center:[wall.origin[0]+along*c,.12,wall.origin[2]-along*s],halfSize:[length/2,.10,.05],yaw:wall.yaw,softness:.55,strength:.40,detail:true});
      }
      start=gap.left+gap.width;
    }
  }
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
