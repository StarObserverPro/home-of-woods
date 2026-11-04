import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ITEM_ACTIONS, LOCAL_MOTIONS } from '../src/content/item-behaviors.ts';
import type { ItemActionDefinition, LocalMotionProfile } from '../src/content/item-behaviors.ts';
import { ITEM_CATALOG } from '../src/domain/item-catalog.ts';
import { createItemBehaviorRegistry, itemActionEligibility, prepareItemAction, actionsForItem, itemMountedContexts } from '../src/domain/item-behaviors.ts';
import type { ItemActionContext } from '../src/domain/item-behaviors.ts';
import { sampleItemLocalMotion } from '../src/domain/item-local-motion.ts';
import { createItemLocalMotionBinding } from '../src/scene/item-local-motion.ts';
import { createState } from '../src/domain/state.ts';
import { canonicalInstances } from '../src/domain/owned-items.ts';
import { createAttachmentRegistry } from '../src/domain/item-attachment-contract.ts';
import type { OwnedItem } from '../src/domain/owned-items.ts';

const item = (definitionId: string, traitId?: string): OwnedItem => ({
  instanceId:'travel-item-1',definitionId,blueprintId:'blueprint.future',createdAt:0,
  location:{kind:'inventory'},traits:traitId?[{id:traitId,value:1}]:[],
  rarityId:'epic', customPayload:{future:true},
});
const ctx = (patch: Partial<ItemActionContext> = {}): ItemActionContext => ({
  trigger:'direct',target:'none',nearby:true,features:new Set(['travel.equipment']),
  contexts:new Set<string>(),presentItemDefinitions:new Set<string>(),
  handlers:new Set(['test.handler']),...patch,
});
const withActiveOwner = (definitionId: string) => {
  const definitions = new Map(ITEM_CATALOG.ownedItems);
  const def = definitions.get(definitionId)!;
  definitions.set(definitionId,{...def,status:'active' as const});
  return definitions;
};
const whistleBase: ItemActionDefinition = {
  actionId:'travel.whistle.test',ownerDefinitionId:'travel.whistle',
  source:'base',status:'active',trigger:'direct',target:'none',
  allowedLocations:['inventory'],requiredFeatures:['travel.equipment'],
  requiredContexts:[],requiredItemDefinitions:[],motionProfileId:null,
  handlerId:'test.handler',
};

test('travel tools exist as planned item bodies before any affix or usable action is unlocked', () => {
  const bodies=['travel.umbrella','travel.sun-hat','travel.spyglass','travel.whistle','travel.animal-blanket','travel.backpack'];
  for (const id of bodies) {
    assert.equal(ITEM_CATALOG.ownedItems.get(id)?.status,'planned');
    assert.deepEqual(ITEM_CATALOG.ownedItems.get(id)?.blueprintIds,[]);
  }
  for (const a of ITEM_ACTIONS) {
    assert.equal(a.status,'planned');
    assert.equal(a.source,'base');
    assert.ok(bodies.includes(a.ownerDefinitionId));
    assert.equal(itemActionEligibility(item(a.ownerDefinitionId),a.actionId,ctx()).available,false);
  }
  assert.ok(LOCAL_MOTIONS.every(p=>p.status==='planned'));
  assert.deepEqual(actionsForItem(item('travel.umbrella')).map(a=>a.actionId),['travel.umbrella.open']);
});

test('action intents are gated by object identity, range, target, executable handler and world features', () => {
  const registry=createItemBehaviorRegistry([whistleBase],[],withActiveOwner('travel.whistle'));
  const owned=item('travel.whistle'),original=structuredClone(owned);
  assert.equal(prepareItemAction(owned,whistleBase.actionId,ctx(),registry).handlerId,'test.handler');
  assert.deepEqual(prepareItemAction(owned,whistleBase.actionId,ctx(),registry).target,{kind:'none'});
  assert.deepEqual(owned,original); // request is not an effect or an inventory transaction
  assert.equal(itemActionEligibility(item('travel.umbrella'),whistleBase.actionId,ctx(),registry).available,false);
  for(const bad of [
    ctx({nearby:false}),ctx({trigger:'movement'}),ctx({target:'point'}),
    ctx({features:new Set()}),ctx({handlers:new Set()}),
  ]) {
    assert.equal(itemActionEligibility(owned,whistleBase.actionId,bad,registry).available,false);
    assert.throws(()=>prepareItemAction(owned,whistleBase.actionId,bad,registry));
  }
  const inWorld={...owned,location:{kind:'world' as const,x:0,z:0,rotation:0}};
  assert.equal(itemActionEligibility(inWorld,whistleBase.actionId,ctx(),registry).available,false);
});

test('point and item interactions must carry a concrete target in the action intent', () => {
  const pointAction:ItemActionDefinition={...whistleBase,actionId:'travel.whistle.test-point',target:'point'};
  const itemAction:ItemActionDefinition={...whistleBase,actionId:'travel.whistle.test-item',target:'item'};
  const registry=createItemBehaviorRegistry([pointAction,itemAction],[],withActiveOwner('travel.whistle'));
  const owned=item('travel.whistle');
  assert.equal(itemActionEligibility(owned,pointAction.actionId,ctx({target:'point'}),registry).available,false);
  assert.equal(itemActionEligibility(owned,pointAction.actionId,ctx({target:'point',targetPoint:{x:NaN,z:0}}),registry).available,false);
  const selectedPoint=ctx({target:'point',targetPoint:{x:-44,z:12}});
  assert.deepEqual(prepareItemAction(owned,pointAction.actionId,selectedPoint,registry).target,
    {kind:'point',point:{x:-44,z:12}});
  assert.equal(itemActionEligibility(owned,itemAction.actionId,ctx({target:'item'}),registry).available,false);
  assert.deepEqual(prepareItemAction(owned,itemAction.actionId,ctx({target:'item',targetItemId:'another-instance'}),registry).target,
    {kind:'item',instanceId:'another-instance'});
  assert.equal(selectedPoint.targetPoint!.x,-44);
});

test('unrecognized affixes are inert; registered trait actions need the owner trait and all prerequisites', () => {
  const traitAction: ItemActionDefinition = {
    ...whistleBase,actionId:'travel.whistle.trait-demo',source:'trait',traitId:'future.reply',
    trigger:'environment',target:'environment',targetContextId:'wind',requiredContexts:['wind'],
    requiredItemDefinitions:['travel.spyglass'],
  };
  const registry=createItemBehaviorRegistry([traitAction],[],withActiveOwner('travel.whistle'));
  const input=ctx({trigger:'environment',target:'environment',targetContextId:'wind',contexts:new Set(['wind']),
    presentItemDefinitions:new Set(['travel.spyglass'])});
  assert.equal(itemActionEligibility(item('travel.whistle'),traitAction.actionId,input,registry).available,false);
  const hasTrait=item('travel.whistle','future.reply');
  assert.equal(itemActionEligibility(hasTrait,traitAction.actionId,input,registry).available,true);
  assert.equal(itemActionEligibility(hasTrait,traitAction.actionId,ctx({trigger:'environment',target:'environment',targetContextId:'wind',contexts:new Set(['wind'])}),registry).available,false);
  assert.equal(itemActionEligibility(hasTrait,traitAction.actionId,ctx({trigger:'environment',target:'environment',targetContextId:'wind',
    contexts:new Set(),presentItemDefinitions:new Set(['travel.spyglass'])}),registry).available,false);
  assert.equal(itemActionEligibility(item('travel.whistle','unknown.affix'),traitAction.actionId,input,registry).available,false);
});

test('invalid animations and conflicting action declarations are rejected at registration',()=>{
  const active:LocalMotionProfile={...LOCAL_MOTIONS[0],status:'active'};
  assert.throws(()=>createItemBehaviorRegistry([whistleBase,whistleBase],[],withActiveOwner('travel.whistle')),/Invalid/);
  assert.throws(()=>createItemBehaviorRegistry([],[{...active,channels:[...active.channels,...active.channels]}]),/Invalid/);
  assert.throws(()=>createItemBehaviorRegistry([],[{...active,channels:[{...active.channels[0],amplitude:2}]}]),/Invalid/);
  assert.throws(()=>createItemBehaviorRegistry([{...whistleBase,motionProfileId:'missing'}],[],withActiveOwner('travel.whistle')),/Invalid/);
  assert.throws(()=>createItemBehaviorRegistry([{...whistleBase,source:'trait'}],[],withActiveOwner('travel.whistle')),/Invalid/);
});

test('one or two local details animate deterministically and reset for idle/reduced motion/planned profiles',()=>{
  const planned=LOCAL_MOTIONS.find(p=>p.motionId==='travel.pack-bow.step-sway')!;
  assert.equal(planned.channels.length,2);
  assert.ok(sampleItemLocalMotion(planned,.2,{moving:true,reducedMotion:false}).every(x=>x.radians===0));
  const active={...planned,status:'active' as const};
  const moving=sampleItemLocalMotion(active,.15,{moving:true,reducedMotion:false});
  assert.equal(moving.length,2);
  assert.ok(Math.abs(moving[0].radians)>0);
  assert.ok(Math.abs(moving[0].radians+moving[1].radians)<1e-9);
  assert.ok(sampleItemLocalMotion(active,.15,{moving:false,reducedMotion:false}).every(x=>x.radians===0));
  assert.ok(sampleItemLocalMotion(active,.15,{moving:true,reducedMotion:true}).every(x=>x.radians===0));
  assert.throws(()=>sampleItemLocalMotion(active,Number.NaN,{moving:true,reducedMotion:false}));
  assert.equal(Object.hasOwn(LOCAL_MOTIONS[0],'soundId'),false);
});

test('Three local motion binding updates cloned child anchors and restores exact baseline on disposal',()=>{
  const root=new THREE.Group(),left=new THREE.Group(),right=new THREE.Group();
  left.name='bow-left';right.name='bow-right';left.rotation.z=.25;right.rotation.z=-.15;
  root.add(left,right);
  const p={...LOCAL_MOTIONS[1],status:'active' as const};
  const binding=createItemLocalMotionBinding(root,p);
  assert.equal(binding.stats().channels,2);
  binding.update(.15,{moving:true,reducedMotion:false});
  assert.notEqual(left.rotation.z,.25);
  binding.update(.15,{moving:true,reducedMotion:true});
  assert.ok(Math.abs(left.rotation.z-.25)<1e-10);
  binding.update(.15,{moving:true,reducedMotion:false});
  binding.dispose();binding.dispose();
  assert.ok(Math.abs(left.rotation.z-.25)<1e-10);
  assert.ok(Math.abs(right.rotation.z+.15)<1e-10);
  binding.update(.5,{moving:true,reducedMotion:false});
  assert.equal(binding.stats().disposed,true);
  assert.throws(()=>createItemLocalMotionBinding(new THREE.Group(),p),/Missing/);
  assert.throws(()=>createItemLocalMotionBinding(root,LOCAL_MOTIONS[1]),/unimplemented/);
});

test('mounted item actions reuse host contexts without gaining host traits or duplicating ownership',()=>{
  const definitions=new Map(ITEM_CATALOG.ownedItems);
  const whistle=definitions.get('travel.whistle')!;
  definitions.set('travel.whistle',{...whistle,mountKinds:['travel-hook']});
  const registry=createAttachmentRegistry([
    {slotId:'cabin:travel-hook',host:{kind:'fixture',id:'cabin'},kind:'travel-hook',
      status:'active',anchorId:'cabin.hook',contexts:['wind','night']},
  ],definitions);
  const mounted:OwnedItem={...item('travel.whistle'),location:{kind:'mounted',hostId:'cabin',slotId:'cabin:travel-hook'}};
  const instances=canonicalInstances([mounted]);const original=structuredClone(instances);
  assert.deepEqual(itemMountedContexts(mounted,instances,registry),['wind','night']);
  assert.deepEqual(itemMountedContexts(item('travel.whistle'),instances,registry),[]);
  assert.deepEqual(instances,original);
  assert.throws(()=>itemMountedContexts({...mounted,location:{kind:'mounted',hostId:'cabin',slotId:'not-real'}},instances,registry));
  const empty=createState();assert.equal(empty.inventory.instances?.length??0,0);
});
