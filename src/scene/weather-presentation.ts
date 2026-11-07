import * as THREE from 'three';
import type {Resources} from './resources.ts';
import {seedArray} from './weather-particle-seeds.js';
import {WEATHER_SHELTERS} from '../content/weather.ts';
import {heightAt} from '../world/surface.ts';

export type WeatherVisualState={cloud:number;rain:number;snowfall:number;wetness:number;puddles:number;snow:number};
type SurfaceKind='surface'|'ground'|'tree';
type WeatherSurface={root:THREE.Object3D;kind?:SurfaceKind};
const noiseGLSL=`
float howWeatherHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float howWeatherNoise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(howWeatherHash(i),howWeatherHash(i+vec2(1.,0.)),f.x),mix(howWeatherHash(i+vec2(0.,1.)),howWeatherHash(i+vec2(1.,1.)),f.x),f.y);
}
float howWeatherField(vec2 p){return howWeatherNoise(p)*.55+howWeatherNoise(p*2.03+7.1)*.28+howWeatherNoise(p*4.11+3.4)*.12;}
`;
const volume={width:140,depth:120,height:70};

/** Scene-owned weather uniforms and bounded geometry. The caller owns time and render scheduling. */
export function createWeatherPresentation(resources:Resources,scene:THREE.Scene,props:Map<string,THREE.Object3D>){
  const group=new THREE.Group();group.name='valley-weather';scene.add(group);
  const profile:WeatherVisualState={cloud:.12,rain:0,snowfall:0,wetness:0,puddles:0,snow:0};
  const uniforms={
    time:{value:0},wetness:{value:0},snow:{value:0},rain:{value:0},snowfall:{value:0},cloud:{value:.12},puddles:{value:0},
    center:{value:new THREE.Vector3()},
  };
  scene.updateMatrixWorld(true);
  const shelters=WEATHER_SHELTERS.map(spec=>{
    const base=heightAt(spec.x,spec.z),object=props.get(spec.id);
    const box=object?new THREE.Box3().setFromObject(object):null;
    const height=box?Math.max(1,box.max.y-base):3.28;
    return {...spec,eaves:base+(spec.id==='camp-log-store'?2.65:height*.66),ridge:base+height};
  });
  const number=(value:number)=>value.toFixed(4);
  const shelterGLSL=`bool howWeatherCovered(vec3 p){
    ${shelters.map(s=>`if(abs(p.x-(${number(s.x)}))<${number(s.halfX)}&&abs(p.z-(${number(s.z)}))<${number(s.halfZ)}){
      float roof=${number(s.ridge)}-abs(p.x-(${number(s.x)}))*${number((s.ridge-s.eaves)/s.halfX)};
      if(p.y<roof-.035)return true;
    }`).join('\n')}
    return false;
  }
  float howWeatherSurfaceExposure(vec3 p){
    ${shelters.map(s=>`if(abs(p.x-(${number(s.x)}))<${number(s.halfX)}&&abs(p.z-(${number(s.z)}))<${number(s.halfZ)}&&p.y<${number(s.eaves)}-.04)return 0.;`).join('\n')}
    return 1.;
  }`;
  const patched=new WeakSet<THREE.Material>();
  let patchedCount=0,disposed=false,initialized=false;
  function bindMaterial(material:THREE.Material,kind:SurfaceKind='surface'){
    if(!(material instanceof THREE.MeshStandardMaterial)||patched.has(material))return;
    patched.add(material);patchedCount++;
    const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
    const ground=kind==='ground'||material.name==='planned-understory-meadow-digital-blocks';
    material.onBeforeCompile=function(shader,renderer){
      previous.call(this,shader,renderer);
      // Item rarity variants can already compose the original weather hook.
      if(shader.vertexShader.includes('varying vec3 vHowWeatherPosition;'))return;
      shader.uniforms.howWetness=uniforms.wetness;shader.uniforms.howSnow=uniforms.snow;
      shader.vertexShader='varying vec3 vHowWeatherPosition;varying vec3 vHowWeatherNormal;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>',`#include <worldpos_vertex>
        vec4 howWeatherPosition=vec4(transformed,1.);
        #ifdef USE_INSTANCING
          howWeatherPosition=instanceMatrix*howWeatherPosition;
        #endif
        vHowWeatherPosition=(modelMatrix*howWeatherPosition).xyz;
        vHowWeatherNormal=inverseTransformDirection(transformedNormal,viewMatrix);
      `);
      shader.fragmentShader=`varying vec3 vHowWeatherPosition;varying vec3 vHowWeatherNormal;
        uniform float howWetness,howSnow;${noiseGLSL}${shelterGLSL}\n`+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphamap_fragment>',`
        float howExposure=${ground?'(howWeatherCovered(vHowWeatherPosition)?0.:1.)':'howWeatherSurfaceExposure(vHowWeatherPosition)'};
        float howPatch=howWeatherField(vHowWeatherPosition.xz*.72);
        float howDamp=smoothstep(howPatch*.5,howPatch*.5+.43,howWetness)*howExposure;
        diffuseColor.rgb*=1.-howDamp*${ground?'.32':'.16'};
        float howUp=normalize(vHowWeatherNormal).y;
        float howSnowMask=smoothstep(.035,.42,howSnow-howPatch*.18)*smoothstep(${kind==='tree'?'.12,.58':'.3,.78'},howUp)*howExposure;
        ${kind==='tree'?`
          #ifdef USE_COLOR
            float howFoliage=step(vColor.r*1.025,vColor.g)*step(vColor.b*1.025,vColor.g);
            howSnowMask*=howFoliage;
          #endif
        `:''}
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.88,.93,.96),howSnowMask*.97);
        #include <alphamap_fragment>
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,${ground?'.4':'.65'},howDamp*.68);
        roughnessFactor=mix(roughnessFactor,.93,howSnowMask);
      `);
    };
    material.customProgramCacheKey=()=>`${previousKey}:how-weather-r1:${kind}`;
    material.needsUpdate=true;
  }
  function bind(root:THREE.Object3D,kind:SurfaceKind='surface'){
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      const materials=Array.isArray(object.material)?object.material:[object.material];
      for(const material of materials)bindMaterial(material,kind);
    });
  }

  const rainCount=2200,snowCount=2600;
  const rainSeeds=seedArray(rainCount,true),snowSeeds=seedArray(snowCount);
  function particleGeometry(seeds:ReturnType<typeof seedArray>,rain:boolean){
    const geometry=resources.own(new THREE.BufferGeometry());
    geometry.setAttribute('position',new THREE.BufferAttribute(seeds.values,3));
    geometry.setAttribute('density',new THREE.BufferAttribute(seeds.density,1));
    geometry.setAttribute('floorHeight',new THREE.BufferAttribute(new Float32Array(seeds.density.length),1));
    if(rain)geometry.setAttribute('tip',new THREE.BufferAttribute(seeds.tips,1));
    geometry.setDrawRange(0,seeds.density.length);
    return geometry;
  }
  const rainGeometry=particleGeometry(rainSeeds,true),snowGeometry=particleGeometry(snowSeeds,false);
  const common={uTime:uniforms.time,uRain:uniforms.rain,uSnow:uniforms.snowfall,uCenter:uniforms.center};
  const rainMaterial=resources.own(new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:common,
    vertexShader:`
      attribute float tip,density,floorHeight;
      uniform float uTime,uRain;uniform vec3 uCenter;
      varying float vFade;varying vec3 vWeatherWorld;
      void main(){
        vec3 p=vec3((position.x-.5)*${volume.width.toFixed(1)},fract(position.y-uTime*(.24+position.z*.12))*${volume.height.toFixed(1)}-4.,(position.z-.5)*${volume.depth.toFixed(1)})+uCenter;
        p+=vec3(.13,-.86,.04)*tip;
        vWeatherWorld=p;
        vFade=(.16+.23*tip)*step(density,uRain)*smoothstep(floorHeight+.08,floorHeight+.7,p.y);
        gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
      }
    `,
    fragmentShader:`varying float vFade;varying vec3 vWeatherWorld;${shelterGLSL}
      void main(){
        if(vFade<.01||howWeatherCovered(vWeatherWorld))discard;
        gl_FragColor=vec4(.8,.89,.94,vFade);
        #include <colorspace_fragment>
      }
    `,
  }));
  const rain=new THREE.LineSegments(rainGeometry,rainMaterial);rain.frustumCulled=false;rain.name='nearby-rain';group.add(rain);
  const snowMaterial=resources.own(new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:common,
    vertexShader:`
      attribute float density,floorHeight;uniform float uTime,uSnow;uniform vec3 uCenter;
      varying float vFade,vRotation;varying vec3 vWeatherWorld;
      void main(){
        vec3 p=vec3((position.x-.5)*${volume.width.toFixed(1)},fract(position.y-uTime*(.012+position.z*.014))*${volume.height.toFixed(1)}-4.,(position.z-.5)*${volume.depth.toFixed(1)})+uCenter;
        p.x+=sin(uTime*.55+position.y*35.)*.65;p.z+=cos(uTime*.33+position.x*29.)*.4;
        vWeatherWorld=p;
        vec4 mv=viewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((1.+position.x*2.3)*140./max(1.,-mv.z),1.5,25.);
        vFade=step(density,uSnow)*smoothstep(floorHeight+.08,floorHeight+.7,p.y)*(.62+position.y*.32);
        vRotation=position.x*12.+uTime*.15;
      }
    `,
    fragmentShader:`varying float vFade,vRotation;varying vec3 vWeatherWorld;${shelterGLSL}
      void main(){
        if(vFade<.01||howWeatherCovered(vWeatherWorld))discard;
        vec2 p=gl_PointCoord*2.-1.;float radius=length(p),angle=atan(p.y,p.x)+vRotation;
        float branches=pow(abs(cos(angle*3.)),12.)*(1.-smoothstep(.25,.92,radius));
        float alpha=(exp(-radius*radius*9.)*.72+branches*.3)*vFade;
        if(alpha<.02)discard;gl_FragColor=vec4(.97,.99,1.,alpha);
      }
    `,
  }));
  const snow=new THREE.Points(snowGeometry,snowMaterial);snow.frustumCulled=false;snow.name='nearby-snowflakes';group.add(snow);
  const sampledCenter=new THREE.Vector3(Infinity,Infinity,Infinity),nextCenter=new THREE.Vector3();
  let sampledTerrain=0;
  function sampleParticleGround(center:THREE.Vector3){
    for(const [geometry,seeds,paired] of [[rainGeometry,rainSeeds,true],[snowGeometry,snowSeeds,false]] as const){
      const attribute=geometry.getAttribute('floorHeight') as THREE.BufferAttribute,step=paired?2:1;
      for(let i=0;i<attribute.count;i+=step){
        const x=(seeds.values[i*3]-.5)*volume.width+center.x,z=(seeds.values[i*3+2]-.5)*volume.depth+center.z;
        const floor=heightAt(x,z);attribute.setX(i,floor);if(paired)attribute.setX(i+1,floor);
      }
      attribute.needsUpdate=true;
    }
    sampledCenter.copy(center);sampledTerrain++;
  }

  const puddleMaterial=resources.own(new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,
    uniforms:{uWetness:uniforms.puddles,uTime:uniforms.time,uRain:uniforms.rain,uSnow:uniforms.snow,uCloud:uniforms.cloud},
    vertexShader:`varying vec2 vUv;varying vec3 vWorld;void main(){vUv=uv;vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
    fragmentShader:`varying vec2 vUv;varying vec3 vWorld;uniform float uWetness,uRain,uTime,uSnow,uCloud;${noiseGLSL}
      void main(){
        vec2 p=vUv*2.-1.;float edge=length(p)+howWeatherNoise(p*5.)*.17;
        float extent=smoothstep(.025,.65,uWetness);
        float alpha=(1.-smoothstep(extent*.8,extent,edge))*.86*(1.-uSnow);
        if(alpha<.01)discard;
        vec3 viewDirection=normalize(cameraPosition-vWorld);
        float fresnel=pow(1.-clamp(viewDirection.y,0.,1.),3.);
        vec2 reflectedPoint=vWorld.xz*.19+viewDirection.xz/max(.3,viewDirection.y)*.4;
        float reflectedCloud=smoothstep(.25,.7,howWeatherField(reflectedPoint+vec2(uTime*.004,0.)));
        vec3 color=mix(vec3(.055,.095,.095),mix(vec3(.10,.23,.32),vec3(.36,.43,.45),reflectedCloud*.7+uCloud*.3),.52+fresnel*.4);
        float ripples=0.;
        for(int i=0;i<4;i++){
          float n=float(i),dropTime=uTime*.68+n*.27,age=fract(dropTime),index=floor(dropTime);
          vec2 center=vec2(howWeatherHash(vec2(n,index)),howWeatherHash(vec2(n+6.,index)))*1.3-.65;
          float distanceToDrop=length(p-center),radius=age*.72;
          ripples+=(exp(-abs(distanceToDrop-radius)*95.)-exp(-abs(distanceToDrop-radius+.035)*110.)*.38)*(1.-age)*uRain;
        }
        color+=ripples*.25;gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  const puddles=new THREE.Group();puddles.name='camp-rain-puddles';group.add(puddles);
  // Sample shallow, unobstructed road verges using the owning terrain heights.
  const puddleSamples=[[-23.4,6.2,1.35,.85],[-23.8,-.3,1.1,.7],[-30.5,18,1.45,.8],[-33.2,26,1.1,.65]];
  for(const [x,z,sx,sz] of puddleSamples){
    const geometry=resources.own(new THREE.PlaneGeometry(2,2,8,8)),position=geometry.getAttribute('position');
    for(let i=0;i<position.count;i++){
      const px=x+position.getX(i)*sx,pz=z-position.getY(i)*sz;
      position.setXYZ(i,px,heightAt(px,pz)+.026,pz);
    }
    geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,puddleMaterial);mesh.renderOrder=2;puddles.add(mesh);
  }

  const lensScene=new THREE.Scene(),lensCamera=new THREE.OrthographicCamera(-1,1,1,-1,.1,5);
  lensCamera.position.z=2;
  const lensMaterial=resources.own(new THREE.ShaderMaterial({
    transparent:true,depthTest:false,depthWrite:false,uniforms:{uOpacity:{value:0}},
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;uniform float uOpacity;
      void main(){
        vec2 p=(vUv-.5)*2.;p.x*=1.+max(0.,p.y)*.7;float r=length(p);
        float silhouette=1.-smoothstep(.83,1.,r),rim=exp(-pow((r-.81)*14.,2.));
        float highlight=exp(-length(p-vec2(-.3,.45))*10.)*.95;
        vec3 color=mix(vec3(.16,.28,.31),vec3(.92,.98,1.),rim*.75+highlight);
        gl_FragColor=vec4(color,(rim*.23+highlight*.35+silhouette*.045)*uOpacity);
      }
    `,
  }));
  const lens=resources.own(new THREE.InstancedMesh(resources.own(new THREE.PlaneGeometry(2,2)),lensMaterial,13));
  lens.frustumCulled=false;lens.instanceMatrix.setUsage(THREE.DynamicDrawUsage);lensScene.add(lens);
  const dummy=new THREE.Object3D();
  let lensWetness=0;
  const dynamic:WeatherSurface[]=[];
  function coverage(seeds:ReturnType<typeof seedArray>,count:number,paired:boolean,intensity:number){
    let admitted=0,minX=1,maxX=0,minZ=1,maxZ=0;
    const bins=Array<number>(16).fill(0),step=paired?2:1;
    for(let particle=0;particle<count;particle++){
      const index=particle*step;
      if(seeds.density[index]>intensity)continue;
      const x=seeds.values[index*3],z=seeds.values[index*3+2];
      admitted++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);
      bins[Math.min(3,Math.floor(x*4))+Math.min(3,Math.floor(z*4))*4]++;
    }
    return {pool:count,admitted,bounds:admitted?{minX,maxX,minZ,maxZ}:null,bins};
  }
  return {
    group,profile,bind,bindMaterial,
    addDynamicSurface(root:THREE.Object3D,kind:SurfaceKind='surface'){dynamic.push({root,kind});bind(root,kind);},
    setWeather(snapshot:WeatherVisualState,dt:number){
      const blend=initialized&&dt>0?1-Math.exp(-dt*1.8):1;initialized=true;
      for(const key of Object.keys(profile) as (keyof WeatherVisualState)[]){
        const next=THREE.MathUtils.clamp(snapshot[key],0,1);profile[key]+= (next-profile[key])*blend;
      }
      uniforms.cloud.value=profile.cloud;uniforms.rain.value=profile.rain;uniforms.snowfall.value=profile.snowfall;
      uniforms.wetness.value=profile.wetness;uniforms.snow.value=profile.snow;uniforms.puddles.value=profile.puddles;
    },
    update(time:number,dt:number,player:{x:number;z:number},camera:THREE.PerspectiveCamera,small:boolean,reducedMotion:boolean){
      if(disposed)return;
      uniforms.time.value=time;
      nextCenter.set(player.x,heightAt(player.x,player.z),player.z).lerp(camera.position,.45);
      nextCenter.y=Math.max(heightAt(player.x,player.z),camera.position.y-36);
      uniforms.center.value.copy(nextCenter);
      rain.visible=profile.rain>.01;snow.visible=profile.snowfall>.01;puddles.visible=profile.puddles>.025&&profile.snow<.98;
      rainGeometry.setDrawRange(0,(small?950:rainCount)*2);snowGeometry.setDrawRange(0,small?1150:snowCount);
      if((rain.visible||snow.visible)&&sampledCenter.distanceToSquared(nextCenter)>9)sampleParticleGround(nextCenter);
      for(const {root,kind} of dynamic)bind(root,kind);
      const sheltered=shelters.some(s=>Math.abs(camera.position.x-s.x)<s.halfX&&Math.abs(camera.position.z-s.z)<s.halfZ&&camera.position.y<s.ridge-Math.abs(camera.position.x-s.x)*(s.ridge-s.eaves)/s.halfX);
      const target=sheltered||reducedMotion?0:profile.rain;
      lensWetness+=(target-lensWetness)*(1-Math.exp(-Math.max(0,dt)*(target>lensWetness?.5:.2)));
      lensMaterial.uniforms.uOpacity.value=lensWetness;lens.count=small?8:13;
      for(let i=0;i<lens.count;i++){
        const seed=i*.419,size=.015+(i%4)*.005,age=(time*.025+seed)%1,fall=Math.pow(Math.max(0,age-.4)/.6,2);
        const edge=i%2?-1:1,x=edge*(.58+(i*.173)%.31);
        dummy.position.set(x+Math.sin(age*5+seed)*.009,.95-fall*2.4-(seed%.2),0);
        dummy.scale.set(size/camera.aspect,size*(1+fall*2.4),1);dummy.updateMatrix();lens.setMatrixAt(i,dummy.matrix);
      }
      lens.instanceMatrix.needsUpdate=true;
    },
    renderLens(renderer:THREE.WebGLRenderer){
      if(disposed||lensWetness<.01)return;
      const autoClear=renderer.autoClear;renderer.autoClear=false;
      try{renderer.clearDepth();renderer.render(lensScene,lensCamera);}finally{renderer.autoClear=autoClear;}
    },
    stats(){return {
      profile:{...profile},
      rain:coverage(rainSeeds,rainGeometry.drawRange.count/2,true,profile.rain),
      snowfall:coverage(snowSeeds,snowGeometry.drawRange.count,false,profile.snowfall),
      lensDrops:lensWetness>.01?lens.count:0,lensWetness,puddles:puddles.children.length,
      patchedMaterials:patchedCount,terrainSamples:sampledTerrain,shelters:shelters.map(s=>({...s})),disposed,
    };},
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();lensScene.clear();dynamic.length=0;},
  };
}
