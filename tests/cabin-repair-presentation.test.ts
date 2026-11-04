import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Models} from '../src/scene/models.ts';
import {Resources} from '../src/scene/resources.ts';
import {createCabinRepair} from '../src/scene/cabin-repair.ts';

test('first repair reuses actual roof and doorway parts without covering the whole roof or changing source geometry',async()=>{
  const bytes=await readFile(new URL('../public/assets/m0/cabin.glb',import.meta.url));
  const cabin=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'')).scene;
  const resources=new Resources(),models=new Models(resources),sources=new Set<THREE.Mesh>();
  cabin.traverse(o=>{if(o instanceof THREE.Mesh){sources.add(o);resources.own(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])resources.own(m);}});
  models.templates.set('cabin',cabin);
  const original=cabin.toJSON(),originalBounds=new THREE.Box3().setFromObject(cabin),repair=createCabinRepair(models);
  const parts=repair.group.children as THREE.Mesh[];
  assert.equal(parts.length,4);
  assert.equal(repair.group.visible,false);repair.update(1);assert.equal(repair.group.visible,true);
  for(const part of parts){
    assert.ok([...sources].some(source=>source.geometry===part.geometry&&source.material===part.material),'preserve authored geometry and material');
    const bounds=new THREE.Box3().setFromObject(part);
    assert.ok(bounds.min.x>=originalBounds.min.x-.01&&bounds.max.x<=originalBounds.max.x+.01,'patches stay within the existing roof footprint');
  }
  const roof=parts.filter(p=>p.name.startsWith('repair-roof'));
  assert.equal(roof.length,2);
  for(const patch of roof){
    const sourceRoof=[...sources].filter(s=>s.name.startsWith('roof_board')&&Math.sign(s.position.x)===Math.sign(patch.position.x));
    assert.ok(sourceRoof.every(s=>Math.abs(s.position.z-patch.position.z)>.7),'each patch fills an empty bay');
  }
  assert.deepEqual(cabin.toJSON(),original,'repair does not mutate the original model or its materials');
  let released=0;
  const geometry=parts[0].geometry;geometry.addEventListener('dispose',()=>released++);
  repair.dispose();repair.dispose();assert.equal(released,0,'detaching repair must not destroy the shared model');
  resources.dispose();resources.dispose();assert.equal(released,1,'the cache releases shared geometry once');
});
