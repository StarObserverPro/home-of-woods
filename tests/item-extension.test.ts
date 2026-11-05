import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/domain/state.ts';
import { createInventory, inventoryTransaction, stackKey, INVENTORY_SCHEMA_VERSION } from '../src/domain/inventory.ts';
import { canonicalInstances, withItemLocation } from '../src/domain/owned-items.ts';
import { prepareInventoryPersistence, serializeInventory } from '../src/domain/inventory-persistence.ts';
import { itemProperties, itemPropertyDiagnostics, resolveFields } from '../src/domain/item-properties.ts';
import { assertItemJson } from '../src/domain/item-data.ts';
import { serializeWorldSave, prepareWorldSave } from '../src/domain/world-save.ts';
import { createSaveContext } from '../src/domain/save-context.ts';
import { transferWood, collectWood } from '../src/domain/woodcraft.ts';
import { validateWorldSession } from '../src/app/session-upgrade.ts';
import { WORLD_SAVE_DATABASE } from '../src/app/world-save-store.ts';
import { WORLD_RULESET_VERSION } from '../src/content/world.ts';
import { saveDigest } from '../src/domain/save-digest.ts';

const instance = () => ({ instanceId:'test-seat',definitionId:'furniture.stump-seat',blueprintId:'blueprint.stump-cozy',createdAt:0,location:{kind:'inventory' as const} });
const context = createSaveContext();
const load = (raw:string) => { const result=prepareInventoryPersistence(raw);if(!('value' in result))throw Error(result.diagnostics.join(';'));return result.value; };

test('carrying core format preserves the intentional v4 migration; abandoned formats stay protected', async () => {
  assert.equal(INVENTORY_SCHEMA_VERSION,6);assert.equal(WORLD_RULESET_VERSION,8);assert.equal(WORLD_SAVE_DATABASE,'home-of-woods-save-v2');
  for(const schemaVersion of [1,2,3,99]) assert.equal(prepareInventoryPersistence(JSON.stringify({schemaVersion,stacks:[]})).decision,'protected');
  assert.equal(prepareInventoryPersistence(JSON.stringify({version:1,quantities:{wood:3}})).decision,'protected');
  assert.equal(prepareInventoryPersistence(null).decision,'no-save');
  const current=JSON.parse(await serializeWorldSave(createState(),context,{sequence:1,savedAt:0}));
  for(const rulesetVersion of [1,2,3,4,99]) { const {checksum,...core}={...current,rulesetVersion};const raw=JSON.stringify({...core,checksum:await saveDigest(core)});const result=await prepareWorldSave(raw,context);assert.equal(result.decision,'protected');if(result.decision==='protected')assert.equal(result.raw,raw); }
});

test('missing optional item fields resolve to defaults without mutating or populating raw records', () => {
  const raw=instance(),before=structuredClone(raw);assert.deepEqual(itemProperties(raw),{rarityId:'common',traits:[]});
  assert.deepEqual(canonicalInstances([raw]),[raw]);assert.deepEqual(raw,before);assert.deepEqual(itemPropertyDiagnostics(raw),[]);
});

test('valid rarity, unknown grade and wrong types all roundtrip without washing out the raw value', async () => {
  for(const rarityId of ['common','uncommon','rare','epic','legendary','mythic',42,null,{},['epic'],false]) {
    const s=createState();s.inventory.instances=[{...instance(),rarityId}];
    const expected=['common','uncommon','rare','epic','legendary'].includes(rarityId as string)?rarityId:'common';
    assert.equal(itemProperties(s.inventory.instances[0]).rarityId,expected);
    const raw=await serializeWorldSave(s,context,{sequence:1,savedAt:0});const restored=await prepareWorldSave(raw,context);
    assert.equal(restored.decision,'restored');if(!('value' in restored))throw Error('load failed');
    assert.deepEqual(restored.value.inventory.instances![0].rarityId,rarityId);
    const second=await serializeWorldSave(restored.value,context,{sequence:1,savedAt:0});assert.equal(second,raw);
  }
});

test('malformed optional traits fall back locally; unknown valid traits and nested metadata are retained', () => {
  for(const traits of [null,3,'comfort',[{id:'comfort',value:'2'}],[{id:'comfort',value:2},{id:'comfort',value:3}]]) {
    const owned={...instance(),traits};assert.deepEqual(itemProperties(owned).traits,[]);
    assert.deepEqual(canonicalInstances([owned])[0].traits,traits);
  }
  const traits=[{id:'future.affix',value:7,units:{id:'future'}}];assert.deepEqual(itemProperties({...instance(),traits}).traits,traits);
});

test('a new registered field requires only its validator and stable fallback, no codec edits', () => {
  const schema={dye: { accepts:(v:unknown):v is string=>typeof v==='string',fallback:'natural' }};
  assert.deepEqual(resolveFields({},schema),{dye:'natural'});assert.deepEqual(resolveFields({dye:0},schema),{dye:'natural'});
  const s=createInventory();s.instances=[{...instance(),dye:'moss',future:{list:[1,null,'x']}}];
  const item=load(serializeInventory(s)).instances![0];assert.deepEqual(resolveFields(item,schema),{dye:'moss'});assert.deepEqual(item.future,{list:[1,null,'x']});
});

test('stack identity covers unknown attributes and ignores object key order, quantity and command delta', () => {
  const a={itemId:'wood',qualityId:'ordinary',quantity:3,finish:{a:1,b:2},rarityId:'epic'};
  assert.equal(stackKey(a),stackKey({...a,quantity:50,delta:-2,finish:{b:2,a:1}}));
  assert.notEqual(stackKey(a),stackKey({...a,rarityId:'legendary'}));assert.notEqual(stackKey(a),stackKey({...a,finish:{a:1,b:3}}));
  let s=inventoryTransaction(createInventory(),[{...a,delta:3},{...a,rarityId:'legendary',delta:2}]);
  s.futureRoot={author:'test'};s=inventoryTransaction(s,[{...s.stacks.find(i=>i.rarityId==='epic')!,delta:-1}]);
  assert.equal(s.stacks.length,2);assert.deepEqual(s.futureRoot,{author:'test'});assert.equal(s.stacks.find(i=>i.rarityId==='epic')!.quantity,2);
  assert.ok(s.stacks.every(i=>!Object.hasOwn(i,'delta')));assert.deepEqual(load(serializeInventory(s)).stacks,s.stacks);
});

test('future material attributes survive physical-island transfer, save, reload and return', async () => {
  const s=createState();const extra={rarityId:'legendary',future:{dye:'red',marks:[1,2]}};
  s.inventory=inventoryTransaction(s.inventory,[{itemId:'wood',qualityId:'ordinary',delta:4,...extra}]);const before=structuredClone(s.inventory.stacks);
  assert.equal(transferWood(s,'prepare'),3);assert.equal(s.inventory.stacks[0].quantity,1);
  for(const p of s.woodcraft.pieces)assert.deepEqual(p.source.future,extra.future);
  const result=await prepareWorldSave(await serializeWorldSave(s,context,{sequence:1,savedAt:0}),context);assert.ok('value' in result);if(!('value' in result))throw Error('load');
  for(const p of [...result.value.woodcraft.pieces])collectWood(result.value,p.id);
  assert.deepEqual(result.value.inventory.stacks,before);
});

test('location updates preserve unknown attachment metadata and item attributes without stale coordinates', () => {
  const item=canonicalInstances([{...instance(),rarityId:'epic',extra:{name:'keep'},location:{kind:'inventory',attachment:{socket:'x'}}}])[0];
  const placed=withItemLocation(item,{kind:'world',x:-35,z:3,rotation:.5});
  assert.deepEqual(placed.location.attachment,{socket:'x'});
  const packed=withItemLocation(placed,{kind:'inventory'});assert.deepEqual(packed,item);assert.equal(Object.hasOwn(packed.location,'x'),false);
});

test('invalid core quantities, duplicate ownership and non-JSON data still fail atomically', () => {
  const s=inventoryTransaction(createInventory(),[{itemId:'wood',qualityId:'ordinary',delta:3}]);const before=structuredClone(s);
  assert.throws(()=>inventoryTransaction(s,[{...s.stacks[0],delta:-4}]));assert.deepEqual(s,before);
  for(const quantity of [-1,.5,null,'2'])assert.equal(prepareInventoryPersistence(JSON.stringify({schemaVersion:4,stacks:[{itemId:'wood',qualityId:'ordinary',quantity}]})).decision,'protected');
  assert.throws(()=>canonicalInstances([instance(),instance()]));
  for(const value of [NaN,Infinity,undefined,new Date(),new Map(),()=>1,Array(2)])assert.throws(()=>assertItemJson(value));
  const cycle:any={};cycle.me=cycle;assert.throws(()=>assertItemJson(cycle));
  const state=createState();(state.inventory as any).schemaVersion=1;const stateBefore=structuredClone(state);assert.throws(()=>validateWorldSession(state,context));assert.deepEqual(state,stateBefore);
});

test('unknown prototype-named JSON keys remain inert and lossless through transactions', () => {
  const raw=JSON.parse('{"schemaVersion":4,"stacks":[{"itemId":"wood","qualityId":"ordinary","quantity":2,"__proto__":{"polluted":true}}]}');
  const s=load(JSON.stringify(raw));const next=inventoryTransaction(s,[{...s.stacks[0],delta:-1}]);
  assert.equal(({} as any).polluted,undefined);assert.deepEqual((JSON.parse(serializeInventory(next))).stacks[0].__proto__,{polluted:true});
});
