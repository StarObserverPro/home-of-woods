import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createState} from '../src/domain/state.ts';
import {createGeometrySpec,assemblyGuides} from '../src/domain/parametric-crafting.ts';
import {Resources} from '../src/scene/resources.ts';
import {createWorkshopAssemblyPresentation} from '../src/scene/workshop-assembly-presentation.ts';

function assemblyState(){
  const state=createState([]),geometry=createGeometrySpec('bench.supported',{length:2,width:.7,height:.8,seatThickness:.15,supportCount:2,supportInset:.2});
  state.workshop.job={id:'workshop-test',kind:'craft',blueprintId:'blueprint.bench-guided',phase:'working',startedAt:0,durationSeconds:3,
    assembly:{phase:'preparing',geometry,placements:[],activePartId:null,activePose:null}};
  return state;
}

test('workbench improvement has real braces and active trial parts move against fixed guides without settling state',()=>{
  const r=new Resources(),workbench=new THREE.Group(),presentation=createWorkshopAssemblyPresentation(r,workbench),state=assemblyState();
  presentation.update(state);assert.equal(presentation.stats().active,true);assert.equal(presentation.stats().braced,false);assert.equal(presentation.stats().parts,3);assert.equal(presentation.stats().guides,0);
  state.workshop.upgrades['camp-workbench:bracing']={level:1,spent:[]} as typeof state.workshop.upgrades[string];
  const assembly=state.workshop.job!.assembly!,guide=assemblyGuides(assembly.geometry).find(guide=>guide.id==='support-0')!;
  assembly.phase='fitting';assembly.activePartId=guide.id;assembly.activePose={id:guide.id,...guide.target,x:guide.target.x+.5,angle:.55};
  const before=structuredClone(state);presentation.update(state);
  assert.equal(presentation.stats().braced,true);assert.equal(presentation.bracing.children.length,2);assert.equal(presentation.stats().guides,3);
  const part=presentation.group.getObjectByName('assembly-part:support-0')!,target=presentation.group.getObjectByName('assembly-guide:support-0')!;
  assert.ok(Math.abs(part.position.x-target.position.x-.5)<1e-8);assert.equal(part.rotation.y,.55);assert.deepEqual(state,before);
  assembly.activePose={id:guide.id,...guide.target};presentation.update(state,true);
  assert.deepEqual(part.position.toArray(),[guide.target.x,guide.target.y,guide.target.z]);assert.equal(part.rotation.y,0);
  assert.equal(presentation.group.getObjectByName('active-part-to-guide')!.visible,false,'reduced motion retains static part and guide feedback');
  assembly.placements=[{id:guide.id,...guide.target}];assembly.activePartId='support-1';assembly.activePose=null;presentation.update(state);
  assert.deepEqual(part.position.toArray(),[guide.target.x,guide.target.y,guide.target.z]);
  assembly.phase='finishing';assembly.activePartId=null;presentation.update(state);assert.equal(presentation.stats().guides,0);
  presentation.dispose();assert.equal(workbench.children.length,0);r.dispose();
});

test('cancel and restart clear every temporary part without growing cached geometry or releasing the owner early',()=>{
  const r=new Resources(),workbench=new THREE.Group(),presentation=createWorkshopAssemblyPresentation(r,workbench),state=assemblyState();
  presentation.update(state);const job=structuredClone(state.workshop.job),warmCache=r.stats(),part=presentation.group.getObjectByName('assembly-part:surface') as THREE.Mesh;
  let released=0;part.geometry.addEventListener('dispose',()=>released++);
  for(let cycle=0;cycle<3;cycle++){
    state.workshop.job=null;presentation.update(state);assert.equal(presentation.stats().active,false);assert.equal(presentation.stats().parts,0);assert.equal(presentation.group.getObjectByName('assembly-part:surface'),undefined);
    state.workshop.job=structuredClone(job);presentation.update(state);assert.equal(presentation.stats().parts,3);assert.deepEqual(r.stats(),warmCache);
  }
  presentation.dispose();presentation.dispose();assert.equal(workbench.children.length,0);assert.equal(released,0);r.dispose();r.dispose();assert.equal(released,1);
});
