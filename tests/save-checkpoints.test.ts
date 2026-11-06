import test from 'node:test';
import assert from 'node:assert/strict';
import {createSaveController} from '../src/app/save-controller.ts';
import type {WorldSaveStore,SaveRecords} from '../src/app/world-save-store.ts';
import {createState} from '../src/domain/state.ts';
import type {GameState} from '../src/domain/state.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {prepareWorldSave} from '../src/domain/world-save.ts';
import {learnPotFoundation} from '../src/domain/pot-foundation.ts';
import {inventoryTransaction} from '../src/domain/inventory.ts';
import {WORKBENCH} from '../src/content/workshop.ts';
import {WORKBENCH_BRACING} from '../src/content/workshop-series.ts';
import {learnWorkshopPlan,beginGuidedCraft,adjustGuidedPart} from '../src/domain/workshop-guided.ts';
import {beginUpgrade} from '../src/domain/upgrades.ts';
import {advanceWorkshop} from '../src/domain/workshop.ts';

function memoryStore(){
  let records:SaveRecords={primary:null,backup:null};
  const store:WorldSaveStore={
    async read(){return {...records};},
    async compareAndSwap(expected,next){
      if(expected.primary!==records.primary||expected.backup!==records.backup)return false;
      records={...next};return true;
    },
  };
  return {store,primary:()=>records.primary};
}
async function observeChange(controller:ReturnType<typeof createSaveController>,state:GameState,primary:()=>string|null){
  const before=primary();
  await new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>{unsubscribe();reject(new Error('A zero-time action did not create a save checkpoint'));},2000);
    const unsubscribe=controller.subscribe(()=>{
      if(controller.status().state==='protected'||controller.status().state==='failed'){
        clearTimeout(timer);unsubscribe();reject(new Error(controller.status().diagnostics.join(';')));
      }else if(controller.status().state==='saved'&&primary()!==before){clearTimeout(timer);unsubscribe();resolve();}
    });
    controller.observe(state);
  });
}

test('learning ordinary pot plans checkpoints while the hourglass is stopped',async()=>{
  const state=createState(),context=createSaveContext(),memory=memoryStore();
  Object.assign(state.player,WORKBENCH.stand);state.selected=WORKBENCH.id;state.clock.speed=0;
  const controller=createSaveController(memory.store,context);await controller.load();assert.equal(await controller.saveNow(state),true);
  const time=state.time,revision=state.inventory.revision;
  assert.match(learnPotFoundation(state,'blueprint.camp-fire-pot'),/已学会/);
  assert.equal(state.time,time);assert.equal(state.inventory.revision,revision);
  await observeChange(controller,state,memory.primary);
  const loaded=await prepareWorldSave(memory.primary(),context);
  assert.equal(loaded.decision,'restored');
  if(loaded.decision==='restored')assert.ok(loaded.value.workshop.blueprints.includes('blueprint.camp-fire-pot'));
});

test('trial fitting checkpoints without spending material or advancing the clock',async()=>{
  const state=createState(),context=createSaveContext(),memory=memoryStore();
  Object.assign(state.player,WORKBENCH.stand);state.selected=WORKBENCH.id;
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'wood',qualityId:'ordinary',delta:4},{itemId:'branch',qualityId:'ordinary',delta:4}]);
  learnWorkshopPlan(state,WORKBENCH_BRACING.blueprintId);beginUpgrade(state,WORKBENCH_BRACING.id);
  state.time+=3.01;advanceWorkshop(state);learnWorkshopPlan(state,'blueprint.bench-guided');beginGuidedCraft(state,'blueprint.bench-guided');
  state.time+=3.01;advanceWorkshop(state);state.clock.speed=0;
  const controller=createSaveController(memory.store,context);await controller.load();assert.equal(await controller.saveNow(state),true);
  const time=state.time,inventory=structuredClone(state.inventory);
  adjustGuidedPart(state,'align');assert.equal(state.time,time);assert.deepEqual(state.inventory,inventory);
  await observeChange(controller,state,memory.primary);
  const loaded=await prepareWorldSave(memory.primary(),context);assert.equal(loaded.decision,'restored');
  if(loaded.decision==='restored')assert.deepEqual(loaded.value.workshop.job?.assembly?.activePose,state.workshop.job?.assembly?.activePose);
});

test('changing 0x to 1x to 4x to 0x checkpoints and reloads each speed without advancing time',async()=>{
  const state=createState(),context=createSaveContext(),memory=memoryStore();
  state.time=12.5;state.clock={speed:0};
  const controller=createSaveController(memory.store,context);
  await controller.load();assert.equal(await controller.saveNow(state),true);
  const time=state.time,inventory=structuredClone(state.inventory);
  let previous=state.clock.speed;
  for(const speed of [1,4,0] as const){
    const before=memory.primary();
    state.clock={speed};
    controller.observe(state);
    const saved=await controller.flush();
    assert.equal(state.time,time);
    assert.deepEqual(state.inventory,inventory,'speed selection does not need an inventory checkpoint');
    const reopened=createSaveController(memory.store,context),loaded=await reopened.load();
    assert.ok(loaded,'the independent controller must load a valid world');
    assert.equal(loaded.clock.speed,speed,`same-time ${previous}x to ${speed}x must survive an independent load`);
    assert.equal(loaded.time,time);
    assert.equal(saved,true,'observe plus flush must commit the speed change');
    assert.notEqual(memory.primary(),before);
    previous=speed;
  }
});
