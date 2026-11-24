import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Resources} from '../src/scene/resources.ts';
import {createExpeditionVegetation} from '../src/scene/expedition-vegetation.ts';
import {createExpeditionLayout} from '../src/world/forest-expedition.ts';

type CrownBatch={mesh:THREE.InstancedMesh;ids:string[];opacity:THREE.InstancedBufferAttribute};

test('crown fading targets the correct tree across batches and does not re-upload an unchanged decimal weight',()=>{
  const resources=new Resources(),vegetation=createExpeditionVegetation(resources);
  try{
    const source=createExpeditionLayout('upper').trees[0];
    const specs=[{...source,id:'first'},{...source,id:'second',x:source.x+10},{...source,id:'other-template',variant:((source.variant+1)%3) as 0|1|2}];
    const group=vegetation.batchTrees(specs),batches=group.userData.crownBatches as CrownBatch[];
    assert.equal(batches.length,2);const target=batches.find(batch=>batch.ids.includes('second'))!;
    const other=batches.find(batch=>batch!==target)!,slot=target.ids.indexOf('second');assert.ok(slot>0);
    const physical=JSON.stringify(group.userData.crownVolumes),geometry=target.mesh.geometry.getAttribute('position').array.slice();
    vegetation.setCrownOpacity(group,'second',.17);
    assert.equal(target.opacity.getX(slot),Math.fround(.17));assert.equal(target.opacity.getX(0),1);assert.equal(other.opacity.getX(0),1);
    const version=target.opacity.version;
    for(let frame=0;frame<30;frame++)vegetation.setCrownOpacity(group,'second',.17);
    assert.equal(target.opacity.version,version,'a stored Float32 value is compared at Float32 precision');
    vegetation.setCrownOpacity(group,'missing',0);assert.equal(target.opacity.version,version);
    vegetation.setCrownOpacity(group,'other-template',.37);assert.equal(other.opacity.getX(0),Math.fround(.37));
    vegetation.setCrownOpacity(group,'second',-2);assert.equal(target.opacity.getX(slot),0);
    vegetation.setCrownOpacity(group,'second',2);assert.equal(target.opacity.getX(slot),1);
    assert.equal(JSON.stringify(group.userData.crownVolumes),physical,'camera reveal does not alter physical canopy volumes');
    assert.deepEqual(target.mesh.geometry.getAttribute('position').array,geometry);
  }finally{vegetation.dispose();resources.dispose();}
  assert.equal(resources.stats().extras,0);
});

test('releasing one crown group clears its index and preserves a live sibling using the same tree IDs and templates',()=>{
  const resources=new Resources(),vegetation=createExpeditionVegetation(resources);
  const spec=createExpeditionLayout('upper').trees[0];
  const first=vegetation.batchTrees([spec]),sibling=vegetation.batchTrees([spec]);
  const stale=(first.userData.crownBatches as CrownBatch[])[0],live=(sibling.userData.crownBatches as CrownBatch[])[0];
  let staleDisposals=0,liveDisposals=0;
  stale.mesh.geometry.addEventListener('dispose',()=>staleDisposals++);live.mesh.geometry.addEventListener('dispose',()=>liveDisposals++);
  vegetation.setCrownOpacity(first,spec.id,.19);assert.equal(live.opacity.getX(0),1);
  const staleVersion=stale.opacity.version;vegetation.releaseGroup(first);
  assert.equal(staleDisposals,1);assert.equal(liveDisposals,0);assert.equal(first.children.length,0);
  vegetation.setCrownOpacity(first,spec.id,.5);assert.equal(stale.opacity.version,staleVersion,'released groups have no reachable opacity slots');
  vegetation.setCrownOpacity(sibling,spec.id,.31);assert.equal(live.opacity.getX(0),Math.fround(.31));
  const replacement=vegetation.createTree(spec),replacementBatch=(replacement.userData.crownBatches as CrownBatch[])[0];
  vegetation.setCrownOpacity(replacement,spec.id,.43);assert.equal(replacementBatch.opacity.getX(0),Math.fround(.43));
  assert.equal(live.opacity.getX(0),Math.fround(.31));
  const liveVersion=live.opacity.version;vegetation.dispose();
  vegetation.setCrownOpacity(sibling,spec.id,1);assert.equal(live.opacity.version,liveVersion,'factory disposal also clears the indices');
  assert.equal(staleDisposals,1);assert.equal(liveDisposals,1);
  assert.equal(resources.stats().extras,0);resources.dispose();
});
