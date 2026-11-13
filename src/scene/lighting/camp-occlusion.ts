import * as THREE from 'three';
import {OCCLUSION as C} from '../../content/occlusion.ts';
import {WORLD} from '../../content/world.ts';
import {CAMP_PROPS} from '../../content/scene-props.ts';
import {treeScaleFactor} from '../../domain/forestry.ts';
import type {GameState} from '../../domain/state.ts';
import type {Tree} from '../../world/layout.ts';
import {heightAt} from '../../world/surface.ts';
import {bakeCanopyField,floorOccluder} from '../../world/occlusion.ts';
import type {CanopyField,CanopySeed,OcclusionVolume} from '../../world/occlusion.ts';
import type {Resources} from '../resources.ts';
import {createAmbientOcclusion} from './ambient-occlusion.ts';
import {buildingOcclusionVolumes} from './building-occlusion.ts';

type Options={resources:Resources;scene:THREE.Scene;trees:Tree[];props:Map<string,THREE.Object3D>;buildingSources:Map<string,THREE.Group>;campRoots:Map<string,THREE.Group>;interactionRoots:()=>THREE.Object3D[];outerSeeds:CanopySeed[];surfaceAt:(x:number,z:number)=>number};
/** Presentation adapter. Existing transforms, tree state and parametric surfaces remain authoritative. */
export function createCampOcclusion(options:Options){
  const {resources,scene,trees,props,buildingSources,campRoots,interactionRoots,outerSeeds,surfaceAt}=options,ao=createAmbientOcclusion(resources);
  const bounds={minX:WORLD.minX,maxX:WORLD.maxX,minZ:WORLD.minZ,maxZ:WORLD.maxZ};
  const outerBounds={minX:-750,maxX:750,minZ:-750,maxZ:750};
  let core:CanopyField|undefined,outer:CanopyField|undefined,forestKey='',surfaceKey='__initial__',clock=Infinity,bindClock=Infinity,forestBakes=0,forestBakeMs=0,omittedVolumes=0;
  const position=new THREE.Vector3(),scale=new THREE.Vector3(),rotation=new THREE.Quaternion(),euler=new THREE.Euler(0,0,0,'YXZ');
  const fixed:OcclusionVolume[]=[];
  for(const [id,root] of props){
    if(id!=='cabin'&&id!=='tent')continue;
    const source=buildingSources.get(id);if(!source)throw new Error(`Missing building source: ${id}`);
    fixed.push(...buildingOcclusionVolumes(id,source,root));
  }
  const logStore=campRoots.get(CAMP_PROPS.logs.id);
  if(logStore){const p=logStore.position;fixed.push({id:'log-store:shelter',center:[p.x,p.y+.9,p.z],halfSize:[1.5,.9,1.5],yaw:0,softness:.7,strength:.19,detail:false});}
  const isVisible=(object:THREE.Object3D)=>{for(let o:THREE.Object3D|null=object;o;o=o.parent)if(!o.visible)return false;return true;};
  const enabled=new URLSearchParams(window.location.search).get('ao')!=='off';ao.setEnabled(enabled);
  function updateForest(state:GameState){
    const seeds:CanopySeed[]=[],key:string[]=[];
    for(const t of trees){
      const life=state.forestry.slots[t.id],status=life?.status??'standing';
      // Smooth growth is quantized only for this broad field, not the visual tree itself.
      const factor=(status==='stump'||status==='falling')?0:Math.round(treeScaleFactor(life,state.time)*20)/20;
      key.push(`${t.id}:${factor}`);if(factor<=0)continue;
      const s=t.scale*factor;seeds.push({x:t.x,z:t.z,radius:(t.role==='landmark'?8:t.kind==='pine'?3.2:3.8)*s,height:(t.role==='landmark'?19:8)*s,coverage:Math.min(1,factor)});
    }
    const next=key.join('|');if(next===forestKey)return;forestKey=next;
    const start=performance.now();
    core=bakeCanopyField(C.coreSize,bounds,seeds,heightAt,core);
    outer=bakeCanopyField(C.outerSize,outerBounds,[...outerSeeds,...seeds],surfaceAt,outer);
    ao.setCanopy('core',core);ao.setCanopy('outer',outer);forestBakes++;forestBakeMs=performance.now()-start;
  }
  return {
    update(state:GameState,dt:number,camera:THREE.Camera,night:number){
      clock+=dt;bindClock+=dt;ao.setNight(night);
      if(clock>=C.forestRefreshSeconds){clock=0;updateForest(state);}
      const dynamic:OcclusionVolume[]=[],signature:string[]=[];
      for(const root of interactionRoots()){
        const spec=root.userData.ambientOccluder as {width:number;height:number;depth:number}|undefined;
        if(!spec||!isVisible(root))continue;
        root.updateWorldMatrix(true,false);root.matrixWorld.decompose(position,rotation,scale);euler.setFromQuaternion(rotation,'YXZ');
        signature.push(`${root.uuid}:${position.toArray()}:${euler.y}:${scale.toArray()}`);
        dynamic.push(...floorOccluder(root.name||root.uuid,position.x,position.y,position.z,spec.width*scale.x,spec.height*scale.y,spec.depth*scale.z,euler.y));
      }
      // Existing gameplay roots (not ghosts/hidden pick proxies) are the only occluders.
      const key=signature.join('|');
      if(key!==surfaceKey){
        surfaceKey=key;const available=C.maxVolumes-fixed.length;
        dynamic.sort((a,b)=>new THREE.Vector3(...a.center).distanceToSquared(camera.position)-new THREE.Vector3(...b.center).distanceToSquared(camera.position));
        omittedVolumes=Math.max(0,dynamic.length-available);ao.setVolumes([...fixed,...dynamic.slice(0,available)]);ao.bind(scene);
      }
      // Covers late-loaded wildlife/clothing and chained weather/rarity variants without per-frame traversal.
      if(bindClock>=1){bindClock=0;ao.bind(scene);}
    },
    bind:ao.bind,bindMaterial:ao.bindMaterial,setEnabled:ao.setEnabled,
    stats(){return {...ao.stats(),forestBakes,lastForestBakeMs:Math.round(forestBakeMs*100)/100,omittedVolumes,forestMode:'canopy-coverage; no forest-near-field AO'};},
    dispose:ao.dispose,
  };
}
