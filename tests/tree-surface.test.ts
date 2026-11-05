import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Resources} from '../src/scene/resources.ts';
import {Models} from '../src/scene/models.ts';
import {makeTrees} from '../src/world/layout.ts';
import {makeGatheringSources} from '../src/world/gathering-layout.ts';
import {harvestBranchMatrix,harvestBranchTemplate} from '../src/scene/harvest-branches.ts';
import {createTree} from '../src/scene/actions/tree.js';

test('all resource branches seat on actual bark with deterministic finite transforms',()=>{
  const r=new Resources(),models=new Models(r),trees=makeTrees();
  for(const source of makeGatheringSources(trees).filter(s=>s.definitionId==='forage.branch-pile')){
    const tree=trees.find(t=>t.id===source.hostRef!.slotId)!;
    const a=harvestBranchMatrix(tree,models,source.targetAnchor),b=harvestBranchMatrix(tree,models,source.targetAnchor);
    assert.deepEqual(a.elements,b.elements);assert.ok(a.elements.every(Number.isFinite));
    const p=new THREE.Vector3().setFromMatrixPosition(a);
    assert.ok(Math.hypot(p.x-tree.x,p.z-tree.z)<tree.scale);
    const g=models.treeGeometry(tree.kind,true,tree);
    assert.equal(g.attributes.uv.count,g.attributes.position.count);
    assert.ok([...g.attributes.barkWeight.array].includes(1));
  }
  assert.ok(harvestBranchTemplate(r,models).children.length===1);r.dispose();
});
test('far trees have no maps; action trees borrow maps and release without disposing them',()=>{
  const r=new Resources(),models=new Models(r),tree=makeTrees().find(t=>t.role==='managed')!;
  models.sourceForTree(tree,true).traverse(o=>{if(o instanceof THREE.Mesh)assert.equal((o.material as THREE.MeshStandardMaterial).map,null);});
  let released=0;models.barkSurface.map.addEventListener('dispose',()=>released++);
  const action=createTree(models.sourceForTree(tree),tree.kind);
  let mapped=0;action.root.traverse((o:THREE.Object3D)=>{if(o instanceof THREE.Mesh&&(o.material as THREE.MeshStandardMaterial).map){mapped++;assert.ok(o.geometry.attributes.uv);}});
  assert.ok(mapped>=3);action.dispose();assert.equal(released,0);r.dispose();r.dispose();assert.equal(released,1);
});
