import {chunkKey} from '../src/world/regions.ts';
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

async function fixture(){
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
  return {r,models,registry,watched};
}

test('actual admitted GLBs share resources, keep source identities through depletion and release hit mappings on unload',async()=>{
  const {r,models,registry,watched}=await fixture();
  const p=createGatheringPresentation(r,models,registry),state=createGathering(registry);
  const serialized=JSON.stringify(state);p.update(state);assert.equal(JSON.stringify(state),serialized);
  const sources=[...registry.sources.values()];
  assert.equal(p.hits.size,sources.length);p.group.updateMatrixWorld(true);
  for(const source of sources)for(const patch of source.patches??[source.targetAnchor]){
    const root=p.hits.objects().find(o=>p.hits.resolve(o)===source.sourceId)!;
    const center=source.placement==='trunk'?new THREE.Vector3(.22,-.05,0).applyMatrix4(root.children[0].matrixWorld):new THREE.Vector3(patch.x,patch.y,patch.z);
    const ray=new THREE.Raycaster(center.clone().add(new THREE.Vector3(0,4,0)),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObjects(p.hits.objects(),true)[0];assert.ok(hit);
    assert.equal(p.hits.resolve(hit.object),source.sourceId,'all circle patches share the source while adjacent trees keep their own IDs');
  }
  const batches=p.group.children.filter((o):o is THREE.InstancedMesh=>o instanceof THREE.InstancedMesh);
  assert.equal(batches.length,4,'attached branches and scraps each use one batch; mushroom circles retain two');
  assert.ok(batches.filter(mesh=>watched.has(mesh.geometry)).length===2,'mushrooms retain their admitted GLB resources');
  const firstBranch=batches[0],matrix=new THREE.Matrix4();
  const branchProxy=p.hits.objects().find(o=>p.hits.resolve(o)===sources[0].sourceId)!.children[0] as THREE.Mesh;
  assert.equal(branchProxy.geometry,firstBranch.geometry,'the visible twig is also its pick surface');
  assert.equal((firstBranch.material as THREE.MeshStandardMaterial).map,models.barkSurface.map,'attached twigs borrow the same bark texture as their hosts');
  firstBranch.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.determinant())>0);
  const beforeCount=firstBranch.count,adjacent=new THREE.Matrix4();firstBranch.getMatrixAt(1,adjacent);
  state.sources[sources[0].sourceId].remaining=0;p.update(state);
  assert.equal(firstBranch.count,beforeCount-1,'empty source is removed from GPU submissions');
  firstBranch.getMatrixAt(0,matrix);assert.deepEqual(matrix,adjacent,'adjacent source remains drawn in the compacted slot');
  assert.equal(p.hits.size,sources.length,'depleted source remains inspectable');
  assert.ok([...watched.values()].every(n=>n===0),'individual changes never dispose shared models');
  p.dispose();p.dispose();assert.equal(p.hits.size,0);assert.equal(p.group.children.length,0);
  assert.ok([...watched.values()].every(n=>n===0),'presentation unregisters while the cache retains ownership');
  r.dispose();r.dispose();assert.ok([...watched.values()].every(n=>n===1));
});

test('chunk trips compact gathering instances with their source tint and restore the same hit identities',async()=>{
  const {r,models,registry}=await fixture(),p=createGatheringPresentation(r,models,registry),state=createGathering(registry);
  p.update(state);
  const sources=[...registry.sources.values()],scraps=sources.filter(s=>registry.definitions.get(s.definitionId)!.itemId==='scrap-fuel');
  const mesh=p.group.children.find((o):o is THREE.InstancedMesh=>o instanceof THREE.InstancedMesh&&o.instanceColor!==null)!;
  assert.ok(mesh);assert.equal(mesh.count,scraps.length);
  const matrix=new THREE.Matrix4(),color=new THREE.Color(),originalTints=new Map<string,number[]>();
  const sourceAtSlot=(index:number)=>{
    mesh.getMatrixAt(index,matrix);const point=new THREE.Vector3().setFromMatrixPosition(matrix);
    const source=scraps.find(s=>Math.hypot(s.x-point.x,s.z-point.z)<1e-4);
    assert.ok(source,'every submitted scrap retains a real source transform');return source;
  };
  for(let index=0;index<mesh.count;index++){mesh.getColorAt(index,color);originalTints.set(sourceAtSlot(index).sourceId,color.toArray());}
  state.sources[scraps[0].sourceId].remaining=0;
  const world=JSON.stringify(state),allocation=r.stats();
  const west=new Set(sources.filter(s=>s.region==='home-woodland').map(chunkKey)),east=new Set(sources.filter(s=>s.region==='east-woodland').map(chunkKey));
  assert.ok(west.size&&east.size);
  for(const active of [west,east,new Set<string>(),west,undefined]){
    p.update(state,active);p.group.updateMatrixWorld(true);
    const activeSources=sources.filter(s=>!active||active.has(chunkKey(s)));
    assert.equal(p.hits.size,activeSources.length,'unloaded chunks unregister proxies; active depleted pools stay inspectable');
    for(const source of activeSources)assert.ok(p.hits.objects().some(o=>p.hits.resolve(o)===source.sourceId));
    const expected=scraps.filter(s=>(!active||active.has(chunkKey(s)))&&state.sources[s.sourceId].remaining>0);
    assert.equal(mesh.count,expected.length);assert.equal(mesh.visible,expected.length>0);
    const seen=new Set<string>();
    for(let index=0;index<mesh.count;index++){
      const source=sourceAtSlot(index);seen.add(source.sourceId);mesh.getColorAt(index,color);
      assert.deepEqual(color.toArray(),originalTints.get(source.sourceId),'compaction must not transfer another source’s wood tone');
    }
    assert.deepEqual(seen,new Set(expected.map(s=>s.sourceId)));
    const matrixVersion=mesh.instanceMatrix.version,colorVersion=mesh.instanceColor!.version;
    p.update(state,active);
    assert.equal(mesh.instanceMatrix.version,matrixVersion);assert.equal(mesh.instanceColor!.version,colorVersion,'unchanged frames do not upload colors again');
    assert.equal(JSON.stringify(state),world);assert.deepEqual(r.stats(),allocation);
  }
  p.dispose();r.dispose();
});
