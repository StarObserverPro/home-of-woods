import {WOOD_TONES} from '../src/content/wood-tones.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {woodCoordinates,woodMaterial} from '../src/scene/wood-grain.ts';
import {Resources} from '../src/scene/resources.ts';
import {createSupportedSurfaceFactory} from '../src/scene/supported-surface-presentation.ts';
import {createGeometrySpec} from '../src/domain/parametric-crafting.ts';

test('grain annotations preserve geometry and separate raw side, cut end and finished faces',()=>{
  for(const raw of [false,true]){
    const g=raw?new THREE.CylinderGeometry(.3,.35,1.8,9):new THREE.BoxGeometry(.3,1.8,.4);
    const before=Array.from(g.getAttribute('position').array),indices=Array.from(g.index!.array),groups=structuredClone(g.groups);
    woodCoordinates(g,raw?'raw':'board','y');
    assert.deepEqual(Array.from(g.getAttribute('position').array),before);assert.deepEqual(Array.from(g.index!.array),indices);assert.deepEqual(g.groups,groups);
    const coords=g.getAttribute('woodCoord'),normals=g.getAttribute('normal');
    for(let i=0;i<coords.count;i++){assert.equal(coords.getZ(i),Math.abs(normals.getY(i))>.8?2:raw?1:0);assert.ok(Number.isFinite(coords.getX(i))&&Number.isFinite(coords.getY(i)));}
    g.dispose();
  }
});

test('merged production furniture retains grain per part and its resource owner releases the shared materials once',()=>{
  const r=new Resources(),factory=createSupportedSurfaceFactory(r),spec=createGeometrySpec('bench.supported',{length:1.6,width:.6,height:.7,seatThickness:.15,supportCount:2,supportInset:.2});
  for(const look of ['bench','table'] as const){const root=factory.create(spec,look);root.traverse(o=>{if(o instanceof THREE.Mesh){assert.equal(o.geometry.getAttribute('woodCoord').count,o.geometry.getAttribute('position').count);assert.equal((o.material as THREE.Material).userData.proceduralWood,true);}});}
  const m=woodMaterial(r,WOOD_TONES.light.face,.78);assert.equal(m,factory.materials.surface);assert.equal(m.map,null);let disposed=0;m.addEventListener('dispose',()=>disposed++);r.dispose();r.dispose();assert.equal(disposed,1);
});
