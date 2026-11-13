import * as THREE from 'three';
import {OCCLUSION as C} from '../../content/occlusion.ts';
import type {CanopyField,OcclusionVolume} from '../../world/occlusion.ts';
import type {Resources} from '../resources.ts';
import {bakeLocalOcclusion} from '../../world/local-occlusion-field.ts';

/** Shared, world-anchored ambient attenuation. No framebuffer pass or extra draws. */
export function createAmbientOcclusion(resources:Resources){
  const count=C.maxVolumes;
  const local=resources.own(new THREE.Data3DTexture(new Uint8Array(2),1,1,1));
  local.format=THREE.RGFormat;local.minFilter=local.magFilter=THREE.LinearFilter;
  local.wrapS=local.wrapT=local.wrapR=THREE.ClampToEdgeWrapping;local.unpackAlignment=1;local.generateMipmaps=false;local.needsUpdate=true;
  let localField=bakeLocalOcclusion([]),localBakeMs=0;
  function texture(field?:CanopyField){
    const tex=resources.own(new THREE.DataTexture(field?.data??new Uint8Array([0,0,255,255]),field?.size??1,field?.size??1,THREE.RGBAFormat));
    tex.minFilter=tex.magFilter=THREE.LinearFilter;tex.wrapS=tex.wrapT=THREE.ClampToEdgeWrapping;tex.generateMipmaps=false;tex.colorSpace=THREE.NoColorSpace;tex.needsUpdate=true;return tex;
  }
  const core=texture(),outer=texture();
  const uniforms={howAOEnabled:{value:1},howAOVolumeCount:{value:0},howAOBroadCount:{value:0},howAOMin:{value:new THREE.Vector3()},howAOMax:{value:new THREE.Vector3()},howAOLocal:{value:local},howAOGrid:{value:new THREE.Vector3(1,1,1)},howAONight:{value:0},howAOCore:{value:core},howAOOuter:{value:outer},howAOCoreBounds:{value:new THREE.Vector4(-150,-150,300,300)},howAOOuterBounds:{value:new THREE.Vector4(-750,-750,1500,1500)},howAOFieldEnabled:{value:0}};
  let volumes:readonly OcclusionVolume[]=[],coreField:CanopyField|undefined,outerField:CanopyField|undefined,updates=0,disposed=false;
  const materials=new Map<THREE.Material,{compile:THREE.Material['onBeforeCompile'];key:THREE.Material['customProgramCacheKey'];installed:THREE.Material['onBeforeCompile']}>();
  const fragment=`
    varying vec3 vHowAOPosition;
    uniform float howAOEnabled,howAONight,howAOFieldEnabled;
    uniform int howAOVolumeCount,howAOBroadCount;
    uniform vec3 howAOMin,howAOMax;
    uniform highp sampler3D howAOLocal;
    uniform vec3 howAOGrid;
    uniform sampler2D howAOCore,howAOOuter;
    uniform vec4 howAOCoreBounds,howAOOuterBounds;
    float howCanopyAO(vec3 p){
      if(howAOFieldEnabled<.5)return 0.;
      vec2 co=(p.xz-howAOCoreBounds.xy)/howAOCoreBounds.zw;
      vec2 ou=(p.xz-howAOOuterBounds.xy)/howAOOuterBounds.zw;
      if(any(lessThan(ou,vec2(0.)))||any(greaterThan(ou,vec2(1.))))return 0.;
      vec4 f=texture2D(howAOOuter,ou);
      if(all(greaterThanEqual(co,vec2(0.)))&&all(lessThanEqual(co,vec2(1.)))){
        float edge=min(min(co.x,1.-co.x),min(co.y,1.-co.y));
        f=mix(f,texture2D(howAOCore,co),smoothstep(0.,.025,edge));
      }
      float base=${C.heightMin.toFixed(1)}+f.g*${C.heightRange.toFixed(1)};
      float canopy=max(3.,f.b*${C.canopyHeightRange.toFixed(1)});
      float below=1.-smoothstep(base+1.0,base+canopy*.9,p.y);
      return f.r*below*${C.forestStrength};
    }
  `;
  function bindMaterial(material:THREE.Material){
    if(disposed||!(material instanceof THREE.MeshStandardMaterial)||material.userData.skipAmbientOcclusion)return;
    // Existing weather/enchantment wrappers retain this key when carrying our hook forward.
    if(materials.has(material)||material.customProgramCacheKey().includes(':how-ao-v1'))return;
    const compile=material.onBeforeCompile,key=material.customProgramCacheKey,oldKey=key.call(material);
    const installed:THREE.Material['onBeforeCompile']=function(this:THREE.Material,shader,renderer){
      compile.call(this,shader,renderer);Object.assign(shader.uniforms,uniforms);
      if(!shader.vertexShader.includes('#include <project_vertex>')||!shader.fragmentShader.includes('#include <aomap_fragment>'))throw new Error(`Ambient occlusion shader anchors missing: ${material.name}`);
      shader.vertexShader='varying vec3 vHowAOPosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 howAOWorld=vec4(transformed,1.);
        #ifdef USE_BATCHING
          howAOWorld=batchingMatrix*howAOWorld;
        #endif
        #ifdef USE_INSTANCING
          howAOWorld=instanceMatrix*howAOWorld;
        #endif
        vHowAOPosition=(modelMatrix*howAOWorld).xyz;`);
      shader.fragmentShader=fragment+'\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
        if(howAOEnabled>.5){
          float howNear=1.-smoothstep(${C.nearFull.toFixed(1)},${C.nearEnd.toFixed(1)},length(vViewPosition));
          float howBroad=0.,howDetail=0.;
          // One cached trilinear lookup replaces per-pixel traversal of every room/contact volume.
          if(howAOVolumeCount>0&&all(greaterThanEqual(vHowAOPosition,howAOMin))&&all(lessThanEqual(vHowAOPosition,howAOMax))){
            vec3 uv=(vHowAOPosition-howAOMin)/max(howAOMax-howAOMin,vec3(.001));
            vec2 shade=texture(howAOLocal,(uv*(howAOGrid-1.)+.5)/howAOGrid).rg;
            howBroad=shade.r;howDetail=shade.g;
          }
          vec3 howWN=inverseTransformDirection(normal,viewMatrix);
          float howPreset=${C.distantUnderside}*(1.-smoothstep(-.3,.65,howWN.y));
          float howOccluded=max(max(howBroad,howDetail*howNear),max(howCanopyAO(vHowAOPosition),howPreset));
          float howAmbient=max(${C.minimumAmbient},1.-howOccluded*mix(1.,.72,howAONight));
          reflectedLight.indirectDiffuse*=howAmbient;
          reflectedLight.indirectSpecular*=sqrt(howAmbient);
        }`);
    };
    material.onBeforeCompile=installed;material.customProgramCacheKey=()=>`${oldKey}:how-ao-v1`;
    material.needsUpdate=true;materials.set(material,{compile,key,installed});
  }
  function bind(root:THREE.Object3D){root.traverse(object=>{if(object instanceof THREE.Mesh)for(const m of Array.isArray(object.material)?object.material:[object.material])bindMaterial(m);});}
  function setVolumes(next:readonly OcclusionVolume[]){
    if(next.length>count)throw new Error(`Ambient occlusion volume budget exceeded: ${next.length}/${count}`);
    for(const v of next)if(![...v.center,...v.halfSize,v.yaw,v.softness,v.strength].every(Number.isFinite)||v.halfSize.some(n=>n<0)||v.softness<=0||v.strength<0||v.strength>1)throw new Error(`Invalid ambient occlusion volume: ${v.id}`);
    volumes=[...next.filter(v=>!v.detail),...next.filter(v=>v.detail)];
    uniforms.howAOVolumeCount.value=volumes.length;uniforms.howAOBroadCount.value=volumes.filter(v=>!v.detail).length;
    const start=performance.now();localField=bakeLocalOcclusion(volumes);localBakeMs=performance.now()-start;
    uniforms.howAOMin.value.fromArray(localField.min);uniforms.howAOMax.value.fromArray(localField.max);uniforms.howAOGrid.value.fromArray(localField.size);
    local.image={data:localField.data,width:localField.size[0],height:localField.size[1],depth:localField.size[2]};local.needsUpdate=true;updates++;
  }
  function setCanopy(kind:'core'|'outer',field:CanopyField){
    const tex=kind==='core'?core:outer,b=field.bounds;tex.image={data:field.data,width:field.size,height:field.size};tex.needsUpdate=true;
    (kind==='core'?uniforms.howAOCoreBounds:uniforms.howAOOuterBounds).value.set(b.minX,b.minZ,b.maxX-b.minX,b.maxZ-b.minZ);
    if(kind==='core')coreField=field;else outerField=field;uniforms.howAOFieldEnabled.value=coreField&&outerField?1:0;
  }
  return {bind,bindMaterial,setVolumes,setCanopy,
    setEnabled(value:boolean){uniforms.howAOEnabled.value=value?1:0;},
    setNight(value:number){uniforms.howAONight.value=THREE.MathUtils.clamp(value,0,1);},
    stats(){return {version:C.version,enabled:!!uniforms.howAOEnabled.value,volumes:volumes.map(v=>v.id),regions:volumes.map(v=>({id:v.id,center:[...v.center],halfSize:[...v.halfSize],yaw:v.yaw,detail:v.detail})),volumeBudget:count,broadVolumes:uniforms.howAOBroadCount.value,spatialBounds:[uniforms.howAOMin.value.toArray(),uniforms.howAOMax.value.toArray()],updates,materials:materials.size,canopyFields:[coreField?.size??1,outerField?.size??1],localFieldSize:[...localField.size],localTextureBytes:localField.data.byteLength,lastLocalBakeMs:Math.round(localBakeMs*100)/100,textureBytes:localField.data.byteLength+(coreField?.data.byteLength??4)+(outerField?.data.byteLength??4),extraDrawCalls:0,extraRenderPasses:0,near:[C.nearFull,C.nearEnd],minimumAmbient:C.minimumAmbient};},
    dispose(){if(disposed)return;disposed=true;for(const [m,old] of materials)if(m.onBeforeCompile===old.installed){m.onBeforeCompile=old.compile;m.customProgramCacheKey=old.key;m.needsUpdate=true;}materials.clear();},
  };
}
