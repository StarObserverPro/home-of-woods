import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {characterModels} from './glb-fixtures.ts';
import {createNeighbourPresentation} from '../src/scene/neighbour.ts';
import {createCharacters} from '../src/scene/characters.ts';
import {createStarterState} from '../src/domain/state.ts';
import {tickNpcVisit} from '../src/domain/npc-visit.ts';
import {NPC_VISIT} from '../src/content/npc-visit.ts';
import {CHARACTER} from '../src/content/characters.ts';
import {RIDGE_NEIGHBOUR} from '../src/content/npcs/ridge-neighbour/profile.ts';
import {travelHeightAt} from '../src/world/traversal.ts';
import {travelAccess} from '../src/world/regions.ts';

const skin=(object:THREE.Object3D)=>object.getObjectByProperty('isSkinnedMesh',true) as THREE.SkinnedMesh;
const pose=(object:THREE.Object3D)=>skin(object).skeleton.bones.map(bone=>({name:bone.name,p:bone.position.toArray(),q:bone.quaternion.toArray()}));
function arriving(){
  const state=createStarterState([]);state.time=30;
  const visit=state.npcs!['ridge-neighbour'].visit;
  const env={time:30,dt:0,playerInCamp:true,hostFocused:true,entry:{x:-33,z:2},greeting:{x:-21,z:2},
    planRoute:(_from:{x:number;z:number},to:{x:number;z:number})=>[{...to}]};
  tickNpcVisit(visit,env);assert.ok(visit.active);
  return {state,visit,env};
}

test('the real neighbour rig and wardrobe load without changing the existing merchant or cached materials',async()=>{
  const {resources,models}=await characterModels(),actors=createCharacters(resources,models,[],new Map());
  const merchantSkin=skin(actors.visitor),sourceGeometry=merchantSkin.geometry,sourceMaterial=merchantSkin.material;
  const merchantPose=pose(actors.visitor),cachedCap=resources.material('#647889',.84),originalCapColor=cachedCap.color.clone();
  const view=createNeighbourPresentation(resources,models),state=createStarterState([]);
  try{
    view.update(state,false,0);assert.equal(view.group.visible,false);assert.equal(view.point(),null);
    const neighbourSkin=skin(view.group);
    assert.notEqual(neighbourSkin.skeleton,merchantSkin.skeleton);
    assert.notEqual(neighbourSkin.skeleton.bones[0],merchantSkin.skeleton.bones[0]);
    assert.equal(neighbourSkin.material,sourceMaterial,'base skin material stays shared and unmodified');
    assert.equal(view.group.scale.x,CHARACTER.worldScale);
    for(const name of ['wardrobe:headwear:cap:head','wardrobe:top:canvas-vest:chest','wardrobe:bottom:patched-trousers:lowerlegl','wardrobe:footwear:boots:footl','wardrobe:back:pack:chest']){
      const part=view.group.getObjectByName(name);assert.ok(part?.visible,name);assert.ok(part.parent instanceof THREE.Bone,name);
    }
    const cap=view.group.getObjectByName('wardrobe:headwear:cap:head')!.children[0] as THREE.Mesh;
    assert.notEqual(cap.material,cachedCap);
    assert.equal((cap.material as THREE.MeshStandardMaterial).color.getHexString(),RIDGE_NEIGHBOUR.appearance.hatColour.slice(1));
    assert.ok(cachedCap.color.equals(originalCapColor),'recolouring a neighbour cannot tint another cached cap');
    const active=arriving();view.update(active.state,false,.2);
    assert.equal(view.group.visible,true);assert.deepEqual(view.point(),active.visit.active!.position);
    assert.equal(view.group.position.y,travelHeightAt(active.visit.active!.position.x,active.visit.active!.position.z,travelAccess(active.state)));
    assert.equal(merchantSkin.geometry,sourceGeometry);assert.equal(merchantSkin.material,sourceMaterial);
    assert.deepEqual(pose(actors.visitor),merchantPose,'neighbour animation cannot move merchant bones');
    active.visit.active=null;view.update(active.state,false,.3);assert.equal(view.group.visible,false);assert.equal(view.point(),null);
  }finally{view.dispose();actors.dispose();resources.dispose();}
});

test('actual bone animation follows unscaled movement and ambient seconds, not a faster game calendar',async()=>{
  const {resources,models}=await characterModels(),a=createNeighbourPresentation(resources,models),b=createNeighbourPresentation(resources,models);
  const slow=arriving(),fast=arriving();fast.state.clock.speed=12;
  try{
    a.update(slow.state,false,0);b.update(fast.state,false,0);
    a.update(slow.state,false,.1);b.update(fast.state,false,.1);
    assert.equal(a.stats().mode,'idle','having a route without a position change must not walk in place');
    const before=pose(a.group);
    for(let frame=1;frame<=30;frame++){
      const seconds=.1+frame/60;
      for(const [fixture,view,speed] of [[slow,a,1],[fast,b,12]] as const){
        fixture.state.time=30+frame/60*speed;
        tickNpcVisit(fixture.visit,{...fixture.env,time:fixture.state.time,dt:1/60});
        view.update(fixture.state,false,seconds);
      }
    }
    assert.equal(a.stats().mode,'walk');assert.equal(b.stats().mode,'walk');
    assert.ok(Math.abs(a.stats().physicalSpeed-NPC_VISIT.walkingSpeed)<1e-8);
    assert.deepEqual(a.point(),b.point());assert.deepEqual(pose(a.group),pose(b.group));
    assert.notDeepEqual(pose(a.group),before,'the loaded Walking_A actually changes the rig');
    for(const fixture of [slow,fast]){
      const visit=fixture.visit.active!;visit.route=[];visit.phase='waiting';visit.attention='unanswered';
      fixture.state.player.x=visit.position.x+1;fixture.state.player.z=visit.position.z;
    }
    a.update(slow.state,false,1);b.update(fast.state,false,1);
    assert.equal(a.stats().mode,'wave');const waveStart=pose(a.group);
    slow.state.time+=.35;fast.state.time+=.35*12;
    a.update(slow.state,false,1.35);b.update(fast.state,false,1.35);
    assert.deepEqual(pose(a.group),pose(b.group));assert.notDeepEqual(pose(a.group),waveStart);
    slow.state.time+=9;fast.state.time+=9*12;
    a.update(slow.state,false,10);b.update(fast.state,false,10);
    assert.equal(a.stats().mode,'idle');assert.deepEqual(pose(a.group),pose(b.group));
  }finally{a.dispose();b.dispose();resources.dispose();}
});

test('disposing the neighbour detaches it and releases owned resources exactly once without destroying shared assets early',async()=>{
  const {resources,models}=await characterModels(),view=createNeighbourPresentation(resources,models),scene=new THREE.Group();
  scene.add(view.group);
  const mesh=skin(view.group),body=view.group.children[0],source=skin(models.templates.get('visitor')!);
  const privateGeometry=mesh.geometry,sharedGeometry=source.geometry,material=source.material as THREE.Material;
  assert.notEqual(privateGeometry,sharedGeometry,'the alternate hair owns only its cut geometry');
  mesh.skeleton.computeBoneTexture();
  let privateFreed=0,sharedFreed=0,materialFreed=0,skeletonTextureFreed=0;
  privateGeometry.addEventListener('dispose',()=>privateFreed++);sharedGeometry.addEventListener('dispose',()=>sharedFreed++);
  material.addEventListener('dispose',()=>materialFreed++);mesh.skeleton.boneTexture!.addEventListener('dispose',()=>skeletonTextureFreed++);
  view.dispose();view.dispose();view.update(arriving().state,false,4);
  assert.equal(view.group.parent,null);assert.equal(view.group.children.length,0);assert.equal(view.group.visible,false);
  assert.equal(view.point(),null);assert.equal(view.stats().disposed,true);assert.equal(body.getObjectByName('wardrobe:headwear:cap:head'),undefined);
  assert.equal(privateFreed,1);assert.equal(mesh.geometry,sharedGeometry);
  assert.equal(sharedFreed,0);assert.equal(materialFreed,0);assert.equal(skeletonTextureFreed,0,'cloned skeleton remains owned by scene Resources');
  resources.dispose();resources.dispose();
  assert.equal(privateFreed,1);assert.equal(sharedFreed,1);assert.equal(materialFreed,1);assert.equal(skeletonTextureFreed,1);
});
