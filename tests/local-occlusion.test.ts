import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {OCCLUSION as C} from '../src/content/occlusion.ts';
import {nearOcclusionWeight,volumeWeight,localAmbientAt,floorOccluder,bakeCanopyField} from '../src/world/occlusion.ts';
import type {OcclusionVolume} from '../src/world/occlusion.ts';
import {Resources} from '../src/scene/resources.ts';
import {createAmbientOcclusion} from '../src/scene/lighting/ambient-occlusion.ts';
import {createCabinState} from '../sandbox/cabin-interior/src/domain.ts';
import {cabinOcclusionVolumes} from '../sandbox/cabin-interior/src/scene/occlusion.ts';
const volume:OcclusionVolume={id:'test',center:[0,0,0],halfSize:[2,.2,.5],yaw:0,softness:.5,strength:.4,detail:true};
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('near detail fades continuously without changing broad enclosure',()=>{
 close(nearOcclusionWeight(0),1);close(nearOcclusionWeight(C.nearEnd),0);close(nearOcclusionWeight((C.nearFull+C.nearEnd)/2),.5);
 assert.ok(Math.abs(nearOcclusionWeight(C.nearEnd-.001)-nearOcclusionWeight(C.nearEnd+.001))<.00001);
 close(localAmbientAt([volume],[0,0,0],100),1);close(localAmbientAt([{...volume,detail:false}],[0,0,0],100),.6);
});
test('occlusion follows the rotated footprint and has a smooth exterior falloff',()=>{
 close(volumeWeight(volume,[1.8,0,0]),.4);close(volumeWeight(volume,[0,0,1.8]),0);
 close(volumeWeight({...volume,yaw:Math.PI/2},[0,0,1.8]),.4);
 close(volumeWeight(volume,[2.25,0,0]),.2);close(volumeWeight(volume,[2.5,0,0]),0);
});
test('overlapping regions do not multiply to black; floor minimum is enforced',()=>{
 close(localAmbientAt([volume,volume],[0,0,0]),.6);close(localAmbientAt([{...volume,strength:1}],[0,0,0]),C.minimumAmbient);
});
test('table shade stays below tabletop, feet stay attached under rotation',()=>{
 const v=floorOccluder('table',3,2,4,2,1,1,Math.PI/2,true);
 assert.equal(v.length,5);assert.ok(localAmbientAt(v,[3,2,4])<1);close(localAmbientAt(v,[3,3,4]),1);
 assert.equal(new Set(v.map(x=>x.id)).size,5);
});
test('cabin uses real door gap and has a bounded full furnishing budget',()=>{
 const state=createCabinState('full'),v=cabinOcclusionVolumes(state);
 assert.ok(v.length<=C.maxVolumes);assert.equal(new Set(v.map(x=>x.id)).size,v.length);
 assert.ok(localAmbientAt(v.filter(x=>x.id.includes('wall-root')),[0,.1,3.5])>.999);
 assert.ok(localAmbientAt(v.filter(x=>x.id.includes('wall-root')),[3,.1,3.5])<.8);
});
test('moving/storing a table regenerates its regions, without leaving an old footprint',()=>{
 const state=createCabinState('starter'),table=state.items.find(i=>i.definitionId==='table')!;
 const before=cabinOcclusionVolumes(state).filter(v=>v.id.startsWith(table.instanceId));
 assert.ok(localAmbientAt(before,[-2.65,0,1.75])<1);
 table.location={kind:'floor',x:1,z:1,yaw:Math.PI/2};
 const moved=cabinOcclusionVolumes(state).filter(v=>v.id.startsWith(table.instanceId));
 close(localAmbientAt(moved,[-2.65,0,1.75]),1);assert.ok(localAmbientAt(moved,[1,0,1])<1);
 table.location={kind:'stored'};assert.equal(cabinOcclusionVolumes(state).filter(v=>v.id.startsWith(table.instanceId)).length,0);
});
test('canopy field is deterministic, spatial and clears felled crowns',()=>{
 const bounds={minX:-10,maxX:10,minZ:-10,maxZ:10},seeds=[{x:0,z:0,radius:3,height:8}];
 const a=bakeCanopyField(33,bounds,seeds,()=>22),b=bakeCanopyField(33,bounds,seeds,()=>22);
 assert.deepEqual(a.data,b.data);assert.ok(a.data[(16*33+16)*4]>150);assert.equal(a.data[0],0);
 const clear=bakeCanopyField(33,bounds,[],()=>{throw Error('Ground heights should be reused');},a);
 for(let i=0;i<clear.data.length;i+=4){assert.equal(clear.data[i],0);assert.equal(clear.data[i+1],a.data[i+1]);}
});
test('invalid field inputs fail explicitly; invalid seed does not poison the field',()=>{
 const bounds={minX:0,maxX:1,minZ:0,maxZ:1};assert.throws(()=>bakeCanopyField(0,bounds,[],()=>0));
 const f=bakeCanopyField(2,bounds,[{x:NaN,z:0,radius:1,height:1}],()=>0);assert.equal(f.data[0],0);
});
test('material hook chains, only attenuates indirect light, and preserves emissive/direct code',()=>{
 const r=new Resources(),ao=createAmbientOcclusion(r),m=r.own(new THREE.MeshStandardMaterial());
 let called=0;m.onBeforeCompile=()=>{called++;};m.customProgramCacheKey=()=> 'existing-wood-weather';
 const originalCompile=m.onBeforeCompile,originalKey=m.customProgramCacheKey;
 ao.bindMaterial(m);ao.bindMaterial(m);
 const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms)};
 m.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
 assert.equal(called,1);assert.ok(shader.fragmentShader.includes('reflectedLight.indirectDiffuse*=howAmbient'));
 assert.ok(!shader.fragmentShader.includes('reflectedLight.directDiffuse*=howAmbient'));assert.ok(!shader.fragmentShader.includes('totalEmissiveRadiance*='));
 assert.ok(shader.vertexShader.includes('USE_INSTANCING'));assert.ok(shader.vertexShader.includes('howAOWorld=vec4(transformed,1.)'));
 assert.equal(ao.stats().materials,1);assert.equal(ao.stats().extraRenderPasses,0);assert.ok(m.customProgramCacheKey().startsWith('existing-wood-weather'));
 ao.dispose();assert.equal(m.onBeforeCompile,originalCompile);assert.equal(m.customProgramCacheKey,originalKey);r.dispose();
});
test('volume capacity and inputs fail before uploading invalid uniforms',()=>{
 const r=new Resources(),ao=createAmbientOcclusion(r);
 assert.throws(()=>ao.setVolumes(Array.from({length:C.maxVolumes+1},()=>volume)));
 assert.throws(()=>ao.setVolumes([{...volume,softness:0}]));ao.setVolumes([volume]);ao.setEnabled(false);assert.equal(ao.stats().enabled,false);ao.dispose();r.dispose();
});

test('building attenuation reads real GLB wall/floor parts, ignores later upgrade bounds',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
 const {buildingOcclusionVolumes}=await import('../src/scene/lighting/building-occlusion.ts');
 for(const id of ['cabin','tent'] as const){
   const bytes=await readFile(new URL(`../public/assets/m0/${id}.glb`,import.meta.url));
   const loaded=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
   const placement=new THREE.Group();placement.position.set(10,21.5,8);placement.scale.setScalar(1.6);
   const a=buildingOcclusionVolumes(id,loaded.scene,placement);
   const ghost=new THREE.Mesh(new THREE.BoxGeometry(100,100,100));ghost.position.x=100;ghost.visible=false;placement.add(ghost);
   assert.deepEqual(buildingOcclusionVolumes(id,loaded.scene,placement),a);
   assert.ok(a.find(v=>v.id.endsWith(':enclosure'))!.center[1]>21.5);
   if(id==='cabin'){assert.equal(a.filter(v=>v.id.includes('wall-root')).length,5);assert.ok(a.filter(v=>v.id.includes('wall-root')).every(v=>v.center[1]>22.5));}
   else assert.equal(a.filter(v=>v.id.includes('canvas-root')).length,3);
   placement.rotation.y=Math.PI/2;const rotated=buildingOcclusionVolumes(id,loaded.scene,placement);
   close(rotated[0].yaw,Math.PI/2);
   ghost.geometry.dispose();(ghost.material as THREE.Material).dispose();
   loaded.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
 }
});
