import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createGatheringRegistry } from '../src/domain/gathering-registry.ts';
import { createGathering } from '../src/domain/gathering.ts';
import { createGatheringPresentation } from '../src/scene/gathering-presentation.ts';
import { Resources } from '../src/scene/resources.ts';
import { Models } from '../src/scene/models.ts';
import { RUNTIME_MODELS } from '../src/content/assets.ts';

test('actual admitted GLBs share resources, keep source identities through depletion and release hit mappings on unload',async()=>{
  const r=new Resources(),models=new Models(r),registry=createGatheringRegistry({assetIds:RUNTIME_MODELS.map(a=>a.assetId)});
  const watched=new Map<THREE.BufferGeometry|THREE.Material,number>();
  for(const spec of RUNTIME_MODELS.filter(a=>a.url.includes('gathering'))){
    const bytes=await readFile(new URL(`../public${spec.url}`,import.meta.url));
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'');
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)for(const v of [o.geometry,...(Array.isArray(o.material)?o.material:[o.material])]){
      if(watched.has(v))continue;watched.set(v,0);v.addEventListener('dispose',()=>watched.set(v,watched.get(v)!+1));r.own(v);
    }});
    models.templates.set(spec.name,gltf.scene);
  }
  const p=createGatheringPresentation(r,models,registry),state=createGathering(registry);
  const serialized=JSON.stringify(state);p.update(state);assert.equal(JSON.stringify(state),serialized);
  const sources=[...registry.sources.values()];
  assert.equal(p.hits.size,sources.length);p.group.updateMatrixWorld(true);
  for(const source of sources)for(const patch of source.patches??[source.targetAnchor]){
    const ray=new THREE.Raycaster(new THREE.Vector3(patch.x,patch.y+4,patch.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(p.hits.objects(),true)[0];assert.ok(hit);
    assert.equal(p.hits.resolve(hit.object),source.sourceId,'all circle patches share the source while adjacent trees keep their own IDs');
  }
  const batches=p.group.children.filter((o):o is THREE.InstancedMesh=>o instanceof THREE.InstancedMesh);
  assert.equal(batches.length,6,'two parts per definition; circles do not multiply draw batches');
  assert.ok(batches.every(mesh=>watched.has(mesh.geometry)),'batches borrow the cache-owned geometry');
  const firstBranch=batches[0],matrix=new THREE.Matrix4();
  firstBranch.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.determinant())>0);
  state.sources[sources[0].sourceId].remaining=0;p.update(state);
  firstBranch.getMatrixAt(0,matrix);assert.equal(matrix.determinant(),0,'empty source instance is hidden');
  firstBranch.getMatrixAt(1,matrix);assert.ok(Math.abs(matrix.determinant())>0,'adjacent source remains drawn');
  assert.equal(p.hits.size,sources.length,'depleted source remains inspectable');
  assert.ok([...watched.values()].every(n=>n===0),'individual changes never dispose shared models');
  p.dispose();p.dispose();assert.equal(p.hits.size,0);assert.equal(p.group.children.length,0);
  assert.ok([...watched.values()].every(n=>n===0),'presentation unregisters while the cache retains ownership');
  r.dispose();r.dispose();assert.ok([...watched.values()].every(n=>n===1));
});
