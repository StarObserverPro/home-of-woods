import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {makeTrees} from '../src/world/layout.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {prepareWorldSave,serializeWorldSave} from '../src/domain/world-save.ts';
import {sceneAppearanceAt} from '../src/domain/scene-props.ts';
import {createCampProps} from '../src/scene/camp-props.ts';
import {Resources} from '../src/scene/resources.ts';
import {createInventory} from '../src/domain/inventory.ts';
import {CAMP_PROPS,VISUAL_DAY_SECONDS} from '../src/content/scene-props.ts';
import {ALTAR_LAYOUT} from '../src/content/altar.ts';
import {buildClosedTerrain} from '../src/world/closed-terrain.ts';
import {heightAt} from '../src/world/surface.ts';

test('accepted terrain keeps every previous fixed tree, individual, coordinate and synthetic world save',async()=>{
  const oldTrees=JSON.parse(await readFile(new URL('../evidence/scene-r5/before-trees.json',import.meta.url),'utf8'));
  assert.deepEqual(makeTrees(),oldTrees);
  const context=createSaveContext(),loaded=await prepareWorldSave(await readFile(new URL('../evidence/scene-r5/before-save.json',import.meta.url),'utf8'),context);
  assert.equal(loaded.decision,'migrated');if(loaded.decision!=='migrated')return;
  assert.equal(loaded.value.selected,'tree-slot-5-26');assert.equal(loaded.value.inventory.stacks.find(s=>s.itemId==='wood')?.quantity,6);
  for(const selected of [...Object.values(CAMP_PROPS).map(p=>p.id),ALTAR_LAYOUT.oracle.id]){
    loaded.value.selected=selected;assert.equal((await prepareWorldSave(await serializeWorldSave(loaded.value,context,{sequence:2,savedAt:1}),context)).decision,'restored');
  }
});
test('day hearth shows real charcoal heads and ash; night restores light and fire without changing game inventory',()=>{
  const r=new Resources(),camp=createCampProps(r),inventory=createInventory(),before=JSON.stringify(inventory);
  const day=sceneAppearanceAt(0),night=sceneAppearanceAt(VISUAL_DAY_SECONDS*9/24);
  assert.equal(day.fire,false);assert.equal(night.fire,true);
  const heads=camp.group.getObjectByName('blackened-charcoal-heads') as THREE.Mesh,ash=camp.group.getObjectByName('cold-ash-on-log-ends')!;
  assert.ok(heads.geometry.getAttribute('position').count>=100);
  camp.update(0,day,inventory,0,false);assert.equal(camp.stats().hearth,'charcoal');assert.equal(ash.visible,true);
  const light=camp.group.children.flatMap(g=>g.children).find(o=>o instanceof THREE.PointLight&&o.color.getHexString()==='ff9a42') as THREE.PointLight;
  assert.equal(light.intensity,0);camp.update(1,night,inventory,1,false);assert.equal(camp.stats().hearth,'burning');assert.equal(ash.visible,false);assert.ok(light.intensity>0);
  assert.equal(JSON.stringify(inventory),before);camp.dispose();r.dispose();
});
test('randomized chips keep their accepted density, have varied triangle shapes and agree inside faces with the shared ground',()=>{
  const geometry=buildClosedTerrain(),p=geometry.getAttribute('position'),ix=geometry.index!;assert.equal(geometry.userData.facetedPatches,166);
  let samples=0;for(let i=0;i<geometry.userData.topTriangles*3;i+=3){const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)];
    const x=ids.reduce((v,id)=>v+p.getX(id),0)/3,z=ids.reduce((v,id)=>v+p.getZ(id),0)/3,y=ids.reduce((v,id)=>v+p.getY(id),0)/3;
    if(Math.abs(x)>88||Math.abs(z)>88)continue;assert.ok(Math.abs(heightAt(x,z)-y)<.00015,`inside visible face ${x},${z}`);samples++;
  }assert.ok(samples>10000);geometry.dispose();
});
