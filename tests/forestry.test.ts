import test from 'node:test';
import assert from 'node:assert/strict';
import {FORESTRY} from '../src/content/forestry.ts';
import {createState} from '../src/domain/state.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import {startChop,cancelChop,advanceForestry,forestrySnapshot,volumePoints,forestryColliders} from '../src/domain/forestry.ts';
const trees=makeTrees(),byId=new Map(trees.map(t=>[t.id,t])),tree=trees.find(t=>t.role==='managed')!;
function nearState(){const state=createState(trees);state.player.x=tree.x+1.7;state.player.z=tree.z;state.selected=tree.id;return state;}
test('protected landmarks, remote trees and exhausted annual points cannot be felled',()=>{
  const s=nearState(),giant=trees.find(t=>t.role==='landmark')!;
  assert.equal(startChop(s,giant).ok,false);assert.equal(s.forestry.wood,0);assert.equal(s.forestry.ledger.reserved,0);
  s.player.x+=20;assert.equal(startChop(s,tree).ok,false);s.player.x-=20;
  s.forestry.ledger.used=FORESTRY.basePoints;assert.equal(startChop(s,tree).ok,false);assert.equal(s.forestry.active,null);
  s.selected=giant.id;const snapshot=forestrySnapshot(s,byId);assert.equal(snapshot.selectedTree?.canChop,false);assert.match(snapshot.selectedTree?.reason??'',/保护/);
});
test('four-hit action reserves once and commits tree, wood, used points and regrowth atomically once',()=>{
  const s=nearState(),cost=volumePoints(tree),original=s.forestry.slots[tree.id].individualId;
  assert.equal(startChop(s,tree).ok,true);assert.equal(s.forestry.ledger.reserved,cost);
  assert.equal(startChop(s,tree).ok,false);assert.equal(s.forestry.ledger.reserved,cost);
  s.time=FORESTRY.chopSeconds-.01;advanceForestry(s,byId);assert.equal(s.forestry.wood,0);
  s.time=FORESTRY.chopSeconds+.01;advanceForestry(s,byId);
  assert.equal(s.forestry.wood,cost);assert.equal(s.forestry.ledger.used,cost);assert.equal(s.forestry.ledger.reserved,0);
  assert.equal(s.forestry.slots[tree.id].status,'falling');assert.equal(s.forestry.slots[tree.id].individualId,original);
  assert.equal(typeof s.forestry.slots[tree.id].regrowAt,'number');
  for(let i=0;i<100;i++)advanceForestry(s,byId);
  assert.equal(s.forestry.wood,cost);assert.equal(s.forestry.completedActions.length,1);
  s.time+=FORESTRY.fallSeconds;advanceForestry(s,byId);assert.equal(s.forestry.slots[tree.id].status,'stump');assert.equal(s.forestry.active,null);
});
test('cancel, invalidated distance and changed year release reservations without rewards',()=>{
  const s=nearState();startChop(s,tree);assert.equal(cancelChop(s).ok,true);assert.equal(cancelChop(s).ok,false);
  assert.equal(s.forestry.ledger.reserved,0);assert.equal(s.forestry.slots[tree.id].status,'standing');
  startChop(s,tree);s.player.x+=20;s.time=FORESTRY.chopSeconds+1;advanceForestry(s,byId);
  assert.equal(s.forestry.wood,0);assert.equal(s.forestry.ledger.used,0);assert.equal(s.forestry.ledger.reserved,0);
  s.player.x-=20;startChop(s,tree);s.forestry.ledger.year=2;s.time+=FORESTRY.chopSeconds+1;advanceForestry(s,byId);
  assert.equal(s.forestry.wood,0);assert.equal(s.forestry.ledger.reserved,0);assert.equal(s.forestry.active,null);
});
test('original slot regrows a new protected immature individual and preserves quota/wood through growth',()=>{
  const s=nearState();startChop(s,tree);s.time=FORESTRY.chopSeconds+FORESTRY.fallSeconds+.01;advanceForestry(s,byId);
  const life=s.forestry.slots[tree.id],cost=s.forestry.wood,original=life.individualId;
  s.time=life.regrowAt!+.01;advanceForestry(s,byId);
  assert.equal(life.slotId,tree.id);assert.equal(life.generation,1);assert.notEqual(life.individualId,original);assert.equal(life.status,'sapling');
  assert.equal(startChop(s,tree).ok,false);assert.match(forestrySnapshot(s,byId).selectedTree?.reason??'',/幼树/);
  const base=makeColliders(trees),grown=forestryColliders(base,byId,s.forestry,s.time);
  const originalCollider=base.find(c=>c.id===tree.id)!,saplingCollider=grown.find(c=>c.id===tree.id)!;
  assert.ok('radius'in originalCollider&&'radius'in saplingCollider);assert.ok(saplingCollider.radius<originalCollider.radius*.3);
  s.time=life.maturesAt!+.01;advanceForestry(s,byId);assert.equal(life.status,'standing');
  assert.equal(s.forestry.wood,cost);assert.equal(s.forestry.ledger.used,cost);assert.equal(s.forestry.ledger.reserved,0);
});
test('fixed-step simulation and a later due-time audit settle the same committed resource result',()=>{
  const a=nearState(),b=nearState();startChop(a,tree);startChop(b,tree);
  for(let i=1;i<=360;i++){a.time=i/60;advanceForestry(a,byId);}
  b.time=6;advanceForestry(b,byId);
  assert.deepEqual(a.forestry,b.forestry);
});
