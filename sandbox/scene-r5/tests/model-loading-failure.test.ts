import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {Models} from '../src/scene/models.ts';
import {Resources} from '../src/scene/resources.ts';
import {RUNTIME_MODELS} from '../src/content/assets.ts';
import {parseGeometryFile} from './glb-fixtures.ts';

type Allocation=THREE.BufferGeometry|THREE.Material|THREE.Texture;
async function parseProductionModel(name:string){
  const spec=RUNTIME_MODELS.find(a=>a.name===name||a.url.endsWith('/'+name+'.glb'))!;
  const gltf=await parseGeometryFile('public'+spec.url);
  if(spec.name==='ranger'||spec.name==='visitor'){
    // A texture fixture tests ownership; actual embedded PNG decoding is checked in-browser.
    const texture=new THREE.DataTexture(new Uint8Array([255,255,255,255]),1,1);
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)(o.material as THREE.MeshStandardMaterial).map=texture;});
  }
  return gltf;
}
function observe(gltf:GLTF,counts:Map<Allocation,number>){
  gltf.scene.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    const textures=materials.flatMap(m=>Object.values(m).filter(v=>v instanceof THREE.Texture)) as THREE.Texture[];
    for(const allocation of [object.geometry,...materials,...textures]){
      if(counts.has(allocation))continue;
      counts.set(allocation,0);allocation.addEventListener('dispose',()=>counts.set(allocation,counts.get(allocation)!+1));
    }
  });
}
test('one early GLB failure releases later shared production resources without reviving the owner or blocking a fresh retry',{timeout:5000},async()=>{
  const original=GLTFLoader.prototype.loadAsync,owner=new Resources(),models=new Models(owner);
  const pending=new Map<string,{resolve:(value:GLTF)=>void;reject:(error:Error)=>void}>();
  const lateCounts=new Map<Allocation,number>(),retryCounts=new Map<Allocation,number>();
  let retryOwner:Resources|undefined;
  GLTFLoader.prototype.loadAsync=function(url){return new Promise<GLTF>((resolve,reject)=>pending.set(url,{resolve,reject}));};
  try{
    // Use the same immediate failure cleanup as createScene; the other requests remain unresolved.
    const failure=new Error('one GLB request failed');
    const loading=models.load().catch(error=>{owner.dispose();return error;});
    assert.equal(pending.size,RUNTIME_MODELS.length);pending.get('/assets/m0/cabin.glb')!.reject(failure);
    assert.equal(await loading,failure,'failure is reported before the pending requests finish');
    assert.deepEqual(owner.stats(),{geometries:0,materials:0,extras:0,disposed:true});
    for(const [url,request] of pending){
      if(url.endsWith('/cabin.glb'))continue;
      const name=url.split('/').at(-1)!.replace('.glb',''),gltf=await parseProductionModel(name);
      let sharedMesh:THREE.Mesh|undefined;gltf.scene.traverse(object=>{if(!sharedMesh&&object instanceof THREE.Mesh)sharedMesh=object;});
      // A clone shares geometry/material, exercising repeated own() calls during traversal.
      if(sharedMesh)gltf.scene.add(sharedMesh.clone());observe(gltf,lateCounts);request.resolve(gltf);
    }
    await new Promise(resolve=>setImmediate(resolve));
    assert.ok(lateCounts.size>8,'the actual production models include many independently owned resources');
    assert.deepEqual(owner.stats(),{geometries:0,materials:0,extras:0,disposed:true});
    assert.equal(models.templates.size,0,'late completions cannot repopulate the failed model set');
    assert.ok([...lateCounts.values()].every(count=>count===1),'every late allocation is released once despite shared mesh references');
    for(const allocation of lateCounts.keys())owner.own(allocation);
    owner.dispose();assert.ok([...lateCounts.values()].every(count=>count===1),'late duplicates and repeated cleanup do not release again');

    retryOwner=new Resources();const retry=new Models(retryOwner);
    GLTFLoader.prototype.loadAsync=async function(url){const gltf=await parseProductionModel(url.split('/').at(-1)!.replace('.glb',''));observe(gltf,retryCounts);return gltf;};
    await retry.load();assert.equal(retry.templates.size,RUNTIME_MODELS.length);
    assert.deepEqual(retryOwner.stats(),{geometries:0,materials:0,extras:retryCounts.size,disposed:false},'normal owner counts remain unique and live');
    assert.ok([...retryCounts.values()].every(count=>count===0),'new owner is independent of the failed attempt');
    retryOwner.dispose();retryOwner.dispose();assert.ok([...retryCounts.values()].every(count=>count===1));
  }finally{
    GLTFLoader.prototype.loadAsync=original;owner.dispose();retryOwner?.dispose();
  }
});
