import * as THREE from 'three';
import {OCCLUSION} from '../../content/occlusion.ts';
import {bakeCanopyField} from '../../world/occlusion.ts';
import type {CanopySeed} from '../../world/occlusion.ts';
import {expeditionHeightAt} from '../../world/forest-expedition.ts';
import type {ExpeditionLayout} from '../../world/forest-expedition.ts';
import type {ProjectedCanopy,ShadowBounds,ShadowPoint} from '../../world/shadow-field.ts';
import type {ExpeditionCrownVolume} from '../expedition-vegetation.ts';
import type {Resources} from '../resources.ts';
import {createOutdoorShadows} from './outdoor-shadows.ts';
import {createAmbientOcclusion} from './ambient-occlusion.ts';
import {createCharacterContactShadows} from './character-contact-shadows.ts';
import type {CharacterFootContact} from './character-contact-shadows.ts';

/** Both lighting channels consume the same authored crown geometry, never camera fade. */
export function forestCanopyInputs(canopies:readonly ExpeditionCrownVolume[],heightAt:(x:number,z:number)=>number){
  const direct:ProjectedCanopy[]=[],ambient:CanopySeed[]=[];
  for(const canopy of canopies){
    const [x,y,z]=canopy.center,[rx,ry,rz]=canopy.halfSize;
    if(![x,y,z,rx,ry,rz].every(Number.isFinite)||Math.min(rx,ry,rz)<=0)continue;
    direct.push({id:canopy.id,center:[x,y,z],radii:[rx,ry,rz]});
    // Equal-area horizontal footprint: a tall narrow crown must not get a
    // giant ground footprint just because its enclosing 3D sphere is tall.
    ambient.push({x,z,radius:Math.sqrt(rx*rz),height:Math.max(.1,y+ry-heightAt(x,z)),coverage:1});
  }
  return {direct,ambient};
}

export function forestLightingBounds(layout:Pick<ExpeditionLayout,'bounds'|'grid'>,canopies:readonly ExpeditionCrownVolume[]):ShadowBounds{
  const min:[number,number,number]=[layout.bounds.minX,Infinity,layout.bounds.minZ];
  const max:[number,number,number]=[layout.bounds.maxX,-Infinity,layout.bounds.maxZ];
  for(let i=1;i<layout.grid.positions.length;i+=3){min[1]=Math.min(min[1],layout.grid.positions[i]);max[1]=Math.max(max[1],layout.grid.positions[i]);}
  for(const crown of canopies)for(let axis=0;axis<3;axis++){
    min[axis]=Math.min(min[axis],crown.center[axis]-crown.halfSize[axis]);
    max[axis]=Math.max(max[axis],crown.center[axis]+crown.halfSize[axis]);
  }
  min[1]-=.5;max[1]+=2;
  return {min,max};
}

type Options={
  renderer:THREE.WebGLRenderer;sun:THREE.DirectionalLight;scene:THREE.Scene;
  layout:ExpeditionLayout;canopies:readonly ExpeditionCrownVolume[];sunDirection:ShadowPoint;
  ambientEnabled?:boolean;
};

/** Per-map adapter over shared rules; the host keeps its renderer, resources and clock. */
export function createForestExpeditionLighting(resources:Resources,options:Options){
  const {renderer,sun,scene,layout,canopies,sunDirection}=options;
  const surfaceAt=(x:number,z:number)=>expeditionHeightAt(layout.id,x,z);
  const input=forestCanopyInputs(canopies,surfaceAt),bounds=forestLightingBounds(layout,canopies);
  // Keep wrapper installation/removal in the same order in every scene.
  const shadows=createOutdoorShadows(resources,{renderer,sun,bounds});
  shadows.setCanopies(input.direct);
  shadows.bind(scene);
  scene.traverse(object=>{
    if(object instanceof THREE.Mesh&&object.userData.vegetationPart==='crown')shadows.configureTreeDepth(object,'crown');
  });
  const ambient=createAmbientOcclusion(resources);
  const coreBounds={minX:bounds.min[0],maxX:bounds.max[0],minZ:bounds.min[2],maxZ:bounds.max[2]};
  const outerBounds={minX:coreBounds.minX-12,maxX:coreBounds.maxX+12,minZ:coreBounds.minZ-12,maxZ:coreBounds.maxZ+12};
  ambient.setCanopy('core',bakeCanopyField(OCCLUSION.coreSize,coreBounds,input.ambient,surfaceAt));
  ambient.setCanopy('outer',bakeCanopyField(OCCLUSION.outerSize,outerBounds,input.ambient,surfaceAt));
  ambient.setEnabled(options.ambientEnabled??true);
  ambient.bind(scene);
  const contact=createCharacterContactShadows(resources,{surfaceAt});
  let disposed=false;
  return {
    bind(root:THREE.Object3D){if(!disposed){shadows.bind(root);ambient.bind(root);}},
    update(frame:{focus:ShadowPoint;dt:number;camera:THREE.Camera;viewportHeight:number;feet:readonly CharacterFootContact[]}){
      if(disposed)return;
      shadows.update({focus:frame.focus,sunDirection,dt:frame.dt,night:0});
      contact.update(frame.feet);ambient.setCharacterContacts(contact.contacts());
      ambient.updateCamera(frame.camera,frame.viewportHeight);
    },
    stats:()=>({canopies:input.direct.length,bounds,shadows:shadows.stats(),ambient:ambient.stats(),contact:contact.stats()}),
    dispose(){if(disposed)return;disposed=true;contact.dispose();ambient.dispose();shadows.dispose();},
  };
}
