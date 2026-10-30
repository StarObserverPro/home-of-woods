import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {MOUNTAINS,ENVIRONMENT_LIMITS} from '../src/content/environment.ts';
import {Resources} from '../src/scene/resources.ts';
import {buildMountainGeometry,createEnvironment,createRiverAppearance} from '../src/scene/environment.ts';
import {createTerrain} from '../src/scene/terrain.ts';

test('PNW environment instantiates bounded, distinct landforms with actual snow, exposed rock and glacier channels',()=>{
  const resources=new Resources(),environment=createEnvironment(resources),stats=environment.stats();
  assert.ok(stats.geometryTriangles<=ENVIRONMENT_LIMITS.triangles);
  assert.ok(stats.meshes<=ENVIRONMENT_LIMITS.meshes);
  assert.ok(stats.materials<=ENVIRONMENT_LIMITS.materialVariants);
  assert.equal(stats.meshes,7);
  const shapes=new Set<string>();
  let snow=0,rock=0,ice=0;
  for(const spec of MOUNTAINS){
    const mesh=environment.group.getObjectByName(spec.id) as THREE.Mesh;
    assert.ok(mesh instanceof THREE.Mesh);
    const positions=mesh.geometry.getAttribute('position'),surfaces=mesh.geometry.getAttribute('surfaceType');
    for(let i=0;i<positions.count;i++){
      assert.ok(Number.isFinite(positions.getX(i))&&Number.isFinite(positions.getY(i))&&Number.isFinite(positions.getZ(i)));
      if(surfaces.getX(i)===0)rock++;else snow++;
      if(surfaces.getX(i)===2)ice++;
    }
    mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox!;
    shapes.add([box.min.x,box.min.z,box.max.y,positions.count].join(':'));
    if(spec.kind==='volcano'){
      assert.ok(box.max.y>130,'dominant glaciated summit');
      assert.ok(box.max.y-box.min.y>260,'massive volcanic relief');
      assert.ok(box.max.x-box.min.x>450,'broad volcanic apron');
    }
  }
  assert.equal(shapes.size,MOUNTAINS.length);
  assert.ok(snow>2000 && rock>2000,'snowline has both snowfields and exposed lower mountain');
  assert.ok(ice>60,'glacier channels are visible generated surface faces');
  environment.dispose();resources.dispose();
});

test('environment generation is deterministic and all geometry/material allocations have one releasing owner',()=>{
  const a=buildMountainGeometry(MOUNTAINS[0]),b=buildMountainGeometry(MOUNTAINS[0]);
  assert.deepEqual(a.getAttribute('position').array,b.getAttribute('position').array);
  assert.deepEqual(a.getAttribute('color').array,b.getAttribute('color').array);a.dispose();b.dispose();
  for(let cycle=0;cycle<3;cycle++){
    const resources=new Resources(),environment=createEnvironment(resources),allocated=new Set<THREE.BufferGeometry|THREE.Material>();
    environment.group.traverse(o=>{if(o instanceof THREE.Mesh){allocated.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])allocated.add(m);}});
    const releases=new Map([...allocated].map(a=>[a,0]));
    for(const a of allocated)a.addEventListener('dispose',()=>releases.set(a,releases.get(a)!+1));
    const sky=environment.group.getObjectByName('sky-porch-daylight') as THREE.Mesh<THREE.BufferGeometry,THREE.ShaderMaterial>;
    const fixedMountain=environment.group.getObjectByName('glacier-volcano')!;
    const mountainPosition=fixedMountain.position.clone();
    environment.update(12,1/60,new THREE.Vector3(10,50,30));
    assert.deepEqual(sky.position.toArray(),[10,50,30]);
    assert.equal(sky.material.uniforms.time.value,12);
    environment.update(90,1/60,new THREE.Vector3(12,52,31),true);
    assert.equal(sky.material.uniforms.time.value,12,'reduced motion freezes cloud phase');
    assert.deepEqual(fixedMountain.position,mountainPosition,'only sky follows the camera');
    environment.dispose();environment.dispose();resources.dispose();resources.dispose();
    assert.ok([...releases.values()].every(count=>count===1));
    assert.deepEqual(resources.stats(),{geometries:0,materials:0,extras:0,disposed:true});
    assert.equal(environment.group.children.length,0);
  }
});

test('flowing water keeps the authoritative river geometry and water height while owning only its material',()=>{
  const resources=new Resources(),{water}=createTerrain(resources),geometry=water.geometry,oldMaterial=water.material;
  const positions=Array.from(geometry.getAttribute('position').array),height=water.position.y,oldGeometries=resources.stats().geometries;
  const river=createRiverAppearance(resources,water),material=water.material;
  let releases=0;(material as THREE.Material).addEventListener('dispose',()=>releases++);
  assert.equal(water.geometry,geometry);assert.equal(water.position.y,height);
  assert.equal(resources.stats().geometries,oldGeometries);
  river.update(8,.1);assert.equal(river.stats().visualTime,8);
  river.update(90,.1,true);assert.equal(river.stats().visualTime,8);
  assert.deepEqual(Array.from(geometry.getAttribute('position').array),positions);
  river.dispose();river.dispose();assert.equal(water.material,oldMaterial);assert.equal(releases,0);
  resources.dispose();assert.equal(releases,1);
});
