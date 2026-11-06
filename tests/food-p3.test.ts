import test from 'node:test';
import assert from 'node:assert/strict';
import {FOOD_GRAINS,FOOD_RULES,FOOD_PORRIDGE_ITEM_ID,FOOD_SOUP_ITEM_ID} from '../src/content/food.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {findUpgradeProfile} from '../src/content/upgrades.ts';
import {RUNTIME_MODELS} from '../src/content/assets.ts';
import {createState} from '../src/domain/state.ts';
import {inventoryCount,inventoryTransaction} from '../src/domain/inventory.ts';
import {startGrainPorridge,startMushroomSoup,advanceFood,eatGrainPorridge,foodSnapshot,heavyLaborAllowed} from '../src/domain/food.ts';
import {createGatheringRegistry} from '../src/domain/gathering-registry.ts';
import {warehouseSnapshot} from '../src/domain/warehouse-view.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {prepareWorldSave,serializeWorldSave} from '../src/domain/world-save.ts';
import {mountFireTop} from '../src/domain/upgrades.ts';

function pot(){
  const state=createState();state.time=200.375;
  state.selected=CAMP_PROPS.fire.id;state.player.x=CAMP_PROPS.fire.x;state.player.z=CAMP_PROPS.fire.z+2.8;
  for(const id of ['camp-fire:stones','camp-fire:support','camp-fire:hook','camp-fire:pot']){
    const profile=findUpgradeProfile(id)!;
    const materialIds:Record<string,string>={'wood.log':'wood','wood.branch':'branch','supply.hardware':'hardware-kit'};
    state.workshop.upgrades[id]={level:1,completedPaths:[profile.paths[0].id],
      investments:profile.paths[0].materials.map(material=>({itemId:materialIds[material.typeId],qualityId:'ordinary',quantity:material.quantity})),updatedAt:0};
    state.workshop.blueprints.push(profile.paths[0].blueprintId);
  }
  state.workshop.blueprints=[...new Set(state.workshop.blueprints)];
  state.workshop.mounted['camp-fire:top']='camp-fire:hook';
  return state;
}
const grant=(state:ReturnType<typeof pot>,id:string,quantity=1)=>{state.inventory=inventoryTransaction(state.inventory,[{itemId:id,qualityId:'ordinary',delta:quantity}]);};

test('each available grain makes one real porridge without needing or consuming mushrooms',()=>{
  for(const grain of FOOD_GRAINS){
    const state=pot();grant(state,grain);grant(state,'mushroom',2);
    assert.match(startGrainPorridge(state,grain),/粥已下锅/);
    assert.equal(inventoryCount(state.inventory,grain),0);
    assert.equal(inventoryCount(state.inventory,'mushroom'),2);
    assert.equal(state.food.cooking?.series,'grain-porridge');
    state.time+=FOOD_RULES.cookSeconds;advanceFood(state);
    assert.equal(inventoryCount(state.inventory,FOOD_PORRIDGE_ITEM_ID),1);
    assert.deepEqual(state.inventory.stacks.find(stack=>stack.itemId===FOOD_PORRIDGE_ITEM_ID)?.food,{series:'grain-porridge',grain});
    assert.equal(advanceFood(state),null);
    assert.equal(inventoryCount(state.inventory,FOOD_PORRIDGE_ITEM_ID),1);
  }
});

test('the same pot can switch from mushroom soup to porridge after the last fungus is used',()=>{
  const state=pot();grant(state,'food-oats');grant(state,'food-beans');grant(state,'mushroom');
  assert.match(startMushroomSoup(state,'food-oats'),/汤已下锅/);
  const busy=structuredClone(state.inventory);
  assert.match(startGrainPorridge(state,'food-beans'),/正在煮/);
  assert.deepEqual(state.inventory,busy);
  state.time+=FOOD_RULES.cookSeconds;advanceFood(state);
  assert.equal(inventoryCount(state.inventory,'mushroom'),0);
  assert.match(startGrainPorridge(state,'food-beans'),/粥已下锅/);
  state.time+=FOOD_RULES.cookSeconds;advanceFood(state);
  assert.equal(inventoryCount(state.inventory,FOOD_SOUP_ITEM_ID),1);
  assert.equal(inventoryCount(state.inventory,FOOD_PORRIDGE_ITEM_ID),1);
});

test('menu options and commands share real pot, distance, input and busy eligibility',()=>{
  const state=pot();grant(state,'food-rice');
  const rice=()=>foodSnapshot(state).cookingOptions.find(option=>option.series==='grain-porridge'&&option.grain==='food-rice')!;
  assert.equal(rice().canStart,true);
  assert.equal(foodSnapshot(state).cookingOptions.find(option=>option.series==='mushroom-grain-soup'&&option.grain==='food-rice')!.canStart,false);
  for(const invalidate of [
    ()=>{state.player.x+=30;},
    ()=>{delete state.workshop.upgrades['camp-fire:pot'];},
    ()=>{state.workshop.mounted['camp-fire:top']='camp-fire:grill';},
    ()=>{state.workshop.job={id:'workshop-1',kind:'craft',blueprintId:'blueprint.stump-cozy',phase:'working',startedAt:0,durationSeconds:3};},
  ]){
    const clean=structuredClone(state);invalidate();
    const before=structuredClone(state.inventory),option=rice();
    assert.equal(option.canStart,false);
    assert.equal(startGrainPorridge(state,'food-rice'),option.reason);
    assert.deepEqual(state.inventory,before);assert.equal(state.food.cooking,null);
    Object.assign(state,clean);
  }
});

test('eating porridge consumes only the actual meal and earns the same next-day work permission',()=>{
  const state=pot();grant(state,'food-rice');
  assert.match(eatGrainPorridge(state),/还没有/);
  startGrainPorridge(state,'food-rice');state.time+=FOOD_RULES.cookSeconds;advanceFood(state);
  assert.match(eatGrainPorridge(state),/吃完.*热粥/);
  assert.equal(inventoryCount(state.inventory,FOOD_PORRIDGE_ITEM_ID),0);
  assert.equal(state.food.mealsEaten,1);
  assert.equal(heavyLaborAllowed(state.food,800),true);
  assert.match(eatGrainPorridge(state),/还没有/);
  assert.equal(state.food.mealsEaten,1);
});

test('grain and fungus variants remain distinct in storage and carry readable prepared-food names',()=>{
  const state=pot();grant(state,'food-oats',2);grant(state,'food-rice');grant(state,'dried-mushroom');
  startGrainPorridge(state,'food-oats');state.time+=8;advanceFood(state);
  startGrainPorridge(state,'food-rice');state.time+=8;advanceFood(state);
  startMushroomSoup(state,'food-oats');state.time+=8;advanceFood(state);
  const registry=createGatheringRegistry({assetIds:RUNTIME_MODELS.map(asset=>asset.assetId)});
  const prepared=warehouseSnapshot(state,registry).items.filter(item=>item.quantity>0&&[FOOD_PORRIDGE_ITEM_ID,FOOD_SOUP_ITEM_ID].includes(item.itemId));
  assert.deepEqual(prepared.map(item=>item.name).sort(),['燕麦粥','米粥','菌菇燕麦汤'].sort());
  assert.equal(new Set(prepared.map(item=>item.key)).size,3);
  assert.equal(prepared.find(item=>item.itemId===FOOD_SOUP_ITEM_ID)?.specification,'干蘑菇 · 燕麦');
});

test('a fractional-time porridge job and its completed meal survive the one world save',async()=>{
  const state=pot(),context=createSaveContext();grant(state,'food-beans');
  startGrainPorridge(state,'food-beans');state.time+=2.25;
  const record=await serializeWorldSave(state,context,{sequence:1,savedAt:1});
  const loaded=await prepareWorldSave(record,context);
  assert.equal(loaded.decision,'restored');if(!('value' in loaded))throw new Error('save did not restore');
  assert.equal(loaded.value.food.cooking?.startedAt,200.375);
  loaded.value.time=208.375;advanceFood(loaded.value);
  const complete=await prepareWorldSave(await serializeWorldSave(loaded.value,context,{sequence:2,savedAt:2}),context);
  assert.equal(complete.decision,'restored');if(!('value' in complete))throw new Error('meal did not restore');
  assert.equal(inventoryCount(complete.value.inventory,FOOD_PORRIDGE_ITEM_ID),1);
  assert.equal(advanceFood(complete.value),null);
  eatGrainPorridge(complete.value);assert.equal(complete.value.food.mealsEaten,1);
});

test('a running soup or porridge keeps its real pot mounted and never consumes a second portion',()=>{
  for(const series of ['soup','porridge']){
    const state=pot();grant(state,'food-rice');grant(state,'mushroom');
    const grill=findUpgradeProfile('camp-fire:grill')!;
    state.workshop.upgrades[grill.id]={level:1,completedPaths:[grill.paths[0].id],investments:[{itemId:'hardware-kit',qualityId:'ordinary',quantity:1}],updatedAt:0};
    if(series==='soup')startMushroomSoup(state,'food-rice');else startGrainPorridge(state,'food-rice');
    const inventory=structuredClone(state.inventory),job=structuredClone(state.food.cooking);
    for(const part of [null,'camp-fire:grill','camp-fire:smoker']){
      assert.match(mountFireTop(state,part),/还在煮饭/);
      assert.equal(state.workshop.mounted['camp-fire:top'],'camp-fire:hook');
      assert.deepEqual(state.inventory,inventory);assert.deepEqual(state.food.cooking,job);
    }
    state.time+=FOOD_RULES.cookSeconds;advanceFood(state);
    assert.equal(inventoryCount(state.inventory,series==='soup'?FOOD_SOUP_ITEM_ID:FOOD_PORRIDGE_ITEM_ID),1);
    assert.match(mountFireTop(state,'camp-fire:grill'),/已装上/);
    assert.equal(state.workshop.mounted['camp-fire:top'],'camp-fire:grill');
    assert.equal(advanceFood(state),null);
  }
});
