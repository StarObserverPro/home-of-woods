import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ITEM_VFX,ITEM_VFX_LIGHT,RARITY_VFX_MODES,isRarityVfxMode} from '../src/content/item-vfx.ts';
import {Resources} from '../src/scene/resources.ts';
import {createItemSurface} from '../src/scene/item-surface.ts';
import {createEmblemGeometry} from '../src/scene/item-emblem.ts';
import {readRarityVfxPreference,writeRarityVfxPreference,RARITY_VFX_PREFERENCE_KEY} from '../src/app/display-preferences.ts';

function setup(){const resources=new Resources(),surface=createItemSurface(resources);const geometry=resources.geometry('seat',()=>new THREE.CylinderGeometry(.52,.6,.7,9));const material=resources.material('#855739');const mesh=new THREE.Mesh(geometry,material);return{resources,surface,mesh,material};}
const compile=(m:THREE.MeshStandardMaterial)=>{const s:any={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <emissivemap_fragment>'};m.onBeforeCompile(s,{} as any);return s;};
test('epic R2 parameters and night cap are unchanged; only legendary brightness falls',()=>{
 assert.deepEqual(ITEM_VFX.epic,{tint:'#b34dff',veil:.12,sheen:.90,core:1.35,rim:.27,glints:9,minPixels:12,maxPixels:52,diameter:.46});
 assert.deepEqual(ITEM_VFX_LIGHT.epic,{day:1,night:.86});
 assert.ok(ITEM_VFX_LIGHT.legendary.day<1&&ITEM_VFX_LIGHT.legendary.day>.7);
 assert.ok(ITEM_VFX_LIGHT.legendary.night<.86&&ITEM_VFX_LIGHT.legendary.night<ITEM_VFX_LIGHT.legendary.day);
 const {resources,surface,mesh}=setup();
 for(const id of ['epic','legendary'] as const){surface.apply(mesh,{rarityId:id});const shader=compile(mesh.material);const glint=mesh.children[0] as THREE.Points<THREE.BufferGeometry,THREE.ShaderMaterial>;assert.deepEqual(shader.uniforms.rarityLightScale.value.toArray(),[ITEM_VFX_LIGHT[id].day,ITEM_VFX_LIGHT[id].night]);assert.deepEqual(glint.material.uniforms.uLight.value.toArray(),shader.uniforms.rarityLightScale.value.toArray());}
 surface.dispose();resources.dispose();
});
test('simple restores base materials and attaches exactly one nonanimated decal per multi-mesh item',()=>{
 const {resources,surface,mesh,material}=setup();const root=new THREE.Group();root.add(mesh);const other=new THREE.Mesh(resources.geometry('small',()=>new THREE.BoxGeometry(.1,.1,.1)),material);root.add(other);
 surface.apply(root,{rarityId:'legendary'});assert.equal(surface.stats().glintDraws,2);
 surface.setMode('simple');assert.equal(surface.stats().glintDraws,0);assert.equal(surface.stats().emblemDraws,1);assert.equal(mesh.material,material);assert.equal(other.material,material);
 const decal=mesh.children[0] as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;assert.match(decal.name,/rarity-emblem/);assert.ok(decal.isMesh);assert.equal(decal.material.depthTest,true);assert.equal(decal.material.depthWrite,false);assert.equal(decal.material.blending,THREE.NormalBlending);assert.ok(decal.material.polygonOffset);assert.equal(decal.castShadow,false);assert.ok(!('uTime' in decal.material.uniforms));
 const vertices=Array.from(decal.geometry.getAttribute('position').array);const quaternion=decal.quaternion.clone();for(let i=0;i<100;i++)surface.update(.1);assert.deepEqual(Array.from(decal.geometry.getAttribute('position').array),vertices);assert.deepEqual(decal.quaternion.toArray(),quaternion.toArray());
 const point=decal.getWorldPosition(new THREE.Vector3());root.position.x=4;root.rotation.z=.3;root.updateMatrixWorld(true);assert.equal(decal.getWorldPosition(new THREE.Vector3()).x,point.x+4);
 surface.release(root);assert.equal(mesh.children.length,0);assert.equal(surface.stats().emblemDraws,0);surface.dispose();resources.dispose();
});
test('simple geometry is clipped to the actual top surface, with no billboard offset',()=>{
 const source=new THREE.CylinderGeometry(.52,.6,.7,9),decal=createEmblemGeometry(source),p=decal.getAttribute('position');assert.ok(p.count>0);
 for(let i=0;i<p.count;i++){assert.ok(Math.abs(p.getY(i)-.35)<1e-5);assert.ok(Math.hypot(p.getX(i),p.getZ(i))<.53);}
 source.dispose();decal.dispose();
});
test('full/simple/off can switch 100 times without accumulating effects, resources or item mutations',()=>{
 const {resources,surface,mesh,material}=setup();const item={rarityId:'legendary',future:{keep:true}},before=structuredClone(item);
 surface.apply(mesh,item);for(const mode of RARITY_VFX_MODES)surface.setMode(mode);const counts=resources.stats();
 for(let i=0;i<100;i++){for(const mode of RARITY_VFX_MODES){surface.setMode(mode);surface.apply(mesh,item);surface.update(.1);assert.equal(surface.stats().mode,mode);if(mode==='off'){assert.equal(mesh.material,material);assert.equal(mesh.children.length,0);}if(mode==='simple')assert.equal(mesh.children.length,1);}}
 assert.deepEqual(resources.stats(),counts);assert.deepEqual(item,before);assert.equal(surface.stats().glintDraws,0);assert.equal(surface.stats().emblemDraws,0);surface.dispose();resources.dispose();assert.equal(resources.stats().extras,0);
});
test('off and simple can be selected before model creation, survive pack/re-add and do not advance effect time',()=>{
 for(const mode of ['simple','off'] as const){const {resources,surface,mesh,material}=setup();surface.setMode(mode);surface.apply(mesh,{rarityId:'epic'});surface.update(1,false,1);assert.equal(surface.stats().elapsed,0);surface.release(mesh);surface.apply(mesh,{rarityId:'epic'});assert.equal(mesh.material,material);assert.equal(surface.stats().emblemDraws,mode==='simple'?1:0);surface.setMode('full');surface.update(.1);assert.equal(surface.stats().elapsed,.1);surface.dispose();resources.dispose();}
});
test('ordinary grades and unsupported animated/instanced meshes never acquire a static star',()=>{
 const {resources,surface,mesh,material}=setup();surface.setMode('simple');for(const id of ['common','uncommon','rare','unknown']){surface.apply(mesh,{rarityId:id});assert.equal(mesh.children.length,0);assert.equal(mesh.material,material);}
 for(const special of [new THREE.SkinnedMesh(mesh.geometry,material),new THREE.InstancedMesh(mesh.geometry,material,1)]){surface.apply(special,{rarityId:'legendary'});assert.equal(special.children.length,0);assert.equal(special.material,material);}
 assert.equal(surface.stats().emblemMaterials,0);surface.dispose();resources.dispose();
});
test('display modes persist separately from world data and invalid preferences fall back to full',()=>{
 const values=new Map<string,string>([['world','keep']]);const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 assert.equal(readRarityVfxPreference(store),'full');
 for(const mode of RARITY_VFX_MODES){assert.ok(writeRarityVfxPreference(mode,store));assert.equal(readRarityVfxPreference(store),mode);}
 for(const raw of ['unknown','null','1','{}']){values.set(RARITY_VFX_PREFERENCE_KEY,raw);assert.equal(readRarityVfxPreference(store),'full');}
 assert.equal(values.get('world'),'keep');assert.equal(isRarityVfxMode('other'),false);assert.equal(writeRarityVfxPreference('other' as any,store),false);
});
test('denied browser storage does not prevent the current display setting from being used',()=>{
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
 assert.equal(readRarityVfxPreference(denied),'full');assert.equal(writeRarityVfxPreference('simple',denied),false);assert.equal(readRarityVfxPreference(null),'full');assert.equal(writeRarityVfxPreference('off',null),false);
});
