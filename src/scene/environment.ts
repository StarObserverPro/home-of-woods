import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { ENVIRONMENT_STYLE, MOUNTAINS } from "../content/environment.ts";
import type { MountainDefinition } from "../content/environment.ts";
import type { Resources } from "./resources.ts";

const clamp=THREE.MathUtils.clamp;
const smooth=THREE.MathUtils.smoothstep;
const hash=(x:number,z:number,seed:number)=>{
  let n=Math.imul(x+seed,374761393)^Math.imul(z-seed,668265263);
  n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;
};
function patchNoise(x:number,z:number,seed:number){
  const ix=Math.floor(x),iz=Math.floor(z),u=smooth(x-ix,0,1),v=smooth(z-iz,0,1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix,iz,seed),hash(ix+1,iz,seed),u),THREE.MathUtils.lerp(hash(ix,iz+1,seed),hash(ix+1,iz+1,seed),u),v);
}
const volcanoProfile:readonly (readonly[number,number])[]=[[0,.94],[.10,.99],[.25,.88],[.43,.65],[.64,.36],[.86,.13],[1.08,0]];
const glacierChannels:readonly (readonly[number,number,number])[]=[[-2.7,.14,.080],[-1.68,.13,.095],[-.54,.18,.105],[.55,.16,.085],[1.62,.18,.095],[2.45,.13,.078]];
function profileAt(r:number){
  for(let i=1;i<volcanoProfile.length;i++)if(r<volcanoProfile[i][0]){
    const a=volcanoProfile[i-1],b=volcanoProfile[i],t=smooth(r,a[0],b[0]);return THREE.MathUtils.lerp(a[1],b[1],t);
  }return 0;
}
function angleDistance(a:number,b:number){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function volcanoCoordinates(nx:number,nz:number){
  const dx=nx-.045,nzWarp=nz+.035+nx*.11,r=Math.hypot(dx,nzWarp),theta=Math.atan2(nzWarp,dx);
  return{theta,radius:r/(1+.055*Math.cos(theta*3+.4)+.035*Math.cos(theta*5-1.2))};
}
function glacierField(theta:number,radius:number){
  let depth=0,channel=0;
  for(const [a,width,amount] of glacierChannels){
    const weight=Math.exp(-((angleDistance(theta,a+.14*radius)/width)**2));
    depth+=amount*weight;channel=Math.max(channel,weight);
  }
  return{depth,channel};
}
function mountainHeight(spec:MountainDefinition,x:number,z:number){
  const nx=(x-spec.center[0])/spec.radius[0],nz=(z-spec.center[1])/spec.radius[1];
  const edge=1-smooth(Math.max(Math.abs(nx),Math.abs(nz)),.82,1);
  if(!edge)return spec.baseY;
  let h=0;
  if(spec.kind==='volcano'){
    // A broad apron, uneven summit shoulder and radial ice-carved basins, rather than a cone.
    const {theta,radius}=volcanoCoordinates(nx,nz);
    h=profileAt(radius);
    h+=.032*Math.exp(-(((nx+.12)/.13)**2+((nz+.02)/.13)**2));
    h-=.027*Math.exp(-(((nx-.04)/.10)**2+((nz+.015)/.08)**2));
    const apron=smooth(radius,.14,.44)*(1-smooth(radius,.78,1.05));
    h-=glacierField(theta,radius).depth*apron;
    h+=.035*(patchNoise(nx*5,nz*5,spec.seed)-.5)*smooth(radius,.1,.4);
  }else{
    const spine=spec.spine!;
    let index=spine.findIndex(p=>p[0]>=nx);index=clamp(index<0?spine.length-1:index,1,spine.length-1);
    const a=spine[index-1],b=spine[index],t=clamp((nx-a[0])/(b[0]-a[0]),0,1);
    const crestZ=THREE.MathUtils.lerp(a[1],b[1],t),crestH=THREE.MathUtils.lerp(a[2],b[2],t);
    const cross=Math.abs(nz-crestZ);
    const shoulder=Math.pow(Math.max(0,1-cross/.96),.82);
    h=crestH*shoulder;
    // Non-repeating cirques break the broad transverse planes and leave connecting arêtes.
    for(let i=1;i<spine.length-1;i+=2){
      const p=spine[i],cx=p[0]+.11,cz=p[1]+.38;
      h-=.10*Math.exp(-(((nx-cx)/.16)**2+((nz-cz)/.20)**2));
    }
    h+=.028*(patchNoise(nx*6,nz*5,spec.seed)-.5)*shoulder;
  }
  return spec.baseY+spec.height*Math.max(0,h)*edge;
}

/** Actual generated geometry is exported for the geometry/resource gate. */
export function buildMountainGeometry(spec:MountainDefinition){
  const [sx,sz]=spec.segments,positions:number[]=[],indices:number[]=[];
  for(let zi=0;zi<=sz;zi++)for(let xi=0;xi<=sx;xi++){
    const nx=xi/sx*2-1,nz=zi/sz*2-1;
    const x=spec.center[0]+nx*spec.radius[0],z=spec.center[1]+nz*spec.radius[1];
    positions.push(x,mountainHeight(spec,x,z),z);
  }
  for(let z=0;z<sz;z++)for(let x=0;x<sx;x++){
    const a=z*(sx+1)+x,b=a+1,c=a+sx+1,d=c+1;
    if((x+z)%2)indices.push(a,c,d,a,d,b);else indices.push(a,c,b,b,c,d);
  }
  const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));indexed.setIndex(indices);
  const geometry=indexed.toNonIndexed();indexed.dispose();geometry.computeVertexNormals();
  const p=geometry.getAttribute('position'),colors=new Float32Array(p.count*3),surfaces=new Float32Array(p.count);
  const green=new THREE.Color('#3d5f5d'),rock=new THREE.Color('#5c6670'),shadowRock=new THREE.Color('#394a5c');
  const snow=new THREE.Color('#f3f6f0'),ice=new THREE.Color('#76aec8'),haze=new THREE.Color().fromArray(ENVIRONMENT_STYLE.airColor);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3(),color=new THREE.Color();
  for(let i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
    const x=(a.x+b.x+c.x)/3,z=(a.z+b.z+c.z)/3,y=(a.y+b.y+c.y)/3,rel=(y-spec.baseY)/spec.height;
    normal.crossVectors(c.clone().sub(b),a.clone().sub(b)).normalize();
    const variation=patchNoise(x/27,z/25,spec.seed);
    const {theta,radius}=volcanoCoordinates((x-spec.center[0])/spec.radius[0],(z-spec.center[1])/spec.radius[1]);
    const gully=spec.kind==='volcano'?glacierField(theta,radius).channel:.5+.5*Math.cos(theta*7+.25);
    const snowThreshold=spec.snowLine+(1-Math.abs(normal.y))*.18+(variation-.5)*.11-gully*.085;
    let surface=0;
    color.copy(green).lerp(rock,smooth(rel,.15,.49));
    color.lerp(shadowRock,clamp((1-normal.y)*.35,0,.3));
    const glacier=spec.kind==='volcano'&&gully>.48&&rel>.38&&rel<.86;
    if(rel>snowThreshold||glacier){
      surface=1;
      color.copy(snow).lerp(ice,glacier?.62:.16*(1-Math.abs(normal.y)));
      if(glacier)surface=2;
    }
    color.multiplyScalar(.97+variation*.055).lerp(haze,spec.haze);
    for(let k=0;k<3;k++){color.toArray(colors,(i+k)*3);surfaces[i+k]=surface;}
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('surfaceType',new THREE.BufferAttribute(surfaces,1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.name=`pnw-${spec.id}`;
  return geometry;
}

const AIR_GLSL=`
uniform vec3 pnwAirColor;
uniform float pnwAirDensity;
uniform float pnwAirHeight;
uniform vec3 pnwSnowDiffuseFloor;
uniform vec3 pnwIceDiffuseFloor;
uniform vec3 pnwSunDirection;
varying vec3 vPnwWorld;
varying vec3 vPnwWorldNormal;
varying float vPnwSurfaceType;
vec3 pnwSnowFill(vec3 radiance){
  // Bright overcast fill within high-albedo snow survives a backlit face.
  // The floor is surface-classified and keeps directional faceting; rocks receive no fill.
  float snowMask=step(.5,vPnwSurfaceType);
  float iceMask=step(1.5,vPnwSurfaceType);
  float facet=.76+.24*max(0.,dot(normalize(vPnwWorldNormal),pnwSunDirection));
  vec3 floorRadiance=mix(pnwSnowDiffuseFloor,pnwIceDiffuseFloor,iceMask)*facet;
  return mix(radiance,max(radiance,floorRadiance),snowMask);
}
vec3 pnwLandAtmosphere(vec3 radiance){
  float distanceToEye=length(vPnwWorld-cameraPosition);
  float meanHeight=max(0.,(vPnwWorld.y+cameraPosition.y)*.5);
  float opticalDepth=pnwAirDensity*distanceToEye*exp(-meanHeight/pnwAirHeight);
  return mix(radiance,pnwAirColor,1.-exp(-opticalDepth));
}`;

export function createEnvironment(resources:Resources,options:{renderer?:THREE.WebGLRenderer}={}){
  const group=new THREE.Group();group.name='pnw-mountain-and-sky';
  const sunDirection=new THREE.Vector3().fromArray(ENVIRONMENT_STYLE.sunDirection).normalize();
  const sunAltitude=Math.asin(sunDirection.y)*180/Math.PI,cloud=ENVIRONMENT_STYLE.cloudCoverage;
  // A fixed spring daylight adaptation of our own Sky Porch lightingState().
  const daylight=smooth(sunAltitude,-9,12),warm=1-smooth(sunAltitude,2,18);
  const lighting={
    sunDirection,
    sunColor:new THREE.Color(1,.95,.84).lerp(new THREE.Color(1,.48,.19),warm*.83),
    sunIntensity:(.72+2.55*Math.pow(Math.max(0,Math.sin(sunAltitude*Math.PI/180)),.48))*(1-cloud*.82),
    skyColor:new THREE.Color(.38,.48,.65).lerp(new THREE.Color(.53,.62,.76),daylight),
    groundColor:new THREE.Color(.11,.13,.18).lerp(new THREE.Color(.22,.24,.16),daylight),
    ambientIntensity:ENVIRONMENT_STYLE.ambientIntensity,
    haze:new THREE.Color(.012,.019,.03).lerp(new THREE.Color().fromArray(ENVIRONMENT_STYLE.airColor),daylight),
    environmentIntensity:ENVIRONMENT_STYLE.environmentIntensity,
    recommendedExposure:ENVIRONMENT_STYLE.recommendedExposure,
  };
  const airUniforms={
    pnwAirColor:{value:lighting.haze},pnwAirDensity:{value:ENVIRONMENT_STYLE.airDensity},pnwAirHeight:{value:ENVIRONMENT_STYLE.airHeight},
    pnwSnowDiffuseFloor:{value:new THREE.Color().fromArray(ENVIRONMENT_STYLE.snowDiffuseFloor)},
    pnwIceDiffuseFloor:{value:new THREE.Color().fromArray(ENVIRONMENT_STYLE.iceDiffuseFloor)},
    pnwSunDirection:{value:sunDirection},
  };
  const mountainMaterial=resources.own(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.91,metalness:0,flatShading:true,fog:false}));
  mountainMaterial.name='pnw-snow-rock-and-air';
  mountainMaterial.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,airUniforms);
    shader.vertexShader='attribute float surfaceType;\nvarying vec3 vPnwWorld;\nvarying vec3 vPnwWorldNormal;\nvarying float vPnwSurfaceType;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPnwWorld=(modelMatrix*vec4(transformed,1.)).xyz;\nvPnwWorldNormal=normalize(mat3(modelMatrix)*normal);\nvPnwSurfaceType=surfaceType;');
    shader.fragmentShader=AIR_GLSL+'\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight=pnwLandAtmosphere(pnwSnowFill(outgoingLight));\n#include <opaque_fragment>');
  };
  mountainMaterial.customProgramCacheKey=()=> 'pnw-mountain-air-snow-fill-r4';
  for(const spec of MOUNTAINS){
    const geometry=resources.geometry(`pnw-mountain-${spec.id}-r4`,()=>buildMountainGeometry(spec));
    const mesh=new THREE.Mesh(geometry,mountainMaterial);mesh.name=spec.id;mesh.renderOrder=-5;group.add(mesh);
  }
  const sky=new Sky();sky.name='sky-porch-daylight';sky.scale.setScalar(10000);sky.frustumCulled=false;sky.renderOrder=-100;
  resources.own(sky.geometry);resources.own(sky.material);
  const u=sky.material.uniforms;
  u.pnwSkyRadianceScale={value:ENVIRONMENT_STYLE.skyRadianceScale};
  u.pnwSkyTint={value:new THREE.Color().fromArray(ENVIRONMENT_STYLE.skyTint)};
  sky.material.fragmentShader='uniform float pnwSkyRadianceScale;\nuniform vec3 pnwSkyTint;\n'+sky.material.fragmentShader;
  sky.material.fragmentShader=sky.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );','gl_FragColor = vec4( texColor * pnwSkyTint * pnwSkyRadianceScale, 1.0 );');
  for(const key of ['turbidity','rayleigh','mieCoefficient','mieDirectionalG','cloudCoverage','cloudDensity','cloudScale','cloudSpeed'] as const)u[key].value=ENVIRONMENT_STYLE[key];
  u.cloudElevation.value=.38;u.sunPosition.value.copy(sunDirection);u.showSunDisc.value=1;
  group.add(sky);
  let environmentTarget:THREE.WebGLRenderTarget|null=null;
  if(options.renderer){
    const generator=new THREE.PMREMGenerator(options.renderer),capture=new THREE.Scene(),captureSky=new THREE.Mesh(sky.geometry,sky.material);
    captureSky.scale.copy(sky.scale);captureSky.frustumCulled=false;capture.add(captureSky);
    u.showSunDisc.value=0;
    try{environmentTarget=resources.own(generator.fromScene(capture,.035,.1,1100,{size:128}));}
    finally{generator.dispose();capture.clear();u.showSunDisc.value=1;}
  }
  let disposed=false,visualTime=0;
  return{
    group,lighting,environmentMap:environmentTarget?.texture??null,
    update(elapsed:number,_dt:number,cameraPosition?:THREE.Vector3,reducedMotion=false){
      if(disposed)return;
      if(cameraPosition)sky.position.copy(cameraPosition);
      if(!reducedMotion)visualTime=elapsed;
      u.time.value=visualTime;
    },
    stats(){
      let triangles=0,meshes=0;const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
      group.traverse(o=>{if(o instanceof THREE.Mesh){meshes++;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;}});
      return{meshes,geometryTriangles:triangles,geometries:geometries.size,materials:materials.size,environmentMap:!!environmentTarget,pmremSize:environmentTarget?128:0,visualTime,disposed};
    },
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();},
  };
}

/** Replaces only the appearance of the existing world-owned river surface. */
export function createRiverAppearance(resources:Resources,surface:THREE.Mesh){
  const previous=surface.material,time={value:0};let disposed=false,visualTime=0;
  const material=resources.own(new THREE.MeshStandardMaterial({color:0xffffff,roughness:.31,metalness:0,transparent:false,envMapIntensity:.32}));
  material.name='pnw-flowing-creek';
  const deep=new THREE.Color('#238f9c'),shallow=new THREE.Color('#73c6ad'),foam=new THREE.Color('#d8eee0');
  const uniforms={riverTime:time,riverDeep:{value:deep},riverShallow:{value:shallow},riverFoam:{value:foam}};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec2 vRiverUv;varying vec3 vRiverWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRiverUv=uv;vRiverWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader=`uniform float riverTime;uniform vec3 riverDeep;uniform vec3 riverShallow;uniform vec3 riverFoam;varying vec2 vRiverUv;varying vec3 vRiverWorld;\n`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float riverAcross=abs(vRiverUv.x*2.-1.);
      float riverPhase=vRiverWorld.z*.66-riverTime*1.1+sin(vRiverWorld.x*.37)*.7;
      float riverBands=sin(riverPhase*1.4+vRiverUv.x*8.)*.5+.5;
      float riverLongStreak=pow(max(0.,sin(vRiverWorld.z*1.52-riverTime*2.0+vRiverUv.x*26.)),14.);
      float riverEdge=smoothstep(.76,.99,riverAcross);
      float riverFoamAmount=riverEdge*(.10+.44*riverBands)+riverLongStreak*.09*(1.-riverEdge);
      diffuseColor.rgb=mix(riverDeep,riverShallow,pow(riverAcross,.65)*.68+riverBands*.045);
      diffuseColor.rgb=mix(diffuseColor.rgb,riverFoam,riverFoamAmount);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
      float riverWx=cos(vRiverWorld.x*1.7+vRiverWorld.z*.18+riverTime*.45)*.022;
      float riverWz=cos(vRiverWorld.z*.90-riverTime*1.25+vRiverUv.x*7.)*.045;
      normal=normalize(normal+mat3(viewMatrix)*vec3(riverWx,0.,riverWz));
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+sin(riverPhase)*.035,.25,.38);');
  };
  material.customProgramCacheKey=()=> 'pnw-flowing-creek-r4';surface.material=material;
  return{
    update(elapsed:number,_dt:number,reducedMotion=false){if(disposed)return;if(!reducedMotion)visualTime=elapsed;time.value=visualTime;},
    stats:()=>({materials:1,additionalGeometry:0,additionalTextures:0,visualTime,disposed}),
    dispose(){if(disposed)return;disposed=true;if(surface.material===material)surface.material=previous;},
  };
}
