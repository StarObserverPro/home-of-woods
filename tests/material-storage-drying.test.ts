import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {inventoryTransaction,inventoryCount,stackKey} from '../src/domain/inventory.ts';
import {awardCarried,awardGround,currentLoad,changeCarrying} from '../src/domain/carrying.ts';
import {isStored} from '../src/domain/transport-location.ts';
import {transferWood,collectWood,validateWoodcraft,placeableWood,woodShape} from '../src/domain/woodcraft.ts';
import {createWoodcraftSession} from '../src/app/woodcraft-session.ts';
import {createWoodPhysics} from '../src/physics/woodcraft.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {MUSHROOM_DRYING} from '../src/content/processing.ts';
import {startDryMushrooms,advanceFood,foodSnapshot} from '../src/domain/food.ts';
import {beginUpgrade,advanceUpgrade} from '../src/domain/upgrades.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
const context=createSaveContext();
const source=(itemId:string)=>({itemId,qualityId:'ordinary',batch:{origin:'regression'}});
const builtDryer=()=>{const s=createState();s.selected=CAMP_PROPS.dryer.id;s.player={...s.player,x:CAMP_PROPS.dryer.x,z:CAMP_PROPS.dryer.z+2.5};s.workshop.upgrades[CAMP_PROPS.dryer.id]={level:1,completedPaths:['upgrade.camp-drying-rack.frame'],investments:[{itemId:'branch',qualityId:'ordinary',quantity:2}],updatedAt:0};return s;};

test('carried timber enters the island directly, removes load and returns to camp exactly once',()=>{
  for(const id of ['wood','branch','scrap-fuel']){
    const s=createState();s.inventory=awardCarried(s.inventory,source(id),1);
    const key=stackKey(s.inventory.stacks[0]);assert.equal(transferWood(s,'one',undefined,key),1);
    assert.equal(currentLoad(s.inventory).weight,0);assert.equal(inventoryCount(s.inventory,id),0);
    validateWoodcraft(s.woodcraft);assert.deepEqual(s.woodcraft.pieces[0].source.batch,{origin:'regression'});
    assert.equal(transferWood(s,'one',undefined,key),0);
    assert.equal(collectWood(s,s.woodcraft.pieces[0].id),true);assert.equal(collectWood(s,'loose-wood-1'),false);
    assert.equal(inventoryCount(s.inventory,id),1);assert.ok(s.inventory.stacks.every(isStored));
  }
});

test('ground drops are excluded and full queued capacity rejects transfers atomically',()=>{
  const s=createState();s.inventory=awardGround(s.inventory,source('scrap-fuel'),1,s.player);assert.equal(placeableWood(s.inventory).length,0);
  s.inventory=inventoryTransaction(s.inventory,[{...source('branch'),delta:33}]);assert.equal(transferWood(s,'prepare'),31);
  assert.equal(transferWood(s,'one'),1);const before=structuredClone(s);assert.equal(transferWood(s,'one'),0);assert.deepEqual(s,before);
});

test('one carried batch can be deposited at the rack without dumping other materials',()=>{
  const s=createState();s.inventory=awardCarried(s.inventory,source('branch'),1);s.inventory=awardCarried(s.inventory,source('mushroom'),1);
  const key=stackKey(s.inventory.stacks.find(s=>s.itemId==='branch')!);const before=structuredClone(s.inventory);
  changeCarrying(s,{kind:'store',key},[]);assert.deepEqual(s.inventory,before);
  s.player.x=CAMP_PROPS.logs.x-3.3;s.player.z=CAMP_PROPS.logs.z+1;
  assert.match(changeCarrying(s,{kind:'store',key},[]),/已存入/);assert.ok(isStored(s.inventory.stacks.find(s=>s.itemId==='branch')!));
  assert.equal(currentLoad(s.inventory).weight,.2);const after=structuredClone(s.inventory);changeCarrying(s,{kind:'store',key},[]);assert.deepEqual(s.inventory,after);
});

test('manual placement remains available while another piece is queued, and cancellation keeps ownership',async()=>{
  const s=createState();s.player={...s.player,...WOODCRAFT.stand};s.inventory=awardCarried(s.inventory,source('scrap-fuel'),3);
  const session=createWoodcraftSession(s,()=>{},async()=>({step:()=>[],stats:()=>({awake:0}),dispose(){}} as unknown as Awaited<ReturnType<typeof createWoodPhysics>>));
  session.activate();await new Promise(r=>setTimeout(r,0));const key=stackKey(s.inventory.stacks[0]);
  assert.equal(session.beginDrop(key),true);session.cancelDrop();assert.equal(inventoryCount(s.inventory,'scrap-fuel'),3);
  transferWood(s,'one',undefined,key);assert.equal(session.snapshot().queued,1);assert.equal(session.beginDrop(key),true);
  session.cancelDrop();session.dispose();
});

test('scrap collision and visible dimensions share a smaller shape; real physics keeps ownership valid',async()=>{
  const s=createState();s.inventory=inventoryTransaction(s.inventory,[{...source('scrap-fuel'),delta:3}]);transferWood(s,'prepare');
  assert.ok(woodShape(s.woodcraft.pieces[0].source).length<woodShape({...source('branch'),quantity:1}).length);
  const physics=await createWoodPhysics();try{for(let i=0;i<1200;i++)for(const id of physics.step(s.woodcraft,WOODCRAFT.fixedStep))collectWood(s,id);validateWoodcraft(s.woodcraft);assert.equal(inventoryCount(s.inventory,'scrap-fuel')+s.woodcraft.pieces.length,3);}finally{physics.dispose();}
});

test('drying accepts carried mushrooms, excludes ground stock, and explains its actual rejection',()=>{
  const s=builtDryer();s.inventory=awardGround(s.inventory,source('mushroom'),4,s.player);
  assert.match(foodSnapshot(s).dryingReason,/地上/);const before=structuredClone(s);startDryMushrooms(s);assert.deepEqual(s,before);
  s.inventory=awardCarried(s.inventory,source('mushroom'),2);assert.equal(foodSnapshot(s).dryingReason,'');
  assert.match(startDryMushrooms(s),/挂上/);assert.equal(currentLoad(s.inventory).weight,0);assert.equal(inventoryCount(s.inventory,'mushroom'),4);
  assert.match(foodSnapshot(s).dryingReason,/已有/);assert.equal(advanceFood(s),null);
});

test('the starting blueprint builds the rack from carried branches and unlocks real drying',()=>{
  const s=createState();s.selected=CAMP_PROPS.dryer.id;s.player={...s.player,x:CAMP_PROPS.dryer.x,z:CAMP_PROPS.dryer.z+2.5};
  s.inventory=awardCarried(s.inventory,source('branch'),2);s.inventory=awardCarried(s.inventory,source('mushroom'),2);
  assert.match(startDryMushrooms(s),/图纸/);assert.match(beginUpgrade(s,CAMP_PROPS.dryer.id),/开始/);
  s.time=3;assert.match(advanceUpgrade(s)!,/已搭好/);assert.equal(inventoryCount(s.inventory,'branch'),0);
  assert.match(startDryMushrooms(s),/挂上/);s.time+=MUSHROOM_DRYING.durationSeconds;assert.match(advanceFood(s)!,/干货/);
  assert.equal(inventoryCount(s.inventory,'dried-mushroom'),1);assert.equal(currentLoad(s.inventory).weight,0);
});

test('drying and placed scrap survive a mid-job save and finish once after game time resumes',async()=>{
  const s=builtDryer();s.inventory=awardCarried(s.inventory,source('mushroom'),2);startDryMushrooms(s);
  s.inventory=inventoryTransaction(s.inventory,[{...source('scrap-fuel'),delta:1}]);transferWood(s,'one');s.time=40;
  const raw=await serializeWorldSave(s,context,{sequence:1,savedAt:0});const result=await prepareWorldSave(raw,context);assert.equal(result.decision,'restored');if(!('value' in result))return;
  const restored=result.value;assert.equal(foodSnapshot(restored).dryingProgress,.4);assert.equal(advanceFood(restored),null);assert.equal(restored.woodcraft.pieces[0].source.itemId,'scrap-fuel');
  restored.time=MUSHROOM_DRYING.durationSeconds;assert.match(advanceFood(restored)!,/干货/);assert.equal(inventoryCount(restored.inventory,'dried-mushroom'),1);assert.equal(advanceFood(restored),null);
});
