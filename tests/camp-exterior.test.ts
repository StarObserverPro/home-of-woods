import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createState} from '../src/domain/state.ts';
import {inventoryTransaction,inventoryTypeCount} from '../src/domain/inventory.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {saveDigest} from '../src/domain/save-digest.ts';
import {CAMP_VISITOR} from '../src/content/characters.ts';
import {CAMP_PROPS} from '../src/content/scene-props.ts';
import {CAMP_EXTERIOR_BLUEPRINTS,STARTER_BLUEPRINTS} from '../src/content/workshop.ts';
import {EXTERIOR_PROFILES,FIRE_TOP_SLOT,findUpgradeProfile,upgradeHostId} from '../src/content/upgrades.ts';
import {createCampExteriors} from '../src/scene/camp-exteriors.ts';
import {Resources} from '../src/scene/resources.ts';
import {advanceWorkshop,cancelWorkshop,tradeSupply,workshopSnapshot} from '../src/domain/workshop.ts';
import {upgradeOptions,upgradeSnapshot,beginUpgrade,mountFireTop} from '../src/domain/upgrades.ts';

const context=createSaveContext();
function campState(){
  const state=createState();
  state.inventory=inventoryTransaction(state.inventory,[
    {itemId:'wood',qualityId:'ordinary',delta:15},
    {itemId:'branch',qualityId:'ordinary',delta:24},
    {itemId:'mushroom',qualityId:'ordinary',delta:6},
  ]);
  state.workshop.blueprints=[...new Set([...state.workshop.blueprints,...CAMP_EXTERIOR_BLUEPRINTS.map(p=>p.id)])];
  return state;
}
type State=ReturnType<typeof campState>;
function build(state:State,id:string){
  const profile=findUpgradeProfile(id)!;
  assert.ok(profile, `missing part ${id}`);
  Object.assign(state.player,profile.stand);
  const message=beginUpgrade(state,id);
  assert.match(message,/开始/, `${id} ${message}`);
  const before=state.time;
  state.time=before+4.1;
  const done=advanceWorkshop(state);
  assert.ok(done?.includes('已'), `${id} ${done}`);
  assert.ok(state.workshop.upgrades[id]?.completedPaths.length);
}
async function restore(state:State){
  const save=await serializeWorldSave(state,context,{sequence:1,savedAt:100});
  const result=await prepareWorldSave(save,context);
  assert.equal(result.decision,'restored',result.diagnostics.join('; '));
  if(!('value' in result))throw new Error('missing saved world');
  return result.value;
}

test('three permanent hosts expose independent exterior parts and unique fitting blueprints',()=>{
  const state=createState();
  assert.equal(upgradeOptions(state,'tent').length,4);
  assert.equal(upgradeOptions(state,'cabin').length,4);
  assert.equal(upgradeOptions(state,CAMP_PROPS.fire.id).length,5);
  assert.equal(EXTERIOR_PROFILES.length,12);
  assert.equal(new Set(EXTERIOR_PROFILES.map(p=>p.id)).size,12);
  assert.equal(new Set(CAMP_EXTERIOR_BLUEPRINTS.map(p=>p.id)).size,12);
  assert.equal(EXTERIOR_PROFILES.filter(p=>p.mountSlot===FIRE_TOP_SLOT).length,3);
  for(const profile of EXTERIOR_PROFILES){
    assert.ok(['tent','cabin',CAMP_PROPS.fire.id].includes(profile.hostId!));
    assert.equal(upgradeHostId(profile.id),profile.hostId);
    assert.equal(profile.paths.length,1);
    assert.equal(profile.paths[0].blueprintId, 'blueprint.'+profile.id.replace(':','-'));
    assert.ok(CAMP_EXTERIOR_BLUEPRINTS.some(p=>p.id===profile.paths[0].blueprintId));
    assert.equal(upgradeSnapshot(state,profile.id)?.near,false);
  }
});

test('fire stones use existing rocks, support is prerequisite and upper socket is reversible without material costs',async()=>{
  const state=campState();
  Object.assign(state.player,findUpgradeProfile('camp-fire:hook')!.stand);
  assert.match(beginUpgrade(state,'camp-fire:hook'),/先完成.*双柱横梁锅架/);
  const initialRevision=state.inventory.revision;
  const initialInventory=structuredClone(state.inventory);
  build(state,'camp-fire:stones');
  assert.equal(state.inventory.revision,initialRevision,'stacking existing stones is material-free');
  assert.deepEqual(state.inventory,initialInventory);
  assert.deepEqual(state.workshop.upgrades['camp-fire:stones'].investments,[]);
  assert.match(beginUpgrade(state,'camp-fire:grill'),/双柱横梁锅架/);
  build(state,'camp-fire:support');
  build(state,'camp-fire:hook');
  assert.equal(state.workshop.mounted[FIRE_TOP_SLOT],'camp-fire:hook');
  const afterHook=structuredClone(state.inventory);
  assert.match(mountFireTop(state,'camp-fire:smoker'),/还没有制作/);
  assert.deepEqual(state.inventory,afterHook);
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'hardware-kit',qualityId:'ordinary',delta:2}]);
  build(state,'camp-fire:grill');
  build(state,'camp-fire:smoker');
  const completed=Object.keys(state.workshop.upgrades);
  const inventory=structuredClone(state.inventory);
  assert.match(mountFireTop(state,'camp-fire:hook'),/已装上/);
  assert.equal(state.workshop.mounted[FIRE_TOP_SLOT],'camp-fire:hook');
  assert.match(mountFireTop(state,'camp-fire:grill'),/已装上/);
  assert.equal(state.workshop.mounted[FIRE_TOP_SLOT],'camp-fire:grill');
  assert.match(mountFireTop(state,null),/收起/);
  assert.equal(state.workshop.mounted[FIRE_TOP_SLOT],undefined);
  assert.deepEqual(state.inventory,inventory,'switching never repeats the crafting debit');
  assert.deepEqual(Object.keys(state.workshop.upgrades),completed,'unequipping does not destroy crafted parts');
  assert.match(mountFireTop(state,'tent:ropes'),/没有制作/);
  assert.deepEqual(state.inventory,inventory);
  mountFireTop(state,'camp-fire:smoker');
  const loaded=await restore(state);
  assert.equal(loaded.workshop.mounted[FIRE_TOP_SLOT],'camp-fire:smoker');
  assert.equal(workshopSnapshot(loaded).upgradeOptions.length,5);
  const loadedInventory=structuredClone(loaded.inventory);
  assert.match(mountFireTop(loaded,'camp-fire:grill'),/已装上/);
  assert.deepEqual(loaded.inventory,loadedInventory);
});

test('merchant provides real canvas and hardware, while cancel or missing materials never consumes inputs',async()=>{
  const state=campState();
  state.workshop.blueprints=[...STARTER_BLUEPRINTS,'blueprint.tent-canvas'];
  Object.assign(state.player,findUpgradeProfile('tent:canvas')!.stand);
  assert.match(beginUpgrade(state,'tent:canvas'),/帆布卷还差 1/);
  state.selected=CAMP_VISITOR.id;
  Object.assign(state.player,{x:CAMP_VISITOR.x,z:CAMP_VISITOR.z});
  const mushroomBefore=inventoryTypeCount(state.inventory,'fungus.fresh');
  assert.match(tradeSupply(state,'canvas-roll'),/换得/);
  assert.equal(inventoryTypeCount(state.inventory,'fungus.fresh'),mushroomBefore-2);
  assert.equal(inventoryTypeCount(state.inventory,'supply.canvas'),1);
  const woodsBefore=inventoryTypeCount(state.inventory,'wood.log');
  assert.match(tradeSupply(state,'hardware-kit'),/换得/);
  assert.equal(inventoryTypeCount(state.inventory,'wood.log'),woodsBefore-1);
  assert.equal(inventoryTypeCount(state.inventory,'supply.hardware'),1);
  const supplyBefore=structuredClone(state.inventory);
  Object.assign(state.player,findUpgradeProfile('tent:canvas')!.stand);
  assert.match(beginUpgrade(state,'tent:canvas'),/开始/);
  state.time+=1;
  cancelWorkshop(state);
  state.time+=7;
  assert.equal(advanceWorkshop(state),null);
  assert.deepEqual(state.inventory,supplyBefore,'cancel does not consume canvas');
  build(state,'tent:canvas');
  assert.equal(inventoryTypeCount(state.inventory,'supply.canvas'),0);
  assert.equal(state.workshop.upgrades['tent:canvas'].level,1);
  const loaded=await restore(state);
  assert.equal(upgradeSnapshot(loaded,'tent:canvas')?.status,'installed');
  assert.equal(inventoryTypeCount(loaded.inventory,'supply.canvas'),0);
});

test('cabin first repair precedes interchangeable exterior improvements; paid batches survive world save',async()=>{
  const state=campState();
  Object.assign(state.player,findUpgradeProfile('cabin:windows')!.stand);
  assert.match(beginUpgrade(state,'cabin:windows'),/木屋/);
  assert.equal(state.workshop.upgrades['cabin:windows'],undefined);
  build(state,'cabin');
  build(state,'cabin:windows');
  build(state,'cabin:entry');
  const before=structuredClone(state.workshop.upgrades);
  const loaded=await restore(state);
  assert.deepEqual(loaded.workshop.upgrades,before);
  assert.equal(loaded.workshop.upgrades['cabin:windows'].level,1);
  assert.equal(loaded.workshop.upgrades['cabin:entry'].level,1);
});

test('visual fittings are attached to the original roots, mutually exclude fire tops, and remove changed canvas on disposal',()=>{
  const r=new Resources(),tent=new THREE.Group(),cabin=new THREE.Group(),fire=new THREE.Group();
  const base=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#eee1bc'}));
  base.name='canvas_panel';tent.add(base);
  const scene=createCampExteriors(r,tent,cabin,fire);
  assert.equal(scene.parts.size,12);
  assert.ok(tent.getObjectByName('fitting-tent:ropes'));
  assert.ok(cabin.getObjectByName('fitting-cabin:windows'));
  assert.ok(fire.getObjectByName('fitting-camp-fire:grill'));
  const state=campState();
  scene.update(state.workshop);
  assert.equal(base.visible,true);
  assert.equal(scene.parts.get('camp-fire:hook')!.visible,false);
  // All three crafted parts survive, but only the active top should be in the draw tree.
  state.inventory=inventoryTransaction(state.inventory,[{itemId:'canvas-roll',qualityId:'ordinary',delta:1},{itemId:'hardware-kit',qualityId:'ordinary',delta:1}]);
  for(const id of ['tent:canvas','tent:ropes','camp-fire:stones','camp-fire:support','camp-fire:hook','camp-fire:grill'])build(state,id);
  scene.update(state.workshop);
  assert.equal(base.visible,false);
  assert.equal(scene.parts.get('tent:canvas')!.visible,true);
  assert.equal(scene.parts.get('camp-fire:grill')!.visible,true);
  assert.equal(scene.parts.get('camp-fire:hook')!.visible,false);
  assert.equal(scene.stats().installed.filter(s=>s.startsWith('camp-fire:')&&['camp-fire:hook','camp-fire:grill','camp-fire:smoker'].includes(s)).length,1);
  mountFireTop(state,null);scene.update(state.workshop);
  assert.equal(scene.parts.get('camp-fire:hook')!.visible,false);
  assert.equal(scene.parts.get('camp-fire:grill')!.visible,false);
  scene.dispose();scene.dispose();
  assert.equal(tent.getObjectByName('fitting-tent:canvas'),undefined);
  assert.equal(tent.children.filter(o=>o.name.startsWith('replaced-sage')).length,0);
  base.geometry.dispose();base.material.dispose();r.dispose();
});

test('invalid mounted fitting data protects the save; old workshop snapshots learn basic new plans',async()=>{
  const state=campState();
  build(state,'camp-fire:stones');build(state,'camp-fire:support');build(state,'camp-fire:hook');
  const saved=JSON.parse(await serializeWorldSave(state,context,{sequence:1,savedAt:100}));
  saved.world.workshop.mounted[FIRE_TOP_SLOT]='tent:ropes';
  const {checksum,...core}=saved;void checksum;
  const wrong=JSON.stringify({...core,checksum:await saveDigest(core)});
  const protectedSave=await prepareWorldSave(wrong,context);
  assert.equal(protectedSave.decision,'protected');
  const old=JSON.parse(await serializeWorldSave(createState(),context,{sequence:2,savedAt:101}));
  delete old.world.workshop.mounted;
  old.world.workshop.blueprints=['blueprint.cabin-repair'];
  const {checksum:oldChecksum,...oldCore}=old;void oldChecksum;
  const migrated=await prepareWorldSave(JSON.stringify({...oldCore,checksum:await saveDigest(oldCore)}),context);
  assert.equal(migrated.decision,'restored');
  if(!('value' in migrated))throw Error('Legacy snapshot protected unexpectedly');
  for(const id of STARTER_BLUEPRINTS)assert.ok(migrated.value.workshop.blueprints.includes(id));
  assert.deepEqual(migrated.value.workshop.mounted,{});
});
