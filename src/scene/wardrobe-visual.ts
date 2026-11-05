import * as THREE from 'three';
import {STARTER_WEAR} from '../content/wardrobe.ts';
import type {InventoryState} from '../domain/inventory.ts';
import type {Resources} from './resources.ts';

/** Lightweight, original low-poly starter accessories attached to the existing KayKit bones.
 * Baked base garment regions are deliberately left untouched until the rig-rebuild pass.
 * Shared geometries and materials remain owned by Resources.
 */
export function createWardrobeVisual(resources:Resources,body:THREE.Object3D){
  const at=(boneName:string)=>{
    const bone=body.getObjectByName(boneName);
    if(!(bone instanceof THREE.Bone))throw new Error('Wardrobe missing character bone: '+boneName);
    const root=new THREE.Group();root.name='wardrobe-on-'+boneName;bone.add(root);return root;
  };
  const head=at('head'),chest=at('chest'),left=at('handslotl'),right=at('handslotr');
  const appearance=new Map<string,THREE.Object3D>();
  const mesh=(key:string,geometry:()=>THREE.BufferGeometry,color:string)=>{
    const item=new THREE.Mesh(resources.geometry('wardrobe-'+key,geometry),resources.material(color,.84));
    item.castShadow=true;item.receiveShadow=true;return item;
  };
  const hat=new THREE.Group();hat.name='starter-soft-cap';
  const crown=mesh('cap-crown',()=>new THREE.CylinderGeometry(.22,.235,.135,8),'#6b7951');crown.position.y=.26;
  const visor=mesh('cap-visor',()=>new THREE.BoxGeometry(.34,.025,.19),'#65754e');visor.position.set(0,.19,.16);
  hat.add(crown,visor);head.add(hat);appearance.set('player:head',hat);

  const backpack=new THREE.Group();backpack.name='starter-small-pack';
  const pack=mesh('pack-body',()=>new THREE.BoxGeometry(.34,.40,.18),'#8e7653');pack.position.set(0,-.10,-.28);
  const flap=mesh('pack-flap',()=>new THREE.BoxGeometry(.35,.14,.20),'#aa9166');flap.position.set(0,.035,-.28);
  backpack.add(pack,flap);
  for(const side of [-1,1]){
    const strap=mesh('pack-strap',()=>new THREE.BoxGeometry(.047,.36,.042),'#5a5946');strap.position.set(side*.135,-.13,.14);
    backpack.add(strap);
  }
  chest.add(backpack);appearance.set('player:back',backpack);

  for(const anchor of [left,right]){
    const mitten=mesh('gloves',()=>new THREE.BoxGeometry(.105,.10,.145),'#a59069');mitten.position.y=-.025;
    anchor.add(mitten);
    appearance.set(anchor===left?'player:hands-left':'player:hands-right',mitten);
  }
  const scarf=new THREE.Group();scarf.name='starter-linen-scarf';
  const knot=mesh('scarf-knot',()=>new THREE.DodecahedronGeometry(.09,0),'#d8c7a5');knot.position.set(0,.16,.20);
  const fall=mesh('scarf-fall',()=>new THREE.ConeGeometry(.09,.25,4),'#ccb68e');fall.rotation.z=Math.PI;fall.position.set(.035,-.02,.20);
  scarf.add(knot,fall);chest.add(scarf);appearance.set('player:neck',scarf);

  // Starter visuals are keyed by the equipped item definition, not by the occupied slot alone.
  let previous:string|null=null;
  function update(inventory:InventoryState){
    const worn=new Map<string,string>();
    for(const item of inventory.instances??[]){
      if(item.location.kind==='mounted'&&item.location.hostId==='player')worn.set(item.location.slotId,item.definitionId);
    }
    const signature=[...worn.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([slot,id])=>slot+':'+id).join('|');
    if(signature===previous)return;previous=signature;
    const owned=worn;
    for(const item of STARTER_WEAR){
      const visible=owned.get(item.slotId)===item.definitionId;
      if(item.slotId==='player:hands'){
        appearance.get('player:hands-left')!.visible=visible;
        appearance.get('player:hands-right')!.visible=visible;
      }else { const model=appearance.get(item.slotId);if(model)model.visible=visible; }
    }
  }
  return {update,dispose(){
    for(const item of [head,chest,left,right])item.removeFromParent();
    appearance.clear();
  }};
}
