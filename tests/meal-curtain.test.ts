import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {WORKBENCH} from '../src/content/workshop.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {WOODEN_BOWL_ID,MEAL_CURTAIN_TRAIT_ID} from '../src/content/meal-vessels.ts';
import {findUpgradeProfile} from '../src/content/upgrades.ts';
import {createGeometrySpec} from '../src/domain/parametric-crafting.ts';
import {learnMealVessel,beginMealVesselCraft,mealVesselsSnapshot} from '../src/domain/meal-vessels.ts';
import {beginItemOracle} from '../src/domain/item-oracle.ts';
import {advanceWorkshop} from '../src/domain/workshop.ts';
import {consumeMeal} from '../src/domain/food.ts';
import {inventoryTransaction,inventoryCount} from '../src/domain/inventory.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';

const grant=(host:ReturnType<typeof createState>,id:string,quantity=1)=>{host.inventory=inventoryTransaction(host.inventory,[{itemId:id,qualityId:'ordinary',delta:quantity}]);};
function craftBowl(){
  const state=createState();state.time=.5;state.selected=WORKBENCH.id;Object.assign(state.player,WORKBENCH.stand);
  learnMealVessel(state,'blueprint.wooden-bowl');grant(state,'wood');
  assert.match(beginMealVesselCraft(state,'blueprint.wooden-bowl',[]),/工作台/);
  advanceWorkshop(state);state.time+=3.01;advanceWorkshop(state);
  const bowl=state.inventory.instances!.find(item=>item.definitionId===WOODEN_BOWL_ID)!;assert.ok(bowl);
  return {state,id:bowl.instanceId};
}
function bless(state:ReturnType<typeof createState>,id:string){
  const bowl=state.inventory.instances!.find(item=>item.instanceId===id)!,rarity=bowl.rarityId;
  bowl.keepsake={engraving:'小山',revision:2};grant(state,'mushroom');
  state.selected=CAMP_PROPS.altar.id;state.player.x=CAMP_PROPS.altar.x;state.player.z=CAMP_PROPS.altar.z+5;
  assert.match(beginItemOracle(state,id,'oracle.meal-curtain'),/神谕/);
  state.time+=3.01;advanceWorkshop(state);
  const changed=state.inventory.instances!.find(item=>item.instanceId===id)!;
  assert.equal(changed.instanceId,id);assert.equal(changed.rarityId,rarity);assert.deepEqual(changed.keepsake,bowl.keepsake);
  assert.ok((changed.traits as {id:string}[]).some(trait=>trait.id===MEAL_CURTAIN_TRAIT_ID));
}
function pot(state:ReturnType<typeof createState>){
  const materialIds:Record<string,string>={'wood.log':'wood','wood.branch':'branch','supply.hardware':'hardware-kit'};
  for(const target of ['camp-fire:stones','camp-fire:support','camp-fire:hook','camp-fire:pot']){
    const path=findUpgradeProfile(target)!.paths[0];
    state.workshop.upgrades[target]={level:1,completedPaths:[path.id],investments:path.materials.map(material=>({itemId:materialIds[material.typeId],qualityId:'ordinary',quantity:material.quantity})),updatedAt:0};
  }
  state.workshop.mounted['camp-fire:top']='camp-fire:hook';
  state.time=200.5;state.selected=CAMP_PROPS.fire.id;state.player.x=CAMP_PROPS.fire.x;state.player.z=CAMP_PROPS.fire.z+2.8;
}
function meal(state:ReturnType<typeof createState>,id?:string){grant(state,'grain-porridge');return consumeMeal(state,'grain-porridge',id);}

test('the ordinary bowl uses one real log and remains a unique, usable item without affixes',()=>{
  const {state,id}=craftBowl();
  assert.equal(inventoryCount(state.inventory,'wood'),0);
  const bowl=state.inventory.instances!.find(item=>item.instanceId===id)!;
  assert.equal(bowl.location.kind,'inventory');assert.deepEqual(bowl.traits,[]);
  pot(state);const result=meal(state,id);
  assert.equal(result.ok,true);assert.equal(result.committed?.bowlId,id);assert.equal(result.committed?.curtain,null);
  assert.equal(inventoryCount(state.inventory,'grain-porridge'),0);
  assert.equal(state.inventory.instances!.filter(item=>item.instanceId===id).length,1);
  assert.equal((state.inventory.instances!.find(item=>item.instanceId===id)!.mealUse as {uses:number}).uses,1);
});

test('the normal workbench rejects branch-only or distant bowl fabrication without consuming material',()=>{
  const state=createState();grant(state,'branch',2);
  const before=structuredClone(state.inventory);
  assert.match(learnMealVessel(state,'blueprint.wooden-bowl'),/走近/);
  Object.assign(state.player,WORKBENCH.stand);learnMealVessel(state,'blueprint.wooden-bowl');
  assert.match(beginMealVesselCraft(state,'blueprint.wooden-bowl',[]),/不足/);
  assert.deepEqual(state.inventory,before);assert.equal(state.workshop.job,null);
});

test('a real oracle rite modifies the original bowl and its first qualified meal emits one curtain pulse',()=>{
  const {state,id}=craftBowl();bless(state,id);pot(state);
  const result=meal(state,id);
  assert.equal(result.ok,true);assert.equal(result.committed?.mealSequence,1);
  assert.equal(result.committed?.at,state.time);assert.equal(result.committed?.curtain?.ownerId,id);
  assert.equal(result.committed?.curtain?.potId,'camp-fire:pot');assert.equal(result.committed?.curtain?.hookId,'camp-fire:hook');
  assert.equal(result.committed?.curtain?.spoonTableId,null,'no table or spoon is summoned');
  assert.equal(result.committed?.curtain?.durationSeconds,1.4);
  const after=structuredClone(state.inventory),again=consumeMeal(state,'grain-porridge',id);
  assert.equal(again.ok,false);assert.equal(again.committed,undefined);assert.deepEqual(state.inventory,after);
});

test('the borrowed bowl, missing pot and inactive hook never enable a vessel affix',()=>{
  const {state,id}=craftBowl();bless(state,id);pot(state);
  assert.equal(meal(state).committed?.curtain,null);
  assert.equal(state.inventory.instances!.find(item=>item.instanceId===id)!.mealUse,undefined);
  state.workshop.mounted['camp-fire:top']='camp-fire:grill';
  assert.equal(meal(state,id).committed?.curtain,null);
  const use=state.inventory.instances!.find(item=>item.instanceId===id)!.mealUse as {qualifiedMeals:number};
  assert.equal(use.qualifiedMeals,0);
  state.workshop.mounted['camp-fire:top']='camp-fire:hook';delete state.workshop.upgrades['camp-fire:pot'];
  assert.equal(meal(state,id).committed?.curtain,null);
});

test('a far world bowl cannot be remotely used and a failed meal does not change vessel cadence',()=>{
  const {state,id}=craftBowl();bless(state,id);pot(state);
  const bowl=state.inventory.instances!.find(item=>item.instanceId===id)!;
  bowl.location={kind:'world',x:70,z:20,rotation:0};grant(state,'grain-porridge');
  const inventory=structuredClone(state.inventory),food=structuredClone(state.food);
  const result=consumeMeal(state,'grain-porridge',id);
  assert.equal(result.ok,false);assert.equal(result.committed,undefined);
  assert.deepEqual(state.inventory,inventory);assert.deepEqual(state.food,food);
  assert.equal(mealVesselsSnapshot(state).bowls[0].available,false);
});

test('curtain cadence lives on the bowl across save/load: first use, at least three qualifying meals, at most daily',async()=>{
  const {state,id}=craftBowl();bless(state,id);pot(state);
  assert.ok(meal(state,id).committed?.curtain);
  for(let i=0;i<3;i++)assert.equal(meal(state,id).committed?.curtain,null,'same-day repeats are suppressed');
  const context=createSaveContext(),record=await serializeWorldSave(state,context,{sequence:1,savedAt:1});
  const restored=await prepareWorldSave(record,context);assert.equal(restored.decision,'restored');if(!('value' in restored))throw Error('bowl did not restore');
  const use=restored.value.inventory.instances!.find(item=>item.instanceId===id)!.mealUse as {qualifiedMeals:number;lastCurtainDay:number};
  assert.equal(use.qualifiedMeals,4);assert.equal(use.lastCurtainDay,1);
  const before=structuredClone(restored.value.inventory);mealVesselsSnapshot(restored.value);assert.deepEqual(restored.value.inventory,before,'snapshot/load has no effect trigger or write');
  restored.value.time=1400.5;
  assert.ok(meal(restored.value,id).committed?.curtain,'a later day may use the accrued qualifying meals');
  assert.equal(meal(restored.value,id).committed?.curtain,null);
});

test('only an actually placed nearby preparation table can contribute its existing spoon',()=>{
  const {state,id}=craftBowl();bless(state,id);pot(state);
  state.inventory.instances!.push({instanceId:'prep-far',definitionId:'furniture.prep-side-table',blueprintId:'blueprint.prep-side-table',createdAt:0,geometry:createGeometrySpec('bench.supported'),location:{kind:'world',x:70,z:30,rotation:0}});
  state.inventory.instances!.push({instanceId:'prep-near',definitionId:'furniture.prep-side-table',blueprintId:'blueprint.prep-side-table',createdAt:0,geometry:createGeometrySpec('bench.supported'),location:{kind:'world',x:CAMP_PROPS.fire.x-3,z:CAMP_PROPS.fire.z+1,rotation:0}});
  const result=meal(state,id);assert.equal(result.committed?.curtain?.spoonTableId,'prep-near');
  assert.equal(state.inventory.instances!.filter(item=>item.definitionId==='furniture.prep-side-table').length,2);
});

test('moving to a later day alone does not skip the three-qualifying-meal interval',()=>{
  const {state,id}=craftBowl();bless(state,id);pot(state);
  assert.ok(meal(state,id).committed?.curtain);
  state.time=1400.5;assert.equal(meal(state,id).committed?.curtain,null);
  state.time=2600.5;assert.equal(meal(state,id).committed?.curtain,null);
  state.time=3800.5;assert.ok(meal(state,id).committed?.curtain);
  const record=state.inventory.instances!.find(item=>item.instanceId===id)!.mealUse as {qualifiedMeals:number;lastCurtainQualifiedMeal:number};
  assert.equal(record.qualifiedMeals,4);assert.equal(record.lastCurtainQualifiedMeal,4);
});

test('midnight cannot reset the curtain daily cap; the next sunrise uses the same meal day boundary',()=>{
  const {state,id}=craftBowl();bless(state,id);pot(state);
  assert.equal(meal(state,id).committed?.curtain?.ownerId,id);
  for(const time of [400.5,500.5,700.5]){
    state.time=time;const result=meal(state,id);
    assert.equal(result.committed?.day,1);assert.equal(result.committed?.curtain,null);
  }
  state.time=800.5;const next=meal(state,id);
  assert.equal(next.committed?.day,2);assert.equal(next.committed?.curtain?.ownerId,id);
});
