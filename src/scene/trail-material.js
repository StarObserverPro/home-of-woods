import * as THREE from 'three';
import {ROUTES} from '../world/horizon.js';

// The route is part of the ground's own material. There is no second height
// field or ribbon mesh that can cut through an adaptive terrain triangle.
export function paintSceneryTrails(material){
 const previous=material.onBeforeCompile,priorKey=material.customProgramCacheKey.bind(material);
 const number=n=>Number(n).toFixed(5),blocks=[];
 for(const route of ROUTES){
  const lengths=route.points.slice(1).map((b,i)=>Math.hypot(b[0]-route.points[i][0],b[1]-route.points[i][1])),total=lengths.reduce((a,b)=>a+b),xs=route.points.map(p=>p[0]),zs=route.points.map(p=>p[1]);let offset=0;
  const segments=lengths.map((length,i)=>{const a=route.points[i],b=route.points[i+1],start=offset/total;offset+=length;return `{
   vec2 a=vec2(${a.map(number)}),b=vec2(${b.map(number)}),v=b-a;
   float t=clamp(dot(p-a,v)/dot(v,v),0.,1.);
   float progress=${number(start)}+t*${number(length/total)};
   float width=${number(route.width)}${route.gate?'*(1.-.70*smoothstep(.82,1.,progress))':''};
   float edge=1.-smoothstep(width-.12,width+.20,length(p-a-v*t));
   mask=max(mask,edge${route.gate?'*(1.-smoothstep(.78,1.,progress))':''});
  }`;});
  const padding=route.width+.25;
  blocks.push(`if(p.x>${number(Math.min(...xs)-padding)}&&p.x<${number(Math.max(...xs)+padding)}&&p.y>${number(Math.min(...zs)-padding)}&&p.y<${number(Math.max(...zs)+padding)}){${segments.join('\n')}}`);
 }
 const dirt=new THREE.Color('#b99970');
 const glsl=`
 vec3 sceneryTrail(vec3 ground,vec2 p){
  float mask=0.;${blocks.join('\n')}
  vec3 trail=vec3(${[dirt.r,dirt.g,dirt.b].map(number)});
  trail*=.97+.06*sin(p.x*.9)*sin(p.y*.83);
  return mix(ground,trail,mask);
 }
 `;
 material.onBeforeCompile=function(shader,...args){
  previous.call(this,shader,...args);
  shader.fragmentShader=glsl+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>','diffuseColor.rgb=sceneryTrail(diffuseColor.rgb,vGroundXZ);\n#include <alphamap_fragment>');
 };
 const key=priorKey();material.customProgramCacheKey=()=>`${key}-terrain-painted-trails-r2`;
 material.userData.sceneryTrails={registration:'terrain-material',routes:ROUTES.map(route=>route.id),independentRoadMeshes:0};
 return material;
}
