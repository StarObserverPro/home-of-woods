import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {merchantVisitAt,merchantListings,MERCHANT_CAPACITY} from '../src/content/merchant.ts';
import {CAMP_VISITOR} from '../src/content/characters.ts';
import {exchangeMerchant,merchantSnapshot,validateMerchant} from '../src/domain/merchant.ts';
import {blueprintCopies,createBlueprintSheet,consumeBlueprintUse,knowsBlueprint} from '../src/domain/blueprint-copies.ts';
import {inventoryTransaction,inventoryCount} from '../src/domain/inventory.ts';
import {beginWorkshop,advanceWorkshop,cancelWorkshop,workshopTarget,validateWorkshop} from '../src/domain/workshop.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {saveDigest} from '../src/domain/save-digest.ts';

const stock=()=>{
  const host=createState();
  host.time=25;host.selected=CAMP_VISITOR.id;
  host.player.x=CAMP_VISITOR.x;host.player.z=CAMP_VISITOR.z;
  return host;
};
const seat=(id:string,rarity='common')=>({
  instanceId:id,definitionId:'furniture.stump-seat',blueprintId:'blueprint.stump-cozy',
  createdAt:0,rarityId:rarity,traits:[{id:'comfort',value:2}],location:{kind:'inventory' as const},
});
const order=(buy:{id:string;quantity:number}[]=[],sellIds:string[]=[])=>
  ({buy,sellIds});
const addSeats=(host:ReturnType<typeof createState>,ids:string[])=>
  host.inventory.instances=ids.map(id=>seat(id));
async function mutate(raw:string,edit:(v:any)=>void){
  const saved=JSON.parse(raw);edit(saved);const {checksum,...core}=saved;return JSON.stringify({...core,checksum:await saveDigest(core)});
}

test('caravan cadence is an isolated provisional parameter and stock stays stable on the same visit',()=>{
  assert.equal(merchantVisitAt(0).active,true);
  assert.equal(merchantVisitAt(0).parked,false);
  assert.equal(merchantVisitAt(25).parked,true);
  assert.deepEqual(merchantListings(42,0),merchantListings(42,0));
  assert.notDeepEqual(merchantListings(42,0),merchantListings(42,1));
  assert.equal(merchantVisitAt(1200*3).active,false);
});
test('walk up, claim welcome rations exactly once; no duplicate rewards or unintended payment',()=>{
  const host=stock();host.player.x=0;
  const before=structuredClone(host);
  assert.equal(exchangeMerchant(host,{...order(),welcome:true}).ok,false);
  assert.deepEqual(host,before);
  host.player.x=CAMP_VISITOR.x;
  const first=exchangeMerchant(host,{...order(),welcome:true});
  assert.equal(first.ok,true);
  assert.equal(inventoryCount(host.inventory,'trail-rations'),1);
  assert.ok(host.workshop.blueprints.includes('blueprint.stump-cozy'));
  const after=structuredClone(host);
  assert.equal(exchangeMerchant(host,{...order(),welcome:true}).ok,false);
  assert.deepEqual(host,after);
});
test('net checkout applies copper coins, real purchased goods and repeat-visit stock limits exactly once',()=>{
  const host=stock();
  const receipt=exchangeMerchant(host,order([{id:'supply.canvas',quantity:1},{id:'supply.hardware',quantity:1}]));
  assert.equal(receipt.ok,false);
  assert.equal(host.merchant.coins,100);
  const one=exchangeMerchant(host,order([{id:'supply.canvas',quantity:1}]));
  assert.equal(one.ok,true);
  assert.equal(host.merchant.coins,10);
  assert.equal(inventoryCount(host.inventory,'canvas-roll'),1);
  const snapshot=merchantSnapshot(host);
  assert.equal(snapshot.listings.find(x=>x.id==='supply.canvas')?.remaining,1);
  assert.equal(exchangeMerchant(host,order([{id:'supply.canvas',quantity:2}])).ok,false);
  assert.equal(inventoryCount(host.inventory,'canvas-roll'),1);
  const result=exchangeMerchant(host,order([{id:'supply.canvas',quantity:1}]));
  assert.equal(result.ok,false,'cannot take another roll without sufficient coins');
});
test('food-only borrowing repays from sales; other merchandise must be paid in cash',()=>{
  const host=stock();
  assert.equal(exchangeMerchant(host,order([{id:'supply.food',quantity:1}])).ok,true);
  assert.equal(inventoryCount(host.inventory,'trail-rations'),1);
  assert.equal(host.merchant.coins,0);
  assert.equal(host.merchant.debt,100);
  addSeats(host,['chair-01']);
  assert.equal(exchangeMerchant(host,order([],['chair-01'])).ok,true);
  assert.equal(host.merchant.debt,0);
  assert.equal(host.merchant.coins,25);
  assert.equal((host.inventory.instances??[]).length,0);
  assert.equal(exchangeMerchant(host,order([{id:'supply.hardware',quantity:1}])).ok,false);
  assert.equal(host.merchant.coins,25);
});
test('finite cargo, per-kind demand and budget reject oversized/repeated transactions atomically',()=>{
  const host=stock(); addSeats(host,['one','two','three']);
  assert.equal(exchangeMerchant(host,order([],[ 'one','one' ])).ok,false);
  assert.equal(exchangeMerchant(host,order([],[ 'one','two','three' ])).ok,false);
  assert.equal(host.inventory.instances?.length,3);
  assert.equal(exchangeMerchant(host,order([],[ 'one','two' ])).ok,true);
  assert.equal(host.inventory.instances?.length,1);
  assert.equal(merchantSnapshot(host).cargoLeft,MERCHANT_CAPACITY.cargoUnits-20);
  const before=structuredClone(host);
  assert.equal(exchangeMerchant(host,order([],[ 'three' ])).ok,false);
  assert.deepEqual(host,before);
});
test('planned furniture is never sold through a registered active-item alias',()=>{
  const host=stock();
  host.inventory.instances=[{...seat('table-01'),definitionId:'furniture.table'}];
  assert.equal(merchantSnapshot(host).saleables.length,0);
  assert.equal(exchangeMerchant(host,order([],['table-01'])).ok,false);
});
test('physical plans are unique inventory instances, consumed on completed crafting, never on cancellation',()=>{
  const host=createState();
  host.inventory=inventoryTransaction(host.inventory,[{itemId:'wood',qualityId:'ordinary',delta:3}]);
  host.inventory.instances=[createBlueprintSheet(host.seed,1,'blueprint.stump-sturdy',2,0)];
  assert.equal(knowsBlueprint(host.inventory,host.workshop.blueprints,'blueprint.stump-sturdy'),true);
  const copy=blueprintCopies(host.inventory,'blueprint.stump-sturdy')[0];
  assert.equal(copy.usesRemaining,2);
  Object.assign(host.player,workshopTarget('craft'));
  assert.match(beginWorkshop(host,'craft',[],'blueprint.stump-sturdy'),/走到/);
  validateWorkshop(host.workshop,host.time,host.inventory);
  advanceWorkshop(host);cancelWorkshop(host);
  assert.equal(blueprintCopies(host.inventory,'blueprint.stump-sturdy')[0].usesRemaining,2);
  for(const remaining of [1,0]){
    assert.match(beginWorkshop(host,'craft',[],'blueprint.stump-sturdy'),/走到/);
    advanceWorkshop(host);host.time+=3.05;
    assert.match(advanceWorkshop(host)??'',/做好/);
    assert.equal(blueprintCopies(host.inventory,'blueprint.stump-sturdy').length,remaining?1:0);
    if(remaining)assert.equal(blueprintCopies(host.inventory,'blueprint.stump-sturdy')[0].usesRemaining,remaining);
  }
  assert.equal(host.inventory.instances?.filter(i=>i.definitionId==='furniture.stump-seat').length,2);
  assert.match(beginWorkshop(host,'craft',[],'blueprint.stump-sturdy'),/先获得/);
  assert.equal(inventoryCount(host.inventory,'wood'),1);
});
test('permanent learned plan does not consume a physical sheet',()=>{
  const host=createState();host.workshop.blueprints.push('blueprint.stump-sturdy');
  host.inventory.instances=[createBlueprintSheet(host.seed,3,'blueprint.stump-sturdy',2,0)];
  const next=consumeBlueprintUse(host.inventory,host.workshop.blueprints,'blueprint.stump-sturdy');
  assert.deepEqual(next,host.inventory);
});
test('version 8 world saves preserve ledger and finite copies; v7 migrates, corrupt current records protect',async()=>{
  const host=stock();
  assert.equal(exchangeMerchant(host,order([{id:'supply.food',quantity:1}])).ok,true);
  addSeats(host,['fixture-01']);
  assert.equal(exchangeMerchant(host,order([],['fixture-01'])).ok,true);
  const context=createSaveContext();
  const raw=await serializeWorldSave(host,context,{sequence:1,savedAt:100});
  const prepared=await prepareWorldSave(raw,context);
  assert.equal(prepared.decision,'restored');
  if(!('value' in prepared))throw Error(prepared.diagnostics.join(';'));
  assert.deepEqual(prepared.value.merchant,host.merchant);
  const old=await mutate(raw,v=>{v.rulesetVersion=7;delete v.world.merchant;});
  const migrated=await prepareWorldSave(old,context);
  assert.equal(migrated.decision,'migrated');
  if(!('value' in migrated))throw Error(migrated.diagnostics.join(';'));
  assert.equal(migrated.value.merchant.coins,100);
  const invalid=await mutate(raw,v=>{v.world.merchant.coins=-4;});
  assert.equal((await prepareWorldSave(invalid,context)).decision,'protected');
  const missing=await mutate(raw,v=>{delete v.world.merchant;});
  assert.equal((await prepareWorldSave(missing,context)).decision,'protected');
  assert.throws(()=>validateMerchant({...host.merchant,coins:NaN}));
});
