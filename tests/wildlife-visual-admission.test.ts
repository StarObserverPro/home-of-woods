import test from 'node:test';
import assert from 'node:assert/strict';
import {Group, AnimationClip} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {RUNTIME_MODELS, ENABLED_RUNTIME_MODELS, runtimeModelEnabled} from '../src/content/assets.ts';
import {INSPECTABLE_VIEWS} from '../src/content/scene-props.ts';
import {Models} from '../src/scene/models.ts';
import {Resources} from '../src/scene/resources.ts';
import {createWildlifePresentation} from '../src/scene/wildlife-presentation.ts';
import {createWildlife, advanceWildlife, validateWildlifeRegistry} from '../src/domain/wildlife.ts';
import {START, WORLD_SEED} from '../src/content/world.ts';
import {makeTrees, makeColliders} from '../src/world/layout.ts';

test('rejected legacy goat stays disabled while original mountain goat is enabled',()=>{
  assert.ok(RUNTIME_MODELS.some(s=>s.name==='goat'),'retain provenance and stable identity');
  assert.equal(runtimeModelEnabled('goat'),false);
  assert.equal(runtimeModelEnabled('unregistered-model'),false);
  assert.equal(runtimeModelEnabled('mountain-goat'),true);
  for(const name of ['stag','squirrel','hare']) assert.equal(runtimeModelEnabled(name),true);
  assert.equal(ENABLED_RUNTIME_MODELS.some(s=>s.name==='goat'),false);
  assert.equal(INSPECTABLE_VIEWS.some(([id])=>id==='goatVista'),true);
  assert.ok(INSPECTABLE_VIEWS.some(([id])=>id==='stagVista'));
  validateWildlifeRegistry(RUNTIME_MODELS.map(s=>s.assetId));
});

test('production loader avoids rejected legacy goat while admitting rigged original and deer',async()=>{
  const original=GLTFLoader.prototype.loadAsync, calls:string[]=[];
  const resources=new Resources(),models=new Models(resources);
  GLTFLoader.prototype.loadAsync=async function(url){
    calls.push(url);
    return {scene:new Group(),animations:['idle','walk','survey'].map(name=>new AnimationClip(name,1,[]))} as unknown as GLTF;
  };
  let presentation:ReturnType<typeof createWildlifePresentation>|undefined;
  try{
    await models.load();
    assert.equal(calls.includes('/assets/wildlife/goat.glb'),false);
    assert.ok(calls.includes('/assets/wildlife/stag.glb'));
    assert.ok(calls.includes('/assets/wildlife/mountain-goat.glb'));
    presentation=createWildlifePresentation(resources,models);
    const available=presentation.available();
    assert.equal(available.includes('wildlife.goat'),true);
    assert.ok(available.includes('wildlife.stag'));
    const state=createWildlife(0), colliders=makeColliders(makeTrees());
    let stagVisits=0, goatVisits=0;
    for(let window=0;window<100;window++){
      advanceWildlife(state,window*260,WORLD_SEED,START,colliders,available,[]);
      if(state.encounters.some(e=>e.definitionId==='wildlife.goat')) goatVisits++;
      if(state.encounters.some(e=>e.definitionId==='wildlife.stag')) stagVisits++;
      assert.ok(state.encounters.length<=3);
    }
    assert.ok(stagVisits>0,'the accepted deer still participates in natural encounters');
    assert.ok(goatVisits>0,'the original mountain goat is now a legitimate rare encounter');
  }finally{
    presentation?.dispose();resources.dispose();GLTFLoader.prototype.loadAsync=original;
  }
});
