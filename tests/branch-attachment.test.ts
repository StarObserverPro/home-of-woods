import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeTrees} from '../src/world/layout.ts';
import {TREE_RESOURCE_HOSTS} from '../src/content/tree-resources.ts';
import {branchAttachment} from '../src/scene/branch-attachment.ts';
import {Resources} from '../src/scene/resources.ts';
import {Models} from '../src/scene/models.ts';
import {createTree} from '../src/scene/actions/tree.js';

test('all five resource trees attach at a real composed branch junction, including yaw and scale',()=>{
 const r=new Resources(),models=new Models(r);
 for(const tree of makeTrees().filter(t=>TREE_RESOURCE_HOSTS.includes(t.id as typeof TREE_RESOURCE_HOSTS[number]))){
  const a=branchAttachment(tree,models),composed=createTree(models.sourceForTree(tree),tree.kind);
  assert.ok(a.local.distanceTo(new THREE.Vector3().fromArray(a.segment.a))<1e-7);
  assert.ok(a.local.clone().applyMatrix4(a.treeMatrix).distanceTo(a.root)<1e-7);
  composed.root.updateMatrixWorld(true);
  // Root must lie inside/on real woody geometry, not somewhere in the crown air.
  let near=Infinity;
  for(const direction of [new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)]){
    const ray=new THREE.Raycaster(a.local.clone().addScaledVector(direction,1),direction.clone().negate());
    const hits=ray.intersectObjects(composed.upper.children.filter(o=>o instanceof THREE.Mesh),false);
    for(const h of hits)near=Math.min(near,h.point.distanceTo(a.local));
  }
  assert.ok(near<.45,`${tree.id}: nearest wood surface ${near}`);
  composed.dispose();
 }
 r.dispose();
});
