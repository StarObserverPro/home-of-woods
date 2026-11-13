import * as THREE from 'three';
import type {Resources} from './resources.ts';
import {WOOD_GRAIN} from '../content/wood-grain.ts';
import {setWoodTone} from './wood-tones.ts';

type Axis='x'|'y'|'z';
type Surface='board'|'raw'|'round-board'|'end';
const axes:Axis[]=['x','y','z'];
/** Attach coordinates BEFORE rotating, translating or merging parts. Does not change topology. */
export function woodCoordinates<T extends THREE.BufferGeometry>(geometry:T,surface:Surface='board',axis?:Axis,toneSeed?:string|number):T {
  geometry.computeBoundingBox();
  const bounds=geometry.boundingBox!,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const along=axis??axes.reduce((a,b)=>size[a]>=size[b]?a:b),across=axes.filter(a=>a!==along);
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
  const data=new Float32Array(position.count*3);
  const at=(attribute:THREE.BufferAttribute|THREE.InterleavedBufferAttribute,a:Axis,i:number)=>a==='x'?attribute.getX(i):a==='y'?attribute.getY(i):attribute.getZ(i);
  const unit=(a:Axis,i:number)=>(at(position,a,i)-center[a])/Math.max(size[a],.0001)+.5;
  const seed=Math.sin(size.x*12.9898+size.y*78.233+size.z*37.719)*43758.5453;
  const shift=((seed-Math.floor(seed))-.5)*.06;
  for(let i=0;i<position.count;i++){
    let u:number,v:number,kind:number;
    if(surface==='end'){
      u=unit(across[0],i);v=unit(across[1],i);kind=2;
    }else if(Math.abs(at(normal,along,i))>.8){
      u=unit(across[0],i);v=unit(across[1],i);kind=2;
    }else if(surface==='raw'||surface==='round-board'){
      // Cylinder UVs preserve the seam, unlike atan2 at its duplicated end vertices.
      u=unit(along,i);v=uv?uv.getX(i):unit(across[0],i);kind=surface==='raw'?1:0;
    }else{
      const transverse=across.reduce((a,b)=>Math.abs(at(normal,a,i))<=Math.abs(at(normal,b,i))?a:b);
      u=unit(along,i);v=unit(transverse,i);kind=0;
    }
    data.set([u*.91+.045+shift,v*.9+.05-shift,kind],i*3);
  }
  geometry.setAttribute('woodCoord',new THREE.BufferAttribute(data,3));
  return setWoodTone(geometry,toneSeed??`${surface}:${along}:${size.toArray().join(',')}`);
}

const fragmentFunctions=`
float howWoodStripe(float value,float footprint){
  float aa=max(.03,footprint*.8);
  return 1.-smoothstep(.11-aa,.11+aa,abs(fract(value)-.5));
}
float howWoodInk(vec2 coord,float kind,float footprint){
  if(kind>1.5){
    vec2 delta=(coord-vec2(.48,.52))*vec2(1.03,1.);
    return .78*howWoodStripe(length(delta)*10.,footprint*10.);
  }
  float bend=.055*(coord.x-.5)*(coord.x-.5)+.018*sin(coord.x*6.283);
  if(kind>.5) bend+=.022*sin(coord.x*20.+coord.y*15.);
  float frequency=kind>.5?8.:6.;
  return (kind>.5?.82:.73)*howWoodStripe((coord.y+bend)*frequency,footprint*frequency);
}`;
const caches=new WeakMap<Resources,Map<string,THREE.MeshStandardMaterial>>();
/** Separate owner-cached materials: never patch a shared plain palette material. */
export function woodMaterial(r:Resources,color:string,roughness=.82,vertexColors=false){
  if(r.disposed)throw new Error('Resource owner destroyed');
  let cache=caches.get(r);if(!cache){cache=new Map();caches.set(r,cache);}
  const key=`${color}:${roughness}:${vertexColors}`;const existing=cache.get(key);if(existing)return existing;
  const material=r.own(new THREE.MeshStandardMaterial({color,roughness,vertexColors}));
  material.name='procedural-wood';material.userData.proceduralWood=true;
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute vec3 woodCoord; attribute vec3 woodTone; varying vec3 vHowWood; varying vec3 vHowWoodTone;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvHowWood=woodCoord;vHowWoodTone=woodTone.x>0.?woodTone:vec3(1.);');
    shader.fragmentShader='varying vec3 vHowWood;varying vec3 vHowWoodTone;\n'+fragmentFunctions+'\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      diffuseColor.rgb*=vHowWoodTone;
      float howFootprint=max(length(dFdx(vHowWood.xy)),length(dFdy(vHowWood.xy)));
      float howDetail=(1.-smoothstep(${1/WOOD_GRAIN.fullDetailPixels},${1/WOOD_GRAIN.noDetailPixels},howFootprint))
        *(1.-smoothstep(${WOOD_GRAIN.distanceFadeStart.toFixed(1)},${WOOD_GRAIN.distanceFadeEnd.toFixed(1)},length(vViewPosition)));
      if(howDetail>0.)diffuseColor.rgb*=1.-${WOOD_GRAIN.strength}*howDetail*howWoodInk(vHowWood.xy,vHowWood.z,howFootprint);
    `);
  };
  material.customProgramCacheKey=()=> 'how-wood-r3-stable-tone-v1';
  cache.set(key,material);return material;
}
