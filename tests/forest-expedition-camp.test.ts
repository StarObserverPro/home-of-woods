import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMP_PROPS } from '../src/content/scene-props.ts';
import { campExpeditionContext, campWithExpedition, nearExpeditionExit, openCampExpedition } from '../src/domain/camp-expedition.ts';
import { changeCarrying, currentLoad, groundStacks } from '../src/domain/carrying.ts';
import { advanceExpedition, beginExpeditionGather, changeExpeditionCarrying, moveExpeditionPlayer, pendingExpeditionTimber, switchExpeditionMap } from '../src/domain/forest-expedition.ts';
import type { ExpeditionContext, ExpeditionResult, ForestExpeditionState } from '../src/domain/forest-expedition.ts';
import { inventoryCount, inventoryTransaction, stackKey } from '../src/domain/inventory.ts';
import { canonicalInstances } from '../src/domain/owned-items.ts';
import { createSaveContext } from '../src/domain/save-context.ts';
import { createStarterState } from '../src/domain/state.ts';
import type { GameState } from '../src/domain/state.ts';
import { isCarried, isStored, transportLocation } from '../src/domain/transport-location.ts';
import { warehouseSnapshot } from '../src/domain/warehouse-view.ts';
import { prepareWorldSave, serializeWorldSave } from '../src/domain/world-save.ts';

const saveContext = createSaveContext();
const accept = (result: ExpeditionResult) => {
  assert.ok(result.ok, result.message);
  return result.state;
};
async function reload(state: GameState) {
  const loaded = await prepareWorldSave(await serializeWorldSave(state, saveContext, {sequence:1,savedAt:0}), saveContext);
  assert.equal(loaded.decision, 'restored', loaded.diagnostics.join('；'));
  if(loaded.decision !== 'restored') throw Error('World save did not restore');
  return loaded.value;
}
function harvest(state: ForestExpeditionState, context: ExpeditionContext, id: string) {
  const site=context.maps[state.activeMapId].resourceSites.find(site=>site.id===id)!;
  state=accept(moveExpeditionPlayer(state,site,context));
  return accept(beginExpeditionGather(state,id,context));
}
function atCampRack(world: GameState) {
  world.player={...world.player,x:CAMP_PROPS.logs.x-3,z:CAMP_PROPS.logs.z};
  return world;
}

test('the same world save carries goods home and keeps forest stock and drops on their own side', async()=>{
  let world=createStarterState();
  const wardrobe=canonicalInstances(world.inventory.instances);
  world.inventory=inventoryTransaction(world.inventory,[{itemId:'branch',qualityId:'ordinary',delta:2},{itemId:'branch',qualityId:'ordinary',transport:{kind:'carried'},delta:1}]);
  const context=campExpeditionContext(world.inventory);
  let forest=openCampExpedition(world,context);
  assert.equal(inventoryCount(forest.inventory,'branch'),1);
  const branch=forest.inventory.stacks.find(isCarried)!;
  forest=accept(moveExpeditionPlayer(forest,context.maps.upper.supply,context));
  forest=accept(changeExpeditionCarrying(forest,{kind:'store',key:stackKey(branch)},context));
  forest=accept(switchExpeditionMap(forest,'mixed',context));
  const fruit='expedition.mixed.edge-serviceberry';
  forest=harvest(forest,context,fruit);
  forest=accept(advanceExpedition(forest,forest.action!.finishAt,context));
  forest=harvest(forest,context,fruit);
  world=await reload(campWithExpedition(world,forest,true));
  assert.ok(world.expedition?.active);
  assert.equal(inventoryCount(world.inventory,'serviceberry'),1);
  assert.deepEqual(world.inventory.instances,wardrobe);
  assert.equal(inventoryCount(world.inventory,'branch'),2);
  forest=openCampExpedition(world,context);
  assert.equal(forest.action?.inventoryRevision,forest.inventory.revision);
  forest=accept(advanceExpedition(forest,forest.action!.finishAt,context));
  assert.equal(inventoryCount(forest.inventory,'serviceberry'),2);
  const carried=forest.inventory.stacks.find(stack=>stack.itemId==='serviceberry')!;
  forest=accept(changeExpeditionCarrying(forest,{kind:'drop',key:stackKey(carried),quantity:1},context));
  assert.equal(nearExpeditionExit(forest,context),false);
  forest=accept(moveExpeditionPlayer(forest,context.maps.mixed.spawn,context));
  assert.equal(nearExpeditionExit(forest,context),true);
  world=await reload(campWithExpedition(world,forest,false));
  assert.equal(world.expedition?.active,false);
  assert.equal(currentLoad(world.inventory).bulk,1);
  assert.equal(groundStacks(world.inventory).length,0);
  assert.equal(world.inventory.stacks.find(stack=>stack.itemId==='serviceberry'&&isCarried(stack))?.quantity,1);
  assert.equal(world.expedition?.localStacks.find(stack=>stack.itemId==='serviceberry')?.expeditionMapId,'mixed');
  assert.equal(world.expedition?.localStacks.find(stack=>stack.itemId==='branch'&&isStored(stack))?.quantity,1);
  assert.match(changeCarrying(atCampRack(world),{kind:'store'},[]),/已全部存入/);
  world=await reload(world);
  const row=warehouseSnapshot(world,saveContext.registry).items.find(item=>item.itemId==='serviceberry'&&item.quantity>0);
  assert.equal(row?.quantity,1);
  assert.equal(row?.recognized,true);
  assert.equal(currentLoad(world.inventory).bulk,0);
  assert.equal(world.expedition?.sources[fruit].remaining,2);
});

test('a recovered log dropped in camp still counts against its own forest until stored',()=>{
  let world=createStarterState(), context=campExpeditionContext(world.inventory);
  let forest=harvest(openCampExpedition(world,context),context,'expedition.upper.windfall-timber');
  forest=accept(advanceExpedition(forest,forest.action!.finishAt,context));
  const log=forest.inventory.stacks.find(stack=>stack.itemId==='wood')!;
  forest=accept(changeExpeditionCarrying(forest,{kind:'take',key:stackKey(log)},context));
  world=campWithExpedition(world,forest,false);
  const carried=world.inventory.stacks.find(isCarried)!;
  changeCarrying(world,{kind:'drop',key:stackKey(carried)},[]);
  const dropped=world.inventory.stacks.find(stack=>transportLocation(stack)?.kind==='ground')!;
  context=campExpeditionContext(world.inventory);
  forest=openCampExpedition(world,context);
  assert.equal(pendingExpeditionTimber(forest,'upper',context),1);
  assert.equal(pendingExpeditionTimber(forest,'mixed',context),0);
  changeCarrying(world,{kind:'take',key:stackKey(dropped)},[]);
  changeCarrying(atCampRack(world),{kind:'store'},[]);
  assert.equal(world.inventory.stacks.find(stack=>stack.itemId==='wood')?.expeditionHarvest,undefined);
  assert.equal(pendingExpeditionTimber(openCampExpedition(world),'upper',campExpeditionContext(world.inventory)),0);
  assert.equal(world.expedition?.timber.used,1);
});
