import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createState} from '../src/domain/state.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {inventoryTransaction,inventoryCount,INVENTORY_SCHEMA_VERSION} from '../src/domain/inventory.ts';
import {transferWood,collectWood} from '../src/domain/woodcraft.ts';
import {createWildlife,advanceWildlife} from '../src/domain/wildlife.ts';
import {WILDLIFE_DEFINITIONS} from '../src/content/wildlife.ts';
import {BLUEPRINTS,SEAT_DEFINITION} from '../src/content/workshop.ts';
import {WORLD_RULESET_VERSION} from '../src/content/world.ts';
import {workstationColliders} from '../src/domain/furniture-placement.ts';
import {WOODCRAFT} from '../src/content/woodcraft.ts';
import {WILDLIFE_ANCHORS} from '../src/world/wildlife-layout.ts';
import {canStand} from '../src/domain/navigation.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';

test('final animal package is exactly squirrel, hare, accepted stag and original mountain goat',()=>{
  assert.deepEqual(readdirSync('public/assets/wildlife').sort(),['hare.glb','mountain-goat.glb','squirrel.glb','stag.glb']);
  assert.deepEqual(WILDLIFE_DEFINITIONS.filter(d=>d.category==='common').map(d=>d.model).sort(),['hare','squirrel']);
  assert.deepEqual(WILDLIFE_DEFINITIONS.filter(d=>d.category==='landmark').map(d=>d.model).sort(),['mountain-goat','stag']);
  assert.equal(existsSync('sources/gobkit/animalB'),false);
  const assets=JSON.parse(readFileSync('public/assets/manifest.json','utf8')).assets;
  assert.equal(assets.filter((a:any)=>a.assetId.startsWith('how-wildlife-')).length,4);
});

test('wildlife remains transient while rarity, unknown properties, clock and loose-wood ownership roundtrip together',async()=>{
  const trees=makeTrees(),state=createState(trees),context=createSaveContext(trees);
  state.clock.speed=12;state.time=40;
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'wood',qualityId:'ordinary',futureBatch:{finish:'fern'},delta:6}]);
  state.inventory.instances=[{instanceId:'integration-seat',definitionId:SEAT_DEFINITION,blueprintId:BLUEPRINTS[0].id,createdAt:0,
    rarityId:'legendary',traits:[{id:'comfort',value:2}],futureFinish:{version:7},location:{kind:'inventory'}}];
  assert.equal(transferWood(state,'prepare'),5);assert.equal(inventoryCount(state.inventory,'wood'),1);
  state.wildlife=createWildlife(state.time);
  advanceWildlife(state.wildlife,state.time,state.seed,state.player,makeColliders(trees),WILDLIFE_DEFINITIONS.map(d=>d.id));
  assert.equal(state.wildlife.encounters.length,2);
  const raw=await serializeWorldSave(state,context,{sequence:1,savedAt:1}),payload=JSON.parse(raw);
  assert.equal(payload.rulesetVersion,WORLD_RULESET_VERSION);assert.equal(payload.world.inventory.schemaVersion,INVENTORY_SCHEMA_VERSION);
  assert.equal(Object.hasOwn(payload.world,'wildlife'),false);assert.equal(payload.world.clock.speed,12);
  const loaded=await prepareWorldSave(raw,context);assert.equal(loaded.decision,'restored');
  if(!('value' in loaded))throw Error('missing restored state');
  assert.deepEqual(loaded.value.inventory.instances,state.inventory.instances);
  assert.deepEqual(loaded.value.woodcraft,state.woodcraft);
  assert.equal(collectWood(loaded.value,loaded.value.woodcraft.pieces[0].id),true);
  assert.equal(inventoryCount(loaded.value.inventory,'wood'),2);assert.equal(loaded.value.woodcraft.pieces.length,4);
  assert.deepEqual(loaded.value.inventory.stacks[0].futureBatch,{finish:'fern'});
  const round2=await prepareWorldSave(await serializeWorldSave(loaded.value,context,{sequence:2,savedAt:2}),context);
  assert.equal(round2.decision,'restored');
});


test('common animal anchors coexist with the final workshop and woodcraft collision footprints',()=>{
  const state=createState(),colliders=[...makeColliders(makeTrees()),...workstationColliders(),
    {id:WOODCRAFT.id,x:WOODCRAFT.x,z:WOODCRAFT.z,halfX:WOODCRAFT.halfX+.2,halfZ:WOODCRAFT.halfZ+.2}];
  const ids=WILDLIFE_DEFINITIONS.filter(d=>d.category==='common').map(d=>String(d.id));
  for(const anchor of WILDLIFE_ANCHORS.filter(a=>ids.includes(a.definitionId)))assert.ok(canStand(anchor,colliders),anchor.id);
  const wildlife=createWildlife(0);
  advanceWildlife(wildlife,0,state.seed,WOODCRAFT.stand,colliders,WILDLIFE_DEFINITIONS.map(d=>d.id));
  assert.equal(wildlife.encounters.filter(e=>ids.includes(e.definitionId)).length,2);
});
