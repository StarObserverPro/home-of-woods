import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {FORESTRY} from '../src/content/forestry.ts';
import {createState} from '../src/domain/state.ts';
import {advanceForestry,chopRange,startChop} from '../src/domain/forestry.ts';
import {makeTrees} from '../src/world/layout.ts';
import {heightAt} from '../src/world/surface.ts';
import {treeVisual} from '../src/world/tree-appearance.ts';
import {usesActionTree} from '../src/world/tree-dimensions.ts';
import {bakeProjectedCanopyField} from '../src/world/shadow-field.ts';
import type {ShadowBakeRequest,ShadowBakeResponse,ShadowBakeWorker} from '../src/world/shadow-field-worker-protocol.ts';
import {Models} from '../src/scene/models.ts';
import {Resources} from '../src/scene/resources.ts';
import {createTree} from '../src/scene/actions/tree.js';
import {createForestryPresentation} from '../src/scene/forestry-presentation.ts';
import {createStreamedForest} from '../src/scene/streamed-forest.ts';
import {createAmbientOcclusion} from '../src/scene/lighting/ambient-occlusion.ts';
import {createCampShadows,campCanopySource,treeCrownBounds} from '../src/scene/lighting/camp-shadows.ts';
import {createWeatherPresentation} from '../src/scene/weather-presentation.ts';

const allTrees=makeTrees();
const representatives=[...new Map(allTrees.map(tree=>[treeVisual(tree).key,tree])).values()];
const hero=allTrees.find(tree=>tree.id==='tree-slot-r3-hero-0')!;
const sunDirection=new THREE.Vector3(0,1,0);
const near=(a:number,b:number,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const descendant=(object:THREE.Object3D,root:THREE.Object3D)=>{for(let node:THREE.Object3D|null=object;node;node=node.parent)if(node===root)return true;return false;};
const shown=(object:THREE.Object3D)=>{for(let node:THREE.Object3D|null=object;node;node=node.parent)if(!node.visible)return false;return true;};

function fixture(workerFactory?:()=>ShadowBakeWorker){
  const resources=new Resources(),models=new Models(resources),forest=models.createForest([hero],true),scene=new THREE.Scene();
  scene.add(forest.group);
  const renderer={shadowMap:{enabled:false,type:THREE.BasicShadowMap}} as unknown as THREE.WebGLRenderer;
  const sun=new THREE.DirectionalLight();
  const ground=resources.own(new THREE.PlaneGeometry(300,300).rotateX(-Math.PI/2).translate(0,heightAt(hero.x,hero.z)-1,0));
  const shadows=createCampShadows({resources,renderer,sun,scene,models,forest,ground,workerFactory});
  shadows.bind(scene);
  const state=createState([hero]),focus=new THREE.Vector3(hero.x,heightAt(hero.x,hero.z),hero.z);
  Object.assign(state.player,{x:hero.x+chopRange(hero)-.1,z:hero.z});
  return {resources,models,forest,scene,renderer,sun,shadows,state,focus};
}

test('real near and far tree shapes retain untextured wood cut faces in solid shadows',()=>{
  const resources=new Resources(),models=new Models(resources);
  assert.ok(new Set(representatives.map(tree=>treeVisual(tree).name)).size>=8);
  for(const tree of representatives.filter(usesActionTree))for(const distant of [false,true]){
    const geometry=models.treeGeometry(tree.kind,true,tree,distant);
    // The action tree's explicit crown group is independent evidence of which parts
    // are foliage. Bark texture presence does not decide whether cut wood is solid.
    const actual=createTree(models.sourceForTree(tree,distant),tree.kind);
    actual.update(0,'climb',true,false);
    let expectedSolid=0,expectedCrown=0,expectedUntexturedWood=0;
    actual.root.traverse((object:THREE.Object3D)=>{
      if(!(object instanceof THREE.Mesh)||!shown(object))return;
      const count=object.geometry.index?.count??object.geometry.attributes.position.count;
      if(descendant(object,actual.crown))expectedCrown+=count;
      else {expectedSolid+=count;if(!(object.material as THREE.MeshStandardMaterial).map)expectedUntexturedWood+=count;}
    });
    const solid=geometry.getAttribute('shadowSolidWeight'),bark=geometry.getAttribute('barkWeight');
    assert.ok(solid,`${treeVisual(tree).key} distant=${distant}`);
    let solidCount=0,crownCount=0,untexturedSolid=0;
    for(let i=0;i<solid.count;i++){
      if(solid.getX(i)===1){solidCount++;if(bark?.getX(i)===0)untexturedSolid++;}
      else {assert.equal(solid.getX(i),0);crownCount++;}
    }
    assert.equal(solidCount,expectedSolid,'every visible wooden triangle remains a depth caster');
    assert.equal(crownCount,expectedCrown,'only the real crown group leaves the solid map');
    assert.ok(expectedUntexturedWood>100,'the production shape includes untextured cut wood');
    if(distant)assert.equal(bark,undefined,'far geometry deliberately has no bark material mask');
    else assert.equal(untexturedSolid,expectedUntexturedWood,'barkWeight=0 cut wood is still solid');
    actual.dispose();
  }
  resources.dispose();
});

test('canopy sources enclose actual transformed crowns and grow about the terrain root',()=>{
  const resources=new Resources(),models=new Models(resources);
  const trees=representatives;
  const point=new THREE.Vector3();
  for(const tree of trees){
    const local=treeCrownBounds(models.treeGeometry(tree.kind,true,tree));
    const sourceTree=models.sourceForTree(tree).clone(true);
    const actual=usesActionTree(tree)?createTree(sourceTree,tree.kind):null;
    actual?.update(0,'climb',true,false);
    const root=actual?.root??sourceTree,crown=actual?.crown??sourceTree.getObjectByName('crown')!;
    for(const factor of [1,.35]){
      const source=campCanopySource(tree,local,factor),ground=heightAt(tree.x,tree.z);
      root.position.set(tree.x,ground,tree.z);root.rotation.y=tree.variant*Math.PI*2;root.scale.setScalar(tree.scale*factor);root.updateMatrixWorld(true);
      const expected=new THREE.Box3();
      crown.traverse((object:THREE.Object3D)=>{
        if(!(object instanceof THREE.Mesh))return;
        const positions=object.geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++)expected.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld));
      });
      const fieldBounds=new THREE.Box3(new THREE.Vector3(...source.center).sub(new THREE.Vector3(...source.radii)),new THREE.Vector3(...source.center).add(new THREE.Vector3(...source.radii)));
      assert.ok(fieldBounds.clone().expandByScalar(1e-5).containsBox(expected),'rotated geometry fits the field, including the giant');
      near(fieldBounds.min.y,expected.min.y);near(fieldBounds.max.y,expected.max.y);
      near(source.center[1]-ground,local.getCenter(new THREE.Vector3()).y*tree.scale*factor);
      near(source.radii[1],local.getSize(new THREE.Vector3()).y*.5*tree.scale*factor);
      assert.equal(source.density,factor);
    }
    actual?.dispose();
  }
  resources.dispose();
});

test('streaming return binds new real tree meshes before the next render and releases old bindings',()=>{
  const f=fixture(),stream=createStreamedForest(f.forest,[hero]);
  const update=()=>f.shadows.update(f.state,0,sunDirection,0,f.focus);
  stream.update(f.state);update();
  const stableBindings=f.shadows.stats().treeDepthBindings;
  for(let trip=0;trip<3;trip++){
    const old=f.forest.selections.get(hero.id) as THREE.Mesh;
    assert.ok(old.customDepthMaterial);
    Object.assign(f.state.player,{x:200,z:200});stream.update(f.state);update();
    assert.equal(f.forest.selections.size,0);assert.equal(old.customDepthMaterial,undefined);
    assert.equal(f.shadows.stats().treeDepthBindings,stableBindings-1);
    Object.assign(f.state.player,{x:hero.x,z:hero.z});stream.update(f.state);
    const next=f.forest.selections.get(hero.id) as THREE.Mesh;
    assert.notEqual(next,old);assert.equal(next.customDepthMaterial,undefined);
    update();
    assert.ok(next.customDepthMaterial,'no one-second material scan delay is permitted');
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.depth.vertexShader,fragmentShader:THREE.ShaderLib.depth.fragmentShader};
    next.customDepthMaterial.onBeforeCompile(shader,f.renderer);
    assert.match(shader.vertexShader,/attribute float shadowSolidWeight/);
    assert.match(shader.fragmentShader,/if\(vHowSolidWeight<.5\)discard/);
    assert.equal(f.shadows.stats().treeDepthBindings,stableBindings);
    assert.equal(f.shadows.stats().depthMaterials,1,'all streamed instances share the same depth program');
  }
  f.shadows.dispose();stream.dispose();f.resources.dispose();
});

test('felling replaces the standing field with the moving crown only after its worker revision commits',()=>{
  const requests:ShadowBakeRequest[]=[];let terminated=false;
  const worker:ShadowBakeWorker={onmessage:null,onerror:null,postMessage:request=>{requests.push(request);},terminate:()=>{terminated=true;}};
  const f=fixture(()=>worker),byId=new Map([[hero.id,hero]]);
  const presentation=createForestryPresentation({models:f.models,resources:f.resources,forestGroup:f.forest.group,trees:[hero],selections:f.forest.selections,bindTreeSurface:f.shadows.bindTree});
  const update=(dt=0)=>{presentation.update(f.state);f.shadows.update(f.state,dt,sunDirection,0,f.focus);};
  update();assert.equal(f.shadows.stats().sourceCount,1);
  const shader={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  f.forest.material.onBeforeCompile(shader,f.renderer);
  const field=shader.uniforms.howCrownField.value as THREE.Data3DTexture;
  const shade=()=>field.image.data.some((value,index)=>index%2===0&&value>0);
  assert.equal(shade(),true);
  const started=startChop(f.state,hero);assert.equal(started.ok,true,started.message);update();
  const action=f.forest.selections.get(hero.id)!.userData.actionTree as ReturnType<typeof createTree>;
  const crownMeshes:THREE.Mesh[]=[];action.crown.traverse((object:THREE.Object3D)=>{if(object instanceof THREE.Mesh)crownMeshes.push(object);});
  assert.ok(crownMeshes.length>0);assert.ok(crownMeshes.every(mesh=>!mesh.castShadow));
  f.state.time=FORESTRY.chopSeconds+.6;advanceForestry(f.state,byId);update();
  assert.equal(f.state.forestry.slots[hero.id].status,'falling');
  assert.ok(action.upper.quaternion.angleTo(new THREE.Quaternion())>.01,'the real crown has started falling');
  assert.equal(requests.length,1);assert.equal(requests[0].canopies.length,0,'the replacement field contains no standing tree');
  assert.equal(f.shadows.stats().inflight,1);assert.equal(f.shadows.stats().sourceCount,1);
  assert.ok(crownMeshes.every(mesh=>!mesh.castShadow),'pending field removal cannot double-darken with the real moving crown');
  const request=requests.shift()!;
  worker.onmessage!({data:{id:request.id,revision:request.revision,field:bakeProjectedCanopyField(request.canopies,request.bounds,request.direction),elapsedMs:1}} as MessageEvent<ShadowBakeResponse>);
  assert.equal(f.shadows.stats().ready,true);update();
  assert.equal(f.shadows.stats().sourceCount,0);assert.equal(shade(),false,'no standing shade remains anywhere in the committed texture');
  assert.ok(crownMeshes.every(mesh=>mesh.castShadow),'the actual falling crown now owns its projection');
  const unchanged=JSON.stringify(f.state);update();assert.equal(JSON.stringify(f.state),unchanged,'shadow presentation never settles gameplay');
  f.state.time=FORESTRY.chopSeconds+FORESTRY.fallSeconds;advanceForestry(f.state,byId);update();
  assert.equal(f.state.forestry.slots[hero.id].status,'stump');assert.equal(f.shadows.stats().sourceCount,0);assert.equal(action.upper.visible,true);
  f.state.time+=1.81;update();assert.equal(action.upper.visible,false);assert.equal(shade(),false);
  f.shadows.dispose();assert.equal(terminated,true);presentation.dispose();f.resources.dispose();
});

test('actual bark, weather, crown and ambient hooks compose once and unwind in owner order',()=>{
  const resources=new Resources(),models=new Models(resources),forest=models.createForest([hero]),scene=new THREE.Scene();scene.add(forest.group);
  const weather=createWeatherPresentation(resources,scene,new Map());weather.bind(forest.group,'tree');
  const renderer={shadowMap:{enabled:false,type:THREE.BasicShadowMap}} as unknown as THREE.WebGLRenderer;
  const ground=resources.own(new THREE.PlaneGeometry(300,300).rotateX(-Math.PI/2));
  const shadows=createCampShadows({resources,renderer,sun:new THREE.DirectionalLight(),scene,models,forest,ground});shadows.bind(scene);
  const ao=createAmbientOcclusion(resources);ao.bind(scene);
  const material=forest.material,hook=material.onBeforeCompile,key=material.customProgramCacheKey();
  shadows.bind(scene);ao.bind(scene);assert.equal(material.onBeforeCompile,hook);assert.equal(material.customProgramCacheKey(),key);
  const shader={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader,renderer);
  for(const symbol of ['vBarkWeight','vHowWeatherPosition','vHowCrownPosition','vHowAOPosition'])
    assert.equal(shader.vertexShader.match(new RegExp(`varying (?:float|vec3) ${symbol};`,'g'))?.length,1,symbol);
  assert.ok(shader.uniforms.howWetness);assert.ok(shader.uniforms.howCrownField);assert.ok(shader.uniforms.howAOEnabled);
  assert.match(shader.fragmentShader,/reflectedLight\.indirectDiffuse\*=howAmbient/);
  assert.match(shader.fragmentShader,/directLight\.color \*= howPrimaryCrownTransmission/);
  ao.dispose();assert.ok(!material.customProgramCacheKey().includes(':how-ao-v1'));
  shadows.dispose();assert.ok(!material.customProgramCacheKey().includes(':how-outdoor-shadow-v1'));
  assert.ok(material.customProgramCacheKey().includes(':how-weather-r1:tree'));assert.ok(material.customProgramCacheKey().includes(':how-bark-v2:'));
  assert.equal(shadows.stats().treeDepthBindings,0);assert.equal(shadows.stats().materials,0);
  weather.dispose();resources.dispose();
});
