import * as THREE from 'three';
import {clamp,mix,smooth} from '../world/horizon.js';

// Height and width are authored independently: an asymmetric massif with a
// connected summit ridge, long rock buttresses, snowfields and carved hollows.

function crest(spec,nx){
 const a=spec.spine;let j=a.findIndex(p=>p[0]>=nx);j=clamp(j<0?a.length-1:j,1,a.length-1);const l=a[j-1],r=a[j],t=clamp((nx-l[0])/(r[0]-l[0]),0,1);
 return {z:mix(l[1],r[1],t),h:mix(l[2],r[2],t)};
}
export function massHeight(spec,nx,nz){
 const ridge=crest(spec,nx),cross=nz-ridge.z,side=cross>0?1.03:.69;
 let h=ridge.h*Math.pow(Math.max(0,1-Math.abs(cross)/side),cross>0?1.13:.83);
 // The spurs radiate obliquely; gullies between them expose darker rock.
 const spurs=Math.abs(Math.sin((nx+cross*.31)*19+spec.seed*.17));
 h+=.085*Math.pow(spurs,4)*Math.sin(Math.PI*clamp(cross,0,1))*(.45+ridge.h);
 for(let i=2;i<spec.spine.length-2;i+=2){const p=spec.spine[i];h-=.055*Math.exp(-(((nx-p[0]-.11)/.09)**2+((nz-p[1]-.34)/.19)**2));}
 h+=(Math.sin(nx*43+nz*13+spec.seed)*Math.cos(nz*29-nx*9))*.009*smooth(.08,.3,Math.abs(cross));
 const edge=1-smooth(.88,1,Math.max(Math.abs(nx),Math.abs(nz)));
 return spec.baseY+spec.height*Math.max(0,h)*edge;
}
export function buildMountainGeometry(spec){
 const [sx,sz]=spec.segments,positions=[],indices=[];
 for(let j=0;j<=sz;j++)for(let i=0;i<=sx;i++){
  const nx=i/sx*2-1,nz=j/sz*2-1;
  positions.push(spec.center[0]+nx*spec.radius[0],massHeight(spec,nx,nz),spec.center[1]+nz*spec.radius[1]);
 }
 for(let j=0;j<sz;j++)for(let i=0;i<sx;i++){
  const a=j*(sx+1)+i,b=a+1,c=a+sx+1,d=c+1;
  if((i+j)%2)indices.push(a,c,d,a,d,b);else indices.push(a,c,b,b,c,d);
 }
 // Back and side shells end beneath the continuous apron; no one-sided backdrop.
 const perimeter=[];for(let i=0;i<sx;i++)perimeter.push(i);for(let j=0;j<sz;j++)perimeter.push(j*(sx+1)+sx);for(let i=sx;i>0;i--)perimeter.push(sz*(sx+1)+i);for(let j=sz;j>0;j--)perimeter.push(j*(sx+1));
 const bottom=positions.length/3;positions.push(spec.center[0],-65,spec.center[1]);
 for(let i=0;i<perimeter.length;i++)indices.push(perimeter[i],perimeter[(i+1)%perimeter.length],bottom);
 const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));indexed.setIndex(indices);
 const g=indexed.toNonIndexed();indexed.dispose();g.computeVertexNormals();
 const p=g.getAttribute('position'),n=g.getAttribute('normal'),colors=[],types=[];
 const rock=new THREE.Color('#586773'),snow=new THREE.Color('#f0eee6'),ice=new THREE.Color('#a1c5d5'),c=new THREE.Color();
 for(let i=0;i<p.count;i+=3){
  const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3;
  const nx=(x-spec.center[0])/spec.radius[0],nz=(z-spec.center[1])/spec.radius[1],h=(y-spec.baseY)/spec.height,up=n.getY(i),r=crest(spec,nx);
  const gully=.5+.5*Math.sin((nx+(nz-r.z)*.31)*19+spec.seed*.17);
  const snowLine=spec.snowLine+.065*Math.sin(nx*9+spec.seed)-.13*(1-gully)+.14*(1-up);
  const deposit=h>snowLine&&up>.37;
  c.copy(rock).multiplyScalar(.92+.11*Math.sin(x*.043+z*.031));
  if(deposit)c.copy(snow).lerp(ice,clamp((1-up)*.45+(1-gully)*.16,0,.42));
  else if(h>snowLine-.14&&gully<.23&&up>.60)c.copy(ice).lerp(snow,.28);
  for(let k=0;k<3;k++){c.toArray(colors,(i+k)*3);types[i+k]=deposit?1:(h>snowLine-.14&&gully<.23&&up>.60?2:0);}
 }
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('surfaceType',new THREE.Float32BufferAttribute(types,1));g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function mountainMaterial(air){
 const m=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:0,flatShading:true,fog:false});
 // Altitude-dependent air perspective; snow still receives the same directional
// light as rock, so the great faces retain their scale and shadow hierarchy.
 m.onBeforeCompile=shader=>{
  shader.uniforms.horizonAir=air;
  shader.vertexShader='varying vec3 vMountainWorld;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvMountainWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader='uniform vec3 horizonAir;varying vec3 vMountainWorld;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`float air=1.-exp(-length(vMountainWorld-cameraPosition)*.00046*exp(-max(0.,vMountainWorld.y)*.003));outgoingLight=mix(outgoingLight,horizonAir,air);\n#include <opaque_fragment>`);
 };m.customProgramCacheKey=()=> 'horizon-r1-mountain-air';return m;
}
