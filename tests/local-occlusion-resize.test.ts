import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Resources} from '../src/scene/resources.ts';
import {createAmbientOcclusion} from '../src/scene/lighting/ambient-occlusion.ts';
import type {OcclusionVolume} from '../src/world/occlusion.ts';
const volume:OcclusionVolume={id:'resize',center:[0,0,0],halfSize:[2,.2,.5],yaw:0,softness:.5,strength:.4,detail:true};

test('resizing the local field replaces GPU storage without leaking owner resources',()=>{
 const r=new Resources(),ao=createAmbientOcclusion(r),m=r.own(new THREE.MeshStandardMaterial());
 ao.bindMaterial(m);
 const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms)};
 m.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
 const texture=()=>shader.uniforms.howAOLocal.value as THREE.Data3DTexture;
 const placeholder=texture();let disposals=0;placeholder.addEventListener('dispose',()=>disposals++);
 const owned=r.stats().extras;
 ao.setVolumes([volume]);assert.notEqual(texture(),placeholder);assert.equal(disposals,1);assert.equal(r.stats().extras,owned);
 const initial=texture();initial.addEventListener('dispose',()=>disposals++);
 ao.setVolumes([{...volume,strength:.2}]);assert.equal(texture(),initial);assert.equal(disposals,1);
 ao.setVolumes([{...volume,halfSize:[6,.2,.5]}]);assert.notEqual(texture(),initial);assert.equal(disposals,2);assert.equal(r.stats().extras,owned);
 ao.setVolumes([]);assert.deepEqual(ao.stats().localFieldSize,[1,1,1]);assert.equal(r.stats().extras,owned);
 ao.dispose();r.dispose();assert.equal(r.stats().extras,0);
});
