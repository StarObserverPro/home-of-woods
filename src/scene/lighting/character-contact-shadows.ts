import * as THREE from 'three';
import {SHADOW_PROFILES} from '../../content/shadows.ts';
import {OCCLUSION} from '../../content/occlusion.ts';
import type {Resources} from '../resources.ts';

const C=SHADOW_PROFILES.character;

/** A sole point sampled after animation, in world space; never a camera-facing blob. */
export type CharacterFootContact={
  id:string;
  position:THREE.Vector3;
  forward?:THREE.Vector3;
  scale?:number;
};

export type CharacterContactPatch={
  id:string;
  center:THREE.Vector3;
  normal:THREE.Vector3;
  tangent:THREE.Vector3;
  radii:THREE.Vector2;
  strength:number;
  lift:number;
  receiverThickness:number;
};

type Options={
  surfaceAt:(x:number,z:number)=>number;
  normalAt?:(x:number,z:number,target:THREE.Vector3)=>THREE.Vector3;
};

const finiteVector=(p:THREE.Vector3)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
const smooth=(low:number,high:number,value:number)=>THREE.MathUtils.smoothstep(value,low,high);

/** Diagnostic of the single dynamic contact layer, after static ambient fields are combined. */
export function characterContactAmbient(baseAmbient:number,contactStrength:number,night=0){
  const weight=1-THREE.MathUtils.clamp(night,0,1)*.28;
  const strength=THREE.MathUtils.clamp(contactStrength,0,C.maxStrength);
  return Math.max(OCCLUSION.minimumAmbient,baseAmbient*(1-strength*weight));
}

/** CPU diagnostic of the same bounded, soft support footprint used by the AO shader. */
export function characterContactAt(contact:CharacterContactPatch,point:THREE.Vector3,normal:THREE.Vector3){
  const dx=point.x-contact.center.x,dy=point.y-contact.center.y,dz=point.z-contact.center.z;
  const n=contact.normal,t=contact.tangent;
  const sideX=n.y*t.z-n.z*t.y,sideY=n.z*t.x-n.x*t.z,sideZ=n.x*t.y-n.y*t.x;
  const radius=Math.hypot((dx*sideX+dy*sideY+dz*sideZ)/contact.radii.x,(dx*t.x+dy*t.y+dz*t.z)/contact.radii.y);
  const planeDistance=Math.abs(dx*n.x+dy*n.y+dz*n.z);
  return contact.strength*(1-smooth(.35,1,radius))
    *(1-smooth(contact.receiverThickness*.2,contact.receiverThickness,planeDistance))
    *smooth(.35,.85,normal.dot(n));
}

/** Small dynamic uniforms; no texture rebake, geometry, render pass or private clock. */
export function createCharacterContactShadows(resources:Resources,{surfaceAt,normalAt}:Options){
  const pool:CharacterContactPatch[]=Array.from({length:C.maxFeet},()=>({
    id:'',center:new THREE.Vector3(),normal:new THREE.Vector3(0,1,0),tangent:new THREE.Vector3(0,0,1),
    radii:new THREE.Vector2(C.radiusX,C.radiusZ),strength:0,lift:0,receiverThickness:C.receiverThickness,
  }));
  const contacts:CharacterContactPatch[]=[];
  let enabled=true,disposed=false,updates=0,omittedFeet=0;
  const controller={
    update(feet:readonly CharacterFootContact[]){
      if(disposed)return;
      contacts.length=0;omittedFeet=Math.max(0,feet.length-C.maxFeet);updates++;
      if(!enabled)return;
      for(const foot of feet){
        if(contacts.length===C.maxFeet)break;
        if(!finiteVector(foot.position))continue;
        const scale=foot.scale??1;
        if(!Number.isFinite(scale)||scale<=0)continue;
        const p=foot.position,ground=surfaceAt(p.x,p.z);
        if(!Number.isFinite(ground))continue;
        const patch=pool[contacts.length];
        patch.center.set(p.x,ground,p.z);
        if(normalAt)patch.normal.copy(normalAt(p.x,p.z,patch.normal));
        else{
          // Use the same height source as the receiver; the sample span follows the foot size.
          const step=Math.max(.035,C.radiusX*scale*.6);
          const dx=surfaceAt(p.x+step,p.z)-surfaceAt(p.x-step,p.z);
          const dz=surfaceAt(p.x,p.z+step)-surfaceAt(p.x,p.z-step);
          patch.normal.set(-dx,step*2,-dz);
        }
        if(!finiteVector(patch.normal)||patch.normal.lengthSq()<1e-10)continue;
        patch.normal.normalize();if(patch.normal.y<0)patch.normal.negate();
        const lift=p.y-ground;
        // Small animation penetration is tolerated; soles well below this support are invalid.
        if(lift<-.15*scale||lift>=C.liftedEnd*scale)continue;
        patch.lift=Math.max(0,lift);
        const airborne=smooth(C.fullContactHeight*scale,C.liftedEnd*scale,patch.lift);
        patch.strength=C.maxStrength*(1-airborne);
        if(patch.strength<=0)continue;
        const spread=1+C.spread*airborne;
        patch.radii.set(C.radiusX*scale*spread,C.radiusZ*scale*spread);
        patch.receiverThickness=C.receiverThickness*scale;
        if(foot.forward)patch.tangent.copy(foot.forward);else patch.tangent.set(0,0,1);
        if(!finiteVector(patch.tangent))patch.tangent.set(0,0,1);
        patch.tangent.addScaledVector(patch.normal,-patch.tangent.dot(patch.normal));
        if(patch.tangent.lengthSq()<1e-8){
          patch.tangent.set(1,0,0).addScaledVector(patch.normal,-patch.normal.x);
        }
        patch.tangent.normalize();patch.id=foot.id;contacts.push(patch);
      }
    },
    contacts:()=>contacts as readonly CharacterContactPatch[],
    setEnabled(value:boolean){if(disposed)return;enabled=value;if(!value)contacts.length=0;},
    stats(){return {enabled:enabled&&!disposed,disposed,updates,omittedFeet,activeFeet:contacts.length,
      mode:'animated-sole ambient contacts',maxStrength:C.maxStrength,extraDrawCalls:0,extraRenderPasses:0,
      feet:contacts.map(p=>({id:p.id,center:p.center.toArray(),normal:p.normal.toArray(),radii:p.radii.toArray(),strength:p.strength,lift:p.lift}))};},
    dispose(){if(disposed)return;disposed=true;enabled=false;contacts.length=0;for(const patch of pool)patch.strength=0;},
  };
  return resources.own(controller);
}
