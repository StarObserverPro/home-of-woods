import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {loadModel} from './load-model.js';import {createTree,clipAbove} from '../src/tree.js';import {createActor} from '../src/actor.js';
const assets={};for(const name of ['pine','broadleaf','player','motions'])assets[name]=await loadModel(name);
const worldPosition=o=>o.getWorldPosition(new T.Vector3());
test('both species: fixed stump, separated falling body, ground-safe landing on flat and slope',()=>{
  for(const kind of ['pine','broadleaf'])for(const slope of [0,.12]){
    const tree=createTree(assets[kind].scene,kind);tree.setSlope(slope);const fixed=tree.root.children[0];fixed.updateMatrixWorld(true);const original=fixed.matrixWorld.clone();
    for(let t=0;t<=7;t+=.1){tree.update(t,'fell',false,false);tree.root.updateMatrixWorld(true);assert.deepEqual(fixed.matrixWorld.elements,original.elements);assert.ok(tree.upper.position.toArray().every(Number.isFinite));
      if(t>=4.15){let min=Infinity;tree.upper.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);min=Math.min(min,v.y-slope*v.x);}}});assert.ok(min>=-.025,`${kind}/${slope}/${t}: penetration ${min}`);}
    }
    const cutCenter=new T.Vector3(0,.88,0).applyMatrix4(tree.upper.matrixWorld);
    assert.ok(cutCenter.x>tree.radius*1.5,'cut end must separate from the stump');tree.dispose();
  }
});
test('replay and scrubbing restore exact geometry; source canopy is not deformed',()=>{
  const source=assets.broadleaf.scene;const sourceMesh=[];source.traverse(o=>{if(o.isMesh)sourceMesh.push([o,o.geometry.attributes.position.array.slice()]);});
  const tree=createTree(source,'broadleaf');tree.update(0,'fell',false,false);const before=tree.upper.children[0].children[0].geometry.attributes.position.array.slice();
  tree.update(5,'fell',false,false);tree.update(0,'fell',false,false);assert.deepEqual(tree.upper.children[0].children[0].geometry.attributes.position.array,before);
  for(const [o,p]of sourceMesh)assert.deepEqual(o.geometry.attributes.position.array,p);tree.dispose();
});
test('clipped upper trunk contains no geometry below the replacement seam',()=>{const g=new T.CylinderGeometry(.3,.5,3,10);g.translate(0,1.5,0);const cut=clipAbove(g,1.65);for(let i=0;i<cut.attributes.position.count;i++)assert.ok(cut.attributes.position.getY(i)>=1.65-1e-6);cut.dispose();g.dispose();});
test('tree disposal releases local geometry and preserves shared source geometry',()=>{
  const source=assets.broadleaf.scene,shared=new Set();source.traverse(o=>{if(o.isMesh)shared.add(o.geometry);});
  let sharedDisposed=0;const onShared=()=>sharedDisposed++;shared.forEach(g=>g.addEventListener('dispose',onShared));
  const tree=createTree(source,'broadleaf'),local=new Set();tree.root.traverse(o=>{if(o.geometry&&!shared.has(o.geometry))local.add(o.geometry);});
  let localDisposed=0;local.forEach(g=>g.addEventListener('dispose',()=>localDisposed++));tree.dispose();assert.equal(localDisposed,local.size);assert.equal(sharedDisposed,0);shared.forEach(g=>g.removeEventListener('dispose',onShared));
});
test('actor: finite repeatable poses, grounded crouch feet and joined prayer hands',()=>{
  const actor=createActor(assets.player.scene,assets.motions.animations);
  actor.update('gather',0);const foot=worldPosition(actor.bones.footl);
  actor.update('gather',1.5);assert.ok(worldPosition(actor.bones.footl).distanceTo(foot)<.08,'crouch foot drift');
  actor.update('pray',2);assert.ok(worldPosition(actor.bones.handslotl).distanceTo(worldPosition(actor.bones.handslotr))<.15,'prayer hands not together');
  const first=worldPosition(actor.bones.handslotl);actor.update('climb',4);actor.update('fell',4);actor.update('pray',2);assert.ok(worldPosition(actor.bones.handslotl).distanceTo(first)<1e-6);
  actor.update('fell',1.49,{radius:.5});
  for(const [side,y]of [['r',.03],['l',.25]]){const grip=new T.Vector3(0,y,0).applyMatrix4(actor.axe.matrixWorld);assert.ok(grip.distanceTo(worldPosition(actor.bones['handslot'+side]))<.08,'hands must hold the axe');}
  assert.ok(Math.abs(new T.Vector3(.25,.61,0).applyMatrix4(actor.axe.matrixWorld).y-.91)<.001,'blade meets cut height');
  for(const a of ['fell','climb','gather','pray','pickup'])for(let t=0;t<=7;t+=.25){actor.update(a,t);for(const b of Object.values(actor.bones))assert.ok([...b.position,...b.quaternion].every(Number.isFinite));}
  actor.dispose();
});

test('medium trees: all four directions land on the fixed world slope',()=>{
 for(const kind of ['pine','broadleaf'])for(const direction of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  const tree=createTree(assets[kind].scene,kind),rig=new T.Group();rig.add(tree.root);rig.rotation.y=direction;tree.setSlope(.12*Math.cos(direction),.12*Math.sin(direction));
  assert.ok(tree.radius*2<=.56);for(const t of [4.15,4.25,4.5,5,7]){rig.updateMatrixWorld(true);tree.update(t,'fell',false,false);rig.updateMatrixWorld(true);let min=Infinity;tree.upper.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);min=Math.min(min,v.y-.12*v.x);}}});assert.ok(min>=-.025,`${kind}/${direction}/${t}: ${min}`);}tree.dispose();
 }
});

test('pickup reaches ground then lifts, and seeking restores the contact pose',()=>{
 const actor=createActor(assets.player.scene,assets.motions.animations);actor.update('pickup',1.15);const low=worldPosition(actor.bones.handslotr);assert.ok(low.y<.3,'pickup hand must reach low');actor.update('pickup',2.5);assert.ok(worldPosition(actor.bones.handslotr).y>low.y+.5);actor.update('pickup',1.15);assert.ok(worldPosition(actor.bones.handslotr).distanceTo(low)<1e-6);actor.dispose();
});
