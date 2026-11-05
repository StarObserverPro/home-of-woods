import test from 'node:test';
import assert from 'node:assert/strict';
import {Models} from '../src/scene/models.ts';
import {Resources} from '../src/scene/resources.ts';
import {createStreamedForest} from '../src/scene/streamed-forest.ts';
import {createForestryPresentation} from '../src/scene/forestry-presentation.ts';
import {CREEK_BRIDGE,WORLD_STREAMING} from '../src/content/regions.ts';
import {FORESTRY} from '../src/content/forestry.ts';
import {START,HOME,WORLD} from '../src/content/world.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {createState} from '../src/domain/state.ts';
import type {GameState} from '../src/domain/state.ts';
import {beginUpgrade,upgradeSnapshot} from '../src/domain/upgrades.ts';
import {advanceWorkshop,tradeSupply} from '../src/domain/workshop.ts';
import {inventoryTransaction,stackKey,inventoryCount} from '../src/domain/inventory.ts';
import {changeCarrying,groundId,carriedStacks} from '../src/domain/carrying.ts';
import {pendingHarvest,validateHarvest} from '../src/domain/harvest.ts';
import {isAvailableMaterial,transportLocation} from '../src/domain/transport-location.ts';
import {chopReason,startChop,chopRange,advanceForestry,volumePoints} from '../src/domain/forestry.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {saveDigest} from '../src/domain/save-digest.ts';
import {canStand,findPath,move} from '../src/domain/navigation.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import {travelAccess,blessingAt,regionAt} from '../src/world/regions.ts';
import {travelHeightAt,onBridge} from '../src/world/traversal.ts';
import {riverX} from '../src/world/surface.ts';

const trees=makeTrees(),byId=new Map(trees.map(tree=>[tree.id,tree])),colliders=makeColliders(trees);
const east=byId.get('tree-slot-19-20')!,west=byId.get('tree-slot-r3-hero-0')!;
function buildBridge(){
  const s=createState();s.player={...CREEK_BRIDGE.stand,facing:0,moving:false};s.selected=CREEK_BRIDGE.id;
  s.inventory=inventoryTransaction(s.inventory,[{itemId:'wood',qualityId:'ordinary',delta:4},{itemId:'branch',qualityId:'ordinary',delta:3}]);
  assert.equal(upgradeSnapshot(s,CREEK_BRIDGE.id)?.canStart,true);
  assert.match(beginUpgrade(s,CREEK_BRIDGE.id),/开始/);s.time+=6;
  assert.match(advanceWorkshop(s)??'',/木桥修好/);return s;
}
function standAt(s:GameState,tree:typeof east){
  for(let i=0;i<48;i++){
    const r=chopRange(tree)-.08,p={x:tree.x+Math.cos(i*Math.PI/24)*r,z:tree.z+Math.sin(i*Math.PI/24)*r};
    if(canStand(p,colliders,undefined,travelAccess(s))){s.player={...p,facing:0,moving:false};s.selected=tree.id;return;}
  }
  throw new Error('No stand for '+tree.id);
}
function fell(s:GameState,tree:typeof east){
  standAt(s,tree);assert.equal(startChop(s,tree,colliders).ok,true);
  s.time+=FORESTRY.chopSeconds+FORESTRY.fallSeconds+.01;advanceForestry(s,byId);
  assert.equal(s.forestry.active,null);assert.equal(s.forestry.slots[tree.id].status,'stump');
}
function storeCarried(s:GameState){
  s.player={x:CAMP_PROPS.logs.x-3.3,z:CAMP_PROPS.logs.z+1,facing:0,moving:false};
  assert.match(changeCarrying(s,{kind:'store'},colliders),/全部存入/);
}

test('construction consumes the blueprint materials once and opens one real bidirectional crossing',()=>{
  const locked=createState(),destination={x:49,z:38};
  assert.deepEqual(findPath(START,destination,colliders,travelAccess(locked)),[]);
  assert.equal(canStand({x:riverX(38),z:38},colliders),false);
  locked.player={...CREEK_BRIDGE.stand,facing:0,moving:false};locked.selected=CREEK_BRIDGE.id;
  const before=structuredClone(locked);assert.match(beginUpgrade(locked,CREEK_BRIDGE.id),/还差/);assert.deepEqual(locked,before);
  const s=buildBridge(),access=travelAccess(s),inventory=structuredClone(s.inventory);
  assert.deepEqual(access.openLinks,[CREEK_BRIDGE.id]);assert.equal(inventoryCount(s.inventory,'wood'),0);assert.equal(inventoryCount(s.inventory,'branch'),0);
  assert.equal(advanceWorkshop(s),null);assert.deepEqual(s.inventory,inventory);
  const waterPoint={x:riverX(38),z:38};assert.ok(canStand(waterPoint,colliders,undefined,access));assert.ok(travelHeightAt(waterPoint.x,waterPoint.z,access)>WORLD.waterY+2);
  for(const [from,to] of [[START,destination],[destination,START]]){
    const route=findPath(from,to,colliders,access);assert.ok(route.some(p=>onBridge(p.x,p.z)));
    let position={...from};for(const node of route){const next=move(position,node.x-position.x,node.z-position.z,colliders,access);assert.ok(Math.hypot(next.x-node.x,next.z-node.z)<.03,JSON.stringify({position,node,next}));position=next;}
    assert.ok(Math.hypot(position.x-to.x,position.z-to.z)<.03);
  }
  const side=move(waterPoint,0,6,colliders,access);assert.ok(Math.abs(side.z-38)<CREEK_BRIDGE.width/2,'railings block sideways movement');
});

test('uncollected timber blocks only its source forest, including after crossing, partial delivery and ordinary warehouse withdrawals',()=>{
  const s=buildBridge();fell(s,east);const quantity=volumePoints(east);
  assert.equal(pendingHarvest(s.inventory,'east-woodland'),quantity);
  standAt(s,west);assert.equal(chopReason(s,west),'','east timber must never block the home forest');
  const stack=s.inventory.stacks.find(item=>item.harvest)!,origin=transportLocation(stack)! as {x:number;z:number};
  s.player={...origin,facing:0,moving:false};s.selected=groundId(stack);
  assert.match(changeCarrying(s,{kind:'take',key:stackKey(stack)},colliders),/拿起/);
  standAt(s,west);assert.match(changeCarrying(s,{kind:'drop',key:stackKey(carriedStacks(s.inventory)[0])},colliders),/放在脚边/);
  assert.equal(pendingHarvest(s.inventory,'home-woodland'),0);assert.equal(pendingHarvest(s.inventory,'east-woodland'),quantity);
  assert.equal(chopReason(s,west),'');
  assert.ok(s.inventory.stacks.filter(item=>item.harvest).every(item=>!isAvailableMaterial(item)));
  const dropped=s.inventory.stacks.find(item=>item.harvest&&item.quantity===1)!;
  assert.match(changeCarrying(s,{kind:'take',key:stackKey(dropped)},colliders),/拿起/);storeCarried(s);
  assert.equal(pendingHarvest(s.inventory,'east-woodland'),quantity-1,'one delivered log cannot clear a whole harvest batch');
  const ordinary=s.inventory.stacks.find(item=>!item.harvest&&item.itemId==='wood')!;
  assert.match(changeCarrying(s,{kind:'withdraw',key:stackKey(ordinary)},colliders),/拿起/);
  assert.match(changeCarrying(s,{kind:'drop',key:stackKey(carriedStacks(s.inventory)[0])},colliders),/放在脚边/);
  assert.equal(pendingHarvest(s.inventory,'east-woodland'),quantity-1);assert.equal(pendingHarvest(s.inventory,'home-woodland'),0);
  while(pendingHarvest(s.inventory,'east-woodland')){
    const item=s.inventory.stacks.find(item=>item.harvest)!;const p=transportLocation(item)! as {x:number;z:number};s.player={...p,facing:0,moving:false};
    assert.match(changeCarrying(s,{kind:'take',key:stackKey(item)},colliders),/拿起/);storeCarried(s);
  }
  assert.ok(s.inventory.stacks.every(item=>!item.harvest));
  // Both forests can independently owe a batch; settling either must leave the other untouched.
  const otherEast=byId.get('tree-slot-18-20')!;fell(s,west);standAt(s,otherEast);assert.equal(chopReason(s,otherEast),'');
  fell(s,otherEast);assert.ok(pendingHarvest(s.inventory,'home-woodland')>0&&pendingHarvest(s.inventory,'east-woodland')>0);
});

test('bridge, exploration and undelivered harvest survive whole-world save without a new inventory or clock',async()=>{
  const s=buildBridge();fell(s,east);s.visited.push('east-bank');const inventory=structuredClone(s.inventory),context=createSaveContext();
  const result=await prepareWorldSave(await serializeWorldSave(s,context,{sequence:1,savedAt:0}),context);
  assert.equal(result.decision,'restored');if(result.decision!=='restored')throw new Error('world did not restore');
  const loaded=result.value;assert.deepEqual(travelAccess(loaded),travelAccess(s));assert.ok(loaded.visited.includes('east-bank'));
  assert.deepEqual(loaded.inventory.stacks,inventory.stacks);assert.equal(pendingHarvest(loaded.inventory,'east-woodland'),volumePoints(east));
  standAt(loaded,west);assert.equal(chopReason(loaded,west),'');
  const tagged=loaded.inventory.stacks.find(item=>item.harvest)!;assert.equal(validateHarvest(tagged.harvest).regionId,'east-woodland');
});

test('blessing coverage is independent of bridges, and distant tree growth catches up against absolute game time on return',()=>{
  const s=buildBridge();assert.equal(blessingAt(s,HOME),true);assert.equal(blessingAt(s,west),false);assert.equal(blessingAt(s,east),false);
  fell(s,east);const life=s.forestry.slots[east.id],due=life.regrowAt!;
  s.player={...START,facing:0,moving:false};assert.ok(Math.hypot(east.x-START.x,east.z-START.z)>WORLD_STREAMING.simulation);
  s.time=due+FORESTRY.saplingSeconds+1;advanceForestry(s,byId);assert.equal(life.status,'stump','distant growth has no per-frame simulation');
  standAt(s,east);advanceForestry(s,byId);assert.equal(life.status,'standing');assert.equal(life.generation,1);assert.equal(life.individualId,`${east.id}:g1`);
  assert.equal(pendingHarvest(s.inventory,'east-woodland'),volumePoints(east),'growth and chunk loading cannot discard transport debt');
  s.workshop.upgrades['grove-altar']={level:2,completedPaths:[],investments:[],updatedAt:s.time};assert.equal(blessingAt(s,west),true);assert.equal(blessingAt(s,east),false);
  assert.equal(regionAt(east.x,east.z),'east-woodland');
});

test('the preceding playable valley gains the eastern roster and bridge plan without resetting its camp',async()=>{
  const s=createState(),context=createSaveContext();s.inventory=inventoryTransaction(s.inventory,[{itemId:'mushroom',qualityId:'ordinary',delta:3}]);
  const current=JSON.parse(await serializeWorldSave(s,context,{sequence:3,savedAt:2}));
  current.layoutVersion='how-valley-r3-hosts-1';current.rulesetVersion=8;
  for(const [id,tree] of context.trees)if(tree.regionId==='east-woodland')delete current.world.forestry.slots[id];
  for(const [id,source] of context.registry.sources)if(source.region==='east-woodland')delete current.world.gathering.sources[id];
  current.world.workshop.blueprints=current.world.workshop.blueprints.filter((id:string)=>id!==CREEK_BRIDGE.blueprintId);
  const {checksum,...core}=current;void checksum;
  const result=await prepareWorldSave(JSON.stringify({...core,checksum:await saveDigest(core)}),context);
  assert.equal(result.decision,'migrated');if(result.decision!=='migrated')throw new Error('Expansion failed');
  assert.equal(inventoryCount(result.value.inventory,'mushroom'),3);assert.deepEqual(result.value.player,s.player);
  assert.ok(result.value.workshop.blueprints.includes(CREEK_BRIDGE.blueprintId));assert.deepEqual(travelAccess(result.value).openLinks,[]);
  assert.deepEqual(result.value.forestry.slots[west.id],s.forestry.slots[west.id]);assert.ok(result.value.forestry.slots[east.id]);
});

test('chunk trips release detailed meshes and hit mappings, submit only visible instances, and never change the world',()=>{
  const resources=new Resources(),models=new Models(resources),forest=models.createForest(trees,true);
  const presenter=createForestryPresentation({models,resources,forestGroup:forest.group,trees,selections:forest.selections});
  const stream=createStreamedForest(forest,trees),s=createState(),before=JSON.stringify(s),allocation=resources.stats();
  const treeCount=forest.sceneryBatches.reduce((sum,batch)=>sum+batch.members.length,0)+1;
  for(let trip=0;trip<3;trip++)for(const position of [START,{x:72,z:65},START]){
    Object.assign(s.player,position);stream.update(s);presenter.update(s);
    assert.equal(forest.mappings.size,forest.selections.size);
    const submitted=forest.sceneryBatches.reduce((sum,batch)=>sum+batch.mesh.count,0);
    assert.equal(submitted+forest.selections.size,treeCount,'zero-scale hidden instances must not remain in the GPU submission count');
    assert.ok(forest.selections.size<trees.filter(t=>t.role!=='scenery').length);
    if(position.x===72){assert.equal(forest.selections.has('tree-slot-r3-hero-1'),false);assert.ok(forest.selections.has(east.id));}
    assert.deepEqual(resources.stats(),allocation,'shared geometry/material caches stay bounded across trips');
  }
  assert.equal(JSON.stringify(s),before);assert.ok(stream.stats().loads>0&&stream.stats().unloads>0);
  presenter.dispose();stream.dispose();models.clear();resources.dispose();assert.equal(resources.stats().extras,0);
});
