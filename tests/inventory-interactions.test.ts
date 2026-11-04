import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/domain/state.ts';
import {inventoryTransaction,stackKey,woodBatch} from '../src/domain/inventory.ts';
import {transferWood,collectWood} from '../src/domain/woodcraft.ts';
import {warehouseSnapshot} from '../src/domain/warehouse-view.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {interactionAccess,approachInteraction} from '../src/domain/interaction-access.ts';
import {placeFurniture,packFurniture,placementReason,furnitureColliders,workstationColliders} from '../src/domain/furniture-placement.ts';
import {createWoodcraftSession} from '../src/app/woodcraft-session.ts';
import type {WoodPhysics} from '../src/physics/woodcraft.ts';
import {WORKBENCH,SEAT_DEFINITION} from '../src/content/workshop.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';
import {CAMP_VISITOR} from '../src/content/characters.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import {canStand,move} from '../src/domain/navigation.ts';
import {heightAt} from '../src/world/surface.ts';

const context=createSaveContext();
const fixedBlockers=[{id:WOODCRAFT.id,x:WOODCRAFT.x,z:WOODCRAFT.z,halfX:WOODCRAFT.halfX+.2,halfZ:WOODCRAFT.halfZ+.2},...makeColliders(makeTrees()),...workstationColliders()];
const dropPoint={x:WOODCRAFT.x,y:heightAt(WOODCRAFT.x,WOODCRAFT.z),z:WOODCRAFT.z};
function stocked(){
  const state=createState();
  state.inventory=inventoryTransaction(state.inventory,[
    {itemId:'wood',qualityId:'ordinary',wood:woodBatch({lengthMm:1600,thicknessMm:180,straightness:'straight'}),delta:2},
    {itemId:'wood',qualityId:'ordinary',wood:woodBatch({lengthMm:2300,thicknessMm:300,straightness:'curved'}),batchCode:'keep-original',delta:1},
    {itemId:'wood',qualityId:'fine',wood:woodBatch({lengthMm:1600,thicknessMm:180,straightness:'straight'}),delta:3},
  ]);
  return state;
}
function walkRoute(state:ReturnType<typeof createState>,blockers:typeof fixedBlockers){
  assert.ok(state.route.length>0,'a route is available');
  let p={x:state.player.x,z:state.player.z};
  for(const waypoint of state.route){p=move(p,waypoint.x-p.x,waypoint.z-p.z,blockers);assert.ok(Math.hypot(p.x-waypoint.x,p.z-waypoint.z)<.1,'route follows real player collision');}
  Object.assign(state.player,p);state.route=[];
}

test('warehouse drag keys identify exact grades, specs and extension fields; stale keys never substitute another batch',()=>{
  const state=stocked(),original=structuredClone(state.inventory.stacks),view=warehouseSnapshot(state,context.registry);
  const rows=view.items.filter(i=>i.itemId==='wood');assert.equal(new Set(rows.map(i=>i.key)).size,3);
  const selected=state.inventory.stacks.find(s=>s.batchCode==='keep-original')!,key=stackKey(selected);
  assert.ok(rows.some(r=>r.key===key));assert.equal(transferWood(state,'one',dropPoint,key),1);
  assert.deepEqual(state.woodcraft.pieces[0].source,{...selected,quantity:1});
  const after=structuredClone(state);assert.equal(transferWood(state,'one',dropPoint,key),0);assert.deepEqual(state,after);
  assert.equal(transferWood(state,'one',dropPoint,'unknown-key'),0);assert.deepEqual(state,after);
  const fine=state.inventory.stacks.find(s=>s.qualityId==='fine')!;assert.equal(transferWood(state,'one',dropPoint,stackKey(fine)),1);
  assert.equal(state.woodcraft.pieces[1].source.qualityId,'fine');
  for(const piece of [...state.woodcraft.pieces])assert.equal(collectWood(state,piece.id),true);
  assert.deepEqual(state.inventory.stacks,original);
});

test('approaching an empty woodpile, log rack, workbench or merchant moves only the player',()=>{
  for(const target of [WOODCRAFT.id,CAMP_PROPS.logs.id,WORKBENCH.id,CAMP_VISITOR.id]){
    const state=createState();Object.assign(state.player,{x:-33,z:22});assert.ok(canStand(state.player,fixedBlockers));
    const original=structuredClone({inventory:state.inventory,woodcraft:state.woodcraft,workshop:state.workshop});
    assert.equal(interactionAccess(state,target)?.near,false);assert.match(approachInteraction(state,target,fixedBlockers),/正在走近/);
    walkRoute(state,fixedBlockers);assert.equal(interactionAccess(state,target)?.near,true);
    assert.deepEqual({inventory:state.inventory,woodcraft:state.woodcraft,workshop:state.workshop},original);
  }
});

test('physical wood cannot be dropped or collected remotely; nearby collection preserves the exact source',async()=>{
  const state=stocked(),original=structuredClone(state.inventory.stacks),messages:string[]=[];
  const engine:WoodPhysics={step:()=>[],stats:()=>({bodies:0,awake:0,colliders:0,steps:0,maxStepMs:0,disposed:false}),dispose(){}};
  const session=createWoodcraftSession(state,m=>messages.push(m),async()=>engine);
  session.activate();await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(session.snapshot().ready,true);
  const key=stackKey(state.inventory.stacks.find(s=>s.batchCode==='keep-original')!);
  Object.assign(state.player,{x:-33,z:22});const far=structuredClone(state);
  assert.equal(session.beginDrop(key),false);assert.equal(session.drop(dropPoint),false);assert.deepEqual(state,far);
  Object.assign(state.player,WOODCRAFT.stand);assert.equal(session.beginDrop(key),true);assert.equal(session.drop(dropPoint),true);
  const piece=state.woodcraft.pieces[0];Object.assign(state.player,{x:-33,z:22});const away=structuredClone(state);
  assert.equal(session.collect(piece.id),false);assert.deepEqual(state,away);
  Object.assign(state.player,WOODCRAFT.stand);assert.equal(session.collect(piece.id),true);assert.equal(session.collect(piece.id),false);
  assert.deepEqual(state.inventory.stacks,original);session.dispose();
});

test('furniture rejects remote placement, remote move and remote collection, then preserves identity after approach',()=>{
  const state=createState();state.inventory.instances=[{instanceId:'seat-for-drag',definitionId:SEAT_DEFINITION,blueprintId:'blueprint.stump-cozy',createdAt:0,rarityId:'epic',traits:[{id:'comfort',value:2}],extension:{finish:'amber'},location:{kind:'inventory'}}];
  const item=structuredClone(state.inventory.instances[0]);let point:{x:number;z:number}|undefined;
  for(let x=-39;x<-31&&!point;x+=.5)for(let z=-2;z<6;z+=.5)if(!placementReason(state,item.instanceId,{x,z},fixedBlockers)){point={x,z};break;}
  assert.ok(point,'nearby camp placement exists');
  const before=structuredClone(state.inventory);assert.match(placeFurniture(state,item.instanceId,{x:point.x+20,z:point.z},0,fixedBlockers),/太远/);assert.deepEqual(state.inventory,before);
  assert.match(placeFurniture(state,item.instanceId,point,Math.PI/4,fixedBlockers),/摆好/);
  const blockers=[...fixedBlockers,...furnitureColliders(state)];Object.assign(state.player,WORKBENCH.stand);assert.equal(interactionAccess(state,item.instanceId)?.near,false);
  const placed=structuredClone(state.inventory);assert.match(packFurniture(state,item.instanceId),/走近/);assert.deepEqual(state.inventory,placed);
  assert.match(placeFurniture(state,item.instanceId,{x:state.player.x+2,z:state.player.z},0,blockers),/走近这件家具/);assert.deepEqual(state.inventory,placed);
  assert.match(approachInteraction(state,item.instanceId,blockers),/正在走近/);walkRoute(state,blockers);assert.equal(interactionAccess(state,item.instanceId)?.near,true);
  assert.match(packFurniture(state,item.instanceId),/收回/);assert.deepEqual(state.inventory.instances![0],item);
});
