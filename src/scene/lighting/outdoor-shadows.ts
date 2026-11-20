import * as THREE from 'three';
import {SHADOW_PROFILES} from '../../content/shadows.ts';
import {bakeProjectedCanopyField,normalizeShadowDirection,snappedShadowPose} from '../../world/shadow-field.ts';
import type {ProjectedCanopy,ProjectedCanopyField,ShadowBounds,ShadowPoint} from '../../world/shadow-field.ts';
import type {Resources} from '../resources.ts';
import type {ShadowBakeRequest,ShadowBakeResponse,ShadowBakeWorker} from '../../world/shadow-field-worker-protocol.ts';

export type OutdoorShadowOptions={renderer:THREE.WebGLRenderer;sun:THREE.DirectionalLight;bounds:ShadowBounds;workerFactory?:()=>ShadowBakeWorker};
export type OutdoorShadowUpdate={focus:ShadowPoint;sunDirection:ShadowPoint;dt:number;night?:number};
export type TreeShadowKind='solid-weight'|'crown'|'solid';
const P=SHADOW_PROFILES.outdoor,C=P.canopy,KEY=':how-outdoor-shadow-v1';

/**
 * One bounded solid map plus a fixed world volume for broad crown transmittance.
 * Bind this before ambient occlusion; dispose AO first. The primary shadow-casting
 * DirectionalLight must be index 0. Point/area/fill lights and indirect light are untouched.
 */
export function createOutdoorShadows(resources:Resources,options:OutdoorShadowOptions){
  const {renderer,sun}=options;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  sun.castShadow=true;sun.shadow.mapSize.set(P.mapSize,P.mapSize);
  Object.assign(sun.shadow.camera,{left:-P.span/2,right:P.span/2,top:P.span/2,bottom:-P.span/2,near:P.near,far:P.far});
  sun.shadow.camera.updateProjectionMatrix();
  const texel=P.span/P.mapSize;
  sun.shadow.normalBias=texel*P.normalBiasTexels;
  sun.shadow.bias=texel*P.depthBiasTexels/(P.far-P.near);
  sun.shadow.radius=P.solidSoftness/texel;
  // The supplied bounds contain real receivers. Put the smooth volume edge outside them,
  // including below the lowest terrain; flat ground must not lie on a zero-shade boundary.
  const padding=options.bounds.min.map((n,i)=>(options.bounds.max[i]-n)/(C.size[i]-1)*(C.boundaryCells+1));
  const bounds:ShadowBounds={
    min:options.bounds.min.map((n,i)=>n-padding[i]) as [number,number,number],
    max:options.bounds.max.map((n,i)=>n+padding[i]) as [number,number,number],
  };
  let field:ProjectedCanopyField|null=null,canopies:readonly ProjectedCanopy[]=[],clock=Infinity,disposed=false,enabled=true,bakes=0,lastBakeMs=0,boundScene:THREE.Object3D|null=null;
  let revision=0,committedRevision=-1,requestId=0,submitted=0,discarded=0,workerErrors=0,totalBakeMs=0,completedBuilds=0,elapsedSeconds=0;
  let worker:ShadowBakeWorker|null=null,inflight:ShadowBakeRequest|null=null,pending:ShadowBakeRequest|null=null,ready:Extract<ShadowBakeResponse,{field:ProjectedCanopyField}>|null=null;
  try{
    worker=options.workerFactory?options.workerFactory():typeof Worker==='function'?new Worker(new URL('../../world/shadow-field-worker.ts',import.meta.url),{type:'module',name:'how-canopy-transmittance'}):null;
  }catch{workerErrors++;}
  const texture=resources.own(new THREE.Data3DTexture(new Uint8Array(C.size[0]*C.size[1]*C.size[2]*2),...C.size));
  texture.name='shared-outdoor-crown-transmittance';texture.format=THREE.RGFormat;texture.type=THREE.UnsignedByteType;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.wrapS=texture.wrapT=texture.wrapR=THREE.ClampToEdgeWrapping;
  texture.unpackAlignment=1;texture.generateMipmaps=false;texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;
  const uniforms={
    howCrownField:{value:texture},howCrownMin:{value:new THREE.Vector3(...bounds.min)},howCrownMax:{value:new THREE.Vector3(...bounds.max)},
    howCrownGrid:{value:new THREE.Vector3(...C.size)},howCrownEnabled:{value:1},
  };
  function stopWorker(){
    if(worker){worker.onmessage=null;worker.onerror=null;worker.terminate();}
    worker=null;inflight=null;pending=null;ready=null;
  }
  function submit(request:ShadowBakeRequest){
    if(!worker||disposed)return;inflight=request;submitted++;
    try{worker.postMessage(request);}catch{workerErrors++;stopWorker();}
  }
  if(worker){
    worker.onmessage=({data})=>{
      if(disposed||!inflight||data.id!==inflight.id)return;
      inflight=null;
      if('error' in data){workerErrors++;stopWorker();return;}
      totalBakeMs+=data.elapsedMs;completedBuilds++;
      if(data.revision===revision&&!pending)ready=data;else discarded++;
      if(pending){const next=pending;pending=null;if(next.revision===revision)submit(next);}
    };
    worker.onerror=()=>{workerErrors++;stopWorker();};
  }
  function commit(next:ProjectedCanopyField,sourceRevision:number,bakeMs:number){
    field=next;lastBakeMs=bakeMs;texture.image.data=next.data;texture.needsUpdate=true;
    committedRevision=sourceRevision;bakes++;clock=0;
  }
  type Binding={compile:THREE.Material['onBeforeCompile'];key:THREE.Material['customProgramCacheKey'];installed:THREE.Material['onBeforeCompile'];onDispose:()=>void};
  const materials=new Map<THREE.Material,Binding>();
  type TreeBinding={kind:TreeShadowKind;castShadow:boolean;previous:THREE.Material|undefined;installed:THREE.Material|undefined;onGeometryDispose:()=>void};
  const trees=new Map<THREE.Mesh,TreeBinding>();
  const depthVariants=new Map<THREE.Material|undefined,THREE.Material>();
  const fragment=`
    varying vec3 vHowCrownPosition;
    uniform highp sampler3D howCrownField;
    uniform vec3 howCrownMin,howCrownMax,howCrownGrid;
    uniform float howCrownEnabled;
    float howPrimaryCrownTransmission(vec3 p){
      if(howCrownEnabled<.5)return 1.;
      vec3 uv=(p-howCrownMin)/(howCrownMax-howCrownMin);
      if(any(lessThan(uv,vec3(0.)))||any(greaterThan(uv,vec3(1.))))return 1.;
      vec3 cells=uv*(howCrownGrid-1.);
      vec2 f=texture(howCrownField,(cells+.5)/howCrownGrid).rg;
      // Conservative upper-height channel prevents a low crown shading an upper receiver.
      if(p.y>=mix(howCrownMin.y,howCrownMax.y,f.g))return 1.;
      vec3 edge=min(cells,howCrownGrid-1.-cells);
      float boundary=smoothstep(0.,${C.boundaryCells.toFixed(1)},min(edge.x,min(edge.y,edge.z)));
      return 1.-f.r*boundary;
    }
  `;
  function releaseMaterial(material:THREE.Material){
    const old=materials.get(material);if(!old)return;
    material.removeEventListener('dispose',old.onDispose);
    if(material.onBeforeCompile===old.installed){material.onBeforeCompile=old.compile;material.customProgramCacheKey=old.key;material.needsUpdate=true;}
    materials.delete(material);
  }
  function bindMaterial(material:THREE.Material){
    if(disposed||!(material instanceof THREE.MeshStandardMaterial)||material.userData.skipOutdoorCanopy||materials.has(material)||material.customProgramCacheKey().includes(KEY))return;
    const compile=material.onBeforeCompile,key=material.customProgramCacheKey,oldKey=key.call(material);
    const installed:THREE.Material['onBeforeCompile']=function(this:THREE.Material,shader,glRenderer){
      compile.call(this,shader,glRenderer);Object.assign(shader.uniforms,uniforms);
      const vertexAnchor='#include <project_vertex>',lightAnchor='#include <lights_fragment_begin>';
      const primary='getDirectionalLightInfo( directionalLight, directLight );';
      if(!shader.vertexShader.includes(vertexAnchor)||!shader.fragmentShader.includes(lightAnchor)||!THREE.ShaderChunk.lights_fragment_begin.includes(primary))throw new Error(`Outdoor shadow shader anchors missing: ${material.name}`);
      shader.vertexShader='varying vec3 vHowCrownPosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace(vertexAnchor,`${vertexAnchor}
        vec4 howCrownWorld=vec4(transformed,1.);
        #ifdef USE_BATCHING
          howCrownWorld=batchingMatrix*howCrownWorld;
        #endif
        #ifdef USE_INSTANCING
          howCrownWorld=instanceMatrix*howCrownWorld;
        #endif
        vHowCrownPosition=(modelMatrix*howCrownWorld).xyz;`);
      shader.fragmentShader=fragment+'\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace(lightAnchor,THREE.ShaderChunk.lights_fragment_begin.replace(primary,`${primary}
        #if UNROLLED_LOOP_INDEX == 0
          directLight.color *= howPrimaryCrownTransmission(vHowCrownPosition);
        #endif`));
    };
    material.onBeforeCompile=installed;material.customProgramCacheKey=()=>oldKey+KEY;material.needsUpdate=true;
    const onDispose=()=>releaseMaterial(material);materials.set(material,{compile,key,installed,onDispose});material.addEventListener('dispose',onDispose);
  }
  function bind(root:THREE.Object3D){if(root instanceof THREE.Scene)boundScene=root;root.traverse(o=>{if(o instanceof THREE.Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])bindMaterial(m);});}
  function releaseTree(mesh:THREE.Mesh){
    const old=trees.get(mesh);if(!old)return;
    mesh.geometry.removeEventListener('dispose',old.onGeometryDispose);
    if(mesh.customDepthMaterial===old.installed)mesh.customDepthMaterial=old.previous;
    mesh.castShadow=old.castShadow;trees.delete(mesh);
  }
  function solidDepth(previous:THREE.Material|undefined){
    let depth=depthVariants.get(previous);if(depth)return depth;
    if(previous&&!(previous instanceof THREE.MeshDepthMaterial))throw new Error('Solid-weight shadows require a standard depth material');
    depth=previous?.clone()??new THREE.MeshDepthMaterial();
    const compile=previous?.onBeforeCompile??depth.onBeforeCompile,key=previous?.customProgramCacheKey()??depth.customProgramCacheKey();
    depth.onBeforeCompile=function(shader,glRenderer){
      compile.call(this,shader,glRenderer);
      if(!shader.vertexShader.includes('#include <begin_vertex>')||!shader.fragmentShader.includes('#include <clipping_planes_fragment>'))throw new Error('Solid tree depth shader anchors missing');
      shader.vertexShader='attribute float shadowSolidWeight;varying float vHowSolidWeight;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvHowSolidWeight=shadowSolidWeight;');
      shader.fragmentShader='varying float vHowSolidWeight;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nif(vHowSolidWeight<.5)discard;');
    };
    depth.customProgramCacheKey=()=>key+':how-solid-tree-depth-v1';depth.needsUpdate=true;resources.own(depth);depthVariants.set(previous,depth);return depth;
  }
  function configureTreeDepth(mesh:THREE.Mesh,kind:TreeShadowKind){
    if(disposed)return;
    if(trees.get(mesh)?.kind===kind)return;
    releaseTree(mesh);
    if(kind==='solid-weight'&&!mesh.geometry.hasAttribute('shadowSolidWeight'))throw new Error(`Tree has no shadowSolidWeight: ${mesh.name}`);
    const previous=mesh.customDepthMaterial,castShadow=mesh.castShadow;
    const installed=kind==='solid-weight'?solidDepth(previous):previous;
    mesh.customDepthMaterial=installed;mesh.castShadow=kind!=='crown';
    const onGeometryDispose=()=>releaseTree(mesh);trees.set(mesh,{kind,previous,installed,castShadow,onGeometryDispose});mesh.geometry.addEventListener('dispose',onGeometryDispose);
  }
  function setCanopies(next:readonly ProjectedCanopy[]){
    if(disposed)return;
    canopies=next.map(c=>({...c,center:[...c.center] as [number,number,number],radii:[...c.radii] as [number,number,number]}));revision++;
  }
  function update(input:OutdoorShadowUpdate){
    if(disposed)return;
    if(boundScene)for(const mesh of [...trees.keys()]){
      let current:THREE.Object3D|null=mesh;while(current&&current!==boundScene)current=current.parent;
      if(!current)releaseTree(mesh);
    }
    const dt=Math.max(0,input.dt);clock+=dt;elapsedSeconds+=dt;
    if(ready){if(ready.revision===revision)commit(ready.field,ready.revision,ready.elapsedMs);else discarded++;ready=null;}
    const direction=normalizeShadowDirection(input.sunDirection),cos=field?Math.min(1,Math.max(-1,direction.reduce((sum,n,i)=>sum+n*field!.direction[i],0))):-1;
    if(!field){
      // Initial loading owns the one synchronous bake; regular frames use a bounded worker queue.
      const start=performance.now(),initial=bakeProjectedCanopyField(canopies,bounds,direction),ms=performance.now()-start;
      totalBakeMs+=ms;completedBuilds++;commit(initial,revision,ms);
    }else if(worker){
      const changed=cos<Math.cos(C.angularThreshold),geometryChanged=committedRevision!==revision;
      if(geometryChanged||changed&&(clock>=C.refreshSeconds||cos<Math.cos(.04))){
        const queued=pending??inflight;
        const queuedCos=queued?direction.reduce((sum,n,i)=>sum+n*queued.direction[i],0):-1;
        if(!queued||queued.revision!==revision||queuedCos<Math.cos(C.angularThreshold)){
          const request:ShadowBakeRequest={id:++requestId,revision,canopies,bounds,direction};
          if(inflight)pending=request;else submit(request);
        }
      }
    }else if(committedRevision!==revision||cos<Math.cos(C.fallbackAngularThreshold)&&clock>=C.fallbackRefreshSeconds){
      // Worker-less fallback keeps a coherent cached sun/field for slow solar motion.
      // A geometry edit may bake synchronously once; it never falls back to 0.35 s solar rebuilds.
      const start=performance.now(),next=bakeProjectedCanopyField(canopies,bounds,direction),ms=performance.now()-start;
      totalBakeMs+=ms;completedBuilds++;commit(next,revision,ms);
    }
    // Commit one direction to both systems. Updating the sun while retaining an older
    // projected volume would otherwise slide the hard and soft parts independently.
    const pose=snappedShadowPose(input.focus,field!.direction);
    sun.target.position.fromArray(pose.target);sun.position.fromArray(pose.position);sun.shadow.camera.up.fromArray(pose.up);
  }
  return {bind,bindMaterial,configureTreeDepth,setCanopies,update,
    setEnabled(value:boolean){enabled=value;uniforms.howCrownEnabled.value=value?1:0;},
    stats(){return {version:SHADOW_PROFILES.version,enabled,disposed,mapCount:1,mapSize:P.mapSize,span:P.span,worldUnitsPerTexel:texel,normalBias:sun.shadow.normalBias,solidSoftness:P.solidSoftness,fieldSize:[...C.size],fieldBytes:texture.image.data?.byteLength??0,fieldBounds:bounds,sourceCount:field?.sourceCount??0,touchedCells:field?.touchedCells??0,bakes,lastBakeMs:Math.round(lastBakeMs*100)/100,meanBakeMs:completedBuilds?Math.round(totalBakeMs/completedBuilds*100)/100:0,totalBakeMs:Math.round(totalBakeMs*100)/100,cpuMsPerSimulationSecond:elapsedSeconds?Math.round(totalBakeMs/elapsedSeconds*100)/100:0,worker:!!worker,inflight:inflight?1:0,pending:pending?1:0,ready:!!ready,revision,committedRevision,submitted,discarded,workerErrors,fallbackRefreshSeconds:C.fallbackRefreshSeconds,materials:materials.size,treeDepthBindings:trees.size,depthMaterials:depthVariants.size,extraRenderPasses:0,extraDrawCalls:0,fieldLookupsPerPrimaryLight:1};},
    dispose(){
      if(disposed)return;disposed=true;
      stopWorker();
      for(const material of [...materials.keys()])releaseMaterial(material);
      for(const mesh of [...trees.keys()])releaseTree(mesh);
      for(const depth of depthVariants.values())resources.releaseOwned(depth);
      depthVariants.clear();resources.releaseOwned(texture);field=null;canopies=[];boundScene=null;
    },
  };
}
export type OutdoorShadows=ReturnType<typeof createOutdoorShadows>;
