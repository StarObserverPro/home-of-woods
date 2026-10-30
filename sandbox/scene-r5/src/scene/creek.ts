import * as THREE from 'three';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {WORLD} from '../content/world.ts';
import {WATER_BUDGET} from '../content/scene-review.ts';
import {riverX} from '../world/surface.ts';
import type {Resources} from './resources.ts';
const shader={name:'R5 faceted reflective creek',uniforms:{color:{value:new THREE.Color()},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()},time:{value:0},day:{value:1},hasReflection:{value:1}},
vertexShader:`uniform mat4 textureMatrix;varying vec4 reflectionUv;varying vec3 w;varying vec2 riverUv;void main(){reflectionUv=textureMatrix*vec4(position,1.);w=(modelMatrix*vec4(position,1.)).xyz;riverUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
fragmentShader:`uniform sampler2D tDiffuse;uniform float time,day,hasReflection;varying vec4 reflectionUv;varying vec3 w;varying vec2 riverUv;
void main(){float across=abs(riverUv.x*2.-1.);float a=sin(w.z*1.4-time*1.65+w.x*.55);float b=sin(w.z*.51+w.x*2.1-time*.8);vec2 distort=vec2(a,b)*.0019;vec4 q=reflectionUv;q.xy+=distort*q.w;vec3 reflected=texture2DProj(tDiffuse,q).rgb;
float fresnel=pow(1.-max(0.,normalize(cameraPosition-w).y),3.);vec3 deep=mix(vec3(.012,.052,.083),vec3(.035,.24,.25),day);vec3 shallow=mix(vec3(.035,.1,.14),vec3(.15,.49,.40),day);vec3 base=mix(deep,shallow,pow(across,2.)*.8);
vec3 water=mix(base,reflected,hasReflection*(.32+.4*fresnel));
float glint=pow(max(0.,sin(w.z*2.8-time*2.+w.x*3.3)),40.)*pow(max(0.,sin(w.x*1.9+w.z*.41)),16.);water+=vec3(.85,.93,.79)*glint*(.055+.24*day);
float edge=smoothstep(.79,.98,across);float foam=edge*(.13+.24*step(.4,a))+.04*pow(max(0.,a),20.);water=mix(water,vec3(.61,.80,.72)*(.35+.65*day),foam);
gl_FragColor=vec4(water,1.);#include <tonemapping_fragment>
#include <colorspace_fragment>
}`.replace('1.);#','1.);\n#')};
export function createCreek(r:Resources,surface:THREE.Mesh){
  const group=new THREE.Group();group.name='reflective-creek-and-rapids';
  const geometry=r.own(surface.geometry.clone().rotateX(Math.PI/2));
  const reflector=new Reflector(geometry,{textureWidth:512,textureHeight:512,multisample:0,clipBias:.005,shader});
  reflector.rotation.x=-Math.PI/2;reflector.position.copy(surface.position);reflector.name='bounded-planar-river-reflection';group.add(reflector);
  const material=reflector.material as THREE.ShaderMaterial;r.own(material);r.own(reflector.getRenderTarget());surface.visible=false;
  const original=reflector.onBeforeRender;let frame=0,passes=0,enabled=true,reduced=false,disposed=false,mobile=false,visualTime=0,invalidated=true,lastDay=1;
  // Cache the mirrored scene. Do not render shadows a second time for water.
  reflector.onBeforeRender=function(renderer,scene,camera,geometry,mat,group){if(disposed)return;frame++;if(!enabled||(!invalidated&&(reduced||frame%(mobile?4:3)!==0)))return;invalidated=false;const auto=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false;try{original.call(reflector,renderer,scene,camera,geometry,mat,group);passes++;}finally{renderer.shadowMap.autoUpdate=auto;}};
  const rockGeo=r.geometry('r5-stream-rock',()=>new THREE.IcosahedronGeometry(1,0)),rockMat=r.material('#647b79',.86);
  const rocks=new THREE.InstancedMesh(rockGeo,rockMat,WATER_BUDGET.rapidRocks),dummy=new THREE.Object3D();
  const centers=[{z:36,offset:-1.1},{z:54,offset:.7},{z:77,offset:-.8}];
  for(let i=0;i<9;i++){const c=centers[Math.floor(i/3)],z=c.z+(i%3-1)*1.4,x=riverX(z)+c.offset+(i%3-1)*1.2;dummy.position.set(x,WORLD.waterY-.15,z);dummy.rotation.set(.2,i*1.7,.1);dummy.scale.set(.6+(i%3)*.18,.65,.95);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);}rocks.receiveShadow=true;group.add(rocks);
  const foamMat=r.own(new THREE.MeshBasicMaterial({color:'#d7f0e7',transparent:true,opacity:.64,depthWrite:false}));
  const foam=new THREE.InstancedMesh(r.geometry('r5-rapid-foam',()=>new THREE.PlaneGeometry(1,1)),foamMat,36);group.add(foam);
  const spray=new THREE.InstancedMesh(r.geometry('r5-water-drops',()=>new THREE.IcosahedronGeometry(1,0)),r.material('#d3eee8',.28),48);group.add(spray);
  return {group,update(time:number,day:number,reduce:boolean,reflect:boolean,isMobile:boolean){
    if(disposed)return;if(!reduce)visualTime=time;reduced=reduce;
    if(enabled!==reflect||Math.abs(lastDay-day)>.04){invalidated=true;lastDay=day;}enabled=reflect;
    if(mobile!==isMobile){mobile=isMobile;reflector.getRenderTarget().setSize(mobile?256:512,mobile?256:512);invalidated=true;}
    material.uniforms.time.value=visualTime;material.uniforms.day.value=day;material.uniforms.hasReflection.value=enabled?1:0;foamMat.color.setRGB(.38+.48*day,.53+.4*day,.55+.34*day);
    for(let i=0;i<36;i++){const c=centers[i%3],phase=(visualTime*.36+i*.618)%1,z=c.z+phase*5+1,x=riverX(z)+c.offset+Math.sin(i*2.4)*1.05;dummy.position.set(x,WORLD.waterY+.026,z);dummy.rotation.set(-Math.PI/2,0,-.65);dummy.scale.set(.1+.22*Math.sin(i),.32+phase*.8,1);dummy.updateMatrix();foam.setMatrixAt(i,dummy.matrix);}
    for(let i=0;i<48;i++){const c=centers[i%3],p=(visualTime*.73+i*.618)%1,z=c.z+Math.sin(i*2)*.9+p*1.3,x=riverX(z)+c.offset+Math.cos(i*2.9)*.9;dummy.position.set(x,WORLD.waterY+.2+Math.sin(p*Math.PI)*.62,z);dummy.rotation.set(0,i,0);dummy.scale.setScalar((.035+.045*(i%4)/4)*Math.sin(p*Math.PI));dummy.updateMatrix();spray.setMatrixAt(i,dummy.matrix);}
    foam.instanceMatrix.needsUpdate=true;spray.instanceMatrix.needsUpdate=true;foam.computeBoundingSphere();spray.computeBoundingSphere();
  },invalidate(){invalidated=true;},stats:()=>({reflectionSize:mobile?256:512,interval:mobile?4:3,reflectionPasses:passes,renderTargets:1,rocks:9,spray:48,foam:36,enabled,disposed}),dispose(){if(disposed)return;disposed=true;surface.visible=true;group.removeFromParent();group.clear();}};
}
