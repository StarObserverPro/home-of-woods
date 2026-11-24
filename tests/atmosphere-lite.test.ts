import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ATMOSPHERE} from '../src/content/atmosphere.ts';
import {atmosphereSegment,meanAtmosphereDensity,bakeTransmittanceLut} from '../src/scene/atmosphere-rules.ts';
import {createAtmosphereLite} from '../src/scene/atmosphere-lite.ts';
import {createSkySample,sampleSkyLight} from '../src/scene/lighting/sky-light.ts';

test('height-integrated optical depth agrees with numerical integration and is direction symmetric',()=>{
  for(const [a,b] of [[0,0],[0,80],[30,300],[-20,300],[8000,10]]){
    let numerical=0;for(let i=0;i<10000;i++)numerical+=Math.exp(-Math.max(0,a+(b-a)*(i+.5)/10000)/1200)/10000;
    const density=meanAtmosphereDensity(a,b,1200);
    assert.ok(Math.abs(density-numerical)<1e-7);assert.equal(density,meanAtmosphereDensity(b,a,1200));
  }
});

test('zero path is clear, longer and wetter paths attenuate, high ridges retain more contrast',()=>{
  assert.deepEqual(atmosphereSegment(0,20,30,0,0).transmittance,[1,1,1]);
  const near=atmosphereSegment(100,20,20,0,0).transmittance;
  const far=atmosphereSegment(800,20,20,0,0).transmittance;
  const high=atmosphereSegment(800,200,250,0,0).transmittance;
  const wet=atmosphereSegment(800,20,20,1,1).transmittance;
  for(let c=0;c<3;c++){assert.ok(far[c]<near[c]);assert.ok(far[c]<high[c]);assert.ok(wet[c]<far[c]);}
  assert.ok(far[0]>far[2]);
});

test('small LUT has clear endpoints, positive bounded monotonic transmittance and updates only for weather',()=>{
  const table=bakeTransmittanceLut(.2,0),width=ATMOSPHERE.lutWidth;
  for(let row=0;row<2;row++)for(let c=0;c<3;c++){
    assert.equal(table[row*width*4+c],1);
    for(let i=1;i<width;i++)assert.ok(table[(row*width+i)*4+c]>0&&table[(row*width+i)*4+c]<=table[(row*width+i-1)*4+c]);
  }
  const air=createAtmosphereLite(),light=createSkySample();sampleSkyLight(light,12,.2,0);
  air.update(light,.2,0);air.update(light,.2,0);assert.equal(air.stats().lutUpdates,1);
  sampleSkyLight(light,18,.2,0);air.update(light,.2,0);assert.equal(air.stats().lutUpdates,1);
  air.update(light,1,1);assert.equal(air.stats().lutUpdates,2);assert.equal(air.stats().lut.bytes,2048);
  air.dispose();air.dispose();assert.equal(air.stats().disposed,true);
});

test('material hooks compose, do not leak to a borrowed scene, and release on material disposal',()=>{
  const air=createAtmosphereLite(),material=new THREE.MeshStandardMaterial();let previousCalls=0;
  const original:THREE.Material['onBeforeCompile']=()=>{previousCalls++;};material.onBeforeCompile=original;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);
  air.bind(mesh);air.bind(mesh);assert.equal(air.stats().materials,1);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
  assert.equal(previousCalls,1);assert.ok(shader.fragmentShader.indexOf('vec3 airL=')<shader.fragmentShader.indexOf('#include <tonemapping_fragment>'));
  air.unbind(mesh);assert.equal(material.onBeforeCompile,original);assert.equal(air.stats().materials,0);
  air.bind(mesh);material.dispose();assert.equal(air.stats().materials,0);mesh.geometry.dispose();air.dispose();
});

test('inherited and late-wrapped hooks have independent activation and release their LUT',()=>{
  const air=createAtmosphereLite(),original=new THREE.MeshStandardMaterial(),variant=new THREE.MeshStandardMaterial();
  const originalMesh=new THREE.Mesh(new THREE.BoxGeometry(),original),variantMesh=new THREE.Mesh(originalMesh.geometry,variant);
  const compile=(material:THREE.Material)=>{
    const shader={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);return shader;
  };
  air.bind(originalMesh);
  variant.onBeforeCompile=original.onBeforeCompile;variant.customProgramCacheKey=original.customProgramCacheKey;
  air.bind(variantMesh);
  const a=compile(original),b=compile(variant);
  assert.notEqual(a.uniforms.howAirActive,b.uniforms.howAirActive);
  assert.equal(b.vertexShader.split('varying vec3 vHowAirWorld;').length,2);
  air.unbind(variantMesh);
  const unbound=compile(variant);
  assert.equal(unbound.uniforms.howAirActive.value,0,'a fresh compile must not reactivate the parent hook');
  assert.equal(unbound.uniforms.howAirLut.value,null);
  assert.equal(a.uniforms.howAirActive.value,1);
  air.bind(variantMesh);
  const reboundBeforeWrapper=compile(variant);
  // A subsequent weather/surface wrapper must survive atmosphere unbinding.
  const airHook=variant.onBeforeCompile;
  const later:THREE.Material['onBeforeCompile']=function(shader,renderer){airHook.call(this,shader,renderer);};
  variant.onBeforeCompile=later;
  air.unbind(variantMesh);
  assert.equal(variant.onBeforeCompile,later);
  assert.equal(reboundBeforeWrapper.uniforms.howAirActive.value,0);assert.equal(reboundBeforeWrapper.uniforms.howAirLut.value,null);
  assert.equal(a.uniforms.howAirActive.value,1);
  air.bind(variantMesh);
  const rebound=compile(variant);
  assert.equal(rebound.uniforms.howAirActive.value,1);
  assert.equal(rebound.vertexShader.split('varying vec3 vHowAirWorld;').length,2);
  air.dispose();
  assert.equal(rebound.uniforms.howAirActive.value,0);assert.equal(rebound.uniforms.howAirLut.value,null);
  original.dispose();variant.dispose();originalMesh.geometry.dispose();
});
