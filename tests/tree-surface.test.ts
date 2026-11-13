import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Resources} from '../src/scene/resources.ts';
import {Models} from '../src/scene/models.ts';
import {makeTrees} from '../src/world/layout.ts';
import {makeGatheringSources} from '../src/world/gathering-layout.ts';
import {harvestBranchTemplate} from '../src/scene/harvest-branches.ts';
import {configureForestBark} from '../src/scene/bark-surface.ts';
import {createTree} from '../src/scene/actions/tree.js';
import {createWeatherPresentation} from '../src/scene/weather-presentation.ts';
import {createAmbientOcclusion} from '../src/scene/lighting/ambient-occlusion.ts';
import {createForestryPresentation} from '../src/scene/forestry-presentation.ts';
import {createStreamedForest} from '../src/scene/streamed-forest.ts';
import {createState} from '../src/domain/state.ts';
import type {Tree} from '../src/world/layout.ts';

test('all resource hosts distinguish bark from leaves and share maps with attached twigs',()=>{
  const r=new Resources(),models=new Models(r),trees=makeTrees();
  for(const source of makeGatheringSources(trees).filter(s=>s.definitionId==='forage.branch-pile')){
    const tree=trees.find(t=>t.id===source.hostRef!.slotId)!;
    const g=models.treeGeometry(tree.kind,true,tree);
    assert.equal(g.attributes.uv.count,g.attributes.position.count);
    assert.ok([...g.attributes.uv.array].every(Number.isFinite));
    assert.deepEqual(new Set(g.attributes.barkWeight.array),new Set([0,1]));
    const far=models.treeGeometry(tree.kind,true,tree,true);
    assert.equal(far.attributes.uv,undefined);assert.equal(far.attributes.barkWeight,undefined);
  }
  const twig=harvestBranchTemplate(r,models).children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>;
  assert.equal(twig.material.map,models.barkSurface.map);assert.equal(twig.material.normalMap,models.barkSurface.normalMap);
  assert.ok([...twig.geometry.attributes.uv.array].every(Number.isFinite));r.dispose();
});
test('far trees have no maps; action trees borrow maps and release without disposing them',()=>{
  const r=new Resources(),models=new Models(r),tree=makeTrees().find(t=>t.role==='managed')!;
  models.sourceForTree(tree,true).traverse(o=>{if(o instanceof THREE.Mesh)assert.equal((o.material as THREE.MeshStandardMaterial).map,null);});
  let released=0;models.barkSurface.map.addEventListener('dispose',()=>released++);
  const action=createTree(models.sourceForTree(tree),tree.kind);
  let mapped=0;action.root.traverse((o:THREE.Object3D)=>{if(o instanceof THREE.Mesh&&(o.material as THREE.MeshStandardMaterial).map){mapped++;assert.ok(o.geometry.attributes.uv);}});
  assert.ok(mapped>=3);action.dispose();assert.equal(released,0);r.dispose();r.dispose();assert.equal(released,1);
});

test('bark, crown fade, weather and indirect occlusion compose once on the same material',()=>{
  const r=new Resources(),models=new Models(r),weather=createWeatherPresentation(r,new THREE.Scene(),new Map()),ao=createAmbientOcclusion(r);
  const near=r.own(new THREE.MeshStandardMaterial({vertexColors:true}));
  let inheritedCalls=0;near.onBeforeCompile=()=>{inheritedCalls++;};near.customProgramCacheKey=()=> 'inherited-hook';
  configureForestBark(near,models.barkSurface);
  const fade=r.own(near.clone());fade.transparent=true;fade.opacity=.2;
  configureForestBark(fade,models.barkSurface,true);
  for(const material of [near,fade]){
    weather.bindMaterial(material,'tree');ao.bindMaterial(material);
    const hook=material.onBeforeCompile,key=material.customProgramCacheKey();
    configureForestBark(material,models.barkSurface,material===fade);weather.bindMaterial(material,'tree');ao.bindMaterial(material);
    assert.equal(material.onBeforeCompile,hook);assert.equal(material.customProgramCacheKey(),key);
    const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms)};
    material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
    assert.equal(shader.vertexShader.match(/varying float vBarkWeight;/g)?.length,1);
    assert.equal(shader.vertexShader.match(/varying vec3 vHowWeatherPosition;/g)?.length,1);
    assert.equal(shader.vertexShader.match(/varying vec3 vHowAOPosition;/g)?.length,1);
    assert.ok(shader.fragmentShader.includes('if(vBarkWeight>.5){\n#include <normal_fragment_maps>'));
    assert.equal(shader.fragmentShader.includes('if(vBarkWeight>.5) diffuseColor.a=1.'),material===fade);
    assert.ok(shader.uniforms.howWetness);assert.ok(shader.uniforms.howAOEnabled);
    assert.ok(shader.fragmentShader.includes('reflectedLight.indirectDiffuse*=howAmbient'));
    assert.ok(!shader.fragmentShader.includes('reflectedLight.directDiffuse*=howAmbient'));
    assert.ok(key.includes(':how-bark-v2:'));assert.ok(key.includes(':how-weather-r1:tree'));assert.ok(key.includes(':how-ao-v1'));
  }
  assert.equal(inheritedCalls,1,'the original near-material hook survives; the fade clone is configured independently');
  assert.ok(near.customProgramCacheKey().startsWith('inherited-hook'));
  assert.equal(ao.stats().materials,2);ao.dispose();weather.dispose();r.dispose();
});

test('streamed action trees bind weather and occlusion immediately, then release temporary material registrations',()=>{
  const trees:Tree[]=[{id:'surface-pine',individualId:'surface-pine:g0',generation:0,x:-35,z:15,kind:'pine',scale:1.1,variant:.2,role:'managed'}];
  const r=new Resources(),models=new Models(r),forest=models.createForest(trees,true),scene=new THREE.Scene();scene.add(forest.group);
  const stream=createStreamedForest(forest,trees),weather=createWeatherPresentation(r,scene,new Map()),ao=createAmbientOcclusion(r);
  let binds=0;
  const presentation=createForestryPresentation({models,resources:r,forestGroup:forest.group,trees,selections:forest.selections,
    bindTreeSurface(root){binds++;weather.bind(root,'tree');ao.bind(root);},
  });
  weather.bind(forest.group,'tree');ao.bind(scene);
  const state=createState(trees),tree=trees[0],allocation=r.stats();
  Object.assign(state.forestry.slots[tree.id],{status:'stump',felledAt:-20,regrowAt:10000});
  let loadedCount:number|undefined,unloadedCount:number|undefined,textureDisposals=0;
  models.barkSurface.map.addEventListener('dispose',()=>textureDisposals++);
  for(let trip=0;trip<3;trip++){
    Object.assign(state.player,{x:tree.x+2,z:tree.z});stream.update(state);presentation.update(state);
    assert.equal(binds,trip+1,'each created action tree is bound exactly once');
    const parts=forest.selections.get(tree.id)!.userData.actionTree as ReturnType<typeof createTree>;
    const materials=new Set<THREE.MeshStandardMaterial>();
    parts.root.traverse((object:THREE.Object3D)=>{if(object instanceof THREE.Mesh)for(const material of Array.isArray(object.material)?object.material:[object.material])if(material instanceof THREE.MeshStandardMaterial)materials.add(material);});
    const mapped=[...materials].filter(material=>material.map);assert.ok(mapped.length>=2);
    let disposed=0;materials.forEach(material=>material.addEventListener('dispose',()=>disposed++));
    for(const material of materials){
      assert.ok(material.customProgramCacheKey().includes(':how-weather-r1:tree'));
      assert.ok(material.customProgramCacheKey().includes(':how-ao-v1'));
      const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms)};
      material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
      assert.ok(shader.uniforms.howWetness);assert.ok(shader.uniforms.howAOEnabled,'AO is ready on the creation frame without waiting for its scan');
    }
    for(const material of mapped){assert.equal(material.map,models.barkSurface.map);assert.equal(material.normalMap,models.barkSurface.normalMap);}
    loadedCount??=ao.stats().materials;assert.equal(ao.stats().materials,loadedCount);
    presentation.update(state);assert.equal(binds,trip+1);
    Object.assign(state.player,{x:200,z:200});stream.update(state);presentation.update(state);
    assert.equal(forest.selections.size,0);assert.ok(disposed>0);
    assert.equal(ao.stats().materials,loadedCount-disposed,'disposed action materials leave the AO registry immediately');
    unloadedCount??=ao.stats().materials;assert.equal(ao.stats().materials,unloadedCount,'return trips do not accumulate old material references');
    assert.equal(textureDisposals,0);assert.deepEqual(r.stats(),allocation);
  }
  ao.dispose();assert.equal(ao.stats().materials,0);assert.ok(!forest.material.customProgramCacheKey().includes(':how-ao-v1'));
  assert.ok(forest.material.customProgramCacheKey().includes(':how-weather-r1:tree'));
  weather.dispose();presentation.dispose();stream.dispose();r.dispose();assert.equal(textureDisposals,1);
});
