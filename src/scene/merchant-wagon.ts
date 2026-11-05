import * as THREE from 'three';
import {heightAt} from '../world/surface.ts';
import {MERCHANT_SCENE,merchantVisitAt} from '../content/merchant.ts';
import type {Resources} from './resources.ts';

/**
 * First playable wagon: compact local geometry adapted to the project's toy proportions.
 * Art direction/reference: Codels Covered Wagon, CC0 1.0
 * https://codels.download/models/wagon
 * No third-party binary, runtime network request, texture atlas or visible dynamic cargo.
 * Replace this adapter with a locally vetted GLB in a later asset intake without changing
 * merchant ownership, trade or movement state.
 */
export function createMerchantWagon(r:Resources) {
  const root=new THREE.Group();root.name='merchant-covered-wagon';
  const body=new THREE.Group();root.add(body);
  const wood=r.material('#a0784b'),dark=r.material('#60482e');
  const canvas=r.material('#dfd3a5'),strap=r.material('#887450'),metal=r.material('#7f897b');
  const fur=r.material('#bca47f'),furDark=r.material('#826c4c'),nose=r.material('#e6ccaa');
  const box=(parent:THREE.Group,w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number)=>{
    const m=new THREE.Mesh(r.geometry('merchant-box-'+w+'-'+h+'-'+d,()=>new THREE.BoxGeometry(w,h,d)),material);
    m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;
  };
  // Low-sided wooden chassis stays invisible under the closed cloth roof.
  box(body,2.1,.18,3.25,wood,0,.92,0);
  for(const side of [-1,1]){
    box(body,.16,.62,3.25,wood,side*1,1.22,0);
    box(body,.15,.14,3.4,dark,side*1,1.55,0);
  }
  box(body,2.0,.62,.14,dark,0,1.23,-1.55);
  box(body,2.05,.13,.42,wood,0,.96,1.85);
  box(body,1.7,.15,.17,dark,0,1.35,1.68);
  for(const sign of [-1,1])box(body,.09,.09,2.7,dark,sign*.5,.78,2.15);
  // Faceted closed bonnet: no cargo meshes, no runtime stacking problem.
  const verts:number[]=[];const panels=10;
  for(let j=0;j<panels;j++){
    const a=Math.PI*j/panels,b=Math.PI*(j+1)/panels;
    const xa=1.12*Math.cos(a),xb=1.12*Math.cos(b);
    const ya=1.68+.98*Math.sin(a),yb=1.68+.98*Math.sin(b);
    for(const v of [[xa,ya,-1.68],[xa,ya,1.62],[xb,yb,1.62],[xa,ya,-1.68],[xb,yb,1.62],[xb,yb,-1.68]])verts.push(...v);
  }
  const roofGeometry=r.geometry('merchant-cloth-roof',()=>{
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.computeVertexNormals();return g;
  });
  const roof=new THREE.Mesh(roofGeometry,canvas);roof.material.side=THREE.DoubleSide;roof.castShadow=true;body.add(roof);
  for(const z of [-1.63,1.59]){
    for(const angle of [-Math.PI/2,0,Math.PI/2]){
      const piece=box(body,.055,.08,3.4,strap,Math.cos(angle)*.95,2.35+Math.sin(angle)*.05,z);
      piece.rotation.z=angle;
    }
  }
  const curtain=box(body,1.96,.96,.07,canvas,0,1.9,-1.71);
  curtain.rotation.x=.06;
  const wheels:THREE.Group[]=[];
  const wheelGeometry=r.geometry('merchant-wheel',()=>new THREE.TorusGeometry(.49,.095,5,10));
  const hubGeometry=r.geometry('merchant-hub',()=>new THREE.CylinderGeometry(.16,.16,.18,8));
  for(const x of [-1.23,1.23])for(const z of [-1.08,1.08]){
    const wheel=new THREE.Group();wheel.position.set(x,.53,z);
    const tire=new THREE.Mesh(wheelGeometry,dark);tire.rotation.y=Math.PI/2;wheel.add(tire);
    const hub=new THREE.Mesh(hubGeometry,metal);hub.rotation.z=Math.PI/2;wheel.add(hub);
    for(let k=0;k<8;k++){
      const spoke=box(wheel,.075,.075,.78,wood,0,0,0);
      spoke.rotation.x=k*Math.PI/8;
    }
    body.add(wheel);wheels.push(wheel);
  }
  // Small faceted pack donkey, not a re-skinned mountain goat.
  const donkey=new THREE.Group();donkey.position.set(0,0,3.34);body.add(donkey);
  const barrel=(parent:THREE.Group,top:number,bottom:number,height:number,material:THREE.Material,x:number,y:number,z:number,segments=7)=>{
    const m=new THREE.Mesh(r.geometry('merchant-cylinder-'+top+'-'+bottom+'-'+height,()=>new THREE.CylinderGeometry(top,bottom,height,segments)),material);
    m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;
  };
  const belly=new THREE.Mesh(r.geometry('merchant-donkey-body',()=>new THREE.SphereGeometry(.54,8,5)),fur);
  belly.scale.set(1,.82,1.65);belly.position.y=1.35;donkey.add(belly);
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
