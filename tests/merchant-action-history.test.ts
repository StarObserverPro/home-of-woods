import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import type {GameState} from '../src/domain/state.ts';
import {CAMP_VISITOR} from '../src/content/characters.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {RUNTIME_MODELS} from '../src/content/assets.ts';
import {createGatheringRegistry} from '../src/domain/gathering-registry.ts';
import {beginGather,advanceGather,commitGather,cancelGather} from '../src/domain/gathering.ts';
import {beginRitual,advanceRitual,cancelRitual} from '../src/domain/ritual.ts';
import {exchangeMerchant,merchantSnapshot,validateMerchant} from '../src/domain/merchant.ts';
import {inventoryCount} from '../src/domain/inventory.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {createSaveContext} from '../src/domain/save-context.ts';

type Phase='approaching'|'performing'|'completed'|'cancelled';
function withAction(kind:'gather'|'ritual',phase:Phase):GameState{
  const state=createState();state.time=25;
  if(kind==='gather'){
    const registry=createGatheringRegistry({assetIds:RUNTIME_MODELS.map(model=>model.assetId)}),source=[...registry.sources.values()][0];
    Object.assign(state.player,{x:source.x,z:source.z});state.selected=source.sourceId;
    assert.equal(beginGather(state,source.sourceId,registry,[]).ok,true);
    if(phase==='performing'||phase==='completed')advanceGather(state,registry,[]);
    if(phase==='completed'){
      state.time+=state.gathering.action!.durationSeconds+.01;
      const candidate=advanceGather(state,registry,[]);assert.ok(candidate);assert.equal(commitGather(state,candidate,registry,[]),true);
    }
    if(phase==='cancelled')assert.equal(cancelGather(state),true);
    assert.equal(state.gathering.action!.phase,phase);
  }else{
    Object.assign(state.player,{x:CAMP_PROPS.altar.x,z:CAMP_PROPS.altar.z+5});state.selected=CAMP_PROPS.altar.id;
    assert.equal(beginRitual(state,[],'prayer').ok,true);
    if(phase==='performing'||phase==='completed')advanceRitual(state);
    if(phase==='completed'){state.time+=6;advanceRitual(state);}
    if(phase==='cancelled')assert.equal(cancelRitual(state),true);
    assert.equal(state.ritual!.phase,phase);
  }
  Object.assign(state.player,{x:CAMP_VISITOR.x+1,z:CAMP_VISITOR.z});state.selected=CAMP_VISITOR.id;
  assert.equal(merchantSnapshot(state).parked,true);
  return state;
}

test('completed or cancelled gather and prayer histories allow the existing welcome gift and ration purchase',()=>{
  for(const kind of ['gather','ritual'] as const)for(const phase of ['completed','cancelled'] as const){
    const state=withAction(kind,phase),history=structuredClone({gathering:state.gathering,ritual:state.ritual});
    assert.equal(merchantSnapshot(state).giftAvailable,true);
    const gift=exchangeMerchant(state,{buy:[],sellIds:[],welcome:true});assert.equal(gift.ok,true,`${kind} ${phase}: ${gift.message}`);
    assert.equal(inventoryCount(state.inventory,'trail-rations'),1);assert.equal(state.merchant.coins,100);assert.equal(state.merchant.debt,0);
    const purchase=exchangeMerchant(state,{buy:[{id:'supply.food',quantity:1}],sellIds:[]});assert.equal(purchase.ok,true,`${kind} ${phase}: ${purchase.message}`);
    assert.equal(inventoryCount(state.inventory,'trail-rations'),2);assert.equal(state.merchant.coins,0);assert.equal(state.merchant.debt,100);
    assert.equal(state.merchant.purchased['supply.food'],1);assert.equal(state.merchant.welcomeClaimed,true);
    assert.deepEqual({gathering:state.gathering,ritual:state.ritual},history,'trading preserves ended action records');
    const after=structuredClone(state);assert.equal(exchangeMerchant(state,{buy:[],sellIds:[],welcome:true}).ok,false);assert.deepEqual(state,after,'the welcome gift still settles once');
  }
});

test('approaching or performing gather and prayer actions still reject gift and ration orders atomically',()=>{
  for(const kind of ['gather','ritual'] as const)for(const phase of ['approaching','performing'] as const){
    const state=withAction(kind,phase),before=structuredClone(state);
    const result=exchangeMerchant(state,{buy:[{id:'supply.food',quantity:1}],sellIds:[],welcome:true});
    assert.equal(result.ok,false,`${kind} ${phase}`);assert.match(result.message,/先完成手上的动作/);assert.deepEqual(state,before);
  }
});

test('gift and ration purchases at fractional world time survive a complete world-save roundtrip',async()=>{
  const state=withAction('gather','completed');state.time=1010.1999999998088;
  assert.equal(exchangeMerchant(state,{buy:[],sellIds:[],welcome:true}).ok,true);
  assert.equal(exchangeMerchant(state,{buy:[{id:'supply.food',quantity:1}],sellIds:[]}).ok,true);
  assert.ok(state.merchant.receipts.every(receipt=>receipt.at===state.time));
  const context=createSaveContext(),raw=await serializeWorldSave(state,context,{sequence:1,savedAt:1});
  const loaded=await prepareWorldSave(raw,context);assert.equal(loaded.decision,'restored');
  if(loaded.decision!=='restored')throw Error(loaded.diagnostics.join(';'));
  assert.equal(loaded.value.time,state.time);assert.deepEqual(loaded.value.merchant,state.merchant);
  assert.deepEqual(loaded.value.inventory.stacks,state.inventory.stacks);assert.equal(inventoryCount(loaded.value.inventory,'trail-rations'),2);
  const before=structuredClone(loaded.value);assert.equal(exchangeMerchant(loaded.value,{buy:[],sellIds:[],welcome:true}).ok,false);assert.deepEqual(loaded.value,before);
});

test('receipt timestamps reject nonfinite or negative simulation time while amounts remain integer',()=>{
  const state=withAction('gather','completed');state.time=1010.1999999998088;
  assert.equal(exchangeMerchant(state,{buy:[],sellIds:[],welcome:true}).ok,true);
  for(const at of [NaN,Infinity,-Infinity,-.01]){
    const ledger=structuredClone(state.merchant);ledger.receipts[0].at=at;
    assert.throws(()=>validateMerchant(ledger),/Invalid merchant receipt/);
  }
  const ledger=structuredClone(state.merchant);ledger.receipts[0].coinsSpent=.5;
  assert.throws(()=>validateMerchant(ledger),/Invalid merchant receipt/);
  assert.deepEqual(validateMerchant(state.merchant),state.merchant);
});
