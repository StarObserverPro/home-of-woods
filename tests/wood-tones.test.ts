import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {WOOD_TONES,woodToneDrift,woodBatchToneSeed} from '../src/content/wood-tones.ts';
import {woodCoordinates,woodMaterial} from '../src/scene/wood-grain.ts';
import {setWoodTone,setWoodInstanceTone,woodToneGeometry} from '../src/scene/wood-tones.ts';
import {scrapGeometry,groundScrapGeometry} from '../src/scene/scrap-geometry.ts';
import {Resources} from '../src/scene/resources.ts';
import {createAmbientOcclusion} from '../src/scene/lighting/ambient-occlusion.ts';

test('visual swatches have an ordered light/warm/dark value range',()=>{
 const luminance=(hex:string)=>{const c=new THREE.Color(hex);return c.r*.2126+c.g*.7152+c.b*.0722;};
 assert.ok(luminance(WOOD_TONES.light.face)>luminance(WOOD_TONES.warm.face));
 assert.ok(luminance(WOOD_TONES.warm.face)>luminance(WOOD_TONES.scrap.face));
 for(const family of Object.values(WOOD_TONES))assert.ok(luminance(family.end)>luminance(family.bark));

});
test('stable bounded drift has multiple values but is independent of evaluation order',()=>{
 const first=Array.from({length:70},(_,i)=>woodToneDrift(`board:${i}`));
 assert.ok(new Set(first.map(x=>JSON.stringify(x))).size>=10);
 for(let i=69;i>=0;i--)assert.deepEqual(first[i],woodToneDrift(`board:${i}`));
 assert.ok(first.flat().every(v=>v>.82&&v<1.19));
 assert.deepEqual(woodToneDrift('x',0),[1,1,1]);
});
test('transport, species, quality, humidity and quantity never recolor a batch',()=>{
 const s={itemId:'wood',wood:{spec:{lengthMm:2600,thicknessMm:350,straightness:'straight'}}};
 const seed=woodBatchToneSeed(s);
 assert.equal(seed,woodBatchToneSeed({...s,woodSpecies:'irrelevant',transport:{kind:'ground',x:99,z:20},quantity:5,qualityId:'legendary',woodCondition:{moisture:.9}}));
});
test('whole-piece tone survives transform and merge without altering geometry or end grain',()=>{
 const a=woodCoordinates(new THREE.BoxGeometry(2,.15,.4),'board','x','a'),b=woodCoordinates(new THREE.BoxGeometry(2,.15,.4),'board','x','b');
 const coords=Array.from(a.getAttribute('woodCoord').array),before=Array.from(a.getAttribute('woodTone').array);
 a.rotateY(.9).translate(12,2,-3);assert.deepEqual(Array.from(a.getAttribute('woodTone').array),before);
 assert.deepEqual(Array.from(a.getAttribute('woodCoord').array),coords);
 for(let i=0;i<before.length;i+=3)assert.deepEqual(before.slice(i,i+3),before.slice(0,3));
 const merged=mergeGeometries([a,b])!;assert.equal(merged.getAttribute('woodTone').count,a.getAttribute('position').count+b.getAttribute('position').count);
 assert.ok(coords.some((x,i)=>i%3===2&&x===2));a.dispose();b.dispose();merged.dispose();
});
test('wood tint cache is bounded, shared, and never mutates the source geometry',()=>{
 const r=new Resources(),g=r.own(woodCoordinates(new THREE.BoxGeometry(2,.2,.3))),before=Array.from(g.getAttribute('woodTone').array);
 const results=Array.from({length:500},(_,i)=>woodToneGeometry(r,g,`piece:${i}`));
 assert.ok(new Set(results).size<=21);assert.equal(woodToneGeometry(r,g,'same'),woodToneGeometry(r,g,'same'));
 assert.deepEqual(Array.from(g.getAttribute('woodTone').array),before);r.dispose();assert.equal(r.stats().geometries,0);
});
test('stock log and both caps receive identical instance drift without extra materials',()=>{
 const r=new Resources(),g=r.own(woodCoordinates(new THREE.CylinderGeometry(1,1,2,8))),m=woodMaterial(r,WOOD_TONES.neutral.bark),mesh=r.own(new THREE.InstancedMesh(g,m,3));
 for(let i=0;i<3;i++)setWoodInstanceTone(mesh,i,'one-log');
 assert.deepEqual(Array.from(mesh.instanceColor!.array).slice(0,3),Array.from(mesh.instanceColor!.array).slice(6,9));
 assert.equal(mesh.material,m);assert.equal(woodMaterial(r,WOOD_TONES.neutral.bark),m);r.dispose();
});
test('scrap keeps separate dark bark/split/end colors and has stable per-piece values',()=>{
 const g=scrapGeometry(),pile=groundScrapGeometry();
 const c=g.getAttribute('color');assert.ok(new Set(Array.from({length:c.count},(_,i)=>[c.getX(i),c.getY(i),c.getZ(i)].join(','))).size>=3);
 const tint=pile.getAttribute('woodTone');assert.ok(new Set(Array.from({length:tint.count},(_,i)=>tint.getX(i))).size>=2);
 g.dispose();pile.dispose();
});
test('wood shader composes with ambient occlusion; no clock/world-space coloration',()=>{
 const r=new Resources(),m=woodMaterial(r,WOOD_TONES.warm.face),ao=createAmbientOcclusion(r);ao.bindMaterial(m);
 const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms)};
 m.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
 assert.ok(shader.fragmentShader.includes('diffuseColor.rgb*=vHowWoodTone'));
 assert.ok(shader.fragmentShader.includes('reflectedLight.indirectDiffuse*=howAmbient'));
 assert.ok(shader.vertexShader.includes('vHowWoodTone=woodTone.x>0.?woodTone:vec3(1.)'));
 assert.ok(!shader.fragmentShader.includes('uWoodTime'));assert.ok(!shader.vertexShader.includes('Math.random'));ao.dispose();r.dispose();
});
