import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OCCLUSION} from '../src/content/occlusion.ts';
import {SHADOW_PROFILES} from '../src/content/shadows.ts';
import {Resources} from '../src/scene/resources.ts';
import {createAmbientOcclusion,occlusionFootprintPixels} from '../src/scene/lighting/ambient-occlusion.ts';
import {createCharacterContactShadows,characterContactAt,characterContactAmbient} from '../src/scene/lighting/character-contact-shadows.ts';

const up=new THREE.Vector3(0,1,0);
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const foot=(x:number,y=0,z=0,id='foot')=>({id,position:new THREE.Vector3(x,y,z)});

test('ordinary 110-unit camp framing retains projected detail, and zoom restores its full footprint',()=>{
  const camera=new THREE.PerspectiveCamera(40,1,.1,3200);camera.zoom=.76;camera.updateProjectionMatrix();
  const normal=occlusionFootprintPixels(camera,800,110);
  assert.ok(normal>OCCLUSION.detailMinPixels);
  camera.zoom=2.4;camera.updateProjectionMatrix();
  assert.ok(occlusionFootprintPixels(camera,800,110)>OCCLUSION.detailFullPixels);
  assert.ok(occlusionFootprintPixels(camera,800,110)>normal);
});

test('equivalent lens/zoom projections give equal detail, while orthographic detail ignores camera distance',()=>{
  const zoomed=new THREE.PerspectiveCamera(40,1,.1,1000);zoomed.zoom=2;zoomed.updateProjectionMatrix();
  const matched=new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(20))/2)),1,.1,1000);
  close(occlusionFootprintPixels(zoomed,800,110),occlusionFootprintPixels(matched,800,110));
  const ortho=new THREE.OrthographicCamera(-5,5,5,-5,.1,1000);
  close(occlusionFootprintPixels(ortho,800,10),occlusionFootprintPixels(ortho,800,110));
  close(occlusionFootprintPixels(ortho,400,110),occlusionFootprintPixels(ortho,800,110)/2);
});

test('lifting one animated sole weakens and spreads its footprint, then removes it',()=>{
  const resources=new Resources(),contact=createCharacterContactShadows(resources,{surfaceAt:()=>0});
  const anchor=foot(0);contact.update([anchor]);
  const planted=contact.contacts()[0],strength=planted.strength,radius=planted.radii.y;
  close(strength,SHADOW_PROFILES.character.maxStrength);
  anchor.position.y=SHADOW_PROFILES.character.liftedEnd*.5;contact.update([anchor]);
  assert.ok(contact.contacts()[0].strength<strength&&contact.contacts()[0].strength>0);
  assert.ok(contact.contacts()[0].radii.y>radius);
  anchor.position.y=SHADOW_PROFILES.character.liftedEnd;contact.update([anchor]);
  assert.equal(contact.contacts().length,0);resources.dispose();
});

test('support height and slope use the supplied terrain; walls and surfaces above the support are excluded',()=>{
  const resources=new Resources(),surfaceAt=(x:number,z:number)=>2+.4*x+.2*z;
  const contact=createCharacterContactShadows(resources,{surfaceAt});
  contact.update([foot(1,surfaceAt(1,2),2)]);
  const patch=contact.contacts()[0],normal=new THREE.Vector3(-.4,1,-.2).normalize();
  close(patch.center.y,surfaceAt(1,2));assert.ok(patch.normal.distanceTo(normal)<1e-8);
  assert.ok(Math.abs(patch.tangent.dot(patch.normal))<1e-8);
  close(characterContactAt(patch,patch.center,normal),patch.strength);
  close(characterContactAt(patch,patch.center,new THREE.Vector3(0,-1,0)),0);
  close(characterContactAt(patch,patch.center.clone().addScaledVector(normal,.2),normal),0);
  resources.dispose();
});

test('two feet produce separate bounded contacts without a character-centred disk',()=>{
  const resources=new Resources(),contact=createCharacterContactShadows(resources,{surfaceAt:()=>0});
  contact.update([foot(-.3,0,0,'left'),foot(.3,0,0,'right')]);
  assert.equal(contact.contacts().length,2);assert.notEqual(contact.contacts()[0].center,contact.contacts()[1].center);
  assert.equal(new Set(contact.contacts().map(p=>p.id)).size,2);
  const strongest=(point:THREE.Vector3)=>Math.max(...contact.contacts().map(p=>characterContactAt(p,point,up)));
  close(strongest(new THREE.Vector3()),0);
  close(strongest(new THREE.Vector3(-.3,0,0)),SHADOW_PROFILES.character.maxStrength);
  resources.dispose();
});

test('a dense canopy keeps a small extra sole cue with a firm ambient floor',()=>{
  const base=1-OCCLUSION.forestStrength;
  const shaded=characterContactAmbient(base,SHADOW_PROFILES.character.maxStrength);
  assert.ok(shaded<base&&shaded>OCCLUSION.minimumAmbient);
  assert.ok(base-shaded<=SHADOW_PROFILES.character.maxStrength);
  close(characterContactAmbient(base,0),base);
  close(characterContactAmbient(.42,SHADOW_PROFILES.character.maxStrength),OCCLUSION.minimumAmbient);
  assert.ok(characterContactAmbient(base,SHADOW_PROFILES.character.maxStrength,1)>shaded);
});

test('disabling or disposing contacts clears footprints, including disposal by the scene resource owner',()=>{
  const resources=new Resources(),contact=createCharacterContactShadows(resources,{surfaceAt:()=>0});
  contact.update([foot(0)]);assert.equal(contact.contacts().length,1);
  contact.setEnabled(false);contact.update([foot(0)]);assert.equal(contact.contacts().length,0);
  contact.setEnabled(true);contact.update([foot(0)]);assert.equal(contact.contacts().length,1);
  resources.dispose();contact.update([foot(0)]);contact.dispose();
  assert.equal(contact.contacts().length,0);assert.equal(contact.stats().disposed,true);
  assert.equal(resources.stats().extras,0);
});

test('projection opt-in and animated feet update only shared uniforms, preserving the legacy default and static bake',()=>{
  const resources=new Resources(),ao=createAmbientOcclusion(resources),material=resources.own(new THREE.MeshStandardMaterial());
  const contact=createCharacterContactShadows(resources,{surfaceAt:()=>0});
  ao.bindMaterial(material);
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms)};
  material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
  assert.equal(ao.stats().detailMode,'legacy-distance');assert.equal(shader.uniforms.howAOProjection.value.x,0);
  const before=ao.stats(),camera=new THREE.PerspectiveCamera(40,1,.1,1000);
  ao.updateCamera(camera,800);contact.update([foot(-.3),foot(.3)]);ao.setCharacterContacts(contact.contacts());
  assert.equal(ao.stats().detailMode,'projected-footprint');assert.equal(shader.uniforms.howAOContactCount.value,2);
  assert.equal(ao.stats().updates,before.updates);assert.equal(ao.stats().localTextureBytes,before.localTextureBytes);
  ao.setCharacterContacts([]);assert.equal(shader.uniforms.howAOContactCount.value,0);
  ao.dispose();resources.dispose();
});
