import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildClosedTerrain} from '../src/world/closed-terrain.ts';
import {heightAt} from '../src/world/surface.ts';
import {makeTrees} from '../src/world/layout.ts';
import {treeVisual} from '../src/world/tree-appearance.ts';
import {buildApron,riverX,riverY,ROUTES,sampleRoute} from '../src/world/horizon.js';
import {createTerrainSampler} from '../src/world/terrain-sampler.js';
import {createHorizon} from '../src/scene/horizon.ts';
import {createTerrain} from '../src/scene/terrain.ts';
import {createCreek} from '../src/scene/creek.ts';
import {Resources} from '../src/scene/resources.ts';
import {makeTree} from '../src/scene/forest-shapes.js';
import {distantTreeGeometry,planOuterForest,OUTER_FOREST} from '../src/scene/outer-forest.js';
import type {DistantTreeKind} from '../src/scene/outer-forest.js';
import {TREE_SLOT_CORRECTIONS} from '../src/content/tree-slot-corrections.ts';

test('rendered valley banks share the near-field height, and the exterior rim and creek stay connected',()=>{
  const ground=buildClosedTerrain(),apron=buildApron(ground),sample=createTerrainSampler([ground,apron]);
  const p=ground.getAttribute('position'),ix=ground.index!;
  let checked=0;
  for(let i=0;i<ground.userData.topTriangles*3;i+=3){
    const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)];
    const x=ids.reduce((s,j)=>s+p.getX(j),0)/3,z=ids.reduce((s,j)=>s+p.getZ(j),0)/3,y=ids.reduce((s,j)=>s+p.getY(j),0)/3;
    if(Math.max(Math.abs(x),Math.abs(z))>88)continue;
    assert.ok(Math.abs(heightAt(x,z)-y)<.00015);checked++;
  }
  assert.ok(checked>16000);
  const rim=new Map<string,number>();
  for(let i=0;i<p.count;i++)if(p.getY(i)>-40&&Math.abs(Math.max(Math.abs(p.getX(i)),Math.abs(p.getZ(i)))-150)<.0001)rim.set(`${p.getX(i)}:${p.getZ(i)}`,p.getY(i));
  const a=apron.getAttribute('position');
  for(let i=0;i<apron.userData.seamVertices;i++)assert.equal(a.getY(i),rim.get(`${a.getX(i)}:${a.getZ(i)}`));
  for(let z=-700;z<=700;z+=3.5)for(const across of [-4.4,0,4.4]){
    const x=riverX(z)+across;if(Math.max(Math.abs(x),Math.abs(z))<151)continue;
    assert.ok(sample(x,z)<riverY(z),`bank covers water at ${x}, ${z}`);
  }
  for(const route of ROUTES)for(const point of sampleRoute(route,.5))assert.ok(Number.isFinite(sample(point.x,point.z)));
  ground.dispose();apron.dispose();
});

test('fixed scenery identities and full crowns clear the planned bridge corridor',()=>{
  const trees=makeTrees();assert.equal(trees.length,580);assert.equal(new Set(trees.map(t=>t.id)).size,580);
  for(const [id,position] of Object.entries(TREE_SLOT_CORRECTIONS)){
    const tree=trees.find(t=>t.id===id)!;assert.equal(tree.role,'scenery');assert.equal(tree.individualId,`${id}:g0`);
    assert.deepEqual({x:tree.x,z:tree.z},position);
  }
  for(const tree of trees.filter(t=>t.x>0&&t.x<60&&Math.abs(t.z-38)<14)){
    const visual=treeVisual(tree),model=makeTree(visual.species,visual.seed,1);
    model.scale.setScalar(tree.scale);model.rotation.y=tree.variant*6.28;model.position.set(tree.x,heightAt(tree.x,tree.z),tree.z);model.updateMatrixWorld(true);
    const box=new THREE.Box3().setFromObject(model);
    assert.ok(!(box.max.x>7&&box.min.x<45&&box.max.z>34.6&&box.min.z<41.4),tree.id);
    model.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
  }
});

test('five forest silhouettes stay within budget and transition from broadleaf valley to conifer high slopes',()=>{
  const ground=buildClosedTerrain(),apron=buildApron(ground),sample=createTerrainSampler([ground,apron]);
  const kinds:DistantTreeKind[]=['oak','poplar','pine','spruce','fir'];
  const geometries=kinds.map(kind=>distantTreeGeometry(kind));
  const counts=Object.fromEntries(kinds.map((kind,i)=>[kind,geometries[i].getAttribute('position').count/3])) as Record<DistantTreeKind,number>;
  const trees=makeTrees(),plan=planOuterForest(sample,counts,trees);
  assert.deepEqual(plan,planOuterForest(sample,counts,trees));assert.ok(plan.triangles<=OUTER_FOREST.triangleBudget);
  assert.equal(new Set(plan.placements.map(t=>t.kind)).size,5);
  const low=plan.placements.filter(t=>t.y<55),high=plan.placements.filter(t=>t.y>100),broad=(t:{kind:string})=>['oak','poplar'].includes(t.kind);
  assert.ok(low.filter(broad).length/low.length>.45);assert.ok(high.filter(broad).length/high.length<.1);
  for(const tree of plan.placements)assert.equal(tree.y,sample(tree.x,tree.z));
  geometries.forEach(g=>g.dispose());ground.dispose();apron.dispose();
});

test('mainline horizon and creek share water presentation and release every added resource exactly once',()=>{
  const previous=globalThis.document;
  Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})}});
  const r=new Resources(),allocations=new Map<{dispose():void},number>(),original=r.own.bind(r);
  r.own=(resource)=>{const eventful=resource as THREE.BufferGeometry;eventful.addEventListener?.('dispose',()=>allocations.set(resource,(allocations.get(resource)??0)+1));allocations.set(resource,0);return original(resource);};
  try{
    const {ground,water}=createTerrain(r),horizon=createHorizon(r,ground.geometry,makeTrees()),river=createCreek(r,water,horizon.riverExtensions);
    assert.equal(ground.material[0].userData.sceneryTrails.independentRoadMeshes,0);
    assert.ok(horizon.stats().triangles<100000);assert.equal(horizon.stats().forest.trees,2389);
    const reflection=river.group.getObjectByName('bounded-planar-river-reflection') as THREE.Mesh;
    for(const name of ['upstream-continuation','downstream-continuation']){
      const extension=river.group.getObjectByName(name) as THREE.Mesh;
      assert.equal(extension.material,reflection.material);assert.deepEqual(extension.position,reflection.position);
    }
    river.update(4,0,false,true,false);
    assert.equal((reflection.material as THREE.ShaderMaterial).uniforms.day.value,0);
    river.dispose();horizon.dispose();r.dispose();r.dispose();
    assert.ok([...allocations.values()].every(n=>n===1));assert.deepEqual(r.stats(),{geometries:0,materials:0,extras:0,disposed:true});
  }finally{r.dispose();Object.assign(globalThis,{document:previous});}
});
