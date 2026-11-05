import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {exchangeMerchant} from '../src/domain/merchant.ts';
import {unpackFoodSack,eatBlackBread,heavyLaborAllowed} from '../src/domain/food.ts';
import {inventoryCount} from '../src/domain/inventory.ts';
import {CAMP_VISITOR} from '../src/content/characters.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {VISUAL_DAY_SECONDS} from '../src/content/scene-props.ts';

test('merchant welcome ration becomes usable food and next-day work without a pot',()=>{
  const state=createState();state.time=25;state.selected=CAMP_VISITOR.id;
  Object.assign(state.player,{x:CAMP_VISITOR.x,z:CAMP_VISITOR.z});
  assert.equal(exchangeMerchant(state,{buy:[],sellIds:[],welcome:true}).ok,true);
  assert.equal(inventoryCount(state.inventory,'trail-rations'),1);
  unpackFoodSack(state);
  assert.equal(inventoryCount(state.inventory,'trail-rations'),0);
  assert.ok(inventoryCount(state.inventory,'food-black-bread')>0);
  const before=JSON.stringify(state.inventory);unpackFoodSack(state);
  assert.equal(JSON.stringify(state.inventory),before);
  state.selected=CAMP_PROPS.fire.id;
  Object.assign(state.player,{x:CAMP_PROPS.fire.x,z:CAMP_PROPS.fire.z});
  eatBlackBread(state);state.time+=VISUAL_DAY_SECONDS;
  assert.equal(heavyLaborAllowed(state.food,state.time),true);
});
