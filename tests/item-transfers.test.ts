import test from 'node:test';
import assert from 'node:assert/strict';
import {createItemTransfers} from '../src/app/item-transfers.ts';
import {createWoodcraftSession} from '../src/app/woodcraft-session.ts';
import {createState} from '../src/domain/state.ts';
import {furnitureColliders,suggestFurniturePlacement,workstationColliders} from '../src/domain/furniture-placement.ts';
import {makeColliders,makeTrees} from '../src/world/layout.ts';
import {HOUSING} from '../src/content/housing.ts';
import {BROOM} from '../src/content/broom.ts';
import {SEAT_DEFINITION} from '../src/content/workshop.ts';
import type {OwnedItem} from '../src/domain/owned-items.ts';

function fixture(){
  const state=createState();
  const item:OwnedItem={instanceId:'drag-seat',definitionId:SEAT_DEFINITION,blueprintId:'blueprint.stump-cozy',createdAt:0,rarityId:'epic',traits:[{id:'comfort',value:2}],extension:{finish:'amber'},location:{kind:'inventory'}};
  state.inventory.instances=[item];
  const fixed=[...makeColliders(makeTrees()),...workstationColliders()];
  const blockers=()=>[...fixed,...furnitureColliders(state)];
  const point=suggestFurniturePlacement(state,item.instanceId,blockers())!;
  assert.ok(point,'a reachable drop position exists');
  let hit:{kind:'furniture';id:string}|null={kind:'furniture',id:item.instanceId};
  let blocked=false;
  const woodcraft=createWoodcraftSession(state,()=>{});
  const transfers=createItemTransfers(state,woodcraft,{
    transferPoint:()=>({...point,y:0}),
    transferItemAt:()=>hit,
    setWoodcraftDrop:()=>{},
  },blockers,()=>blocked);
  return {state,item,transfers,woodcraft,setHit:(next:typeof hit)=>{hit=next;},setBlocked:(next:boolean)=>{blocked=next;}};
}

test('drag placement and return preserve one owned prop and its traits',()=>{
  const f=fixture(),original=structuredClone(f.item),intent={kind:'furniture' as const,id:f.item.instanceId,name:'木墩'};
  assert.equal(f.transfers.preview(intent,0,0,false).valid,true);
  assert.equal(f.transfers.commit(intent,0,0,false).valid,true);
  assert.equal(f.state.inventory.instances?.length,1);
  assert.equal(f.state.inventory.instances![0].location.kind,'world');
  const hit=f.transfers.worldItem(0,0);assert.ok(hit?.kind==='furniture');assert.equal(hit.id,intent.id);
  assert.equal(f.transfers.commit(intent,0,0,true).valid,true);
  assert.deepEqual(f.state.inventory.instances![0],original);
  const inventory=structuredClone(f.state.inventory);
  assert.equal(f.transfers.commit(intent,0,0,true).valid,false);
  assert.deepEqual(f.state.inventory,inventory);
  f.woodcraft.dispose();
});

test('release rechecks distance and action ownership after a valid preview',()=>{
  const f=fixture(),intent={kind:'furniture' as const,id:f.item.instanceId,name:'木墩'};
  assert.equal(f.transfers.preview(intent,0,0,false).valid,true);
  const inventory=structuredClone(f.state.inventory),player={...f.state.player};
  f.state.player.x+=30;
  assert.equal(f.transfers.commit(intent,0,0,false).valid,false);
  assert.deepEqual(f.state.inventory,inventory);
  f.state.player=player;f.setBlocked(true);
  assert.equal(f.transfers.commit(intent,0,0,false).valid,false);
  assert.deepEqual(f.state.inventory,inventory);
  f.woodcraft.dispose();
});

test('scene drag sources include portable benches and brooms while distant or mounted props remain ordinary hits',()=>{
  const f=fixture();
  for(const definitionId of [SEAT_DEFINITION,HOUSING.guestBench.definitionId,BROOM.definitionId]){
    const item={...f.item,definitionId,location:{kind:'world' as const,x:f.state.player.x+2,z:f.state.player.z,rotation:0}};
    f.state.inventory.instances=[item];
    const hit=f.transfers.worldItem(0,0);assert.ok(hit?.kind==='furniture');assert.equal(hit.id,item.instanceId);
    item.location.x+=20;
    assert.equal(f.transfers.worldItem(0,0),null);
  }
  f.state.inventory.instances=[{...f.item,definitionId:HOUSING.doorbell.definitionId,location:{kind:'mounted',hostId:HOUSING.doorbell.hostId,slotId:HOUSING.doorbell.slotId}}];
  assert.equal(f.transfers.worldItem(0,0),null);
  f.setHit({kind:'furniture',id:'removed-prop'});
  assert.equal(f.transfers.worldItem(0,0),null);
  f.woodcraft.dispose();
});
