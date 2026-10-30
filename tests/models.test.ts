import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { Models } from "../src/scene/models.ts";
import { Resources } from "../src/scene/resources.ts";
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CABIN} from '../src/content/world.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
test("static model batching preserves distinct geometry for each material group", () => {
  const resources = new Resources(),
    models = new Models(resources),
    root = new THREE.Group();
  const a = new THREE.Mesh(
    new THREE.BoxGeometry(1, 2, 3),
    new THREE.MeshStandardMaterial({ color: "#ff0000" }),
  );
  const b = new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#00ff00" }),
  );
  b.position.x = 7;
  root.add(a, b);
  models.templates.set("test", root);
  const batched = models.staticClone("test"),
    first = batched.children[0] as THREE.Mesh,
    second = batched.children[1] as THREE.Mesh;
  assert.equal(batched.children.length, 2);
  assert.notEqual(first.geometry, second.geometry);
  first.geometry.computeBoundingBox();
  second.geometry.computeBoundingBox();
  assert.ok(first.geometry.boundingBox!.max.x < 1);
  assert.ok(second.geometry.boundingBox!.min.x > 5);
  assert.equal(first.material, a.material);
  assert.equal(second.material, b.material);
  resources.dispose();
  a.geometry.dispose();
  b.geometry.dispose();
  (a.material as THREE.Material).dispose();
  (b.material as THREE.Material).dispose();
});
test('collision footprints cover the actual scaled cabin steps and both exported tree trunks',async()=>{
  const trees=makeTrees(),colliders=makeColliders(trees),loader=new GLTFLoader();
  const load=async(name:string)=>{
    const bytes=await readFile(new URL(`../public/assets/m0/${name}.glb`,import.meta.url));
    return (await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,'')).scene;
  };
  const cabin=await load('cabin');cabin.scale.setScalar(1.6);cabin.position.set(CABIN.x,0,CABIN.z);cabin.updateMatrixWorld(true);
  const footprint=colliders.find(c=>c.id==='cabin')!;assert.ok('halfX' in footprint);
  let groundParts=0;
  cabin.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const box=new THREE.Box3().setFromObject(object);
    if(box.max.y>1.4)return;
    groundParts++;
    assert.ok(box.min.x>=footprint.x-footprint.halfX-.01 && box.max.x<=footprint.x+footprint.halfX+.01,'cabin solid width');
    assert.ok(box.min.z>=footprint.z-footprint.halfZ-.01 && box.max.z<=footprint.z+footprint.halfZ+.01,'cabin foundation or step depth');
  });
  assert.ok(groundParts>=5,'foundation, floor and three steps inspected');
  const loaded=[cabin];
  for(const kind of ['pine','broadleaf'] as const){
    const tree=trees.find(t=>t.kind===kind&&t.role==='managed')!;
    const root=await load(kind);loaded.push(root);root.position.set(tree.x,0,tree.z);root.scale.setScalar(tree.scale);root.updateMatrixWorld(true);
    const trunk=root.getObjectByName(kind==='pine'?'chunky_pine_trunk':'broadleaf_flared_trunk') as THREE.Mesh;
    assert.ok(trunk instanceof THREE.Mesh,'actual exported trunk');
    const c=colliders.find(c=>c.id===tree.id)!;assert.ok('radius' in c);
    const positions=trunk.geometry.getAttribute('position'),v=new THREE.Vector3();
    for(let i=0;i<positions.count;i++){
      v.fromBufferAttribute(positions,i).applyMatrix4(trunk.matrixWorld);
      assert.ok(Math.hypot(v.x-tree.x,v.z-tree.z)<=c.radius+1e-5,`${kind} trunk covered`);
    }
  }
  loaded.forEach(root=>root.traverse(object=>{
    if(object instanceof THREE.Mesh){object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();}
  }));
});
