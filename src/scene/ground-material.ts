import * as THREE from 'three';
import {GROUND_PLAN} from '../content/biomes.ts';
import {PALETTE,PATH,RIVER_KNOTS} from '../content/world.ts';
import type {Resources} from './resources.ts';

const number=(v:number)=>v.toFixed(5);
const rgb=(hex:string)=>{
  const c=new THREE.Color(hex);return `vec3(${number(c.r)},${number(c.g)},${number(c.b)})`;
};
export function createGroundMaterial(r:Resources){
  const material=r.own(new THREE.MeshStandardMaterial({color:PALETTE.grass,roughness:.76,metalness:0}));
  const zones=(list:typeof GROUND_PLAN.woodland|typeof GROUND_PLAN.clearings,name:string)=>list.map(p=>
    `${name}=max(${name},(1.-smoothstep(.5,1.,length((p-vec2(${number(p.x)},${number(p.z)}))/vec2(${number(p.rx)},${number(p.rz)}))))*${number(p.weight)});`).join('\n');
  const roads=PATH.slice(1).map((b,i)=>{
    const a=PATH[i];return `roadD=min(roadD,segmentD(p,vec2(${number(a.x)},${number(a.z)}),vec2(${number(b.x)},${number(b.z)})));`;
  }).join('\n');
  const river=RIVER_KNOTS.slice(1).map((b,i)=>{
    const a=RIVER_KNOTS[i];
    const condition=i===0?`p.y<${number(b.z)}`:i===RIVER_KNOTS.length-2?`p.y>=${number(a.z)}`:`p.y>=${number(a.z)}&&p.y<${number(b.z)}`;
    return `if(${condition})bedX=${number(a.x)}+(${number(b.x-a.x)})*(p.y-(${number(a.z)}))/${number(b.z-a.z)};`;
  }).join('\n');
  const helpers=`
varying vec2 vGroundXZ;
varying float vGroundUp;
float patchHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float patchNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(patchHash(i),patchHash(i+vec2(1.,0.)),f.x),mix(patchHash(i+vec2(0.,1.)),patchHash(i+vec2(1.,1.)),f.x),f.y);}
float segmentD(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.));}
vec3 groundCover(vec2 p){
 float forest=0.,clearing=0.;
 ${zones(GROUND_PLAN.woodland,'forest')}
 ${zones(GROUND_PLAN.clearings,'clearing')}
 forest*=1.-clearing;
 // Quantized cells inside broad coherent fields produce planned digital edges, not noisy grain.
 vec2 tiles=floor(p/${number(GROUND_PLAN.tileSize)});
 float cellTone=patchNoise(tiles/${number(GROUND_PLAN.patternSpan)});
 vec3 meadow=mix(${rgb(GROUND_PLAN.meadow[0])},${rgb(GROUND_PLAN.meadow[1])},step(.38,cellTone));
 meadow=mix(meadow,${rgb(GROUND_PLAN.meadow[2])},step(.64,cellTone));
 vec3 litter=mix(${rgb(GROUND_PLAN.understory[0])},${rgb(GROUND_PLAN.understory[1])},step(.37,cellTone));
 litter=mix(litter,${rgb(GROUND_PLAN.understory[2])},step(.66,cellTone));
 vec3 cover=mix(meadow,litter,forest);
 float bedX=0.;${river}
 float bankD=abs(p.x-bedX);
 cover=mix(cover,${rgb(GROUND_PLAN.verge)},(1.-smoothstep(7.,14.,bankD))*.54);
 cover=mix(cover,${rgb(GROUND_PLAN.bank)},1.-smoothstep(4.3,7.2,bankD));
 float steep=1.-smoothstep(.45,.72,vGroundUp);
 cover=mix(cover,${rgb(GROUND_PLAN.scree)}*(.94+.06*step(.54,cellTone)),steep*.78);
 float roadD=10000.;${roads}
 return mix(cover,${rgb(PALETTE.path)},1.-smoothstep(2.4,2.65,roadD));
}`;
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 vGroundXZ;varying float vGroundUp;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGroundXZ=position.xz;vGroundUp=abs(normal.y);');
    shader.fragmentShader=helpers+'\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=groundCover(vGroundXZ);');
  };
  material.customProgramCacheKey=()=>`r4-planned-ground-${JSON.stringify(GROUND_PLAN)}-${JSON.stringify(PATH)}-${JSON.stringify(RIVER_KNOTS)}`;
  material.name='planned-understory-meadow-digital-blocks';
  return material;
}
