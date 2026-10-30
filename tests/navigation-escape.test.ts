import test from 'node:test';
import assert from 'node:assert/strict';
import {MOVEMENT} from '../src/content/world.ts';
import {FORESTRY} from '../src/content/forestry.ts';
import {createState} from '../src/domain/state.ts';
import {startChop,advanceForestry,forestryColliders} from '../src/domain/forestry.ts';
import {canStand,move} from '../src/domain/navigation.ts';
import {makeTrees,makeColliders} from '../src/world/layout.ts';
import type {Collider} from '../src/world/layout.ts';
import type {Point} from '../src/content/world.ts';
import {heightAt,inOpenArea,slopeAt} from '../src/world/surface.ts';

const step=MOVEMENT.speed*MOVEMENT.fixedStep;
test('a player beside a regrown sapling can walk out after its authoritative trunk grows around them',()=>{
  const trees=makeTrees(),tree=trees.find(t=>t.id==='tree-slot-r3-hero-0')!;
  const byId=new Map(trees.map(t=>[t.id,t])),base=makeColliders(trees),state=createState(trees);
  state.player.x=tree.x+1.7;state.player.z=tree.z;
  assert.equal(startChop(state,tree).ok,true);
  state.time=FORESTRY.chopSeconds+FORESTRY.fallSeconds+.01;advanceForestry(state,byId);
  state.time=state.forestry.slots[tree.id].regrowAt!+.01;advanceForestry(state,byId);
  const young=forestryColliders(base,byId,state.forestry,state.time);
  const entered=move(state.player,-.9,0,young);
  state.player.x=entered.x;state.player.z=entered.z;
  assert.ok(Math.abs(entered.x-(tree.x+.8))<1e-8);assert.equal(canStand(entered,young),true);
  state.time=state.forestry.slots[tree.id].maturesAt!+.01;advanceForestry(state,byId);
  const grown=forestryColliders(base,byId,state.forestry,state.time),unchanged=JSON.stringify(grown);
  const stateBefore=JSON.stringify(state);let player:Point={...entered},ticks=0;
  assert.equal(state.forestry.slots[tree.id].status,'standing');assert.equal(canStand(player,grown),false);
  while(!canStand(player,grown)&&ticks++<60){
    const next=move(player,step,0,grown);
    assert.ok(next.x>player.x,'outward input must make progress from the existing overlap');
    assert.ok(Math.hypot(next.x-player.x,next.z-player.z)<=step+1e-10,'retreat remains an ordinary movement step');
    player=next;
  }
  assert.equal(canStand(player,grown),true);assert.equal(JSON.stringify(grown),unchanged,'authoritative colliders are unchanged');
  assert.equal(JSON.stringify(state),stateBefore,'movement returns a position without modifying domain state');
});

const point={x:-35,z:2};
const grownTrunk:Collider={id:'grown-tree',x:point.x-.8,z:point.z,radius:1.1};
test('retreat cannot deepen an existing overlap or enter another trunk or building',()=>{
  assert.equal(canStand(point,[]),true);
  assert.deepEqual(move(point,-step,0,[grownTrunk]),point,'input toward the original trunk is blocked');
  assert.ok(move(point,step,0,[grownTrunk]).x>point.x,'outward input is available without a new blocker');
  const tangent=move(point,-step*.03,step,[grownTrunk]);
  assert.equal(tangent.x,point.x,'a segment cannot first deepen overlap even if its endpoint is farther away');
  assert.ok(tangent.z>point.z,'safe tangent sliding remains available');
  const otherTree:Collider={id:'other-tree',x:point.x+1.2,z:point.z,radius:.7};
  const building:Collider={id:'building',x:point.x+1,z:point.z,halfX:.5,halfZ:3};
  assert.equal(canStand(point,[otherTree]),true);assert.equal(canStand(point,[building]),true);
  assert.deepEqual(move(point,step,0,[grownTrunk,otherTree]),point,'escape cannot enter an independent circular blocker');
  assert.deepEqual(move(point,step,0,[grownTrunk,building]),point,'escape cannot enter an expanded building footprint');
  const secondOverlap:Collider={id:'second-overlap',x:point.x+.8,z:point.z,radius:1.1};
  assert.deepEqual(move(point,step,0,[grownTrunk,secondOverlap]),point,'improving one overlap cannot deepen another');
});

test('escape still obeys unopened land, river and slope facts',()=>{
  const cases=[
    {name:'closed upper trail',p:{x:-27,z:-74.99},dx:0,dz:-step},
    {name:'water edge',p:{x:13.46,z:40},dx:step,dz:0},
    {name:'steep slope',p:{x:-53.75,z:-26.25},dx:step,dz:0},
  ];
  for(const {name,p,dx,dz} of cases){
    const target={x:p.x+dx,z:p.z+dz};
    assert.equal(canStand(p,[]),true,`${name}: initial terrain is valid`);
    assert.equal(canStand(target,[]),false,`${name}: the intended step crosses a terrain limit`);
    const length=Math.hypot(dx,dz),blocker:Collider={id:'growing-tree',x:p.x-dx/length*.8,z:p.z-dz/length*.8,radius:1.1};
    assert.deepEqual(move(p,dx,dz,[blocker]),p,`${name}: no retreat exception bypasses terrain`);
  }
  assert.equal(inOpenArea(-27,-75.01),false);
  assert.ok(heightAt(13.46+step,40)<1.7);
  assert.ok(slopeAt(-53.75+step,-26.25)>MOVEMENT.maxSlope);
});
