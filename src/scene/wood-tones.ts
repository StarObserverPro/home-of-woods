import * as THREE from 'three';
import {woodToneDrift,woodToneHash,WOOD_TONE_STYLE} from '../content/wood-tones.ts';
/** Apply to owned pieces before batching. Every vertex in a piece shares one value. */
export function setWoodTone<T extends THREE.BufferGeometry>(geometry:T,seed:string|number,amount?:number):T{
  const tone=woodToneDrift(seed,amount),count=geometry.getAttribute('position').count,data=new Float32Array(count*3);
  for(let i=0;i<count;i++)data.set(tone,i*3);
  geometry.setAttribute('woodTone',new THREE.BufferAttribute(data,3));return geometry;
}
/** One shared instanced draw; no extra materials. Only call for wood-only batches. */
export function setWoodInstanceTone(mesh:THREE.InstancedMesh,index:number,seed:string|number){
  const [r,g,b]=woodToneDrift(seed,WOOD_TONE_STYLE.instanceDrift);
  mesh.setColorAt(index,new THREE.Color().setRGB(r,g,b));
  mesh.instanceColor!.needsUpdate=true;
}

/** Small bounded cache for movable wood. Tint is geometry data, never a material per item. */
export function woodToneGeometry(resources:import('./resources.ts').Resources,source:THREE.BufferGeometry,seed:string|number){
  const bucket=woodToneHash(seed)%21;
  return resources.geometry(`wood-tone:${source.uuid}:${bucket}`,()=>{
    const geometry=source.clone(),previous=geometry.getAttribute('woodTone'),tone=woodToneDrift(`variant:${bucket}`,WOOD_TONE_STYLE.instanceDrift);
    const count=geometry.getAttribute('position').count,data=new Float32Array(count*3);
    for(let i=0;i<count;i++)for(let k=0;k<3;k++)data[i*3+k]=tone[k]*(previous?previous.getComponent(i,k):1);
    geometry.setAttribute('woodTone',new THREE.BufferAttribute(data,3));return geometry;
  });
}
