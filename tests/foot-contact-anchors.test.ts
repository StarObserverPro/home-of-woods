import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {parseGeometryFile} from './glb-fixtures.ts';
import {createFootContactAnchors} from '../src/scene/lighting/foot-contact-anchors.ts';
import {SHADOW_PROFILES} from '../src/content/shadows.ts';

function release(root:THREE.Object3D){
  root.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>material.dispose());}if(object instanceof THREE.SkinnedMesh)object.skeleton.dispose();});
}

test('real admitted skin supplies two distinct sole anchors and follows actual walk animation',async()=>{
  const body=(await parseGeometryFile('public/assets/characters/player.glb')).scene;
  const motions=await parseGeometryFile('public/assets/characters/motions.glb');
  body.scale.setScalar(1.5);
  const anchors=createFootContactAnchors(body,{idPrefix:'walking-player'}),feet=anchors.update();
  assert.equal(feet.length,2);assert.ok(anchors.stats().inspectedVertices>10);
  assert.ok(feet[0].position.distanceTo(feet[1].position)>.15,'each foot has its own ground support');
  assert.ok(feet.every(foot=>Number.isFinite(foot.scale)&&foot.scale!>0));
  assert.ok(feet.every(foot=>2*SHADOW_PROFILES.character.radiusZ*foot.scale!<1),'measured contacts are foot-sized');
  const mixer=new THREE.AnimationMixer(body),clip=motions.animations.find(value=>value.name==='Walking_A')!;
  assert.ok(clip);mixer.clipAction(clip).play();
  const samples:number[][]=[];
  for(const time of [0,.2,.4,.6,.8]){mixer.setTime(time);samples.push(anchors.update().flatMap(foot=>foot.position.toArray()));}
  assert.ok(samples.some(sample=>sample.some((value,index)=>Math.abs(value-samples[0][index])>.04)), 'contact positions use animated feet, not a centre disc');
  assert.equal(anchors.update(),feet,'per-frame output reuses the bounded arrays');
  mixer.stopAllAction();mixer.uncacheRoot(body);release(body);release(motions.scene);
});

test('sole anchors keep their geometry-based offset under parent motion and scale, and rigs remain independent',async()=>{
  const first=(await parseGeometryFile('public/assets/characters/player.glb')).scene,second=clone(first);
  const a=createFootContactAnchors(first),b=createFootContactAnchors(second);
  const initial=a.update().map(foot=>({position:foot.position.clone(),scale:foot.scale!}));
  const untouched=b.update().map(foot=>foot.position.toArray());
  first.position.set(12,5,-7);first.rotation.y=Math.PI/2;first.scale.setScalar(2);first.updateWorldMatrix(true,true);
  for(const [index,foot] of a.update().entries()){
    const expected=initial[index].position.clone().applyMatrix4(first.matrixWorld);
    assert.ok(foot.position.distanceTo(expected)<1e-6,'sole offset follows its skeleton through the complete world transform');
    assert.ok(Math.abs(foot.scale!-initial[index].scale*2)<1e-6);
  }
  assert.deepEqual(b.update().map(foot=>foot.position.toArray()),untouched);
  release(first);second.traverse(object=>{if(object instanceof THREE.SkinnedMesh)object.skeleton.dispose();});
});

test('a missing foot skin produces no invented ground contact',()=>{
  const root=new THREE.Group(),bone=new THREE.Bone();bone.name='foot.l';root.add(bone);
  const anchors=createFootContactAnchors(root);
  assert.deepEqual(anchors.update(),[]);assert.equal(anchors.stats().feet,0);
});

test('a real skin measured under a translated and scaled parent agrees before and after its first render update',async()=>{
  const source=(await parseGeometryFile('public/assets/characters/player.glb')).scene;
  const baseline=createFootContactAnchors(source).update().map(foot=>({position:foot.position.clone(),scale:foot.scale!}));
  const first=clone(source),second=clone(source),parent=new THREE.Group(),renderedParent=new THREE.Group();
  for(const root of [parent,renderedParent]){root.position.set(12,4,-8);root.scale.setScalar(1.5);}
  parent.add(first);renderedParent.add(second);
  // Three's renderer calls updateMatrixWorld, whose SkinnedMesh override also
  // changes attached-skin bindings. A first-frame measurement must agree with it.
  renderedParent.updateMatrixWorld(true);
  const beforeRender=createFootContactAnchors(first),afterRender=createFootContactAnchors(second);
  const a=beforeRender.update(),b=afterRender.update();
  assert.equal(a.length,2);
  for(let i=0;i<a.length;i++){
    assert.ok(a[i].position.distanceTo(b[i].position)<1e-7,'initial render timing cannot move the sole');
    assert.ok(a[i].position.distanceTo(baseline[i].position.clone().applyMatrix4(parent.matrixWorld))<1e-6,'parent translation and scale enter once');
    assert.ok(Math.abs(a[i].scale!-baseline[i].scale*1.5)<1e-6,'foot size scales once');
    assert.ok(Math.abs(a[i].scale!-b[i].scale!)<1e-7);
  }
  parent.position.set(-5,7,19);parent.rotation.y=.7;parent.scale.setScalar(.8);
  const moved=beforeRender.update();
  for(let i=0;i<moved.length;i++){
    assert.ok(moved[i].position.distanceTo(baseline[i].position.clone().applyMatrix4(parent.matrixWorld))<1e-6,'final parent pose is visible to the same-frame contacts');
    assert.ok(Math.abs(moved[i].scale!-baseline[i].scale*.8)<1e-6);
  }
  release(source);
  for(const body of [first,second])body.traverse(object=>{if(object instanceof THREE.SkinnedMesh)object.skeleton.dispose();});
});
