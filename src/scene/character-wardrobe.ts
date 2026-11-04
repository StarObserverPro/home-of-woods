import * as THREE from 'three';
import type {Resources} from './resources.ts';
import {DEFAULT_WARDROBE, WARDROBE_OPTIONS, WARDROBE_SLOTS, resolveWardrobe} from '../content/wardrobe.ts';
import type {WardrobeLook, WardrobeSlot} from '../content/wardrobe.ts';

/** Low-poly modular accessories and bone-following clothing, without another skeleton or mixer.
 * Everything is an optional cover over the reviewed KayKit model; the original remains selectable.
 * This does NOT claim cloth simulation or the skinning fidelity of a fully tailored garment.
 */
export function createCharacterWardrobe(resources:Resources, actor:THREE.Object3D) {
  const bones=new Map<string,THREE.Bone>();
  for(const name of ['head','chest','hips','upperarml','upperarmr','lowerarml','lowerarmr',
    'upperlegl','upperlegr','lowerlegl','lowerlegr','footl','footr']) {
    const found=actor.getObjectByName(name);
    if(!(found instanceof THREE.Bone))throw new Error('Missing wardrobe-compatible KayKit bone: '+name);
    bones.set(name,found);
  }
  type Part={root:THREE.Group; slot:WardrobeSlot;variant:string};
  const parts:Part[]=[];
  let look:WardrobeLook={...DEFAULT_WARDROBE},disposed=false;
  let hairTail:THREE.Group|null=null,packKnot:THREE.Group|null=null;
  const bone=(name:string)=>bones.get(name)!;
  const cylinder=(top:number,bottom:number,height:number,segments=9)=>
    resources.geometry('wardrobe:cy:'+ [top,bottom,height,segments].join(','),()=>
      new THREE.CylinderGeometry(top,bottom,height,segments,1));
  const ellipsoid=()=>resources.geometry('wardrobe:sph',()=>new THREE.SphereGeometry(1,10,7));
  const cuboid=(x:number,y:number,z:number)=>
    resources.geometry('wardrobe:box:'+ [x,y,z].join(','),()=>new THREE.BoxGeometry(x,y,z));
  const ring=(radius:number,tube:number)=>
    resources.geometry('wardrobe:ring:'+ [radius,tube].join(','),()=>
      new THREE.TorusGeometry(radius,tube,4,12));
  function mount(slot:WardrobeSlot,variant:string,to:string) {
    if(!Object.hasOwn(WARDROBE_OPTIONS[slot],variant))throw Error('Unknown wardrobe variant: '+variant);
    const root=new THREE.Group();root.name='wardrobe:'+slot+':'+variant+':'+to;
    bone(to).add(root);parts.push({root,slot,variant});return root;
  }
  function put(root:THREE.Group,geo:THREE.BufferGeometry,color:string,
      pos:[number,number,number],size?:[number,number,number]){
    const m=new THREE.Mesh(geo,resources.material(color,.84));
    m.position.set(...pos);if(size)m.scale.set(...size);
    m.castShadow=true;m.receiveShadow=true;root.add(m);return m;
  }
  function topVariant(id:WardrobeLook['top'],fabric:string,longSleeve:boolean,vest=false,hem=false) {
    if(id==='original')return;
    const torso=mount('top',id,'chest');
    put(torso,cylinder(vest?.31:.295,hem?.35:.305,hem?.62:.53,9),fabric,[0,-.18,0]);
    put(torso,cylinder(.267,.267,.038,10),'#c7b99a',[0,.085,0]);
    if(hem)put(torso,cylinder(.346,.343,.07,9),'#8f7657',[0,-.49,0]);
    if(!vest)for(const side of ['l','r']){
      put(mount('top',id,'upperarm'+side),cylinder(.145,.132,.25,8),fabric,[0,.11,0]);
      if(longSleeve)put(mount('top',id,'lowerarm'+side),cylinder(.133,.113,.25,8),fabric,[0,.115,0]);
    }
  }
  topVariant('field-shirt','#708364',false);
  topVariant('canvas-vest','#b2996f',false,true);
  topVariant('work-jacket','#617784',true,false,true);

  function trousers(id:WardrobeLook['bottom'],fabric:string,patched:boolean) {
    if(id==='original')return;
    const belt=mount('bottom',id,'hips');
    put(belt,cylinder(.30,.30,.065,10),'#70533d',[0,.065,0]);
    for(const side of ['l','r']){
      const upper=mount('bottom',id,'upperleg'+side);
      put(upper,cylinder(.151,.137,.24,8),fabric,[0,.112,0]);
      const lower=mount('bottom',id,'lowerleg'+side);
      put(lower,cylinder(.137,.128,.24,8),fabric,[0,.11,0]);
      if(patched)put(lower,cuboid(.18,.14,.018),'#b49a6c',[0,.08,-.135]);
    }
  }
  trousers('field-trousers','#756b54',false);
  trousers('patched-trousers','#656c5e',true);

  function footVariant(id:WardrobeLook['footwear'],fabric:string,high:boolean){
    if(id==='original')return;
    for(const side of ['l','r']){
      const foot=mount('footwear',id,'foot'+side);
      put(foot,ellipsoid(),fabric,[0,.11,-.02],[.16,.23,.14]);
      if(high)put(mount('footwear',id,'lowerleg'+side),
        cylinder(.139,.13,.23,9),fabric,[0,.095,0]);
    }
  }
  footVariant('shoes','#5a4334',false);
  footVariant('boots','#413a33',true);

  function hairVariant(id:WardrobeLook['hair']) {
    if(id==='original')return;
    const root=mount('hair',id,'head');
    const shade='#292928';
    put(root,ellipsoid(),shade,[0,.305,0],[.35,.15,.31]);
    if(id==='cropped'){
      put(root,ellipsoid(),shade,[0,.25,-.19],[.32,.13,.15]);
    }else if(id==='swept'){
      const fringe=put(root,cuboid(.37,.075,.15),shade,[.07,.25,-.27]);
      fringe.rotation.z=-.24;
    }else if(id==='bun'){
      put(root,ellipsoid(),shade,[0,.36,.31],[.17,.18,.17]);
    }else if(id==='ponytail'){
      const tail=new THREE.Group();tail.position.set(0,.28,.29);root.add(tail);
      put(tail,ellipsoid(),shade,[0,-.15,.02],[.14,.24,.14]);
      hairTail=tail;
    }
  }
  for(const id of ['cropped','swept','bun','ponytail'] as const)hairVariant(id);

  {
    const straw=mount('headwear','straw','head');
    put(straw,cylinder(.40,.40,.038,12),'#d2b374',[0,.44,0]);
    put(straw,cylinder(.23,.28,.25,10),'#d2b374',[0,.56,0]);
    put(straw,cylinder(.281,.281,.037,10),'#826647',[0,.464,0]);
    const cap=mount('headwear','cap','head');
    put(cap,ellipsoid(),'#647889',[0,.385,0],[.36,.155,.31]);
    put(cap,ellipsoid(),'#596d80',[0,.305,-.30],[.27,.035,.15]);
    const beanie=mount('headwear','beanie','head');
    put(beanie,ellipsoid(),'#af684f',[0,.43,0],[.34,.20,.32]);
    put(beanie,cylinder(.34,.34,.075,10),'#a15d49',[0,.33,0]);
  }

  {
    const pack=mount('back','pack','chest');
    put(pack,cuboid(.49,.51,.28),'#8b7455',[0,-.19,.29]);
    put(pack,cuboid(.48,.12,.31),'#a48a65',[0,.075,.28]);
    put(pack,cuboid(.42,.07,.07),'#6a5137',[0,-.05,.48]);
    for(const sx of [-1,1])put(pack,cuboid(.07,.49,.07),'#65543e',[sx*.23,-.17,.04]);
    const knot=new THREE.Group();knot.position.set(.18,.04,.44);pack.add(knot);
    const leaf=put(knot,ellipsoid(),'#d1b782',[.07,0,0],[.11,.04,.045]);leaf.rotation.z=.3;
    packKnot=knot;
  }

  function apply(next:WardrobeLook){
    if(disposed)return;
    look=resolveWardrobe(next);
    for(const p of parts)p.root.visible=look[p.slot]===p.variant;
  }
  apply(DEFAULT_WARDROBE);
  return {
    apply,
    update(seconds:number,moving:boolean,reducedMotion:boolean){
      if(disposed)return;
      const swing=moving&&!reducedMotion?Math.sin(seconds*7)*.075:0;
      if(hairTail)hairTail.rotation.z=look.hair==='ponytail'?swing:0;
      if(packKnot)packKnot.rotation.z=look.back==='pack'?swing*.7:0;
    },
    stats:()=>({look:{...look},parts:parts.length,disposed}),
    dispose(){
      if(disposed)return;disposed=true;
      for(const p of parts){p.root.removeFromParent();p.root.clear();}
      parts.length=0;hairTail=null;packKnot=null;
      // Geometry and materials are cached by the scene Resources owner.
    },
  };
}
