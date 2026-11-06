import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Resources} from '../src/scene/resources.ts';
import {createBroomStudy,sampleBroomStudy,BROOM_STUDY_ENVELOPE} from '../src/scene/broom-study.ts';
import type {BroomStudyInput} from '../src/scene/broom-study.ts';

const base:BroomStudyInput={phase:'sweeping',progress:.25,swept:false,signed:false,affixMotion:'off',reducedMotion:false,allowDodge:false};
test('ordinary sweeping remains visible without an affix and reduced motion keeps only the completed cleanup change',()=>{
  assert.notEqual(sampleBroomStudy(base).sweep,0);
  assert.equal(sampleBroomStudy({...base,reducedMotion:true}).sweep,0);
  assert.equal(sampleBroomStudy({...base,reducedMotion:true}).gathered,0);
  assert.equal(sampleBroomStudy({...base,reducedMotion:true,progress:1}).gathered,1);
  assert.equal(sampleBroomStudy({...base,phase:'playful',progress:.5}).yaw,0,'an absent/disabled playful motion never moves the ordinary broom');
  assert.equal(sampleBroomStudy({...base,phase:'playful',progress:.5,affixMotion:'full',allowDodge:false}).x,0,'an unverified clearance disables the dodge translation');
  const simple=sampleBroomStudy({...base,phase:'playful',progress:.5,affixMotion:'simple',allowDodge:true});assert.equal(simple.x,0);assert.ok(simple.yaw>0&&simple.yaw<.5);
});

test('the complete original broom stays within the proposed local sweep/dodge envelope and shares owner resources',()=>{
  const r=new Resources(),broom=createBroomStudy(r),geometry=(broom.tool.getObjectByName('broom-reed-head') as THREE.Mesh).geometry;
  let releases=0;geometry.addEventListener('dispose',()=>releases++);
  for(const phase of ['sweeping','playful'] as const)for(let i=0;i<=40;i++){
    broom.update({...base,phase,progress:i/40,affixMotion:'full',allowDodge:true,signed:true});broom.group.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(broom.tool);
    for(const x of [box.min.x,box.max.x])for(const z of [box.min.z,box.max.z])assert.ok(Math.hypot(x,z)<BROOM_STUDY_ENVELOPE,'domain can conservatively validate a single bounded circle');
  }
  const warmCache=r.stats(),other=createBroomStudy(r);assert.deepEqual(r.stats().geometries,warmCache.geometries);assert.deepEqual(r.stats().materials,warmCache.materials);
  assert.equal(broom.stats().meshes,3);assert.ok(broom.stats().triangles<900);assert.ok(broom.stats().leafTriangles<100);
  broom.dispose();other.dispose();assert.equal(releases,0);r.dispose();r.dispose();assert.equal(releases,1);
});

test('leaf feedback samples caller ground and ends as a visible pile without creating a collectible state',()=>{
  const r=new Resources(),broom=createBroomStudy(r),matrix=new THREE.Matrix4(),position=new THREE.Vector3();
  const input={...base,phase:'idle' as const,progress:1,swept:true,signed:true};const before=structuredClone(input);
  broom.update(input,(x,z)=>x*.1+z*.03);
  for(let i=0;i<12;i++){
    broom.leaves.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
    assert.ok(position.x>.5&&position.x<.8);assert.ok(Math.abs(position.y-(position.x*.1+position.z*.03))<.04);
  }
  assert.deepEqual(input,before);assert.equal(broom.stats().mark,true);broom.dispose();r.dispose();
});
