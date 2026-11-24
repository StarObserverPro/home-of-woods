import * as THREE from 'three';
import {ATMOSPHERE as C} from '../content/atmosphere.ts';
import {ENVIRONMENT_STYLE} from '../content/environment.ts';
import {atmosphereWeatherKey,bakeTransmittanceLut} from './atmosphere-rules.ts';
import type {createSkySample} from './lighting/sky-light.ts';

export type AtmosphereDebug='final'|'off'|'transmittance'|'inscatter';

/** One material-space owner, before tone mapping. No scene re-render, depth prepass or RAF. */
export function createAtmosphereLite(initial:AtmosphereDebug='final') {
  const data=new Uint16Array(C.lutWidth*2*4);
  const lut=new THREE.DataTexture(data,C.lutWidth,2,THREE.RGBAFormat,THREE.HalfFloatType);
  lut.name='rainier-optical-path-transmittance';
  lut.minFilter=lut.magFilter=THREE.LinearFilter;lut.generateMipmaps=false;
  lut.wrapS=lut.wrapT=THREE.ClampToEdgeWrapping;lut.colorSpace=THREE.NoColorSpace;
  const uniforms={howAirMode:{value:1},howAirLut:{value:lut},howAirSunDirection:{value:new THREE.Vector3()},
    howAirSky:{value:new THREE.Color()},howAirSun:{value:new THREE.Color()},howAirSunStrength:{value:0}};
  let debug:AtmosphereDebug=initial,weatherKey='',lutUpdates=0,disposed=false,bindVisits=0;
  const bindings=new Map<THREE.Material,{compile:THREE.Material['onBeforeCompile'];key:THREE.Material['customProgramCacheKey'];installed:THREE.Material['onBeforeCompile'];inheritedAir:boolean;active:{value:number};texture:{value:THREE.Texture|null};onDispose:()=>void}>();
  const fragment=`
    varying vec3 vHowAirWorld;
    uniform float howAirMode,howAirSunStrength,howAirActive;
    uniform sampler2D howAirLut;
    uniform vec3 howAirSunDirection,howAirSky,howAirSun;
    float howAirDensity(float a,float b,float height){
      float lo=min(a,b),hi=max(a,b),span=hi-lo;
      if(hi<=0.)return 1.;
      if(span<.01)return exp(-max(0.,lo)/height);
      float pos=max(0.,lo),delta=(hi-pos)/height;
      float integral=height*exp(-pos/height)*(delta<.001?delta*(1.-delta*.5):1.-exp(-delta));
      return clamp((max(0.,-lo)+integral)/span,0.,1.);
    }
    vec3 howAirTransmission(float opticalPath,float row){
      float u=sqrt(clamp(opticalPath/${C.maxOpticalDistanceM.toFixed(1)},0.,1.));
      return texture2D(howAirLut,vec2((u*${(C.lutWidth-1).toFixed(1)}+.5)/${C.lutWidth.toFixed(1)},row)).rgb;
    }
  `;
  const composite=`
    if(howAirActive>.5&&howAirMode>.5){
      vec3 airDelta=vHowAirWorld-cameraPosition;
      float airDistance=length(airDelta);
      float airA=(cameraPosition.y-${C.baseY.toFixed(1)})*${C.metersPerWorldUnit.toFixed(1)};
      float airB=(vHowAirWorld.y-${C.baseY.toFixed(1)})*${C.metersPerWorldUnit.toFixed(1)};
      float airMeters=airDistance*${C.metersPerWorldUnit.toFixed(1)};
      vec3 rayT=howAirTransmission(airMeters*howAirDensity(airA,airB,${C.rayleighScaleHeightM.toFixed(1)}),.25);
      vec3 mieT=howAirTransmission(airMeters*howAirDensity(airA,airB,${C.aerosolScaleHeightM.toFixed(1)}),.75);
      float mu=dot(airDelta/max(.0001,airDistance),howAirSunDirection);
      float rayPhase=.75*(1.+mu*mu);
      float g=${ENVIRONMENT_STYLE.mieDirectionalG.toFixed(4)};
      float miePhase=min(4.,(1.-g*g)/pow(max(.02,1.+g*g-2.*g*mu),1.5));
      vec3 raySource=howAirSky*(.75+.25*rayPhase)+howAirSun*(.035*howAirSunStrength);
      vec3 mieSource=(howAirSky*.8+howAirSun*(${C.sunScatter}*miePhase*howAirSunStrength))*${C.aerosolAlbedo};
      vec3 airT=rayT*mieT;
      vec3 airL=(1.-rayT)*raySource+rayT*(1.-mieT)*mieSource;
      float airBlend=smoothstep(${C.nearClearStart.toFixed(1)},${C.nearClearEnd.toFixed(1)},airDistance);
      if(howAirMode<1.5)gl_FragColor.rgb=mix(gl_FragColor.rgb,gl_FragColor.rgb*airT+airL,airBlend);
      else if(howAirMode<2.5)gl_FragColor.rgb=mix(vec3(1.),airT,airBlend);
      else gl_FragColor.rgb=airL*airBlend;
    }
  `;
  function release(material:THREE.Material){
    const record=bindings.get(material);if(!record)return;
    // Other surface owners may have wrapped this hook after us. Their chain must
    // remain intact; local uniforms still let a borrowed material leave the air.
    record.active.value=0;record.texture.value=null;
    material.removeEventListener('dispose',record.onDispose);
    // A clone's previous hook can itself contain the parent's active air. Keep
    // our disabled wrapper in that case, including across future recompiles.
    if(material.onBeforeCompile===record.installed&&!record.inheritedAir){material.onBeforeCompile=record.compile;material.customProgramCacheKey=record.key;material.needsUpdate=true;}
    bindings.delete(material);
  }
  function bindMaterial(material:THREE.Material){
    if(disposed||!(material instanceof THREE.MeshStandardMaterial)||material.userData.skipAtmosphere)return;
    if(bindings.has(material))return;
    const compile=material.onBeforeCompile,key=material.customProgramCacheKey,oldKey=key.call(material);
    const inheritedAir=oldKey.includes(':how-air-v2');
    const active={value:1},texture:{value:THREE.Texture|null}={value:lut};
    const installed:THREE.Material['onBeforeCompile']=function(this:THREE.Material,shader,renderer){
      compile.call(this,shader,renderer);
      // Cloned variants may carry another material's hook. Replace its uniform
      // ownership even when the GLSL was already injected by that earlier hook.
      Object.assign(shader.uniforms,uniforms,{howAirActive:active,howAirLut:texture});
      if(shader.vertexShader.includes('varying vec3 vHowAirWorld;'))return;
      if(!shader.vertexShader.includes('#include <project_vertex>')||!shader.fragmentShader.includes('#include <tonemapping_fragment>'))throw new Error(`Atmosphere anchors missing: ${material.name}`);
      shader.vertexShader='varying vec3 vHowAirWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 howAirWorld=vec4(transformed,1.);
        #ifdef USE_BATCHING
          howAirWorld=batchingMatrix*howAirWorld;
        #endif
        #ifdef USE_INSTANCING
          howAirWorld=instanceMatrix*howAirWorld;
        #endif
        vHowAirWorld=(modelMatrix*howAirWorld).xyz;`);
      shader.fragmentShader=fragment+'\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <tonemapping_fragment>',composite+'\n#include <tonemapping_fragment>')
        .replace('#include <fog_fragment>','');
    };
    material.onBeforeCompile=installed;material.customProgramCacheKey=()=>oldKey.includes(':how-air-v2')?oldKey:`${oldKey}:how-air-v2`;
    const onDispose=()=>release(material);bindings.set(material,{compile,key,installed,inheritedAir,active,texture,onDispose});
    material.addEventListener('dispose',onDispose);material.needsUpdate=true;
  }
  function setDebug(mode:AtmosphereDebug){debug=mode;uniforms.howAirMode.value={off:0,final:1,transmittance:2,inscatter:3}[mode];}
  setDebug(initial);
  return {
    bindMaterial,
    bind(root:THREE.Object3D){
      if(disposed)return;bindVisits++;
      root.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])bindMaterial(material);});
    },
    unbind(root:THREE.Object3D){root.traverse(object=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])release(material);});},
    update(light:ReturnType<typeof createSkySample>,cloud:number,rain:number){
      if(disposed)return;
      const quantized=atmosphereWeatherKey(cloud,rain);
      if(quantized.key!==weatherKey){
        const values=bakeTransmittanceLut(quantized.cloud,quantized.rain);
        for(let i=0;i<values.length;i++)data[i]=THREE.DataUtils.toHalfFloat(values[i]);
        lut.needsUpdate=true;weatherKey=quantized.key;lutUpdates++;
      }
      uniforms.howAirSunDirection.value.copy(light.sunDirection);
      uniforms.howAirSky.value.copy(light.skyColor).multiplyScalar(light.ambientIntensity*C.skyFill);
      uniforms.howAirSun.value.copy(light.sunColor);uniforms.howAirSunStrength.value=light.sunIntensity;
    },
    setDebug,
    stats:()=>({model:'height-integrated-extinction-with-sky-scatter',mode:debug,weatherKey,lutUpdates,lut:{width:C.lutWidth,height:2,format:'RGBA16F',bytes:data.byteLength},materials:bindings.size,bindVisits,textureSamplesPerFragment:2,extraDraws:0,metersPerWorldUnit:C.metersPerWorldUnit,disposed}),
    dispose(){if(disposed)return;disposed=true;for(const material of [...bindings.keys()])release(material);lut.dispose();},
  };
}
