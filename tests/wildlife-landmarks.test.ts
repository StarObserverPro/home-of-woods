import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WILDLIFE, WILDLIFE_DEFINITIONS } from '../src/content/wildlife.ts';
import { RUNTIME_MODELS } from '../src/content/assets.ts';
import { START, WORLD_SEED } from '../src/content/world.ts';
import { WILDLIFE_ANCHORS } from '../src/world/wildlife-layout.ts';
import { heightAt } from '../src/world/surface.ts';
import { makeColliders, makeTrees } from '../src/world/layout.ts';
import { createWildlife,advanceWildlife,landmarkRouteLegal,wildlifeHasCapacity,wildlifeViews,validateWildlifeRegistry } from '../src/domain/wildlife.ts';
import { parseGeometryFile } from './glb-fixtures.ts';
const colliders=makeColliders(makeTrees()), available=WILDLIFE_DEFINITIONS.map(d=>d.id);
function at(time:number){const s=createWildlife(time);advanceWildlife(s,time,WORLD_SEED,START,colliders,available);return s;}
const rare=(s:ReturnType<typeof createWildlife>)=>s.encounters.filter(e=>e.id.includes(':vista:'));
test('source-backed landmark definitions, ridge/ledge anchors and strict shared global budget',()=>{
  validateWildlifeRegistry(RUNTIME_MODELS.map(x=>x.assetId));
  const sites=WILDLIFE_ANCHORS.filter(a=>a.patrol);
  assert.equal(sites.length,4);
  assert.ok(sites.every(landmarkRouteLegal));
  const stag=at(1040);assert.equal(rare(stag).length,1);assert.equal(rare(stag)[0].definitionId,'wildlife.stag');
  assert.equal(stag.encounters.length,3);assert.equal(wildlifeHasCapacity(stag,'wildlife.goat'),false);
  const goat=at(1300);assert.equal(rare(goat).length,1);assert.equal(rare(goat)[0].definitionId,'wildlife.goat');
  assert.equal(goat.encounters.length,1);assert.equal(wildlifeHasCapacity(goat,'wildlife.stag'),false);
  assert.equal(at(0).encounters.length,2);assert.equal(rare(at(0)).length,0);
});
test('a seen landmark remains while watched, disappears shortly after panning away and never respawns within the same window',()=>{
  const s=at(1040),e=rare(s)[0];assert.ok(e);
  for(let k=1;k<=65;k++) advanceWildlife(s,1040+k/30,WORLD_SEED,START,colliders,available,[e.id]);
  assert.equal(e.lastVisibleAt!==null,true);assert.equal(e.exitAt,null);
  for(let k=66;k<=125;k++) advanceWildlife(s,1040+k/30,WORLD_SEED,START,colliders,available,[]);
  assert.ok(e.exitAt!==null,'one second after leaving the frame should begin culling');
  const ids=s.encounters.map(x=>x.id);
  for(let k=126;k<=205;k++)advanceWildlife(s,1040+k/30,WORLD_SEED,START,colliders,available,[e.id]);
  assert.ok(!s.encounters.some(x=>x.id===e.id));assert.ok(ids.includes(e.id));
  assert.equal(rare(s).length,0,'turning back cannot reroll the same rare window');
});
test('unseen landmark exits on its own; watched landmark may linger, but not forever',()=>{
  const s=at(1300),e=rare(s)[0];assert.ok(e);
  for(let k=1;k<=330;k++)advanceWildlife(s,1300+k/30,WORLD_SEED,START,colliders,available,[]);
  assert.ok(!s.encounters.some(x=>x.id===e.id));
  const kept=at(1040),i=rare(kept)[0];
  for(let k=1;k<=2300;k++) advanceWildlife(kept,1040+k/30,WORLD_SEED,START,colliders,available,[i.id]);
  assert.ok(!kept.encounters.some(x=>x.id===i.id));
});
test('motion uses short, real terrain-grounded stag and cliff routes; no scene-dependent AI',()=>{
  const s=at(1040),e=rare(s)[0],origin={x:e.x,z:e.z};
  const motions=new Set<string>();
  for(let k=1;k<=900;k++){
    advanceWildlife(s,1040+k/30,WORLD_SEED,START,colliders,available,[e.id]);
    motions.add(e.behavior);
    assert.ok(Math.hypot(e.x-origin.x,e.z-origin.z)<3);
    assert.ok(Number.isFinite(heightAt(e.x,e.z)));
  }
  assert.ok(motions.has('survey'));assert.ok(motions.has('stride'));
  const g=at(1300),goat=rare(g)[0],a=WILDLIFE_ANCHORS.find(x=>x.id===goat.anchorId)!;
  for(let k=1;k<=900;k++){
    advanceWildlife(g,1300+k/30,WORLD_SEED,START,colliders,available,[goat.id]);
    assert.ok(Math.hypot(goat.x-a.x,goat.z-a.z)<2.8);
    assert.ok(heightAt(goat.x,goat.z)>2);
  }
});
test('published stag and original mountain goat use separate animated quadruped rigs',async()=>{
  const expected={stag:{joints:38,clips:['bound','graze','idle','survey','walk']},'mountain-goat':{joints:21,clips:['idle','survey','lift_front','walk']}} as const;
  for(const name of ['stag','mountain-goat'] as const){
    const g=await parseGeometryFile(`public/assets/wildlife/${name}.glb`);
    assert.deepEqual(g.animations.map(a=>a.name).sort(),[...expected[name].clips].sort());
    const skins:THREE.SkinnedMesh[]=[];g.scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh)skins.push(o);});
    assert.ok(skins.some(s=>s.skeleton.bones.length===expected[name].joints));
    g.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());} if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});
  }
});
