import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SHADOW_PROFILES} from '../src/content/shadows.ts';
import {bakeProjectedCanopyField,projectedCanopySlice,sampleProjectedCanopyField,snappedShadowPose} from '../src/world/shadow-field.ts';
import type {ProjectedCanopy,ShadowBounds} from '../src/world/shadow-field.ts';
import {createOutdoorShadows} from '../src/scene/lighting/outdoor-shadows.ts';
import {createAmbientOcclusion} from '../src/scene/lighting/ambient-occlusion.ts';
import {Resources} from '../src/scene/resources.ts';
import type {ShadowBakeRequest,ShadowBakeResponse,ShadowBakeWorker} from '../src/world/shadow-field-worker-protocol.ts';

const bounds:ShadowBounds={min:[-30,-4,-30],max:[30,45,30]};
const crown:ProjectedCanopy={id:'oak',center:[0,12,0],radii:[3,3,3]};
const near=(a:number,b:number,epsilon=1e-8)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
function fixture(){
  const owner=new Resources(),sun=new THREE.DirectionalLight(),renderer={shadowMap:{enabled:false,type:THREE.BasicShadowMap}} as unknown as THREE.WebGLRenderer;
  const shadows=createOutdoorShadows(owner,{renderer,sun,bounds});
  return {owner,sun,renderer,shadows};
}

test('directional crown projection follows the sun and distinguishes receiver height',()=>{
  const field=bakeProjectedCanopyField([crown],bounds,[1,1,0],[96,48,96]);
  assert.ok(sampleProjectedCanopyField(field,[-12,0,0])>.12);
  assert.equal(sampleProjectedCanopyField(field,[12,0,0]),0);
  assert.equal(sampleProjectedCanopyField(field,[-12,20,0]),0);
  const reversed=bakeProjectedCanopyField([crown],bounds,[-1,1,0],[96,48,96]);
  assert.ok(sampleProjectedCanopyField(reversed,[12,0,0])>.12);
  assert.equal(sampleProjectedCanopyField(reversed,[-12,0,0]),0);
});

test('a higher crown has a wider softer footprint and lower central shade',()=>{
  const low=projectedCanopySlice(crown,0,[0,1,0])!;
  const high=projectedCanopySlice({...crown,center:[0,36,0]},0,[0,1,0])!;
  assert.ok(high.softness>low.softness);
  assert.ok(high.extentX>low.extentX&&high.extentZ>low.extentZ);
  assert.ok(high.strength<low.strength);
  // The central opacity approximately conserves the footprint integral as it spreads.
  near(low.strength*low.extentX*low.extentZ,high.strength*high.extentX*high.extentZ);
  assert.equal(projectedCanopySlice(crown,15,[0,1,0]),null);
});

test('world boundary fades, canopy removal clears shade, and overlaps stay bounded',()=>{
  const wide={...crown,radii:[60,3,60] as const};
  const dense=bakeProjectedCanopyField(Array.from({length:12},(_,i)=>({...wide,id:`c${i}`})),bounds,[0,1,0],[64,32,64]);
  assert.equal(sampleProjectedCanopyField(dense,[-30,0,0]),0);
  assert.ok(sampleProjectedCanopyField(dense,[-29.9,0,0])<sampleProjectedCanopyField(dense,[-25,0,0]));
  assert.ok(sampleProjectedCanopyField(dense,[0,0,0])<=SHADOW_PROFILES.outdoor.canopy.maximumShade+1/255);
  const empty=bakeProjectedCanopyField([],bounds,[0,1,0],[32,16,32]);
  assert.equal(sampleProjectedCanopyField(empty,[0,0,0]),0);
  assert.equal(sampleProjectedCanopyField(empty,[31,0,0]),0);
  assert.throws(()=>bakeProjectedCanopyField([crown,crown],bounds,[0,1,0]),/Invalid projected canopy/);
});

test('shadow centre is snapped in light space without altering the illumination direction',()=>{
  const p=snappedShadowPose([0,0,0],[-.5,1,.3]);
  const moved=p.right.map(n=>n*p.texel*.2) as [number,number,number];
  const q=snappedShadowPose(moved,[-.5,1,.3]);
  p.target.forEach((n,i)=>near(n,q.target[i]));
  p.direction.forEach((n,i)=>near(n,q.direction[i]));
  const dot=(a:readonly number[],b:readonly number[])=>a.reduce((s,n,i)=>s+n*b[i],0);
  const any=snappedShadowPose([12.37,8.16,-9.42],[-.5,1,.3]);
  near(dot(any.target,any.right)/any.texel,Math.round(dot(any.target,any.right)/any.texel));
  near(dot(any.target,any.up)/any.texel,Math.round(dot(any.target,any.up)/any.texel));
});

test('direct canopy hook composes with AO and leaves local lights and indirect lighting separate',()=>{
  const {owner,renderer,shadows}=fixture(),material=new THREE.MeshStandardMaterial();
  const original=material.onBeforeCompile;let previousCalls=0;
  material.onBeforeCompile=function(){previousCalls++;};const before=material.onBeforeCompile;
  shadows.bindMaterial(material);const directHook=material.onBeforeCompile;
  const ao=createAmbientOcclusion(owner);ao.bindMaterial(material);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader} as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader,renderer);
  assert.equal(previousCalls,1);
  assert.equal(shader.fragmentShader.match(/directLight\.color \*= howPrimaryCrownTransmission/g)?.length,1);
  assert.match(shader.fragmentShader,/#if UNROLLED_LOOP_INDEX == 0/);
  assert.match(shader.fragmentShader,/reflectedLight\.indirectDiffuse\*=howAmbient/);
  assert.match(shader.fragmentShader,/getPointLightInfo/);
  assert.match(shader.vertexShader,/instanceMatrix\*howCrownWorld/);
  ao.dispose();assert.equal(material.onBeforeCompile,directHook);
  shadows.dispose();assert.equal(material.onBeforeCompile,before);
  material.onBeforeCompile=original;material.dispose();owner.dispose();
});

test('solid depth uses dedicated geometry identity, shares material, and releases streamed meshes',()=>{
  const {owner,renderer,shadows}=fixture(),scene=new THREE.Scene();
  const geometry=new THREE.BoxGeometry();geometry.setAttribute('shadowSolidWeight',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1),1));
  const material=new THREE.MeshStandardMaterial(),a=new THREE.Mesh(geometry,material),b=new THREE.Mesh(geometry,material);
  scene.add(a,b);shadows.bind(scene);shadows.configureTreeDepth(a,'solid-weight');shadows.configureTreeDepth(b,'solid-weight');
  assert.equal(a.customDepthMaterial,b.customDepthMaterial);assert.equal(shadows.stats().depthMaterials,1);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader} as Parameters<THREE.Material['onBeforeCompile']>[0];
  a.customDepthMaterial!.onBeforeCompile(shader,renderer);
  assert.match(shader.vertexShader,/attribute float shadowSolidWeight/);
  assert.match(shader.fragmentShader,/if\(vHowSolidWeight<.5\)discard/);
  assert.doesNotMatch(shader.vertexShader,/barkWeight/);
  scene.remove(a);shadows.update({focus:[0,0,0],sunDirection:[0,1,0],dt:0});
  assert.equal(shadows.stats().treeDepthBindings,1);assert.equal(a.customDepthMaterial,undefined);
  shadows.dispose();shadows.dispose();assert.equal(b.customDepthMaterial,undefined);assert.equal(owner.stats().extras,0);
  material.dispose();geometry.dispose();owner.dispose();
});

test('cached field and solid map commit the same sun direction and geometry invalidates immediately',()=>{
  const {owner,sun,shadows}=fixture();shadows.setCanopies([crown]);
  shadows.update({focus:[0,0,0],sunDirection:[0,1,0],dt:0});const count=shadows.stats().bakes;
  shadows.update({focus:[1,0,1],sunDirection:[.001,1,0],dt:0});
  assert.equal(shadows.stats().bakes,count);
  const committed=new THREE.Vector3().subVectors(sun.position,sun.target.position).normalize();near(committed.x,0);
  shadows.setCanopies([]);shadows.update({focus:[1,0,1],sunDirection:[.001,1,0],dt:0});
  assert.equal(shadows.stats().sourceCount,0);assert.equal(shadows.stats().bakes,count+1);
  assert.equal(shadows.stats().fieldBytes,192*48*192*2);
  shadows.dispose();owner.dispose();
});

test('worker queue keeps only latest geometry, commits on update, and terminates without late writes',()=>{
  const owner=new Resources(),sun=new THREE.DirectionalLight(),renderer={shadowMap:{enabled:false,type:THREE.BasicShadowMap}} as unknown as THREE.WebGLRenderer;
  const requests:ShadowBakeRequest[]=[];let terminated=false;
  const worker:ShadowBakeWorker={onmessage:null,onerror:null,postMessage:r=>requests.push(r),terminate:()=>{terminated=true;}};
  const shadows=createOutdoorShadows(owner,{renderer,sun,bounds,workerFactory:()=>worker});
  shadows.setCanopies([crown]);shadows.update({focus:[0,0,0],sunDirection:[0,1,0],dt:0});
  shadows.update({focus:[0,0,0],sunDirection:[.2,1,0],dt:.4});
  assert.equal(requests.length,1);assert.equal(shadows.stats().inflight,1);
  shadows.setCanopies([{...crown,id:'second'}]);shadows.update({focus:[0,0,0],sunDirection:[.2,1,0],dt:.01});
  shadows.setCanopies([{...crown,id:'latest'},{...crown,id:'latest-other',center:[9,12,0]}]);shadows.update({focus:[0,0,0],sunDirection:[.2,1,0],dt:.01});
  assert.equal(requests.length,1);assert.equal(shadows.stats().pending,1);
  const reply=(r:ShadowBakeRequest)=>({id:r.id,revision:r.revision,field:bakeProjectedCanopyField(r.canopies,r.bounds,r.direction),elapsedMs:12} satisfies ShadowBakeResponse);
  worker.onmessage!({data:reply(requests[0])} as MessageEvent<ShadowBakeResponse>);
  assert.equal(requests.length,2);assert.equal(requests[1].canopies.length,2);assert.equal(shadows.stats().discarded,1);
  worker.onmessage!({data:reply(requests[1])} as MessageEvent<ShadowBakeResponse>);
  assert.equal(shadows.stats().ready,true);assert.equal(shadows.stats().sourceCount,1);
  shadows.update({focus:[0,0,0],sunDirection:[.2,1,0],dt:0});
  assert.equal(shadows.stats().sourceCount,2);assert.equal(shadows.stats().committedRevision,3);assert.equal(shadows.stats().bakes,2);
  const committed=new THREE.Vector3().subVectors(sun.position,sun.target.position).normalize();near(committed.x,.2/Math.hypot(.2,1));
  const staleHandler=worker.onmessage!,stale=reply(requests[1]);shadows.dispose();
  staleHandler({data:stale} as MessageEvent<ShadowBakeResponse>);
  assert.equal(terminated,true);assert.equal(worker.onmessage,null);assert.equal(worker.onerror,null);assert.equal(shadows.stats().bakes,2);assert.equal(owner.stats().extras,0);owner.dispose();
});

test('worker-less solar fallback caches coherently for eight seconds instead of baking each frame',()=>{
  const {owner,sun,shadows}=fixture();shadows.setCanopies([crown]);
  shadows.update({focus:[0,0,0],sunDirection:[0,1,0],dt:0});
  for(let i=0;i<70;i++)shadows.update({focus:[0,0,0],sunDirection:[.1,1,0],dt:.1});
  assert.equal(shadows.stats().bakes,1);near(new THREE.Vector3().subVectors(sun.position,sun.target.position).normalize().x,0);
  shadows.update({focus:[0,0,0],sunDirection:[.1,1,0],dt:1.1});assert.equal(shadows.stats().bakes,2);
  shadows.dispose();owner.dispose();
});
