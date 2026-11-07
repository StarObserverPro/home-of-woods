import {daylightAt} from '../domain/scene-props.ts';
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { ENVIRONMENT_STYLE, MOUNTAINS } from "../content/environment.ts";
import type { Resources } from "./resources.ts";
import type {WeatherVisualState} from './weather-presentation.ts';

import {buildMountainGeometry,mountainMaterial} from './mountain-geometry.js';
export {buildMountainGeometry} from './mountain-geometry.js';
const smooth=THREE.MathUtils.smoothstep;

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
  const mountainAir={value:new THREE.Color(.40,.55,.66)};
  const mountains=resources.own(mountainMaterial(mountainAir));
  for(const spec of MOUNTAINS){
    const geometry=resources.geometry(`valley-mountain-${spec.id}-r2`,()=>buildMountainGeometry(spec));
    const mesh=new THREE.Mesh(geometry,mountains);mesh.name=spec.id;mesh.renderOrder=-5;group.add(mesh);
  }
  const sky=new Sky();sky.name='sky-porch-daylight';sky.scale.setScalar(10000);sky.frustumCulled=false;sky.renderOrder=-100;
  resources.own(sky.geometry);resources.own(sky.material);
  const u=sky.material.uniforms;
  u.reviewNight={value:0};
  u.pnwSkyRadianceScale={value:ENVIRONMENT_STYLE.skyRadianceScale};
  u.pnwSkyTint={value:new THREE.Color().fromArray(ENVIRONMENT_STYLE.skyTint)};
  u.pnwWeatherCloud={value:.12};u.pnwWeatherRain={value:0};
  sky.material.fragmentShader='uniform float reviewNight;uniform float pnwSkyRadianceScale;\nuniform vec3 pnwSkyTint;uniform float pnwWeatherCloud,pnwWeatherRain;\n'+sky.material.fragmentShader;
  sky.material.fragmentShader=sky.material.fragmentShader.replace('gl_FragColor = vec4( texColor, 1.0 );',`
    vec3 pnwSky=mix(texColor*pnwSkyTint*pnwSkyRadianceScale,vec3(.008,.015,.038)+vec3(.015,.024,.045)*max(0.,direction.y),reviewNight);
    // One high ceiling has a planar underside and covers the solar disc.
    if(direction.y>.005){
      vec2 ceiling=direction.xz/max(.045,direction.y)*1.8+vec2(time*.006,0.);
      float field=clamp(fbm(ceiling,0.)*.38+.5,0.,1.);
      float weatherCover=smoothstep(.25,.87,pnwWeatherCloud);
      float bank=smoothstep(.66-pnwWeatherCloud*.36,.82-pnwWeatherCloud*.36,field);
      float ceilingMask=max(bank*weatherCover,weatherCover*.81)*smoothstep(.006,.12,direction.y);
      vec3 ceilingColor=mix(vec3(.62,.64,.63),vec3(.35,.40,.44),pnwWeatherCloud*.65+pnwWeatherRain*.16);
      ceilingColor*=.85+field*.22;
      ceilingColor=mix(ceilingColor,vec3(.027,.039,.065)*(.83+field*.3),reviewNight);
      pnwSky=mix(pnwSky,ceilingColor,ceilingMask);
    }
    gl_FragColor=vec4(pnwSky,1.);
  `);
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
  let disposed=false,visualTime=0,weatherCloud=.12,weatherRain=0;
  const moonDirection=new THREE.Vector3(.45,.7,.65).normalize();
  return{
    setWeather(weather:Pick<WeatherVisualState,'cloud'|'rain'>){
      weatherCloud=THREE.MathUtils.clamp(weather.cloud,0,1);weatherRain=THREE.MathUtils.clamp(weather.rain,0,1);
      u.pnwWeatherCloud.value=weatherCloud;u.pnwWeatherRain.value=weatherRain;
      u.cloudCoverage.value=weatherCloud;u.cloudDensity.value=.35+weatherCloud*.4;
      u.showSunDisc.value=1-weatherCloud*.97;
    },
    setHour(hour:number){
      const {day,night,warm,altitude}=daylightAt(hour);
      sunDirection.set(-.6,Math.max(.08,altitude),-.32).normalize();
      u.sunPosition.value.copy(sunDirection);u.reviewNight.value=night;
      // Keep a soft moon-side fill above the camp so ordinary night actions
      // remain readable even on the shaded front of the cabin.
      sunDirection.lerp(moonDirection,night).normalize();
      u.pnwSkyTint.value.setRGB(.68+warm*.30,.84-warm*.2,1-warm*.42);
      lighting.sunColor.set('#fff1d3').lerp(new THREE.Color('#f4a46c'),warm*.75).lerp(new THREE.Color('#9aafff'),night);
      lighting.sunIntensity=.65*night+2.1*day;
      lighting.skyColor.set('#a3bfd5').lerp(new THREE.Color('#5d76ac'),night);
      lighting.groundColor.set('#71784f').lerp(new THREE.Color('#17273e'),night);
      lighting.ambientIntensity=.62+day*.43;
      lighting.environmentIntensity=.15+day*.15;
      lighting.haze.set('#819eaf').lerp(new THREE.Color('#171f39'),night);
      mountainAir.value.setRGB(.40,.55,.66).lerp(new THREE.Color('#171f39'),night);
      const overcast=smooth(weatherCloud,.18,.92);
      lighting.sunIntensity*=1-overcast*.68;
      lighting.ambientIntensity*=1-overcast*.08-weatherRain*.04;
      lighting.skyColor.lerp(new THREE.Color('#a0abb1').lerp(new THREE.Color('#4a5a7a'),night),overcast*.45);
      lighting.environmentIntensity*=1-overcast*.12;
      return {day,night};
    },
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
      return{meshes,geometryTriangles:triangles,geometries:geometries.size,materials:materials.size,environmentMap:!!environmentTarget,pmremSize:environmentTarget?128:0,visualTime,weatherCloud,weatherRain,disposed};
    },
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();},
  };
}
