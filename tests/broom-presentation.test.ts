import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {characterModels} from './glb-fixtures.ts';
import {createStarterState} from '../src/domain/state.ts';
import {createCharacters} from '../src/scene/characters.ts';
import {createBroomPresentation} from '../src/scene/broom-presentation.ts';
import {BROOM,CAMP_LEAF_PATCHES} from '../src/content/broom.ts';
import {useBroom} from '../src/domain/broom.ts';
import {posedMeshes} from './seated-geometry.ts';

async function fixture(willful=false){
  const {resources,models}=await characterModels(),state=createStarterState([]),actors=createCharacters(resources,models,[],new Map()),view=createBroomPresentation(resources,actors.player),patch=CAMP_LEAF_PATCHES[1];
  state.inventory.instances!.push({instanceId:'real-broom',definitionId:BROOM.definitionId,blueprintId:BROOM.blueprintId,createdAt:0,location:{kind:'inventory'},rarityId:'common',traits:[{id:BROOM.markTraitId,value:1,markId:'leaf',category:'utility'},...(willful?[{id:BROOM.willfulTraitId,value:1,category:'interaction'}]:[])]});
  state.player={...patch.stand,moving:false};actors.update(state,true,0);view.update(state,0,true);
  const beforeUse=structuredClone(state),result=useBroom(state,'real-broom',patch.id,[]);assert.equal(result.ok,true);if(!result.event)throw Error('Expected a real committed use event');
  return {resources,state,actors,view,event:result.event,beforeUse};
}
test('ordinary sweep is held by the real actor for its complete action and does not intersect the torso or head',async()=>{
  const {resources,state,actors,view,event}=await fixture(),body=actors.player.children[0];assert.equal(view.isPlaying(),false,'saved leaf state cannot launch an autonomous ordinary broom');
  assert.equal(view.present(event),true);const before=structuredClone(state);let sawStroke=false;
  for(let frame=0;frame<35;frame++){
    view.restorePose();actors.update(state,false,frame*.1);view.update(state,.1,false);actors.player.updateMatrixWorld(true);view.group.updateMatrixWorld(true);
    sawStroke||=Math.abs(view.held.joint.rotation.z)>.01;
    for(const [side,anchor] of [['l',view.held.upperGrip],['r',view.held.lowerGrip]] as const){
      const socket=body.getObjectByName('handslot'+side)!.getWorldPosition(new THREE.Vector3()),target=anchor.getWorldPosition(new THREE.Vector3());
      assert.ok(socket.distanceTo(target)<.11,`actual hand misses ${side} broom grip by ${socket.distanceTo(target)}m`);
    }
    const start=view.held.joint.localToWorld(new THREE.Vector3(0,.13,0)),end=view.held.joint.localToWorld(new THREE.Vector3(0,1.51,0)),direction=end.clone().sub(start),length=direction.length();
    for(const mesh of posedMeshes(body))if(mesh.mesh instanceof THREE.SkinnedMesh)mesh.mesh.computeBoundingSphere();
    const ray=new THREE.Raycaster(start,direction.normalize(),.001,length-.001);
    const forbidden=ray.intersectObject(body,true).filter(hit=>{
      for(let p:THREE.Object3D|null=hit.object;p;p=p.parent)if(!p.visible)return false;
      if(!(hit.object instanceof THREE.SkinnedMesh)||!hit.face)return /pack|scarf/.test(hit.object.parent?.name??'');
      const skin=hit.object.geometry.getAttribute('skinIndex'),weights=hit.object.geometry.getAttribute('skinWeight');let axis=0;for(let index=1;index<4;index++)if(weights.getComponent(hit.face.a,index)>weights.getComponent(hit.face.a,axis))axis=index;
      return /^(hips|spine|chest|head|upperarm|upperleg|lowerleg|foot|toes)/.test(hit.object.skeleton.bones[skin.getComponent(hit.face.a,axis)].name);
    });
    assert.equal(forbidden.length,0,'the actual handle segment never passes through the posed torso, head, upper arm or legs');
  }
  assert.equal(sawStroke,true);assert.equal(view.held.mark.visible,true);assert.deepEqual(state,before,'presentation never repeats the leaf/instance transaction');
  view.restorePose();actors.update(state,false,3.6);view.update(state,.1,false);assert.equal(view.isPlaying(),false);assert.equal(view.held.group.visible,false);
  assert.equal(view.present(event),false,'a duplicate receipt cannot replay the scene action');view.dispose();actors.dispose();resources.dispose();
});

test('willful motion is separate from rarity, needs its real trait, and movement cancels without touching the committed leaves',async()=>{
  const {resources,state,actors,view,event}=await fixture(true);assert.equal(event.kind,'willful');view.setRarityVfxMode('off');view.setWhimsyMode('full');view.present(event);
  for(let frame=0;frame<29;frame++){view.restorePose();actors.update(state,false,frame*.1);view.update(state,.1,false);}
  assert.ok(Math.abs(view.held.tool.rotation.y)>.1,'an actual willful broom briefly turns after the ordinary sweep');
  const before=structuredClone(state);state.player.moving=true;view.restorePose();actors.update(state,false,3);view.update(state,.1,false);assert.equal(view.isPlaying(),false);state.player.moving=false;
  assert.deepEqual(state,before,'leaving only cancels the presentation; the existing committed leaf pile remains');
  view.dispose();actors.dispose();resources.dispose();
});

test('full/simple/off and reduced motion preserve ordinary cleanup while world place/pack reuse the same shared geometry',async()=>{
  const {resources,state,actors,view,event}=await fixture(true);view.setWhimsyMode('off');view.present(event);
  for(let frame=0;frame<29;frame++){view.restorePose();actors.update(state,false,frame*.1);view.update(state,.1,false);}
  assert.equal(view.held.tool.rotation.y,0);assert.ok(Math.abs(view.held.joint.rotation.z)>.01,'turning off whimsy retains ordinary sweeping');view.cancel();
  view.setWhimsyMode('simple');view.present({...event,useId:event.useId+'-simple'});
  for(let frame=0;frame<29;frame++){view.restorePose();actors.update(state,false,frame*.1);view.update(state,.1,false);}
  assert.ok(view.held.tool.rotation.y>0&&view.held.tool.rotation.y<=.35,'simple keeps only the small in-place turn');assert.ok(Math.abs(view.held.tool.position.x)<1e-7,'simple never dodges laterally');view.cancel();
  view.setWhimsyMode('full');view.present({...event,useId:event.useId+'-reduced'});
  for(let frame=0;frame<29;frame++){view.restorePose();actors.update(state,true,0);view.update(state,.1,true);}
  assert.equal(view.held.tool.rotation.y,0);assert.equal(view.held.joint.rotation.z,0);assert.equal(view.held.group.visible,true,'reduced motion retains the actor-held ordinary tool');view.cancel();
  const item=state.inventory.instances!.find(item=>item.instanceId==='real-broom')!;
  item.location={kind:'world',x:-23,z:11,rotation:.7};view.update(state,0,true);const warm=resources.stats();assert.equal(view.stats().placed,1);
  for(let cycle=0;cycle<3;cycle++){item.location={kind:'inventory'};view.update(state,0,true);item.location={kind:'world',x:-23,z:11,rotation:.7};view.update(state,0,true);assert.deepEqual(resources.stats(),warm);}
  assert.equal(view.stats().patches,3);view.dispose();actors.dispose();resources.dispose();
});

test('world replacement allows a genuinely repeated sweep sequence without replaying cancelled receipts',async()=>{
  const {resources,state,actors,view,event,beforeUse}=await fixture();assert.equal(view.present(event),true);view.cancel();
  assert.equal(view.present(event),false,'moving away never clears the receipt guard');
  Object.assign(state,structuredClone(beforeUse));const next=useBroom(state,'real-broom',event.patchId,[]);assert.equal(next.ok,true);assert.ok(next.event);assert.equal(next.event.useId,event.useId);
  view.resetPresentationHistory();view.update(state,0,false);assert.equal(view.isPlaying(),false);assert.equal(view.held.group.visible,false,'replacement alone cannot animate a broom');
  assert.equal(view.present(next.event),true);actors.update(state,false,0);view.update(state,0,false);assert.equal(view.held.group.visible,true);
  assert.equal(view.present(next.event),false,'the new world still rejects duplicate use receipts');
  view.dispose();actors.dispose();resources.dispose();
});
