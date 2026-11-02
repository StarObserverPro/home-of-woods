import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {parseGeometryFile} from './glb-fixtures.ts';
import {RUNTIME_MODELS, runtimeModelEnabled} from '../src/content/assets.ts';
import {WILDLIFE_DEFINITIONS} from '../src/content/wildlife.ts';

/** Regression guard: a real four-legged rig, not a bouncing one-piece mascot. */
test('original mountain goat has non-coplanar triangle facets, species silhouette and 21 actual joints',async()=>{
  const gltf=await parseGeometryFile('public/assets/wildlife/mountain-goat.glb');
  const meshes:THREE.SkinnedMesh[]=[];
  gltf.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh)meshes.push(o);});
  assert.equal(meshes.length,1);
  const mesh=meshes[0];
  assert.equal(mesh.skeleton.bones.length,21);
  const names=new Set(mesh.skeleton.bones.map(b=>b.name));
  for(const key of ['goat_torso','goat_head','goat_neck','left_front_upper','left_front_lower','left_front_hoof','right_front_upper','left_hind_upper','right_hind_upper']){
    assert.ok(names.has(key),`Bone ${key}`);
  }
  const geometry=mesh.geometry, count=geometry.index?.count??geometry.getAttribute('position').count;
  assert.ok(count/3>=800 && count/3<=2500,`triangles=${count/3}`);
  const normals=geometry.getAttribute('normal');
  assert.ok(normals);
  const facetSet=new Set<string>();
  for(let i=0;i<normals.count;i+=3) facetSet.add(`${normals.getX(i).toFixed(2)}:${normals.getY(i).toFixed(2)}:${normals.getZ(i).toFixed(2)}`);
  assert.ok(facetSet.size>350,`independent geometric facet normals=${facetSet.size}`);
  const box=new THREE.Box3().setFromObject(gltf.scene);
  assert.ok(box.max.y>2 && box.min.y>=-.02);
  assert.ok(box.max.z>1.4 && box.min.z<-.8);
  const definition=WILDLIFE_DEFINITIONS.find(d=>d.id==='wildlife.goat');
  assert.equal(definition?.model,'mountain-goat');
  assert.equal(runtimeModelEnabled('goat'),false,'the withdrawn Gobkit goat remains disabled');
  assert.equal(runtimeModelEnabled('mountain-goat'),true);
  assert.ok(RUNTIME_MODELS.some(x=>x.assetId==='how-wildlife-mountain-goat'));
  // Independent skeletons prevent one animal's footstep from moving the other.
  const copy=cloneSkeleton(gltf.scene);
  const a=mesh.skeleton.bones.find(b=>b.name==='left_front_upper')!;
  let duplicate:THREE.SkinnedMesh|undefined;copy.traverse(o=>{if(o instanceof THREE.SkinnedMesh)duplicate=o;});
  assert.ok(duplicate);
  const clonedBone=duplicate!.skeleton.bones.find(b=>b.name==='left_front_upper')!;
  assert.notEqual(a,clonedBone);
  a.rotation.x=-.4;assert.ok(Math.abs(clonedBone.rotation.x)<.01);
});

test('lift-front, lookout and slow two-step walk move distinct bones without root teleport',async()=>{
  const {scene,animations}=await parseGeometryFile('public/assets/wildlife/mountain-goat.glb');
  assert.deepEqual(animations.map(c=>c.name).sort(),['idle','lift_front','survey','walk']);
  const mixer=new THREE.AnimationMixer(scene),bones=new Map<string,THREE.Bone>();
  scene.traverse(o=>{if(o instanceof THREE.Bone)bones.set(o.name,o);});
  const front=bones.get('left_front_upper')!, lower=bones.get('left_front_lower')!,hind=bones.get('right_hind_upper')!,head=bones.get('goat_head')!,root=bones.get('goat_root')!;
  const resting=front.quaternion.clone(),rootRest=root.position.clone();
  const clip=(name:string,t:number)=>{
    mixer.stopAllAction();
    for(const b of bones.values())b.quaternion.identity();
    mixer.clipAction(animations.find(a=>a.name===name)!).reset().play();
    mixer.setTime(t);
  };
  clip('lift_front',1.1);
  assert.ok(resting.angleTo(front.quaternion)>.23,'foreleg lifts at upper joint');
  assert.ok(lower.rotation.x>.3,'knee folds to clear the hoof');
  assert.ok(root.position.distanceTo(rootRest)<.0001,'no root teleport');
  clip('survey',1.5);assert.ok(Math.abs(head.rotation.y)>.07,'neck and head look naturally');
  clip('walk',.48);
  assert.ok(Math.abs(front.rotation.x)>.12 && Math.abs(hind.rotation.x)>.12,'opposing legs step');
  assert.ok(root.position.distanceTo(rootRest)<.0001);
});
