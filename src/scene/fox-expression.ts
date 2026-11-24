import * as THREE from 'three';
import { FOX_EXPRESSION as F } from '../content/fox-expression.ts';
import type { WildlifeView } from '../domain/wildlife.ts';

/** Absolute samples of the real rig in the existing paused scene inspector. */
export type FoxReviewPose = {
  seconds: number; blink?: number; gaze?: readonly [number, number];
  head?: readonly [number, number]; motion?: 'idle' | 'walk' | 'run';
};
const clamp = THREE.MathUtils.clamp;
function hash(text:string) {
  let n=2166136261;
  for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619);
  return n>>>0;
}
function unit(seed:number,index:number) {
  let n=Math.imul(seed^(index|0),2246822507);
  n=Math.imul(n^(n>>>13),3266489909);
  return ((n^(n>>>16))>>>0)/4294967296;
}
const smooth=(x:number)=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
function blinkPulse(t:number) {
  if(t<0||t>F.closeSeconds+F.closedSeconds+F.openSeconds)return 0;
  if(t<F.closeSeconds)return smooth(t/F.closeSeconds);
  return 1-smooth((t-F.closeSeconds-F.closedSeconds)/F.openSeconds);
}
/** One saved game clock; seeded intervals differ between encounters, with rare double blinks. */
export function foxBlinkAt(time:number,seed:number) {
  const shifted=Math.max(0,time)+unit(seed,91)*F.blinkWindow;
  const window=Math.floor(shifted/F.blinkWindow),local=shifted-window*F.blinkWindow;
  const first=.6+unit(seed,window)*1.25;
  return Math.max(blinkPulse(local-first),unit(seed,window+131)<.14?blinkPulse(local-first-.32):0);
}

/** The original eyes are painted, not separate eyeballs. Move a small atlas region consistently in PBR. */
function bindEyes(material:THREE.Material,gaze:{value:THREE.Vector2}) {
  if(!(material instanceof THREE.MeshStandardMaterial))return;
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  const glsl=`
    uniform vec2 howFoxGaze;
    vec2 howFoxEyeUv(vec2 uv) {
      vec2 radius=vec2(${F.eyeRadius.join(',')});
      float a=length((uv-vec2(${F.eyes[0].join(',')}))/radius);
      float b=length((uv-vec2(${F.eyes[1].join(',')}))/radius);
      float mask=1.0-smoothstep(.85,1.45,min(a,b));
      return uv+vec2(howFoxGaze.x*${F.eyeUvTravel[0]},-howFoxGaze.y*${F.eyeUvTravel[1]})*mask;
    }
  `;
  // The original ORM red channel is constant white. Leave aomap_fragment as an
  // include so the game's shared contact/canopy AO can append its own shading.
  const chunks=[['map_fragment','vMapUv'],['roughnessmap_fragment','vRoughnessMapUv'],
    ['metalnessmap_fragment','vMetalnessMapUv']] as const;
  material.onBeforeCompile=function(shader,renderer) {
    compile.call(this,shader,renderer);shader.uniforms.howFoxGaze=gaze;
    shader.fragmentShader=glsl+'\n'+shader.fragmentShader;
    for(const [chunk,uv] of chunks) {
      const anchor=`#include <${chunk}>`,source=THREE.ShaderChunk[chunk];
      if(!shader.fragmentShader.includes(anchor)||!source.includes(uv))throw Error(`Fox eye shader anchor missing: ${chunk}`);
      shader.fragmentShader=shader.fragmentShader.replace(anchor,source.replaceAll(uv,`howFoxEyeUv(${uv})`));
    }
  };
  material.customProgramCacheKey=()=>`${key}:how-fox-eyes-v1`;
  material.needsUpdate=true;
}

export function createFoxExpression(model:THREE.Object3D,root:THREE.Object3D,materials:THREE.Material[],id:string) {
  const head=model.getObjectByName('Head'),lids=model.getObjectByName('Lids');
  if(!head||!lids)throw Error('Admitted fox is missing Head / Lids');
  const seed=hash(id),restLids=lids.position.clone(),closedDelta=new THREE.Vector3(...F.lidsClosedDelta);
  const authoredHead=head.quaternion.clone(),gaze={value:new THREE.Vector2()},eyeTarget=new THREE.Vector2(),wantedGaze=new THREE.Vector2();
  const position=new THREE.Vector3(),direction=new THREE.Vector3(),up=new THREE.Vector3(),right=new THREE.Vector3();
  const inverseHead=new THREE.Quaternion(),bodyRotation=new THREE.Quaternion(),yawRotation=new THREE.Quaternion(),pitchRotation=new THREE.Quaternion();
  let yaw=0,pitch=0,blink=0;
  materials.forEach(material=>bindEyes(material,gaze));
  return {
    // PropertyMixer may skip unchanged tracks: always remove last frame's additive rotation first.
    beforeAnimation(){head.quaternion.copy(authoredHead);},
    update(view:WildlifeView,time:number,dt:number,reducedMotion:boolean,player?:THREE.Vector3,review?:FoxReviewPose) {
      authoredHead.copy(head.quaternion);
      if(review) {
        const sample=review.seconds;
        blink=clamp(review.blink??foxBlinkAt(sample,seed),0,1);
        eyeTarget.set(clamp(review.gaze?.[0]??Math.sin(sample*.65)*.4,-1,1),clamp(review.gaze?.[1]??0,-1,1));
        yaw=clamp(review.head?.[0]??0,-F.maxHeadYaw,F.maxHeadYaw);
        pitch=clamp(review.head?.[1]??0,-F.maxHeadPitch,F.maxHeadPitch);
      } else if(reducedMotion) {
        blink=0;eyeTarget.set(0,0);yaw=0;pitch=0;
      } else if(dt>0) {
        blink=foxBlinkAt(time,seed);
        let wantedYaw=0,wantedPitch=0,wantedEyeX=0,wantedEyeY=0;
        if(view.motionTag==='wildlife.idle') {
          // Held glances, not a constantly orbiting pupil. Walking/running looks ahead.
          const glance=Math.floor((time+unit(seed,17)*3.1)/3.1);
          wantedEyeX=(unit(seed,glance+511)-.5)*.8;
          wantedEyeY=(unit(seed,glance+913)-.5)*.25;
          wantedYaw=wantedEyeX*.12;
          root.updateWorldMatrix(true,true);head.getWorldPosition(position);
          if(player) {
            direction.copy(player).sub(position);
            const horizontal=Math.hypot(direction.x,direction.z);
            root.getWorldQuaternion(bodyRotation).invert();direction.applyQuaternion(bodyRotation);
            const angle=Math.atan2(direction.x,direction.z);
            if(horizontal<F.noticeDistance&&Math.abs(angle)<1.15) {
              const elevation=Math.atan2(direction.y,Math.max(.1,horizontal));
              wantedYaw=clamp(angle*.65,-F.maxHeadYaw,F.maxHeadYaw);
              wantedPitch=clamp(elevation*.45,-F.maxHeadPitch,F.maxHeadPitch);
              wantedEyeX=clamp((angle-yaw)/.55,-1,1);
              wantedEyeY=clamp((elevation-pitch)/.65,-1,1);
            }
          }
        }
        const eyeStep=1-Math.exp(-F.eyeResponse*dt),headStep=1-Math.exp(-F.headResponse*dt);
        eyeTarget.lerp(wantedGaze.set(wantedEyeX,wantedEyeY),eyeStep);
        yaw+=(wantedYaw-yaw)*headStep;pitch+=(wantedPitch-pitch)*headStep;
      }
      // Retract a shifted iris under the original closed lid; keep shared textures untouched.
      gaze.value.copy(eyeTarget).multiplyScalar(1-blink);
      lids.position.copy(restLids).addScaledVector(closedDelta,blink);
      root.updateWorldMatrix(true,true);
      head.getWorldQuaternion(inverseHead).invert();
      up.set(0,1,0).applyQuaternion(inverseHead).normalize();
      root.getWorldQuaternion(bodyRotation);
      right.set(1,0,0).applyQuaternion(bodyRotation).applyQuaternion(inverseHead).normalize();
      head.quaternion.multiply(yawRotation.setFromAxisAngle(up,yaw)).multiply(pitchRotation.setFromAxisAngle(right,-pitch));
    },
    stats:()=>({blink,gaze:eyeTarget.toArray(),head:[yaw,pitch]}),
    dispose(){head.quaternion.copy(authoredHead);lids.position.copy(restLids);gaze.value.set(0,0);},
  };
}

