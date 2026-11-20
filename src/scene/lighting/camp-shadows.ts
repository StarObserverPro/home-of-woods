import * as THREE from 'three';
import {SHADOW_PROFILES} from '../../content/shadows.ts';
import {WORLD} from '../../content/world.ts';
import {treeScaleFactor} from '../../domain/forestry.ts';
import type {GameState} from '../../domain/state.ts';
import type {Tree} from '../../world/layout.ts';
import {heightAt} from '../../world/surface.ts';
import type {ProjectedCanopy} from '../../world/shadow-field.ts';
import type {Models} from '../models.ts';
import type {Resources} from '../resources.ts';
import {createOutdoorShadows} from './outdoor-shadows.ts';
import type {OutdoorShadowOptions} from './outdoor-shadows.ts';

/** Actual crown vertices, independent of camera opacity, bark textures and the current LOD. */
export function treeCrownBounds(geometry:THREE.BufferGeometry){
  const position=geometry.getAttribute('position'),solid=geometry.getAttribute('shadowSolidWeight');
  if(!position||!solid)throw new Error('Tree shadow sources require explicit solid/crown weights');
  const bounds=new THREE.Box3(),point=new THREE.Vector3();
  for(let i=0;i<position.count;i++)if(solid.getX(i)<.5)bounds.expandByPoint(point.fromBufferAttribute(position,i));
  if(bounds.isEmpty())throw new Error('Tree shadow source contains no crown vertices');
  return bounds;
}

export function campCanopySource(tree:Tree,localBounds:THREE.Box3,factor:number):ProjectedCanopy{
  const matrix=new THREE.Matrix4().compose(
    new THREE.Vector3(tree.x,heightAt(tree.x,tree.z),tree.z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),tree.variant*Math.PI*2),
    new THREE.Vector3().setScalar(tree.scale*factor));
  const bounds=localBounds.clone().applyMatrix4(matrix),center=bounds.getCenter(new THREE.Vector3()),radii=bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
  return {id:tree.id,center:center.toArray(),radii:radii.toArray(),density:Math.min(1,factor)};
}

type Options={resources:Resources;renderer:THREE.WebGLRenderer;sun:THREE.DirectionalLight;scene:THREE.Scene;
  models:Models;forest:ReturnType<Models['createForest']>;ground:THREE.BufferGeometry;
  workerFactory?:OutdoorShadowOptions['workerFactory']};

/** Main-valley adapter: authoritative tree lifecycle and geometry feed the shared outdoor rules. */
export function createCampShadows({resources,renderer,sun,scene,models,forest,ground,workerFactory}:Options){
  const boundsByGeometry=new Map<THREE.BufferGeometry,THREE.Box3>();
  const sources=forest.canopyTrees.map(tree=>{
    const geometry=models.treeGeometry(tree.kind,true,tree);
    let bounds=boundsByGeometry.get(geometry);
    if(!bounds){bounds=treeCrownBounds(geometry);boundsByGeometry.set(geometry,bounds);}
    return {tree,bounds};
  });
  ground.computeBoundingBox();
  const groundBounds=ground.boundingBox!;
  const top=Math.max(groundBounds.max.y+8,...sources.map(({tree,bounds})=>heightAt(tree.x,tree.z)+bounds.max.y*tree.scale));
  const shadows=createOutdoorShadows(resources,{renderer,sun,workerFactory,bounds:{
    min:[WORLD.minX,groundBounds.min.y,WORLD.minZ],max:[WORLD.maxX,top+2,WORLD.maxZ],
  }});
  let clock=Infinity,bindClock=Infinity,sourceKey='',lifecycleKey='',disposed=false;
  function bindTree(root:THREE.Object3D){
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      shadows.configureTreeDepth(object,object.geometry.hasAttribute('shadowSolidWeight')?'solid-weight':
        /crown|tier|leaf/i.test(object.name)?'crown':'tree-solid');
    });
    shadows.bind(root);
  }
  bindTree(forest.group);
  function update(state:GameState,dt:number,sunDirection:THREE.Vector3,night:number,focus:THREE.Vector3){
    if(disposed)return;
    clock+=Math.max(0,dt);bindClock+=Math.max(0,dt);
    const active=state.forestry.active,nextLifecycle=active?`${active.treeId}:${active.phase}`:'';
    if(clock>=SHADOW_PROFILES.outdoor.canopy.refreshSeconds||nextLifecycle!==lifecycleKey){
      clock=0;lifecycleKey=nextLifecycle;
      const factors=sources.map(({tree})=>{
        const life=state.forestry.slots[tree.id];
        return life?.status==='falling'||life?.status==='stump'?0:Math.round(treeScaleFactor(life,state.time)*20)/20;
      });
      const next=factors.join(',');
      if(next!==sourceKey){sourceKey=next;shadows.setCanopies(sources.flatMap(({tree,bounds},i)=>factors[i]>0?[campCanopySource(tree,bounds,factors[i])]:[]));}
    }
    if(bindClock>=1){bindClock=0;shadows.bind(scene);}
    shadows.update({focus:focus.toArray(),sunDirection:sunDirection.toArray(),dt,night});
    const fieldState=shadows.stats(),fieldCommitted=fieldState.committedRevision===fieldState.revision;
    // The moving crown changes to a real projection on the frame its standing field
    // is removed. A pending worker result must not produce both shadows at once.
    forest.selections.forEach((object,id)=>{
      // Streaming recreates selection meshes. Admit their geometry on the same frame,
      // before render, so returning to a chunk cannot restore the hard crown silhouette.
      if(object instanceof THREE.Mesh&&object.geometry.hasAttribute('shadowSolidWeight'))
        shadows.configureTreeDepth(object,'solid-weight');
      const action=object.userData.actionTree as {crown:THREE.Group}|undefined;
      if(!action)return;
      const status=state.forestry.slots[id]?.status;
      action.crown.traverse(mesh=>{if(mesh instanceof THREE.Mesh)shadows.configureTreeDepth(mesh,fieldCommitted&&(status==='falling'||status==='stump')?'solid':'crown');});
    });
  }
  return {update,bindTree,bind:shadows.bind,bindMaterial:shadows.bindMaterial,setEnabled:shadows.setEnabled,
    stats:()=>({...shadows.stats(),sourceGeometryCount:boundsByGeometry.size,sourceRule:'actual-crown-vertices; authoritative tree lifecycle'}),
    dispose(){if(disposed)return;disposed=true;shadows.dispose();boundsByGeometry.clear();},
  };
}
