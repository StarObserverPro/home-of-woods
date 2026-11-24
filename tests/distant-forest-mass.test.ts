import test from 'node:test';
import assert from 'node:assert/strict';
import {clusterDistantForest} from '../src/scene/distant-forest-mass.js';
const tree=(x:number,z:number,y=40,kind='oak')=>({x,z,y,kind,width:1.2,height:1.1,angle:0,tone:.5});
test('distant visual patches preserve silhouettes and conserve input anchors',()=>{
 const samples=[
  tree(306,312,40),tree(309,316,44),tree(313,313,41),
  tree(316,320,39),tree(322,312,43),tree(325,319,40),tree(327,311,40),
  tree(162,35,42),tree(380,510,70,'fir')
 ];
 const snapshot=structuredClone(samples);
 const a=clusterDistantForest(samples);
 assert.deepEqual(a,clusterDistantForest(samples));assert.deepEqual(samples,snapshot);
 assert.ok(a.masses.length>0);
 assert.equal(a.singles.length+a.mergedTrees,samples.length);
 assert.ok(a.singles.some(t=>t.x===162)&&a.singles.some(t=>t.x===380));
 assert.ok(a.singles.some(t=>t.y===44));
 for(const mass of a.masses){
  assert.ok(mass.members>=3&&mass.members<=4);
  assert.ok([mass.x,mass.y,mass.z,mass.rx,mass.ry,mass.rz].every(Number.isFinite));
  assert.ok(mass.rx>0&&mass.ry>0&&mass.rz>0);
 }
});
test('unclustered comparison leaves all scenic trees unchanged',()=>{
 const samples=[tree(311,308),tree(312,307),tree(316,310),tree(319,311)];
 const full=clusterDistantForest(samples,{enabled:false});
 assert.equal(full.masses.length,0);
 assert.equal(full.mergedTrees,0);
 assert.deepEqual(full.singles,samples);
});
