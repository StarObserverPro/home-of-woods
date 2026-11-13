import * as THREE from 'three';
import {WORLD} from '../content/world.ts';
import {buildApron,buildRiver} from '../world/horizon.js';
import {createTerrainSampler} from '../world/terrain-sampler.js';
import {createGroundMaterial} from './ground-material.ts';
import {paintSceneryTrails} from './trail-material.js';
import {createOuterForest} from './outer-forest.js';
import {createRocks,portalProps} from './landscape-props.js';
import type {Resources} from './resources.ts';
import type {CanopySeed} from '../world/occlusion.ts';
import type {Tree} from '../world/layout.ts';

/** Decorative extension of the scene-owned terrain. No navigation, IDs or save state. */
export function createHorizon(r:Resources,ground:THREE.BufferGeometry,trees:Tree[]){
  const group=new THREE.Group();group.name='continuous-valley-horizon';
  const geometry=r.own(buildApron(ground)),material=createGroundMaterial(r),compile=material.onBeforeCompile;
  material.vertexColors=true;
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    shader.fragmentShader=shader.fragmentShader.replace('diffuseColor.rgb=groundCover(vGroundXZ);',`
      float outerDistance=max(abs(vGroundXZ.x),abs(vGroundXZ.y));
      diffuseColor.rgb=mix(groundCover(vGroundXZ),vColor.rgb,smoothstep(150.,240.,outerDistance));
      float exposed=(1.-smoothstep(.49,.73,vGroundUp))*smoothstep(151.,177.,outerDistance);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.26,.30,.28)*(.92+.08*sin(vGroundWorld.y*.23+vGroundWorld.x*.04)),exposed*.88);`);
  };
  material.customProgramCacheKey=()=> 'continuous-horizon-ground-r2';
  paintSceneryTrails(material);
  const apron=new THREE.Mesh(geometry,material);apron.name='continuous-exterior-apron';apron.receiveShadow=true;
  const sample=createTerrainSampler([ground,geometry]),forest=createOuterForest(r,sample,trees);
  group.add(apron,forest,createRocks(r,sample),portalProps(r,sample));
  // Creek owns presentation of every segment and shares its reflection/lighting uniforms.
  const riverExtensions=[[-720,WORLD.minZ],[WORLD.maxZ,720]].map(([start,end])=>r.own(buildRiver(start,end).translate(0,-WORLD.waterY,0)));
  let disposed=false;
  return {group,riverExtensions,canopySeeds:forest.userData.canopySeeds as CanopySeed[],surfaceAt:sample,
    stats(){
      let meshes=0,triangles=0;group.traverse(object=>{if(object instanceof THREE.Mesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.getAttribute('position').count)/3*(object instanceof THREE.InstancedMesh?object.count:1);}});
      const {canopySeeds:_,...forestSummary}=forest.userData;
      return {meshes,triangles,forest:forestSummary,seam:{...geometry.userData},riverExtensions:riverExtensions.length,disposed};
    },
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();},
  };
}
