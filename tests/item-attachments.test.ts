import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/domain/state.ts';
import { ITEM_CATALOG } from '../src/domain/item-catalog.ts';
import { HOST_ATTACHMENT_SLOTS } from '../src/content/item-attachment-slots.ts';
import { createAttachmentRegistry, mountIndependentItem, unmountIndependentItem, mountedItemSources, validateAttachedItems } from '../src/domain/item-attachments.ts';
import type { OwnedItem } from '../src/domain/owned-items.ts';
import { canonicalInstances, withItemLocation } from '../src/domain/owned-items.ts';
import { validateInventory, INVENTORY_SCHEMA_VERSION } from '../src/domain/inventory.ts';
import { prepareInventoryPersistence, serializeInventory } from '../src/domain/inventory-persistence.ts';
import { serializeWorldSave, prepareWorldSave } from '../src/domain/world-save.ts';
import { createSaveContext } from '../src/domain/save-context.ts';
import { WORLD_RULESET_VERSION } from '../src/content/world.ts';

const createBell = (id = 'bell-one'): OwnedItem => ({
  instanceId:id,definitionId:'accessory.pinecone-doorbell',
  blueprintId:'blueprint.test-bell',createdAt:0,rarityId:'epic',
  traits:[{id:'visitor-welcome',value:3}],
  futureTraitMetadata:{source:'individual-item'},
  location:{kind:'inventory',note:'retain-me'},
});
const activeRegistry = () => {
  const definitions = new Map(ITEM_CATALOG.ownedItems);
  const bell = definitions.get('accessory.pinecone-doorbell')!;
  definitions.set(bell.definitionId,{...bell,status:'active'});
  const slots = HOST_ATTACHMENT_SLOTS.map(slot => slot.slotId === 'cabin:entry-hanging' ? {...slot,status:'active' as const} : slot);
  return createAttachmentRegistry(slots,definitions);
};
const savedState = () => { const s=createState();s.inventory.instances=[createBell()];return s; };

test('durable objects share the catalog; the ordinary doorbell is active while unimplemented accessories remain planned', () => {
  assert.equal(ITEM_CATALOG.ownedItems.get('furniture.stump-seat')?.status,'active');
  assert.equal(ITEM_CATALOG.ownedItems.get('accessory.pinecone-doorbell')?.status,'active');
  assert.deepEqual(ITEM_CATALOG.ownedItems.get('accessory.pinecone-doorbell')?.blueprintIds,['blueprint.pinecone-doorbell']);
  assert.equal(ITEM_CATALOG.items.has('accessory.pinecone-doorbell'),false);
  assert.equal(ITEM_CATALOG.ownedItems.get('accessory.pinecone-doorbell')?.mountKinds.includes('entrance-hanging'),true);
  assert.ok(!createState().workshop.blueprints.includes('blueprint.pinecone-doorbell'),'an available recipe still needs to be learned at the workbench');
  assert.equal(ITEM_CATALOG.ownedItems.get('accessory.note-box')?.status,'planned');
  assert.deepEqual(ITEM_CATALOG.ownedItems.get('accessory.note-box')?.blueprintIds,[]);
  assert.equal(ITEM_CATALOG.items.has('accessory.note-box'),false);
  assert.ok(!createState().workshop.blueprints.includes('blueprint.test-bell'));
});

test('mount and unmount move one instance without changing its identity, rarity, affix or metadata', async () => {
  const registry=activeRegistry(),s=savedState(),before=structuredClone(s.inventory.instances![0]);
  assert.equal(INVENTORY_SCHEMA_VERSION,6);assert.equal(WORLD_RULESET_VERSION,8);
  const mounted=mountIndependentItem(s.inventory,'bell-one','cabin','cabin:entry-hanging',registry);
  assert.equal(s.inventory.instances![0].location.kind,'inventory');
  assert.equal(mounted.instances!.length,1);
  assert.deepEqual(mounted.instances![0].location,{kind:'mounted',hostId:'cabin',slotId:'cabin:entry-hanging',note:'retain-me'});
  assert.equal(mounted.instances![0].rarityId,'epic');
  assert.deepEqual(mounted.instances![0].traits,before.traits);
  const sources=mountedItemSources(mounted,'cabin');
  assert.equal(sources.length,1);assert.equal(sources[0].instanceId,'bell-one');
  assert.equal(sources[0].rarityId,'epic');assert.deepEqual(sources[0].traits,before.traits);
  assert.ok(sources[0].contexts.includes('visitor-arrival'));
  const recovered=unmountIndependentItem(mounted,'bell-one',registry);
  assert.deepEqual(recovered.instances![0],before);
  assert.equal(recovered.instances![0].location.kind,'inventory');
  assert.equal(Object.hasOwn(recovered.instances![0].location,'hostId'),false);
  assert.equal(Object.hasOwn(recovered.instances![0].location,'slotId'),false);
  assert.equal(mounted.revision,s.inventory.revision+1);assert.equal(recovered.revision,mounted.revision+1);
  s.inventory=mounted;
  const raw=await serializeWorldSave(s,createSaveContext(),{sequence:1,savedAt:0});
  const loaded=await prepareWorldSave(raw,createSaveContext());
  assert.equal(loaded.decision,'restored');
  if(loaded.decision!=='restored')throw Error('World save must restore');
  assert.deepEqual(loaded.value.inventory.instances,mounted.instances);
});

test('default planned slots cannot be used to mint a playable accessory', () => {
  const s=createState();
  s.inventory.instances=[{...createBell('note-one'),definitionId:'accessory.note-box',blueprintId:'blueprint.test-note-box'}];
  assert.equal(HOST_ATTACHMENT_SLOTS.find(slot=>slot.slotId==='cabin:message-hook')?.status,'planned');
  const unchanged=structuredClone(s.inventory);
  assert.throws(()=>mountIndependentItem(s.inventory,'note-one','cabin','cabin:message-hook'),/not available/);
  assert.deepEqual(s.inventory,unchanged);
});

test('wrong host, wrong item and occupied slot reject atomically', () => {
  const registry=activeRegistry(),s=savedState();
  s.inventory.instances!.push(createBell('bell-two'));
  const source=structuredClone(s.inventory);
  assert.throws(()=>mountIndependentItem(s.inventory,'bell-one','tent','cabin:entry-hanging',registry),/Wrong fixture/);
  assert.throws(()=>mountIndependentItem(s.inventory,'bell-one','cabin','camp-fire:pot-hanger',registry),/Wrong fixture/);
  assert.deepEqual(s.inventory,source);
  const mounted=mountIndependentItem(s.inventory,'bell-one','cabin','cabin:entry-hanging',registry);
  const unchanged=structuredClone(mounted);
  assert.throws(()=>mountIndependentItem(mounted,'bell-two','cabin','cabin:entry-hanging',registry),/occupied/);
  assert.deepEqual(mounted,unchanged);
  assert.throws(()=>mountIndependentItem(mounted,'bell-one','cabin','cabin:entry-hanging',registry),/inventory/);
});

test('a kettle belongs to itself, but the fire provides a hook and an active top-slot prerequisite', () => {
  const definitions=new Map(ITEM_CATALOG.ownedItems);
  const kettle=definitions.get('vessel.copper-kettle')!;
  definitions.set(kettle.definitionId,{...kettle,status:'active'});
  const slots=HOST_ATTACHMENT_SLOTS.map(slot=>slot.slotId==='camp-fire:pot-hanger'?{...slot,status:'active' as const}:slot);
  const registry=createAttachmentRegistry(slots,definitions);
  const state=createState();
  state.inventory.instances=[{instanceId:'kettle-one',definitionId:kettle.definitionId,
    blueprintId:'blueprint.test-kettle',createdAt:0,rarityId:'legendary',
    traits:[{id:'warmth',value:2}],location:{kind:'inventory'}}];
  assert.throws(()=>mountIndependentItem(state.inventory,'kettle-one','camp-fire','camp-fire:pot-hanger',registry),/prerequisite/);
  const noTop={builtUpgrades:new Set(['camp-fire:hook']),legacyMounted:{}};
  assert.throws(()=>mountIndependentItem(state.inventory,'kettle-one','camp-fire','camp-fire:pot-hanger',registry,noTop),/prerequisite/);
  const activeHook={builtUpgrades:new Set(['camp-fire:hook']),legacyMounted:{'camp-fire:top':'camp-fire:hook'}};
  const mounted=mountIndependentItem(state.inventory,'kettle-one','camp-fire','camp-fire:pot-hanger',registry,activeHook);
  assert.equal(mounted.instances![0].rarityId,'legendary');
  assert.equal(mounted.instances![0].location.kind,'mounted');
  assert.equal(state.inventory.instances![0].location.kind,'inventory');
});

test('cross-instance slots check their host type, reject missing hosts, cycles and duplicate occupants', () => {
  const registry=createAttachmentRegistry([
    {slotId:'item-holder:hook',host:{kind:'item',definitionId:'fixture.test-holder'},kind:'hanger',status:'active',anchorId:'fixture.hook',contexts:['night']},
  ]);
  const fixture=(id:string,hostId:string):OwnedItem=>({
    instanceId:id,definitionId:'fixture.test-holder',blueprintId:'blueprint.test',createdAt:0,
    location:{kind:'mounted',hostId,slotId:'item-holder:hook'},
  });
  assert.throws(()=>validateAttachedItems([fixture('a','missing')],registry),/Missing or wrong item host/);
  assert.throws(()=>validateAttachedItems([fixture('a','b'),fixture('b','a')],registry),/Cyclic/);
  assert.throws(()=>validateAttachedItems([fixture('a','b'),fixture('c','b'),
    {instanceId:'b',definitionId:'fixture.test-holder',blueprintId:'blueprint.test',createdAt:0,location:{kind:'inventory'}}],registry),/occupied/);
});

test('invalid mounted references and forged duplicated slot records protect inventory and whole-world saves', async () => {
  const registry=activeRegistry(),s=savedState();
  s.inventory=mountIndependentItem(s.inventory,'bell-one','cabin','cabin:entry-hanging',registry);
  assert.doesNotThrow(()=>validateInventory(s.inventory));
  assert.equal(prepareInventoryPersistence(serializeInventory(s.inventory)).decision,'restored');
  for(const edit of [
    (i:OwnedItem)=>{i.location={kind:'mounted',hostId:'cabin',slotId:'not-a-slot'};},
    (i:OwnedItem)=>{i.location={kind:'mounted',hostId:'tent',slotId:'cabin:entry-hanging'};},
    (i:OwnedItem)=>{i.location={kind:'mounted',hostId:i.instanceId,slotId:'cabin:entry-hanging'};},
  ]) {
    const broken=structuredClone(s.inventory);
    edit(broken.instances![0]);
    assert.throws(()=>validateInventory(broken));
    assert.equal(prepareInventoryPersistence(JSON.stringify(broken)).decision,'protected');
  }
  const bad=structuredClone(s.inventory);
  bad.instances!.push({...structuredClone(bad.instances![0]),instanceId:'bell-two'});
  assert.throws(()=>validateInventory(bad),/occupied/);
  const forgedLegacy={...s.inventory,schemaVersion:5};
  assert.equal(prepareInventoryPersistence(JSON.stringify(forgedLegacy)).decision,'protected');
  const authenticLegacy={...savedState().inventory,schemaVersion:5};
  const migrated=prepareInventoryPersistence(JSON.stringify(authenticLegacy));
  assert.equal(migrated.decision,'migrated');
  assert.ok('value' in migrated);
});

test('location states cannot silently retain another ownership mode\'s reserved keys', () => {
  for (const location of [
    {kind:'inventory',hostId:'cabin',slotId:'cabin:entry-hanging'},
    {kind:'world',x:0,z:0,rotation:0,hostId:'cabin'},
    {kind:'mounted',hostId:'cabin',slotId:'cabin:entry-hanging',x:2},
  ]) {
    const item={...createBell(),location};
    assert.throws(()=>canonicalInstances([item]),/Conflicting/);
  }
});

test('switching the location core does not discard unrelated future location fields', () => {
  const a=createBell();
  const mounted=withItemLocation(a,{kind:'mounted',hostId:'cabin',slotId:'cabin:entry-hanging'});
  const world=withItemLocation(mounted,{kind:'world',x:1,z:2,rotation:0});
  assert.deepEqual(world.location,{kind:'world',x:1,z:2,rotation:0,note:'retain-me'});
  assert.deepEqual(canonicalInstances([world])[0],world);
});

test('planned player wardrobe slots preserve unique item instances, traits and ownership', () => {
  const state = createState();
  const head = HOST_ATTACHMENT_SLOTS.find(v => v.slotId === 'player:headwear')!;
  const back = HOST_ATTACHMENT_SLOTS.find(v => v.slotId === 'player:back-gear')!;
  assert.equal(head.host.kind, 'character');
  assert.equal(head.status, 'planned');
  assert.equal(back.status, 'planned');
  assert.deepEqual(ITEM_CATALOG.ownedItems.get('travel.sun-hat')?.mountKinds, ['headwear']);
  assert.deepEqual(ITEM_CATALOG.ownedItems.get('travel.backpack')?.mountKinds, ['back-gear']);
  assert.equal(ITEM_CATALOG.ownedItems.get('travel.backpack')?.status, 'planned');

  const hat: OwnedItem = {instanceId:'hat-one', definitionId:'travel.sun-hat',
    blueprintId:'blueprint.test-hat', createdAt:0, rarityId:'epic',
    traits:[{id:'shade',value:2}], futureColors:{band:'#aabbcc'},
    location:{kind:'inventory'}};
  const pack: OwnedItem = {instanceId:'pack-one', definitionId:'travel.backpack',
    blueprintId:'blueprint.test-pack', createdAt:0, rarityId:'rare',
    traits:[{id:'step-sway',value:1}], location:{kind:'inventory'}};
  state.inventory.instances = [hat,pack];
  assert.throws(() => mountIndependentItem(state.inventory,'hat-one','player','player:headwear'), /not available/);
  assert.deepEqual(state.inventory.instances, [hat,pack]);

  // Exercise the contract with a temporary active registry, without unlocking actual gameplay.
  const definitions = new Map(ITEM_CATALOG.ownedItems);
  for (const id of ['travel.sun-hat','travel.backpack']) {
    const d = definitions.get(id)!;
    definitions.set(id,{...d,status:'active'});
  }
  const slots = HOST_ATTACHMENT_SLOTS.map(v => ['player:headwear','player:back-gear'].includes(v.slotId)
    ? {...v,status:'active' as const} : v);
  const registry = createAttachmentRegistry(slots,definitions);
  assert.throws(() => mountIndependentItem(state.inventory,'hat-one','camp-visitor','player:headwear',registry), /Wrong character/);
  assert.throws(() => mountIndependentItem(state.inventory,'pack-one','player','player:headwear',registry), /not available/);

  const h = mountIndependentItem(state.inventory,'hat-one','player','player:headwear',registry);
  const equipped = mountIndependentItem(h,'pack-one','player','player:back-gear',registry);
  assert.equal(equipped.instances!.length,2);
  assert.deepEqual(equipped.instances!.find(v=>v.instanceId==='hat-one')!.traits,hat.traits);
  assert.deepEqual(equipped.instances!.find(v=>v.instanceId==='hat-one')!.futureColors,hat.futureColors);
  assert.deepEqual(equipped.instances!.find(v=>v.instanceId==='hat-one')!.location,
    {kind:'mounted',hostId:'player',slotId:'player:headwear'});
  assert.deepEqual(mountedItemSources(equipped,'player',registry).map(v=>v.instanceId).sort(),
    ['hat-one','pack-one']);
  const recovered=unmountIndependentItem(unmountIndependentItem(equipped,'hat-one',registry),'pack-one',registry);
  assert.deepEqual(recovered.instances,canonicalInstances([hat,pack]));
});
