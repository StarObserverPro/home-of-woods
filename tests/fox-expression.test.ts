import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {foxBlinkAt,createFoxExpression} from '../src/scene/fox-expression.ts';
import {createWildlifePresentation} from '../src/scene/wildlife-presentation.ts';
import {foxInspectionView} from '../src/domain/wildlife.ts';
import {FOX_EXPRESSION as F} from '../src/content/fox-expression.ts';
import {characterModels,parseGeometryFile} from './glb-fixtures.ts';

test('blink timing is bounded, repeatable, and varies between encounters',()=>{
  const values:number[]=[],other:number[]=[],starts:number[]=[];
  for(let n=0;n<2400;n++){
    const t=n/120,a=foxBlinkAt(t,1381),b=foxBlinkAt(t,7361);
    assert.ok(a>=0&&a<=1);assert.equal(a,foxBlinkAt(t,1381));
    if(a>0&&(values.at(-1)??0)===0)starts.push(t);
    values.push(a);other.push(b);
  }
  assert.ok(values.includes(1),'eyes fully close');assert.ok(values.filter(x=>x===0).length>values.length*.9,'eyes stay open most of the time');
  assert.ok(starts.length>=3);assert.notDeepEqual(values,other,'animals do not blink in lockstep');
  for(let i=1;i<starts.length;i++)assert.ok(starts[i]-starts[i-1]>.29&&starts[i]-starts[i-1]<6.1);
});

test('real fox watches the player, keeps the camera out of attention, freezes without quaternion drift, and uses run when fleeing',async()=>{
  const {resources,models}=await characterModels(),a=createWildlifePresentation(resources,models),b=createWildlifePresentation(resources,models);
  const v={...foxInspectionView(),id:'fox-attention',targetRef:{kind:'wildlife' as const,encounterId:'fox-attention'}};
  const cameraA=new THREE.PerspectiveCamera(),cameraB=new THREE.PerspectiveCamera();cameraA.position.set(-31,26,6);cameraB.position.set(-39,30,-8);
  const player=new THREE.Vector3(v.x+1.3,v.y+1.5,v.z+3);
  try {
    for(let n=0;n<=120;n++){a.update([v],n/60,14,cameraA,false,player);cameraB.rotation.y=n/30;b.update([v],n/60,14,cameraB,false,player);}
    const first=a.stats().expressions[0];assert.ok(first.gaze[0]>.1&&first.head[0]>.05&&first.head[1]>0,'eyes/head turn toward the nearby player');
    assert.deepEqual(first,b.stats().expressions[0],'camera movement does not attract the fox');
    const head=a.group.getObjectByName('Head')!,lids=a.group.getObjectByName('Lids')!,pose=head.quaternion.toArray(),lid=lids.position.toArray();
    for(let n=0;n<60;n++)a.update([v],2,14,cameraA,false,player);
    assert.deepEqual(a.stats().expressions[0],first);assert.deepEqual(head.quaternion.toArray(),pose);assert.deepEqual(lids.position.toArray(),lid);
    player.x=v.x-1.3;
    for(let n=1;n<=120;n++)a.update([v],2+n/60,14,cameraA,false,player);
    assert.ok(a.stats().expressions[0].gaze[0]<-.1&&a.stats().expressions[0].head[0]<-.05);
    a.update([{...v,motionTag:'wildlife.move',behavior:'flee',speed:3.2}],4.02,14,cameraA,false,player);
    assert.equal(a.stats().expressions[0].clip,'run');
    a.update([v],4.04,14,cameraA,true,player);assert.deepEqual(a.stats().expressions[0],{id:v.id,clip:'idle',blink:0,gaze:[0,0],head:[0,0],eyeWetness:1});
  }finally{a.dispose();b.dispose();models.clear();resources.dispose();}
});

test('closed lids use the authored rig offset and exact review samples do not accumulate',async()=>{
  const {resources,models}=await characterModels(),p=createWildlifePresentation(resources,models),v=foxInspectionView(),camera=new THREE.PerspectiveCamera();
  try {
    p.update([v],0,14,camera,false,undefined,{seconds:.4,blink:0,gaze:[-1,0],head:[-.25,.1]});
    const lids=p.group.getObjectByName('Lids')!,open=lids.position.clone(),head=p.group.getObjectByName('Head')!;
    p.update([v],0,14,camera,false,undefined,{seconds:.4,blink:1,gaze:[1,0],head:[.25,.1]});
    assert.ok(lids.position.distanceTo(open.clone().add(new THREE.Vector3(...F.lidsClosedDelta)))<1e-9);
    const pose=head.quaternion.toArray();
    for(let n=0;n<10;n++)p.update([v],0,14,camera,false,undefined,{seconds:.4,blink:1,gaze:[1,0],head:[.25,.1]});
    assert.deepEqual(head.quaternion.toArray(),pose);
    p.update([v],0,14,camera,false,undefined,{seconds:.4,blink:0,gaze:[0,0],head:[0,0]});
    assert.ok(lids.position.distanceTo(open)<1e-9);
  }finally{p.dispose();models.clear();resources.dispose();}
});

test('eye uniforms are private, survive recompilation, and preserve the main-game AO shader anchor',async()=>{
  const gltf=await parseGeometryFile('public/assets/wildlife/fox.glb'),root=new THREE.Group();root.add(gltf.scene);
  const a=new THREE.MeshPhysicalMaterial(),b=new THREE.MeshPhysicalMaterial();let previous=0;
  a.onBeforeCompile=()=>{previous++;};
  const x=createFoxExpression(gltf.scene,root,[a],'a'),y=createFoxExpression(gltf.scene,root,[b],'b');
  const compile=(material:THREE.Material)=>{
    const shader={vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader,uniforms:{}};
    material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);return shader;
  };
  try {
    const first=compile(a),second=compile(a),other=compile(b),u=first.uniforms as Record<string,{value:THREE.Vector2}>;
    assert.equal(previous,2);assert.equal(u.howFoxGaze,(second.uniforms as typeof u).howFoxGaze);assert.notEqual(u.howFoxGaze,(other.uniforms as typeof u).howFoxGaze);
    for(const anchor of ['aomap_fragment','lights_fragment_begin','tonemapping_fragment'])
      assert.ok(first.fragmentShader.includes(`#include <${anchor}>`),'shared light, shadow, AO and atmosphere hooks retain their anchors');
    for(const map of ['vMapUv','vRoughnessMapUv','vMetalnessMapUv'])assert.ok(first.fragmentShader.includes(`howFoxEyeUv(${map})`));
    const key=a.customProgramCacheKey();x.beforeAnimation();x.update(foxInspectionView(),0,0,false,undefined,{seconds:0,blink:0,gaze:[1,-1]});
    assert.deepEqual(u.howFoxGaze.value.toArray(),[1,-1]);assert.deepEqual((other.uniforms as typeof u).howFoxGaze.value.toArray(),[0,0]);
    assert.equal(a.customProgramCacheKey(),key,'looking around must not create shader programs');
    const wet=(first.uniforms as unknown as Record<string,{value:number}>).howFoxWetness;
    const otherWet=(other.uniforms as unknown as Record<string,{value:number}>).howFoxWetness;
    assert.ok(a.clearcoat>0&&a.clearcoatRoughness>=.1,'a bounded physical layer is enabled once');
    assert.equal(wet,(second.uniforms as unknown as Record<string,{value:number}>).howFoxWetness);
    assert.notEqual(wet,otherWet);assert.equal(wet.value,1);
    x.beforeAnimation();x.update(foxInspectionView(),0,0,false,undefined,{seconds:0,blink:1});
    assert.equal(wet.value,0,'closed eyelids suppress the entire cornea contribution');
    assert.equal(otherWet.value,1,'blinking one instance does not affect another');
    x.beforeAnimation();x.update(foxInspectionView(),0,0,false,undefined,{seconds:0,blink:.5});
    assert.ok(wet.value>0&&wet.value<1,'the layer fades during closure');
    x.beforeAnimation();x.update(foxInspectionView(),0,0,false,undefined,{seconds:0,blink:0,eyeWetness:0});
    assert.equal(wet.value,0,'the paused A/B control restores the original painted eye');
    x.beforeAnimation();x.update(foxInspectionView(),0,0,true);
    assert.equal(wet.value,1,'leaving review restores ordinary passive reflections even with reduced motion');
    assert.equal(a.customProgramCacheKey(),key,'blink and dry/wet comparison do not compile new programs');
  } finally {x.dispose();y.dispose();a.dispose();b.dispose();gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(o.material as THREE.Material).dispose();}if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});}
});
