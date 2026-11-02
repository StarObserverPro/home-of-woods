import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Resources} from '../src/scene/resources.ts';
import {createItemSurface} from '../src/scene/item-surface.ts';
import {sampleGlintSurface} from '../src/scene/item-glints.ts';
import {ITEM_VFX} from '../src/content/item-vfx.ts';

function setup(){const resources=new Resources(),surface=createItemSurface(resources);const geometry=resources.geometry('stump',()=>new THREE.CylinderGeometry(.52,.6,.7,9));const material=resources.material('#855739');const mesh=new THREE.Mesh(geometry,material);return{resources,surface,mesh,material};}
test('glint samples are deterministic finite points on the mesh surface, not an overhead badge',()=>{
 const g=new THREE.CylinderGeometry(.52,.6,.7,9),a=sampleGlintSurface(g,12),b=sampleGlintSurface(g,12);
 assert.deepEqual(a.getAttribute('position').array,b.getAttribute('position').array);assert.equal(a.getAttribute('position').count,12);
 const p=a.getAttribute('position'),n=a.getAttribute('normal');let sides=0,tops=0;
 for(let i=0;i<p.count;i++){assert.ok([p.getX(i),p.getY(i),p.getZ(i)].every(Number.isFinite));assert.ok(p.getY(i)<=.38 && p.getY(i)>=-.38);assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);if(n.getY(i)>.9)tops++;else sides++;}
 assert.ok(tops>0&&sides>0);a.dispose();b.dispose();g.dispose();
});
test('ordinary grades allocate neither glowing variants nor sparkle objects',()=>{
 const {resources,surface,mesh,material}=setup();for(const rarityId of ['common','uncommon','rare','future'])surface.apply(mesh,{rarityId});
 assert.equal(mesh.material,material);assert.equal(mesh.children.length,0);assert.equal(surface.stats().variants,0);assert.equal(surface.stats().glintMaterials,0);surface.dispose();resources.dispose();
});
test('star glow is depth-tested, noninteractive, nonshadowing and attached to the actual transformed mesh',()=>{
 const {resources,surface,mesh}=setup();surface.apply(mesh,{rarityId:'legendary'});const p=mesh.children[0] as THREE.Points;
 assert.ok(p instanceof THREE.Points);assert.equal(p.parent,mesh);assert.equal(p.geometry.getAttribute('position').count,ITEM_VFX.legendary.glints);
 const mat=p.material as THREE.ShaderMaterial;assert.equal(mat.depthTest,true);assert.equal(mat.depthWrite,false);assert.equal(mat.blending,THREE.AdditiveBlending);assert.equal(p.castShadow,false);assert.equal(p.receiveShadow,false);
 assert.match(mat.fragmentShader,/float star=/);assert.match(mat.fragmentShader,/float halo=/);assert.match(mat.vertexShader,/smoothstep\(-0.03,0.3/);
 const ray=new THREE.Raycaster(),hits:THREE.Intersection[]=[];p.raycast(ray,hits);assert.equal(hits.length,0);
 mesh.position.set(7,2,-3);mesh.rotation.y=.7;mesh.updateMatrixWorld(true);assert.deepEqual(p.matrixWorld.elements,mesh.matrixWorld.elements);surface.dispose();resources.dispose();
});
test('effect release and repeated reattachment preserve base material and bound cached resources',()=>{
 const {resources,surface,mesh,material}=setup();surface.apply(mesh,{rarityId:'epic'});const first=resources.stats();
 for(let i=0;i<100;i++){surface.release(mesh);assert.equal(mesh.children.length,0);assert.equal(mesh.material,material);surface.apply(mesh,{rarityId:'epic'});assert.equal(mesh.children.length,1);}
 assert.deepEqual(resources.stats(),first);assert.equal(surface.stats().activeRoots,1);surface.apply(mesh,{rarityId:'rare'});assert.equal(mesh.children.length,0);assert.equal(mesh.material,material);
 surface.release(mesh);assert.equal(surface.stats().activeRoots,0);surface.dispose();surface.dispose();resources.dispose();assert.equal(resources.stats().extras,0);
});
test('shared app delta drives flow; pause, reduced motion and invalid deltas do not animate',()=>{
 const {resources,surface}=setup();surface.update(.1);surface.update(.1);assert.equal(surface.stats().elapsed,.2);surface.update(0);surface.update(-2);surface.update(NaN);assert.equal(surface.stats().elapsed,.2);
 surface.update(.1,true);const fixed=surface.stats().elapsed;for(let i=0;i<100;i++)surface.update(.1,true);assert.equal(surface.stats().elapsed,fixed);surface.update(.1,false);assert.ok(Math.abs(surface.stats().elapsed-.3)<1e-9);surface.dispose();resources.dispose();
});
test('surface shader keeps original hook and includes broad sheen, local coordinates and a bright core',()=>{
 const {resources,surface,mesh,material}=setup();material.onBeforeCompile=shader=>{shader.uniforms.originalHook={value:17};};surface.apply(mesh,{rarityId:'epic'});
 const shader:any={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <emissivemap_fragment>'};(mesh.material as THREE.Material).onBeforeCompile(shader,{} as any);
 assert.equal(shader.uniforms.originalHook.value,17);assert.match(shader.vertexShader,/vRarityLocal=/);assert.match(shader.fragmentShader,/float sheen=/);assert.match(shader.fragmentShader,/float core=/);assert.match(shader.fragmentShader,/totalEmissiveRadiance/);
 surface.update(.1);assert.equal(shader.uniforms.rarityTime.value,.1);assert.equal(material.emissive.getHex(),0);surface.dispose();resources.dispose();
});
test('unsupported skinned or instanced models do not get a static sparkle substitute',()=>{
 const {resources,surface,mesh}=setup();const skinned=new THREE.SkinnedMesh(mesh.geometry,mesh.material),instanced=new THREE.InstancedMesh(mesh.geometry,mesh.material,2);
 surface.apply(skinned,{rarityId:'epic'});surface.apply(instanced,{rarityId:'legendary'});assert.equal(skinned.children.length,0);assert.equal(instanced.children.length,0);assert.equal(surface.stats().variants,0);surface.dispose();resources.dispose();
});
