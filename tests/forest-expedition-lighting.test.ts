import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Resources} from '../src/scene/resources.ts';
import {createExpeditionLayout,expeditionHeightAt} from '../src/world/forest-expedition.ts';
import {createExpeditionVegetation} from '../src/scene/expedition-vegetation.ts';
import type {ExpeditionCrownVolume} from '../src/scene/expedition-vegetation.ts';
import {createForestExpeditionLighting,forestCanopyInputs,forestLightingBounds} from '../src/scene/lighting/forest-expedition-lighting.ts';

test('actual crown geometry supplies bounded lighting volumes independent of the camera reveal',()=>{
  for(const id of ['upper','mixed','lower'] as const){
    const layout=createExpeditionLayout(id),resources=new Resources();
    const vegetation=createExpeditionVegetation(resources,{heightAt:(x,z)=>expeditionHeightAt(id,x,z)});
    const members=[layout.trees.find(tree=>tree.landmark)!,layout.trees.find(tree=>!tree.landmark)!];
    const group=vegetation.batchTrees(members,'mid');
    const crowns=group.userData.crownVolumes as ExpeditionCrownVolume[];
    assert.equal(crowns.length,members.length);
    const input=forestCanopyInputs(crowns,(x,z)=>expeditionHeightAt(id,x,z));
    const physical=JSON.stringify(input),volumes=JSON.stringify(crowns);
    group.updateWorldMatrix(true,true);
    group.traverse(object=>{
      if(!(object instanceof THREE.InstancedMesh)||object.userData.vegetationPart!=='crown')return;
      assert.equal(object.customDepthMaterial,undefined,'camera fade has no custom depth wrapper');
      for(let index=0;index<object.count;index++){
        const crown=crowns.find(value=>value.id===object.userData.entityIds[index])!;
        const local=new THREE.Matrix4();object.getMatrixAt(index,local);
        const world=object.matrixWorld.clone().multiply(local),position=object.geometry.getAttribute('position');
        for(let vertex=0;vertex<position.count;vertex+=7){
          const point=new THREE.Vector3().fromBufferAttribute(position,vertex).applyMatrix4(world);
          for(let axis=0;axis<3;axis++)assert.ok(Math.abs(point.getComponent(axis)-crown.center[axis])<=crown.halfSize[axis]+1e-5);
        }
      }
    });
    for(const tree of members)vegetation.setCrownOpacity(group,tree.id,.17);
    assert.equal(JSON.stringify(crowns),volumes);
    assert.equal(JSON.stringify(forestCanopyInputs(crowns,(x,z)=>expeditionHeightAt(id,x,z))),physical);
    const bounds=forestLightingBounds(layout,crowns);
    for(let i=0;i<layout.grid.positions.length;i+=3)for(let axis=0;axis<3;axis++){
      assert.ok(layout.grid.positions[i+axis]>=bounds.min[axis]-1e-5&&layout.grid.positions[i+axis]<=bounds.max[axis]+1e-5);
    }
    for(const crown of crowns)for(let axis=0;axis<3;axis++)assert.ok(bounds.min[axis]<=crown.center[axis]-crown.halfSize[axis]&&bounds.max[axis]>=crown.center[axis]+crown.halfSize[axis]);
    vegetation.dispose();resources.dispose();assert.equal(resources.stats().extras,0);
  }
});

test('ambient coverage uses the horizontal crown footprint while direct shading retains real height',()=>{
  const crown:ExpeditionCrownVolume={id:'tall-narrow-tree',center:[12,28,-7],halfSize:[2,22,3],radius:Math.hypot(2,22,3)};
  const input=forestCanopyInputs([crown],()=>4);
  assert.deepEqual(input.direct,[{id:crown.id,center:[12,28,-7],radii:[2,22,3]}]);
  assert.ok(Math.abs(input.ambient[0].radius-Math.sqrt(6))<1e-10);
  assert.equal(input.ambient[0].height,46);
  assert.ok(input.ambient[0].radius<crown.radius/5,'tall conifer crowns do not become broad ground spheres');
  const bad={...crown,id:'invalid',halfSize:[2,NaN,3] as [number,number,number]};
  assert.equal(forestCanopyInputs([bad],()=>4).direct.length,0);
});

test('switching map lighting restores persistent actor material hooks and keeps solid/canopy ownership separate',()=>{
  const scene=new THREE.Scene(),sun=new THREE.DirectionalLight(),camera=new THREE.PerspectiveCamera(43,1,.15,520);
  scene.add(sun,sun.target);camera.position.set(12,15,24);camera.lookAt(0,0,0);
  const actorMaterial=new THREE.MeshStandardMaterial(),actorGeometry=new THREE.BoxGeometry(.6,2,.4);
  const actor=new THREE.Mesh(actorGeometry,actorMaterial);actor.castShadow=actor.receiveShadow=true;scene.add(actor);
  const compile=actorMaterial.onBeforeCompile,key=actorMaterial.customProgramCacheKey;
  const renderer={shadowMap:{enabled:false,type:THREE.BasicShadowMap}} as THREE.WebGLRenderer;
  for(const id of ['upper','lower'] as const){
    const layout=createExpeditionLayout(id),owner=new Resources();
    const crown=new THREE.Mesh(owner.own(new THREE.SphereGeometry(2,8,6)),owner.material('#618258'));
    crown.userData.vegetationPart='crown';crown.castShadow=true;scene.add(crown);
    const physical:ExpeditionCrownVolume={id:'local-crown',center:[0,12,0],halfSize:[3,5,4],radius:Math.hypot(3,5,4)};
    const lighting=createForestExpeditionLighting(owner,{renderer,sun,scene,layout,canopies:[physical],sunDirection:[0,1,0]});
    assert.equal(crown.castShadow,false);assert.equal(actor.castShadow,true);
    lighting.update({focus:[0,0,0],dt:0,camera,viewportHeight:800,feet:[]});
    const before=lighting.stats();assert.equal(before.shadows.sourceCount,1);assert.equal(before.shadows.bakes,1);
    const standard=THREE.ShaderLib.standard;
    const shader={uniforms:THREE.UniformsUtils.clone(standard.uniforms),vertexShader:standard.vertexShader,fragmentShader:standard.fragmentShader};
    actorMaterial.onBeforeCompile(shader,renderer);
    assert.ok(shader.uniforms.howCrownField&&shader.uniforms.howAOCore&&shader.uniforms.howAOOuter,'persistent actors receive both physical light channels');
    lighting.update({focus:[8,0,7],dt:.1,camera,viewportHeight:800,feet:[]});
    assert.equal(lighting.stats().shadows.bakes,1,'camera/player motion does not rebake a static physical crown field');
    lighting.dispose();assert.equal(crown.castShadow,true);
    assert.equal(actorMaterial.onBeforeCompile,compile);assert.equal(actorMaterial.customProgramCacheKey,key);
    scene.remove(crown);owner.dispose();assert.equal(owner.stats().extras,0);
  }
  actorGeometry.dispose();actorMaterial.dispose();sun.shadow.dispose();
});
