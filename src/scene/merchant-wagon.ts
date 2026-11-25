import * as THREE from 'three';
import {heightAt} from '../world/surface.ts';
import {MERCHANT_SCENE,merchantVisitAt} from '../content/merchant.ts';
import type {Resources} from './resources.ts';

export function createMerchantWagon(r:Resources,wagon:THREE.Group) {
  const root=new THREE.Group();root.name='merchant-covered-wagon';
  root.add(wagon);
  const wheels=['wheelFL','wheelFR','wheelRL','wheelRR'].map(name=>wagon.getObjectByName(name)!);
  const dark=r.material('#60482e');
  const fur=r.material('#bca47f'),furDark=r.material('#826c4c'),nose=r.material('#e6ccaa');
  const box=(parent:THREE.Group,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number)=>{
    const m=new THREE.Mesh(r.geometry('merchant-box-'+w+'-'+h+'-'+d,()=>new THREE.BoxGeometry(w,h,d)),material);
    m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;
  };
  const donkey=new THREE.Group();donkey.position.z=3.55;root.add(donkey);
  const harness=r.material('#765636',.88);
  for(const side of [-1,1]){
    const trace=box(root,.045,.045,Math.hypot(.89,1.05),harness,side*.39,.715,3.125);
    trace.rotation.x=-Math.atan2(.89,1.05);
  }
  const barrel=(parent:THREE.Group,top:number,bottom:number,height:number,material:THREE.Material,x:number,y:number,z:number,segments=7)=>{
    const m=new THREE.Mesh(r.geometry('merchant-cylinder-'+top+'-'+bottom+'-'+height,()=>new THREE.CylinderGeometry(top,bottom,height,segments)),material);
    m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;
  };
  const belly=new THREE.Mesh(r.geometry('merchant-donkey-body',()=>new THREE.SphereGeometry(.54,8,5)),fur);
  belly.scale.set(1,.82,1.65);belly.position.y=1.35;donkey.add(belly);
  const bellyBand=new THREE.Mesh(r.geometry('merchant-donkey-belly-band',()=>new THREE.CylinderGeometry(1,1,.15,10).rotateX(Math.PI/2)),harness);
  bellyBand.scale.set(.55,.454,1);bellyBand.position.set(0,1.35,.10);donkey.add(bellyBand);
  for(const x of [-.36,.36])for(const z of [-.55,.55]){
    const leg=barrel(donkey,.105,.13,.94,furDark,x,.56,z);
    leg.rotation.x=z>0?-.06:.06;
    box(donkey,.24,.17,.31,dark,x,.14,z+.02);
  }
  const neck=barrel(donkey,.25,.32,.9,fur,.0,1.76,.68);
  neck.rotation.x=-.31;
  const head=new THREE.Group();head.position.set(0,2.08,.93);donkey.add(head);
  const skull=box(head,.47,.46,.74,fur,0,0,.08);
  skull.rotation.x=-.08;
  box(head,.42,.27,.3,nose,0,-.16,.50);
  for(const side of [-1,1]){
    const ear=barrel(head,.055,.115,.47,furDark,side*.18,.45,-.07,5);
    ear.rotation.z=side*.16;
    const eye=new THREE.Mesh(r.geometry('merchant-donkey-eye',()=>new THREE.SphereGeometry(.043,5,4)),dark);
    eye.position.set(side*.25,.08,.37);head.add(eye);
  }
  barrel(donkey,.065,.025,.72,furDark,0,1.24,-.92).rotation.x=.4;
  root.rotation.y=.78;
  root.visible=false;
  const path=new THREE.Vector2(MERCHANT_SCENE.entryOffset.x,MERCHANT_SCENE.entryOffset.z);
  let previously=0;
  return {
    group:root,
    update(time:number,reducedMotion=false){
      const presence=merchantVisitAt(time);root.visible=presence.active;
      if(!presence.active)return;
      const t=presence.travel;
      const ease=t*t*(3-2*t);
      const x=MERCHANT_SCENE.wagon.x+path.x*(1-ease),z=MERCHANT_SCENE.wagon.z+path.y*(1-ease);
      root.position.set(x,heightAt(x,z),z);
      const moving=t<1&&!reducedMotion;
      const change=Math.abs(t-previously);
      if(moving&&change>0)for(const wheel of wheels)wheel.rotation.x+=.8*change*15;
      head.rotation.y=presence.parked&&!reducedMotion?.055*Math.sin(time*.6):0;
      previously=t;
    },
    dispose(){root.removeFromParent();root.clear();},
  };
}
