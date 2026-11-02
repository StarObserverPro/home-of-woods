import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {inventoryTransaction,inventoryCount} from '../src/domain/inventory.ts';
import {beginWorkshop,advanceWorkshop,cancelWorkshop,workshopTarget,merchantStock,tradeBlueprint,workshopInput} from '../src/domain/workshop.ts';
import {BLUEPRINTS,WORKBENCH,SEAT_DEFINITION} from '../src/content/workshop.ts';
import {CAMP_VISITOR} from '../src/content/characters.ts';
import {canonicalInstances} from '../src/domain/owned-items.ts';
import {placeFurniture,packFurniture,furnitureColliders,placementReason,workstationColliders} from '../src/domain/furniture-placement.ts';
import {advanceLocalClock,calendarAt} from '../src/domain/local-clock.ts';
import {prepareInventoryPersistence,serializeInventory} from '../src/domain/inventory-persistence.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {saveDigest} from '../src/domain/save-digest.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import {beginRitual} from '../src/domain/ritual.ts';

const context=createSaveContext();
function stocked(){const s=createState();s.inventory=inventoryTransaction(s.inventory,[{itemId:'wood',qualityId:'ordinary',delta:50},{itemId:'mushroom',qualityId:'ordinary',delta:50}]);return s;}
function craft(s:ReturnType<typeof createState>,id=BLUEPRINTS[0].id){if(!s.workshop.blueprints.includes(id))s.workshop.blueprints.push(id);Object.assign(s.player,workshopTarget('craft'));beginWorkshop(s,'craft',[],id);advanceWorkshop(s);s.time+=3.01;assert.match(advanceWorkshop(s)??'',/做好/);}
async function change(raw:string,f:(o:any)=>void){const o=JSON.parse(raw);f(o);const {checksum,...core}=o;return JSON.stringify({...core,checksum:await saveDigest(core)});}

test('two visually identical seats have different immutable identities and traits; settle once',()=>{
 const s=stocked();craft(s);craft(s,BLUEPRINTS[1].id);const [a,b]=s.inventory.instances!;
 assert.notEqual(a.instanceId,b.instanceId);assert.equal(a.definitionId,SEAT_DEFINITION);assert.equal(a.definitionId,b.definitionId);assert.notDeepEqual(a.traits,b.traits);assert.equal(inventoryCount(s.inventory,'wood'),48);
 const before=structuredClone(s);for(let i=0;i<5;i++)assert.equal(advanceWorkshop(s),null);assert.deepEqual(s,before);
 s.inventory=inventoryTransaction(s.inventory,[{itemId:'mushroom',qualityId:'ordinary',delta:1}]);assert.deepEqual(s.inventory.instances,before.inventory.instances);
});
test('unlearned, insufficient, cancelled and interrupted jobs never debit resources',()=>{
 const s=stocked();Object.assign(s.player,WORKBENCH.stand);assert.match(beginWorkshop(s,'craft',[],BLUEPRINTS[0].id),/先获得/);assert.equal(s.workshop.job,null);
 s.workshop.blueprints.push(BLUEPRINTS[0].id);const original=structuredClone(s.inventory);beginWorkshop(s,'craft',[],BLUEPRINTS[0].id);advanceWorkshop(s);s.time+=1;cancelWorkshop(s);s.time+=20;advanceWorkshop(s);assert.deepEqual(s.inventory,original);
 beginWorkshop(s,'craft',[],BLUEPRINTS[0].id);advanceWorkshop(s);s.selected=null;advanceWorkshop(s);assert.deepEqual(s.inventory,original);assert.equal(s.workshop.job,null);
 const empty=createState();assert.match(beginWorkshop(empty,'offering',[]),/蘑菇/);assert.equal(empty.workshop.job,null);
});
test('fuel-only scraps cannot silently become crafting or barter material',()=>{
 const s=createState();s.inventory=inventoryTransaction(s.inventory,[{itemId:'scrap-fuel',qualityId:'ordinary',delta:5}]);assert.equal(workshopInput(s,'craft'),undefined);assert.equal(workshopInput(s,'trade'),undefined);
});
test('one-mushroom offerings have deterministic varied responses, duplicates and no-plan outcomes',()=>{
 const a=stocked(),b=stocked();const messages=new Set<string>();
 for(let i=0;i<30;i++)for(const s of [a,b]){Object.assign(s.player,workshopTarget('offering'));beginWorkshop(s,'offering',[]);advanceWorkshop(s);s.time+=1.81;messages.add(advanceWorkshop(s)!);}
 assert.deepEqual(a,b);assert.equal(inventoryCount(a.inventory,'mushroom'),20);assert.equal(a.workshop.prayerCount,30);assert.equal(a.workshop.blueprints.length,2);assert.ok([...messages].some(m=>m.includes('这次没有')));assert.ok([...messages].some(m=>m.includes('已经学会')));
 assert.equal(advanceWorkshop(a),null);assert.equal(inventoryCount(a.inventory,'mushroom'),20);
});
test('merchant fixed stock survives same-day remount; exchange requires proximity, stock and one debit',()=>{
 const s=stocked();assert.deepEqual(merchantStock(s),merchantStock(structuredClone(s)));assert.ok(merchantStock(s).includes(BLUEPRINTS[0].id));
 assert.match(tradeBlueprint(s,BLUEPRINTS[0].id),/先走/);s.selected=CAMP_VISITOR.id;Object.assign(s.player,{x:CAMP_VISITOR.x+2,z:CAMP_VISITOR.z});assert.match(tradeBlueprint(s,BLUEPRINTS[0].id),/已换得/);assert.equal(inventoryCount(s.inventory,'wood'),49);
 assert.match(tradeBlueprint(s,BLUEPRINTS[0].id),/已经学会/);assert.equal(inventoryCount(s.inventory,'wood'),49);
 const days=new Set(Array.from({length:28},(_,i)=>merchantStock({...s,time:i*1200}).length));assert.equal(days.size,2);
});
test('place, overlap rejection, relocate and pack retain one instance, including its affix',()=>{
 const s=stocked();craft(s);craft(s,BLUEPRINTS[1].id);Object.assign(s.player,{x:-35,z:2});const [a,b]=structuredClone(s.inventory.instances!);const blockers=[...makeColliders(makeTrees()),...workstationColliders()];
 let p:{x:number;z:number}|undefined;
 for(let x=-48;x<-25&&!p;x+=1)for(let z=-7;z<16;z+=1)if(!placementReason(s,a.instanceId,{x,z},blockers)){p={x,z};break;}
 assert.ok(p,'camp has an available flat placement');assert.match(placeFurniture(s,a.instanceId,p,Math.PI/4,blockers),/摆好/);
 const occupied=[...blockers,...furnitureColliders(s)];assert.notEqual(placementReason(s,b.instanceId,p,occupied),'');const before=structuredClone(s.inventory);placeFurniture(s,b.instanceId,p,0,occupied);assert.deepEqual(s.inventory,before);
 assert.notEqual(placementReason(s,b.instanceId,{x:999,z:999},occupied),'');assert.notEqual(placementReason(s,b.instanceId,WORKBENCH.stand,occupied),'');
 assert.match(packFurniture(s,a.instanceId),/收回/);assert.equal(s.inventory.instances!.length,2);assert.deepEqual(s.inventory.instances!.find(i=>i.instanceId===a.instanceId),a);
 assert.match(placeFurniture(s,a.instanceId,p,0,blockers),/摆好/);assert.equal(s.inventory.instances!.length,2);
});
test('current inventory core preserves instances and unknown catalog IDs; protects invalid structures',()=>{
 const s=stocked();craft(s);s.inventory.instances!.push({...structuredClone(s.inventory.instances![0]),instanceId:'future-own-1',definitionId:'future.furniture',blueprintId:'future.recipe',traits:[{id:'future.affix',value:17}]});
 const restored=prepareInventoryPersistence(serializeInventory(s.inventory));assert.notEqual(restored.decision,'protected');if(restored.decision==='protected')throw Error('unexpected');assert.deepEqual(restored.value.instances,canonicalInstances(s.inventory.instances));
 assert.equal(prepareInventoryPersistence(JSON.stringify({schemaVersion:3,stacks:[]})).decision,'protected');assert.equal(prepareInventoryPersistence(JSON.stringify({schemaVersion:99,stacks:[],instances:[]})).decision,'protected');
 const bad=structuredClone(s.inventory.instances!);bad.push(bad[0]);assert.throws(()=>canonicalInstances(bad));bad.pop();bad[0].location={kind:'world',x:NaN,z:0,rotation:0};assert.throws(()=>canonicalInstances(bad));
});
test('world save persists job, clock, learned plans and instances; old rules are no longer imported',async()=>{
 const s=stocked();craft(s);s.clock.speed=12;beginWorkshop(s,'craft',[],BLUEPRINTS[0].id);advanceWorkshop(s);s.time+=1;
 const raw=await serializeWorldSave(s,context,{sequence:1,savedAt:100});const restored=await prepareWorldSave(raw,context);assert.equal(restored.decision,'restored');if(restored.decision!=='restored')throw Error('unexpected');
 assert.deepEqual(restored.value.workshop,s.workshop);assert.deepEqual(restored.value.inventory.instances,s.inventory.instances);assert.equal(restored.value.clock.speed,12);
 const loaded=restored.value;loaded.time+=3;advanceWorkshop(loaded);assert.equal(loaded.inventory.instances!.length,2);advanceWorkshop(loaded);assert.equal(loaded.inventory.instances!.length,2);
 const oldRaw=await change(raw,o=>{o.rulesetVersion=2;});assert.equal((await prepareWorldSave(oldRaw,context)).decision,'protected');
 for(const mutate of [(o:any)=>{o.world.workshop.nextInstance=1;},(o:any)=>{o.world.clock.speed=99;},(o:any)=>{o.world.workshop.future=true;},(o:any)=>{o.world.inventory.instances[0].createdAt=999999;}])assert.equal((await prepareWorldSave(await change(raw,mutate),context)).decision,'protected');
});
test('local clock scales only simulated time, crosses midnight/seasons, rejects invalid inputs',()=>{
 for(const speed of [1,4,12] as const){const s=createState();s.clock.speed=speed;advanceLocalClock(s,2);assert.equal(s.time,2*speed);assert.deepEqual(s.player,createState().player);}
 assert.equal(calendarAt(500).day,2);assert.equal(calendarAt(1200*(7-14/24)).season,'夏');assert.equal(calendarAt(1200*(28-14/24)).year,2);
 assert.throws(()=>advanceLocalClock(createState(),-1));assert.throws(()=>advanceLocalClock(createState(),NaN));
});
test('workshop and legacy prayer cannot run concurrently',()=>{
 const s=stocked();Object.assign(s.player,workshopTarget('offering'));beginWorkshop(s,'offering',[]);assert.equal(beginRitual(s,[],'prayer').ok,false);
});
