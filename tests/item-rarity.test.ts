import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RARITIES } from '../src/content/rarities.ts';
import { craftedRarity } from '../src/domain/item-creation.ts';
import { rollBlueprintRarity } from '../src/domain/blueprint-rarity.ts';
import { itemRarity, itemProperties } from '../src/domain/item-properties.ts';
import { createItemSurface } from '../src/scene/item-surface.ts';
import { Resources } from '../src/scene/resources.ts';
import { createState } from '../src/domain/state.ts';
import { inventoryTransaction } from '../src/domain/inventory.ts';
import { beginWorkshop, advanceWorkshop, cancelWorkshop, workshopTarget } from '../src/domain/workshop.ts';
import { BLUEPRINTS } from '../src/content/workshop.ts';
import { serializeWorldSave, prepareWorldSave } from '../src/domain/world-save.ts';
import { createSaveContext } from '../src/domain/save-context.ts';

test('five grades share one palette; only epic and legendary emit', () => {
  assert.deepEqual(RARITIES.map(r=>r.id),['common','uncommon','rare','epic','legendary']);
  assert.equal(new Set(RARITIES.map(r=>r.color)).size,5);
  assert.deepEqual(RARITIES.filter(r=>r.intensity>0).map(r=>r.id),['epic','legendary']);
  assert.equal(itemRarity({rarityId:'unregistered'}).id,'common');
});

test('surface variants retain base appearance, cover every material slot and never mutate shared bench materials', () => {
  const resources=new Resources(),surface=createItemSurface(resources);
  const wood=resources.material('#855739'),end=resources.material('#d6b47a');
  const geometry=resources.geometry('test-seat',()=>new THREE.CylinderGeometry(.52,.6,.7,9));
  const ordinary=new THREE.Mesh(geometry,[wood,end,end]);const epic=ordinary.clone(),legend=ordinary.clone();
  surface.apply(epic,{rarityId:'epic'});surface.apply(legend,{rarityId:'legendary'});
  assert.equal(wood.emissive.getHex(),0);assert.equal(end.emissive.getHex(),0);assert.equal(ordinary.material[0],wood);
  for(const [root,id] of [[epic,'epic'],[legend,'legendary']] as const) {
    const materials=root.material as THREE.MeshStandardMaterial[];
    for(const [index,material] of materials.entries()) {
      const original=index===0?wood:end;assert.notEqual(material,original);assert.equal(material.emissive.getHex(),original.emissive.getHex());
      const shader:any={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <emissivemap_fragment>'};material.onBeforeCompile(shader,{} as any);
      assert.ok(shader.uniforms.raritySurfaceTint.value.getHex()>0);assert.match(shader.fragmentShader,/float sheen/);assert.match(shader.fragmentShader,/rarityAlbedo/);
      assert.equal(material.color.getHex(),original.color.getHex());assert.equal(material.roughness,original.roughness);
      assert.equal(material.depthTest,true);assert.equal(material.depthWrite,true);assert.equal(material.transparent,false);assert.equal(material.opacity,1);
      assert.match(material.name,new RegExp(id));
    }
    assert.equal(materials[1],materials[2]);
  }
  assert.equal(surface.stats().variants,4);const bound=epic.material;
  for(let i=0;i<100;i++)surface.apply(epic,{rarityId:'epic'});
  assert.equal(epic.material,bound);assert.equal(surface.stats().variants,4);
  surface.apply(epic,{rarityId:'rare'});assert.equal(epic.material[0],wood);assert.equal(epic.material[1],end);
  surface.apply(epic,{rarityId:'mythic'});assert.equal(epic.material[0],wood);
  let disposed=0;for(const material of new Set(legend.material))material.addEventListener('dispose',()=>disposed++);
  surface.dispose();resources.dispose();resources.dispose();assert.equal(disposed,2);assert.equal(resources.stats().extras,0);
});

test('all grades are obtainable deterministically; roll depends on identity rather than time or reload', () => {
  const grades=new Set(Array.from({length:2000},(_,i)=>craftedRarity(104729,i+1)));
  assert.deepEqual([...grades].sort(),RARITIES.map(r=>r.id).sort());
  assert.equal(craftedRarity(104729,13),craftedRarity(104729,13));
  assert.throws(()=>craftedRarity(104729,0));
});

test('real craft settles rarity once; cancellation and a mid-job world reload never reroll or change traits/costs', async () => {
  const state=createState();state.inventory=inventoryTransaction(state.inventory,[{itemId:'wood',qualityId:'ordinary',delta:4}]);
  state.workshop.blueprints=[BLUEPRINTS[0].id];Object.assign(state.player,workshopTarget('craft'));
  const expected=rollBlueprintRarity(state.seed,1,BLUEPRINTS[0].id,'common',50);
  beginWorkshop(state,'craft',[],BLUEPRINTS[0].id);advanceWorkshop(state);cancelWorkshop(state);
  assert.equal(state.workshop.nextInstance,1);assert.equal(state.inventory.stacks[0].quantity,4);
  beginWorkshop(state,'craft',[],BLUEPRINTS[0].id);advanceWorkshop(state);state.time+=1;
  const ctx=createSaveContext(),result=await prepareWorldSave(await serializeWorldSave(state,ctx,{sequence:1,savedAt:0}),ctx);
  assert.ok('value' in result);if(!('value' in result))throw Error('load');
  const restored=result.value;restored.time+=3;advanceWorkshop(restored);const item=restored.inventory.instances![0];
  assert.equal(item.rarityId,expected);assert.deepEqual(itemProperties(item).traits,[{id:BLUEPRINTS[0].traitId,value:2}]);
  assert.equal(restored.inventory.stacks[0].quantity,3);const before=structuredClone(restored);advanceWorkshop(restored);assert.deepEqual(restored,before);
});
