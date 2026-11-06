import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {POT_FOUNDATION_TARGETS} from '../src/content/food.ts';
import {WORKBENCH} from '../src/content/workshop.ts';
import {CAMP_VISITOR} from '../src/content/characters.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {findUpgradeProfile} from '../src/content/upgrades.ts';
import {potFoundationSnapshot,learnPotFoundation} from '../src/domain/pot-foundation.ts';
import {beginUpgrade,advanceUpgrade} from '../src/domain/upgrades.ts';
import {exchangeMerchant,merchantSnapshot} from '../src/domain/merchant.ts';
import {inventoryCount,inventoryTransaction} from '../src/domain/inventory.ts';
import {unpackFoodSack,startGrainPorridge,advanceFood,eatGrainPorridge,heavyLaborAllowed} from '../src/domain/food.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {createSaveContext} from '../src/domain/save-context.ts';

const atWorkbench=(state:ReturnType<typeof createState>)=>{state.selected=WORKBENCH.id;state.player.x=WORKBENCH.stand.x;state.player.z=WORKBENCH.stand.z;};

test('ordinary pot plans are explicit local learning, without granting pots, stock, coins or fittings',()=>{
  const state=createState();atWorkbench(state);
  const before=structuredClone({inventory:state.inventory,merchant:state.merchant,upgrades:state.workshop.upgrades});
  const plans=potFoundationSnapshot(state).plans;
  assert.equal(plans.length,3);
  for(const plan of plans){assert.equal(plan.canLearn,true);assert.match(learnPotFoundation(state,plan.id),/已学会/);}
  assert.deepEqual({inventory:state.inventory,merchant:state.merchant,upgrades:state.workshop.upgrades},before);
  assert.ok(potFoundationSnapshot(state).plans.every(plan=>plan.known&&!plan.canLearn));
  const knowledge=[...state.workshop.blueprints];
  assert.match(learnPotFoundation(state,plans[0].id),/已经学会/);
  assert.deepEqual(state.workshop.blueprints,knowledge);
});

test('distant, busy or unrelated plan learning never changes knowledge or resources',()=>{
  const state=createState(),plan=potFoundationSnapshot(state).plans[0];
  const before=structuredClone(state.workshop);
  assert.match(learnPotFoundation(state,plan.id),/走近工作台/);
  assert.deepEqual(state.workshop,before);
  atWorkbench(state);state.workshop.job={id:'workshop-1',kind:'craft',blueprintId:'blueprint.stump-cozy',phase:'working',startedAt:0,durationSeconds:3};
  const busy=structuredClone(state.workshop);
  assert.match(learnPotFoundation(state,plan.id),/当前动作/);assert.deepEqual(state.workshop,busy);
  state.workshop.job=null;
  assert.match(learnPotFoundation(state,'blueprint.camp-fire-smoker'),/没有这张/);
  assert.ok(!state.workshop.blueprints.includes('blueprint.camp-fire-smoker'));
});

test('first-visit paid hardware and real camp materials can complete the pot and a meal on day one',()=>{
  const state=createState();state.time=12.25;state.selected=CAMP_VISITOR.id;state.player.x=CAMP_VISITOR.x+2;state.player.z=CAMP_VISITOR.z+1;
  assert.equal(exchangeMerchant(state,{buy:[{id:'supply.hardware',quantity:1}],sellIds:[],welcome:true}).ok,true);
  assert.equal(state.merchant.coins,15);assert.equal(state.merchant.debt,0);
  assert.equal(inventoryCount(state.inventory,'hardware-kit'),1);
  atWorkbench(state);
  for(const plan of potFoundationSnapshot(state).plans)learnPotFoundation(state,plan.id);
  // Explicit material fixture stands for current collection; no fitting is seeded.
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'wood',qualityId:'ordinary',delta:1},{itemId:'branch',qualityId:'ordinary',delta:3}]);
  const fireStand=findUpgradeProfile('camp-fire')!.stand;state.selected=CAMP_PROPS.fire.id;state.player.x=fireStand.x;state.player.z=fireStand.z;
  for(const target of ['camp-fire:stones',...POT_FOUNDATION_TARGETS]){
    assert.match(beginUpgrade(state,target),/开始/);
    state.time+=3.01;assert.ok(advanceUpgrade(state));
    assert.equal(state.workshop.upgrades[target].level,1);
  }
  assert.equal(inventoryCount(state.inventory,'wood'),0);assert.equal(inventoryCount(state.inventory,'branch'),0);assert.equal(inventoryCount(state.inventory,'hardware-kit'),0);
  assert.equal(state.workshop.mounted['camp-fire:top'],'camp-fire:hook');
  assert.match(unpackFoodSack(state),/已拆开/);
  assert.match(startGrainPorridge(state,'food-oats'),/粥已下锅/);
  state.time+=8.01;advanceFood(state);assert.match(eatGrainPorridge(state),/吃完/);
  assert.equal(heavyLaborAllowed(state.food,800),true);
  assert.equal(state.merchant.coins,15);
});

test('local knowledge survives the normal world record and the shop recognizes plans already learned',async()=>{
  const state=createState(),context=createSaveContext();atWorkbench(state);
  for(const plan of potFoundationSnapshot(state).plans)learnPotFoundation(state,plan.id);
  const loaded=await prepareWorldSave(await serializeWorldSave(state,context,{sequence:1,savedAt:1}),context);
  assert.equal(loaded.decision,'restored');if(!('value' in loaded))throw new Error('knowledge did not restore');
  assert.ok(potFoundationSnapshot(loaded.value).plans.every(plan=>plan.known));
  loaded.value.time=4*14*1200+12;
  const offer=merchantSnapshot(loaded.value).listings.find(plan=>plan.blueprintId==='blueprint.camp-fire-pot');
  assert.ok(offer);assert.equal(offer.learned,true);assert.equal(offer.price,275);
});
