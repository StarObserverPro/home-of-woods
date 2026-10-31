import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {Models} from '../src/scene/models.ts';
import {Resources} from '../src/scene/resources.ts';
import {makeTrees} from '../src/world/layout.ts';
import {treeVisual} from '../src/world/tree-appearance.ts';
import {createTree} from '../src/scene/actions/tree.js';
import {createUnderstory} from '../src/scene/understory.js';
import {heightAt,pathDistance} from '../src/world/surface.ts';
import {createState} from '../src/domain/state.ts';

test('all eight admitted tree shapes are used, finite and identical between static and action preparation',()=>{
 const r=new Resources(),m=new Models(r),trees=makeTrees();const seen=new Set<number>();
 for(const tree of trees.filter((t,i,a)=>a.findIndex(v=>treeVisual(v).key===treeVisual(t).key)===i)){
  seen.add(treeVisual(tree).species);const geometry=m.treeGeometry(tree.kind,true,tree);const action=createTree(m.sourceForTree(tree),tree.kind);action.update(0,'climb',true,false);
  geometry.computeBoundingBox();const box=new T.Box3().setFromObject(action.root);
  assert.ok(Math.abs(box.max.y-geometry.boundingBox!.max.y)<.01);assert.ok(geometry.attributes.position.array.every(Number.isFinite));
  action.setGround((x,z)=>.05*x+.03*z);for(const t of [0,1,2.5,4.3]){action.update(t,'fell',false,false);action.root.traverse(o=>{if(o instanceof T.Mesh)assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));});}
  action.dispose();
 }
 assert.equal(seen.size,8);r.dispose();assert.equal(r.stats().extras,0);
});
test('production understory has all admitted families, stays bounded and follows tree removal',()=>{
 const r=new Resources(),m=new Models(r),trees=makeTrees(),forest=m.createForest(trees),before=JSON.stringify(trees);
 const under=createUnderstory(r,trees,forest.selections),stats=under.stats();
 assert.ok(Number(stats.ferns)>20);assert.ok(Number(stats.triangles)<100000);assert.ok(Number(stats.batches)<=10);
 for(const name of ['fern','grass','shrub','stone','log','litter'])assert.ok(under.group.getObjectByName(`understory-${name}`));
 const grass=under.group.getObjectByName('understory-grass') as T.InstancedMesh,mat=new T.Matrix4(),pos=new T.Vector3();
 for(let i=0;i<grass.count;i++){grass.getMatrixAt(i,mat);pos.setFromMatrixPosition(mat);assert.ok(Math.abs(pos.y-heightAt(pos.x,pos.z)-.01)<.001);assert.ok(pathDistance(pos.x,pos.z)>2.79);}
 const state=createState(trees);under.update(state);const fern=under.group.getObjectByName('understory-fern') as T.InstancedMesh;fern.getMatrixAt(0,mat);assert.ok(mat.determinant()>0);
 for(const life of Object.values(state.forestry.slots))life.status='stump';under.update(state);fern.getMatrixAt(0,mat);assert.equal(mat.determinant(),0);
 assert.equal(JSON.stringify(trees),before);r.dispose();assert.equal(r.stats().extras,0);
});
