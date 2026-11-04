import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {createInventory,inventoryTransaction,inventoryCount,stackKey,validateInventory} from '../src/domain/inventory.ts';
import type {InventoryStack} from '../src/domain/inventory.ts';
import {CARRY_ITEMS,CARRY_PROFILES,CARRY_RULES} from '../src/content/carrying.ts';
import {ITEMS} from '../src/content/items.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {MOVEMENT} from '../src/content/world.ts';
import {awardCarried,awardGround,carryingLoad,currentLoad,changeCarrying,carryingSnapshot,groundId,atLocation} from '../src/domain/carrying.ts';
import {isCarried,isStored,transportLocation} from '../src/domain/transport-location.ts';
import {serializeInventory,prepareInventoryPersistence} from '../src/domain/inventory-persistence.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {saveDigest} from '../src/domain/save-digest.ts';
import {availableWood} from '../src/domain/woodcraft.ts';
import {woodCandidates} from '../src/domain/wood-selection.ts';
import {workshopInput} from '../src/domain/workshop.ts';
import {createGatheringRegistry} from '../src/domain/gathering-registry.ts';
import {RUNTIME_MODELS} from '../src/content/assets.ts';
import {warehouseSnapshot} from '../src/domain/warehouse-view.ts';
import {advanceLocalClock} from '../src/domain/local-clock.ts';
import {move} from '../src/domain/navigation.ts';
const item=(itemId:string,quantity=1):InventoryStack=>({itemId,qualityId:'ordinary',quantity});
const nearStorage=()=>{const s=createState();s.player.x=CAMP_PROPS.logs.x-3.3;s.player.z=CAMP_PROPS.logs.z+1;return s;};
const registry=createGatheringRegistry({assetIds:RUNTIME_MODELS.map(x=>x.assetId)});
const context=createSaveContext();

test('all registered material items have finite positive weight and occupied-space rules',()=>{
  for(const i of ITEMS){const p=CARRY_ITEMS[i.itemId];assert.ok(p,i.itemId);assert.ok(p.weight>0&&p.bulk>0&&p.bundleFactor>0&&p.bundleFactor<=1);}
});
test('ten mushrooms, three branches or one log fit; one more cannot fit',()=>{
  for(const [id,n] of [['mushroom',10],['branch',3],['wood',1]] as const){assert.equal(carryingLoad([item(id,n)]).reason,'');assert.notEqual(carryingLoad([item(id,n+1)]).reason,'');}
});
test('mixed materials compete for the same volume and mass, not per-item slots',()=>{
  assert.equal(carryingLoad([item('branch'),item('mushroom',7)]).reason,'');
  assert.notEqual(carryingLoad([item('branch'),item('mushroom',8)]).reason,'');
  assert.notEqual(carryingLoad([item('wood'),item('mushroom')]).reason,'');
});
test('weight-only and bulk-only loads both slow movement; penalties never multiply below one third',()=>{
  const byWeight=carryingLoad([item('branch',6)],CARRY_PROFILES.backpack);
  assert.ok(byWeight.weight>10&&byWeight.bulk<30&&byWeight.speed<1);
  const byBulk=carryingLoad([item('mushroom',10)]);assert.equal(byBulk.weight,2);assert.equal(byBulk.speed,CARRY_RULES.minSpeed);
  assert.equal(carryingLoad([item('wood')]).speed,1/3);
  for(let n=0;n<80;n++){const l=carryingLoad([item('branch',n)]);assert.ok(l.speed>=1/3&&l.speed<=1);}
});
test('bundling changes bulk and handling, never mass, amount, identity or mushroom/log volume',()=>{
  const stacks=[item('branch',3),item('mushroom')],loose=carryingLoad(stacks),packed=carryingLoad(stacks,CARRY_PROFILES.bundle);
  assert.equal(packed.weight,loose.weight);assert.equal(packed.bulk,3*3*.55+1);assert.ok(packed.speed>loose.speed);
  assert.equal(carryingLoad([item('wood')],CARRY_PROFILES.bundle).bulk,10);
  assert.equal(carryingLoad([item('branch',6)],CARRY_PROFILES.bundle).reason,'');
  assert.notEqual(carryingLoad([item('branch',7)],CARRY_PROFILES.bundle).reason,'');
});
test('planned carriers include their own weight; wheels change effort, not cargo mass',()=>{
  const load=[item('branch',10)],cart=carryingLoad(load,CARRY_PROFILES.cart),uphill=carryingLoad(load,CARRY_PROFILES.cart,4);
  assert.equal(cart.weight,50);assert.equal(cart.effort,7.5);assert.ok(uphill.speed<cart.speed);
  assert.equal(carryingLoad([item('mushroom')],CARRY_PROFILES.basket).weight,2.2);
  assert.notEqual(carryingLoad([item('wood')],CARRY_PROFILES.backpack).reason,'');
  assert.throws(()=>changeCarrying(createState(),{kind:'method',method:'cart' as 'hands'},[]));
});
test('unknown and malformed material data never become weightless free cargo',()=>{
  assert.notEqual(carryingLoad([item('future.material')]).reason,'');
  assert.equal(carryingLoad([item('future.material')]).speed,1/3);
  assert.throws(()=>carryingLoad([item('branch',-1)]));
  assert.throws(()=>carryingLoad([item('branch')],CARRY_PROFILES.cart,NaN));
});
test('failed pickup is atomic; no partial debit, location or revision changes',()=>{
  const s=createState();s.inventory=awardCarried(s.inventory,item('mushroom'),10);s.inventory=awardGround(s.inventory,item('branch'),3,s.player);
  const ground=s.inventory.stacks.find(x=>transportLocation(x)?.kind==='ground')!,before=structuredClone(s);
  assert.match(changeCarrying(s,{kind:'take',key:stackKey(ground)},[]),/放不下/);assert.deepEqual(s,before);
});
test('carried drop and pickup preserve arbitrary metadata; stale commands cannot duplicate',()=>{
  const s=createState(),source={...item('branch'),rarePayload:{a:[1,2,3]},rarityId:'epic'};
  s.inventory=awardCarried(s.inventory,source,3);
  const key=stackKey(s.inventory.stacks[0]);changeCarrying(s,{kind:'drop',key,quantity:3},[]);
  assert.equal(s.inventory.stacks[0].quantity,3);assert.equal(transportLocation(s.inventory.stacks[0])?.kind,'ground');
  const ground=s.inventory.stacks[0];s.selected=groundId(ground);
  changeCarrying(s,{kind:'take',key:stackKey(ground),quantity:3},[]);
  assert.equal(s.selected,null);assert.equal(inventoryCount(s.inventory,'branch'),3);assert.equal(currentLoad(s.inventory).weight,12);
  const expected=atLocation(source,{kind:'carried'});assert.deepEqual(s.inventory.stacks[0],{...expected,quantity:3});
  const before=structuredClone(s);changeCarrying(s,{kind:'take',key:stackKey(ground),quantity:3},[]);assert.deepEqual(s,before);
});
test('ground cannot be looted from far away or through a wall',()=>{
  const s=createState(),p={x:s.player.x+2,z:s.player.z};s.inventory=awardGround(s.inventory,item('branch'),1,p);
  const key=stackKey(s.inventory.stacks[0]),before=structuredClone(s.inventory);
  changeCarrying(s,{kind:'take',key},[{id:'test-wall',x:s.player.x+1,z:s.player.z,halfX:.15,halfZ:2}]);assert.deepEqual(s.inventory,before);
  s.player.x-=10;changeCarrying(s,{kind:'take',key},[]);assert.deepEqual(s.inventory,before);
});
test('deposit requires camp proximity, removes load and conserves batches; withdrawal is capacity checked',()=>{
  const s=nearStorage();s.inventory=awardCarried(s.inventory,item('wood'),1);s.inventory=inventoryTransaction(s.inventory,[{...item('wood'),delta:2}]);
  assert.match(changeCarrying(s,{kind:'store'},[]),/已全部/);assert.equal(currentLoad(s.inventory).weight,0);assert.equal(s.inventory.stacks.length,1);assert.equal(inventoryCount(s.inventory,'wood'),3);
  const key=stackKey(s.inventory.stacks[0]);changeCarrying(s,{kind:'withdraw',key},[]);assert.equal(currentLoad(s.inventory).weight,30);
  const before=structuredClone(s.inventory);changeCarrying(s,{kind:'withdraw',key},[]);assert.deepEqual(s.inventory,before);
  s.player.x-=20;changeCarrying(s,{kind:'store'},[]);assert.deepEqual(s.inventory,before);
});
test('unpacking an overfull bundle is rejected; putting a portion down makes unpacking possible',()=>{
  const s=createState();changeCarrying(s,{kind:'method',method:'bundle'},[]);s.inventory=awardCarried(s.inventory,item('branch'),6);
  const before=structuredClone(s.inventory);assert.match(changeCarrying(s,{kind:'method',method:'hands'},[]),/放不下/);assert.deepEqual(s.inventory,before);
  changeCarrying(s,{kind:'drop',key:stackKey(s.inventory.stacks[0]),quantity:3},[]);changeCarrying(s,{kind:'method',method:'hands'},[]);assert.equal(s.inventory.carryMode,'hands');
});
test('warehouse and wood island exclude carried and ground materials; processing cannot consume ground drops',()=>{
  const s=createState();s.inventory=awardGround(s.inventory,item('branch'),3,s.player);s.inventory=awardCarried(s.inventory,item('branch'),3);
  assert.equal(warehouseSnapshot(s,registry).total,0);assert.equal(availableWood(s.inventory).length,0);
  assert.equal(woodCandidates(s.inventory,{useId:'campfire.fuel',mode:'aggregate',measureId:'piece',amount:1}).length,1);
  assert.ok(isCarried(workshopInput(s,'craft')!));
  s.inventory.stacks=s.inventory.stacks.filter(x=>!isCarried(x));assert.equal(workshopInput(s,'craft'),undefined);
});
test('material position, carry mode and selected ground batch survive two whole-world roundtrips',async()=>{
  const s=createState();changeCarrying(s,{kind:'method',method:'bundle'},[]);s.inventory=awardCarried(s.inventory,item('branch'),3);s.inventory=awardGround(s.inventory,{...item('wood'),future:{x:1}},4,s.player);
  s.selected=groundId(s.inventory.stacks.find(x=>transportLocation(x)?.kind==='ground')!);
  let world=s;for(let i=1;i<=2;i++){const raw=await serializeWorldSave(world,context,{sequence:i,savedAt:i});const restored=await prepareWorldSave(raw,context);assert.equal(restored.decision,'restored');if(!('value' in restored))throw Error('restore failed');world=restored.value;}
  assert.deepEqual(world.inventory.stacks,s.inventory.stacks);assert.equal(world.selected,s.selected);assert.equal(world.inventory.carryMode,'bundle');
});
test('pre-carrying v4 inventory / v5 world migrate existing stock into camp, without adding resources',async()=>{
  const s=createState();s.inventory=inventoryTransaction(s.inventory,[{...item('wood'),future:{preserve:true},delta:20}]);
  const raw=JSON.parse(await serializeWorldSave(s,context,{sequence:1,savedAt:0}));raw.rulesetVersion=5;raw.world.inventory.schemaVersion=4;
  const {checksum,...core}=raw;const restored=await prepareWorldSave(JSON.stringify({...core,checksum:await saveDigest(core)}),context);
  assert.equal(restored.decision,'migrated');if(!('value' in restored))throw Error('migration failed');
  assert.deepEqual(restored.value.inventory.stacks,s.inventory.stacks);assert.ok(restored.value.inventory.stacks.every(isStored));assert.equal(currentLoad(restored.value.inventory).weight,0);
});
test('invalid locations and undeclared transport modes protect saved data',()=>{
  for(const transport of [{kind:'ground',x:Infinity,z:0},{kind:'ground',x:999999,z:0},{kind:'remote'},{kind:'carried',x:2}]){
    const inv=createInventory();inv.stacks=[{...item('branch'),transport}];assert.throws(()=>validateInventory(inv));
  }
  const inv=createInventory();inv.carryMode='cart';assert.throws(()=>serializeInventory(inv));
  assert.equal(prepareInventoryPersistence(JSON.stringify({schemaVersion:4,stacks:[{...item('branch'),transport:{kind:'carried'}}]})).decision,'protected');
});
test('all hourglass rates produce the same loaded walking distance while calendar time differs',()=>{
  const outcomes=[];
  for(const speed of [1,4,12] as const){const s=createState();s.clock.speed=speed;s.inventory=awardCarried(s.inventory,item('wood'),1);const start={...s.player};
    for(let i=0;i<60;i++){advanceLocalClock(s,MOVEMENT.fixedStep);Object.assign(s.player,move(s.player,0,MOVEMENT.speed*currentLoad(s.inventory).speed*MOVEMENT.fixedStep,[]));}
    outcomes.push({distance:Math.hypot(s.player.x-start.x,s.player.z-start.z),time:s.time});}
  assert.ok(Math.abs(outcomes[0].distance-outcomes[2].distance)<1e-9);assert.ok(Math.abs(outcomes[0].distance-MOVEMENT.speed/3)<1e-8);assert.ok(outcomes[2].time>outcomes[0].time*11.99);
});
test('representative presentation states are semantic only, never extra inventory',()=>{
  const s=createState();s.inventory=awardCarried(s.inventory,item('mushroom'),1);assert.equal(carryingSnapshot(s).visual,'backpack');
  s.inventory=awardCarried(createInventory(),item('branch'),1);assert.equal(carryingSnapshot(s).visual,'wood-bundle');
  s.inventory=awardCarried(createInventory(),item('wood'),1);assert.equal(carryingSnapshot(s).visual,'shoulder-log');
});
