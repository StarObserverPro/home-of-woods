import { inventoryCount } from '../src/domain/inventory.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {characterModels} from './glb-fixtures.ts';
import {createCharacters} from '../src/scene/characters.ts';
import {createForestryPresentation} from '../src/scene/forestry-presentation.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import {createState} from '../src/domain/state.ts';
import {startChop,cancelChop,chopRange} from '../src/domain/forestry.ts';
import {heightAt} from '../src/world/surface.ts';
import {canStand} from '../src/domain/navigation.ts';
import {FORESTRY} from '../src/content/forestry.ts';
import {CAMP_VISITOR} from '../src/content/characters.ts';

test('actual skinned character stops at real tree solids, keeps two palms on the handle, and cancels without gameplay writes',async()=>{
  const {resources,models}=await characterModels(),trees=makeTrees(),forest=models.createForest(trees);
  const presenter=createForestryPresentation({models,resources,forestGroup:forest.group,trees,selections:forest.selections});
  const characters=createCharacters(resources,models,trees,forest.selections),colliders=makeColliders(trees);
  const cases=['pine','broadleaf'].flatMap(kind=>trees.filter(t=>t.role==='managed'&&t.kind===kind).filter((_,i)=>i%9===0).slice(0,4));
  assert.equal(new Set(cases.map(t=>t.kind)).size,2,'test both trunk shapes');
  let checked=0;const misses:string[]=[];
  for(const tree of cases)for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const reach of ['preferred','maximum']){
    const distance=reach==='maximum'?chopRange(tree)-.03:Math.min(chopRange(tree)-.03,(tree.kind==='pine'?.43:.66)*tree.scale+1.1);
    const x=tree.x+Math.sin(angle)*distance,z=tree.z+Math.cos(angle)*distance;
    if(!canStand({x,z},colliders))continue;
    const state=createState(trees);state.player.x=x;state.player.z=z;state.selected=tree.id;
    assert.equal(startChop(state,tree).ok,true);const saved=JSON.stringify(state);
    for(const phase of [0,.17,.4,.58,.64,.72,.9,.999]){
      state.time=phase*FORESTRY.chopSeconds/FORESTRY.hits;
      const readonly=JSON.stringify(state);presenter.update(state);characters.update(state);
      const info=characters.stats();if(!info.stopFound)misses.push(tree.id+' angle '+angle+' '+reach);
      assert.ok((info.contactClearance??Infinity)>=-1e-6,'whole sampled blade is outside the limited-bite boundary');
      assert.ok((info.grip?.leftGripRadialGap??1)<1e-6,'left palm remains on the rigid handle');
      assert.ok((info.grip?.leftGripAlongHandle??1)<.5773,'left palm stays within the physical handle');
      assert.equal(JSON.stringify(state),readonly,'presentation cannot consume time, points or materials');
    }
    assert.equal(characters.player.getObjectByName('forestry-hand-axe')?.visible,true);
    cancelChop(state);characters.update(state);assert.equal(characters.player.getObjectByName('forestry-hand-axe')?.visible,false);
    assert.equal(inventoryCount(state.inventory,'wood'),0);assert.equal(state.forestry.ledger.reserved,0);assert.ok(saved.includes(tree.id));checked++;
  }
  assert.ok(checked>=8,'both species and multiple legal sides sampled');assert.deepEqual([...new Set(misses)],[],'normal forest stances must actually reach the cut');
  characters.dispose();characters.dispose();presenter.dispose();resources.dispose();
});

test('vertical inspector is bounded by the support top and NPC gestures leave legs fixed',async()=>{
  const {resources,models}=await characterModels(),trees=makeTrees(),forest=models.createForest(trees);
  const characters=createCharacters(resources,models,trees,forest.selections),state=createState(trees);
  const before=JSON.stringify(state);characters.setInspection('vertical');characters.update(state);
  assert.equal(characters.stats().stopFound,true);assert.ok(Math.abs(characters.stats().contactClearance!)<1e-6);
  assert.equal(JSON.stringify(state),before,'inspection is presentation only');
  characters.setInspection(null);state.player.x=CAMP_VISITOR.x+2;state.player.z=CAMP_VISITOR.z;
  const leg=characters.visitor.getObjectByName('lowerlegl')!,arm=characters.visitor.getObjectByName('upperarmr')!;
  characters.update(state);const baseline=leg.quaternion.clone(),start=arm.quaternion.clone();
  let movement=0;
  for(const time of [.1,.5,1,1.5,2,3]){state.time=time;characters.update(state);assert.ok(leg.quaternion.angleTo(baseline)<1e-7);movement=Math.max(movement,arm.quaternion.angleTo(start));}
  assert.ok(movement>.1);characters.dispose();resources.dispose();
});

test('character instances share buffers but have independent skeletons and bone textures release once',async()=>{
  const {resources,models}=await characterModels(),a=models.clone('ranger'),b=models.clone('ranger');
  const first=a.getObjectByProperty('isSkinnedMesh',true) as THREE.SkinnedMesh,second=b.getObjectByProperty('isSkinnedMesh',true) as THREE.SkinnedMesh;
  assert.equal(first.geometry,second.geometry);assert.equal(first.material,second.material);assert.notEqual(first.skeleton,second.skeleton);
  const other=second.skeleton.bones[3].quaternion.clone();first.skeleton.bones[3].rotation.x+=.7;assert.deepEqual(second.skeleton.bones[3].quaternion.toArray(),other.toArray());
  first.skeleton.computeBoneTexture();second.skeleton.computeBoneTexture();let freed=0;
  first.skeleton.boneTexture!.addEventListener('dispose',()=>freed++);second.skeleton.boneTexture!.addEventListener('dispose',()=>freed++);
  resources.dispose();resources.dispose();assert.equal(freed,2);
});
