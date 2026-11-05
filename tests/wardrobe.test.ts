import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createState,createStarterState} from '../src/domain/state.ts';
import {WARDROBE_SLOTS,STARTER_WEAR,WARDROBE_DESIGN_LIBRARY} from '../src/content/wardrobe.ts';
import {changeWardrobe,wardrobeSnapshot} from '../src/domain/wardrobe.ts';
import {validateInventory} from '../src/domain/inventory.ts';
import {serializeInventory,prepareInventoryPersistence} from '../src/domain/inventory-persistence.ts';
import {itemProperties} from '../src/domain/item-properties.ts';
import {createWardrobeVisual} from '../src/scene/wardrobe-visual.ts';
import {Resources} from '../src/scene/resources.ts';

test('new world grants exactly one common starter item in each wearable slot',()=>{
  assert.equal(createState().inventory.instances,undefined,'generic state must stay empty for old tests and migration');
  const s=createStarterState(),instances=s.inventory.instances??[];
  assert.doesNotThrow(()=>validateInventory(s.inventory));
  assert.equal(WARDROBE_SLOTS.length,8);
  assert.equal(instances.length,8);
  const view=wardrobeSnapshot(s.inventory);
  assert.deepEqual(view.slots.map(x=>x.label),['上衣','裤装','鞋靴','帽子','背负','手套','腰带','领巾']);
  assert.equal(view.slots.filter(x=>x.equipped!==null).length,8);
  for(const slot of view.slots){
    const worn=instances.find(i=>i.instanceId===slot.equipped!.instanceId)!;
    assert.equal(worn.location.kind,'mounted');
    assert.equal(worn.rarityId,'common');
    assert.deepEqual(itemProperties(worn).traits,[]);
  }
  assert.equal(new Set(instances.map(i=>i.instanceId)).size,8);
});
test('design variants are 78 distinct silhouettes; no unapproved 3D files are claimed',()=>{
  const counts=new Map<string,number>();
  for(const shape of WARDROBE_DESIGN_LIBRARY){
    assert.equal(shape.meshAssetId,null);
    assert.equal(shape.status,'design-only');
    counts.set(shape.slotId,(counts.get(shape.slotId)??0)+1);
  }
  assert.deepEqual(Object.fromEntries(counts),{
    'player:top':20,'player:legs':20,'player:feet':8,'player:head':9,
    'player:back':6,'player:hands':5,'player:waist':5,'player:neck':5
  });
  assert.equal(WARDROBE_DESIGN_LIBRARY.length,78);
  assert.equal(new Set(WARDROBE_DESIGN_LIBRARY.map(s=>s.designId)).size,78);
});
test('unequip and equip use one ownership ledger, conserve identities, and survive persistence',()=>{
  const state=createStarterState(),original=state.inventory;
  const initialHat=wardrobeSnapshot(original).slots.find(s=>s.slotId==='player:head')!.equipped!;
  const removed=changeWardrobe(original,{kind:'unequip',slotId:'player:head'}).inventory;
  assert.notEqual(removed,original);assert.equal(original.revision,0);
  assert.equal(wardrobeSnapshot(removed).slots.find(s=>s.slotId==='player:head')!.equipped,null);
  assert.equal(wardrobeSnapshot(removed).slots.find(s=>s.slotId==='player:head')!.available[0].instanceId,initialHat.instanceId);
  const worn=changeWardrobe(removed,{kind:'equip',slotId:'player:head',instanceId:initialHat.instanceId}).inventory;
  assert.equal(worn.instances!.find(i=>i.instanceId===initialHat.instanceId)!.location.kind,'mounted');
  assert.equal(worn.instances!.length,8);
  const result=prepareInventoryPersistence(serializeInventory(worn));
  assert.equal(result.decision,'restored');
  if(result.decision==='protected')return;
  assert.deepEqual(result.value.instances,worn.instances);
  assert.equal(worn.revision,2);
});
test('replacement moves old clothes to inventory, preserves traits, rejects wrong slots atomically',()=>{
  const s=createStarterState(),before=structuredClone(s.inventory);
  const top=before.instances!.find(v=>v.definitionId===STARTER_WEAR[0].definitionId)!;
  const replacement={...structuredClone(top),instanceId:'extra-work-shirt',traits:[{id:'color',value:3}],location:{kind:'inventory' as const}};
  const augmented={...s.inventory,instances:[...s.inventory.instances!,replacement]};
  const next=changeWardrobe(augmented,{kind:'equip',slotId:'player:top',instanceId:replacement.instanceId}).inventory;
  const current=next.instances!.find(v=>v.instanceId===replacement.instanceId)!;
  assert.equal(current.location.kind,'mounted');
  assert.deepEqual(itemProperties(current).traits,[{id:'color',value:3}]);
  assert.equal(next.instances!.find(v=>v.instanceId===top.instanceId)!.location.kind,'inventory');
  assert.equal(next.instances!.length,9);
  const frozen=structuredClone(next);
  assert.throws(()=>changeWardrobe(next,{kind:'equip',slotId:'player:feet',instanceId:top.instanceId}),/不能穿/);
  assert.deepEqual(next,frozen);
});
test('starter overlays use named bones and hide instantly when independently unequipped',()=>{
  const resources=new Resources(),body=new THREE.Group();
  for(const name of ['head','chest','handslotl','handslotr']){
    const bone=new THREE.Bone();bone.name=name;body.add(bone);
  }
  const visual=createWardrobeVisual(resources,body);
  const hats=body.getObjectByName('starter-soft-cap')!;
  const pack=body.getObjectByName('starter-small-pack')!;
  let s=createState();
  visual.update(s.inventory);
  assert.equal(hats.visible,true);
  assert.equal(pack.visible,true);
  s.inventory=changeWardrobe(s.inventory,{kind:'unequip',slotId:'player:head'}).inventory;
  visual.update(s.inventory);assert.equal(hats.visible,false);assert.equal(pack.visible,true);
  s.inventory=changeWardrobe(s.inventory,{kind:'unequip',slotId:'player:back'}).inventory;
  visual.update(s.inventory);assert.equal(pack.visible,false);
  visual.dispose();
  assert.equal(body.children.every(bone=>bone.children.length===0),true);
  resources.dispose();
});
