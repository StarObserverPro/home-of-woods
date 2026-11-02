import * as THREE from 'three';
import type { Resources } from './resources.ts';
import { itemRarity } from '../domain/item-properties.ts';
import type { RarityId } from '../content/rarities.ts';
import { ITEM_VFX, ITEM_VFX_SPEED } from '../content/item-vfx.ts';
import type { EffectRarity } from '../content/item-vfx.ts';
import { createGlintFactory } from './item-glints.ts';

type Binding = {mesh:THREE.Mesh;original:THREE.Material|THREE.Material[];glints?:THREE.Points};
/** Enchanted surface: broad moving sheen + bright cores + surface-anchored soft star glints. */
export function createItemSurface(resources: Resources) {
  const variants = new Map<string,THREE.MeshStandardMaterial>();
  const bindings = new Map<THREE.Object3D,Binding[]>();
  const grades = new WeakMap<THREE.Object3D,RarityId>();
  const time = {value:0}, night = {value:0};
  const glints = createGlintFactory(resources,time,night);
  let elapsed=0, disposed=false;
  function variant(original:THREE.Material,geometry:THREE.BufferGeometry,id:EffectRarity):THREE.Material {
    if (!(original instanceof THREE.MeshStandardMaterial)) return original;
    const key=`${original.uuid}:${geometry.uuid}:${id}`;
    let result=variants.get(key);
    if(result)return result;
    const spec=ITEM_VFX[id];
    geometry.computeBoundingBox();
    const min=geometry.boundingBox!.min.clone(),size=geometry.boundingBox!.getSize(new THREE.Vector3()).max(new THREE.Vector3(.001,.001,.001));
    result=resources.own(original.clone());result.name=`${original.name||'item'}:${id}:surface`;
    const previousCompile=original.onBeforeCompile,previousKey=original.customProgramCacheKey();
    const tint={value:new THREE.Color(spec.tint)};
    const params={value:new THREE.Vector4(spec.veil,spec.sheen,spec.core,spec.rim)};
    result.onBeforeCompile=(shader,renderer)=>{
      previousCompile.call(result!,shader,renderer);
      Object.assign(shader.uniforms,{raritySurfaceTint:tint,rarityParams:params,rarityTime:time,rarityNight:night,rarityMin:{value:min},raritySize:{value:size}});
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
        uniform vec3 rarityMin,raritySize;
        varying vec3 vRarityLocal;
        varying float vRarityOffset;`);
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vRarityLocal=(position-rarityMin)/raritySize;
        vRarityOffset=fract(dot(modelMatrix[3].xyz,vec3(.173,.071,.139)));`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        uniform vec3 raritySurfaceTint;
        uniform vec4 rarityParams;
        uniform float rarityTime,rarityNight;
        varying vec3 vRarityLocal;
        varying float vRarityOffset;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
        float rarityAlbedo=.4+.6*dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
        float warp=.06*sin(vRarityLocal.x*7.0+vRarityLocal.z*4.0+rarityTime*.6);
        float stripe=abs(fract(vRarityLocal.y*.60+vRarityLocal.x*.28+vRarityLocal.z*.18+warp-rarityTime*${ITEM_VFX_SPEED}+vRarityOffset)-.5);
        float sheen=1.0-smoothstep(.035,.22,stripe);
        float core=1.0-smoothstep(.007,.025,stripe);
        float rim=pow(1.0-clamp(dot(normal,normalize(vViewPosition)),0.0,1.0),2.0);
        vec3 rarityLight=raritySurfaceTint*(rarityParams.x+sheen*rarityParams.y+rim*rarityParams.w);
        rarityLight+=mix(raritySurfaceTint,vec3(1.0,.95,.86),.72)*core*rarityParams.z;
        totalEmissiveRadiance+=rarityLight*rarityAlbedo*mix(1.0,.86,rarityNight);`);
    };
    result.customProgramCacheKey=()=>`${previousKey}:rarity-enchantment-v3`;
    variants.set(key,result);return result;
  }
  function apply(root:THREE.Object3D,item:unknown){
    if(disposed)return;
    const rarity=itemRarity(item);
    if(grades.get(root)===rarity.id)return;
    let owned=bindings.get(root);
    if(!owned){
      owned=[];
      root.traverse(object=>{if(object instanceof THREE.Mesh && !(object instanceof THREE.SkinnedMesh) && !(object instanceof THREE.InstancedMesh))owned!.push({mesh:object,original:object.material});});
      bindings.set(root,owned);
    }
    for(const binding of owned){
      binding.glints?.removeFromParent();binding.glints=undefined;
      if(rarity.id==='epic'||rarity.id==='legendary'){
        const id=rarity.id;
        binding.mesh.material=Array.isArray(binding.original)?binding.original.map(m=>variant(m,binding.mesh.geometry,id)):variant(binding.original,binding.mesh.geometry,id);
        binding.glints=glints.create(binding.mesh,id);binding.mesh.add(binding.glints);
      }else binding.mesh.material=binding.original;
    }
    grades.set(root,rarity.id);
  }
  function release(root:THREE.Object3D){
    for(const binding of bindings.get(root)??[]){binding.glints?.removeFromParent();binding.mesh.material=binding.original;}
    bindings.delete(root);grades.delete(root);
  }
  return {apply,release,
    update(dt:number,reducedMotion=false,nightAmount=0){
      if(disposed)return;
      if(!reducedMotion && Number.isFinite(dt) && dt>0)elapsed+=Math.min(dt,.1);
      time.value=reducedMotion?.7:elapsed;
      night.value=THREE.MathUtils.clamp(nightAmount,0,1);
    },
    stats:()=>({variants:variants.size,activeRoots:bindings.size,glintDraws:[...bindings.values()].reduce((n,b)=>n+b.filter(m=>!!m.glints).length,0),elapsed:time.value,...glints.stats()}),
    dispose(){if(disposed)return;for(const root of bindings.keys())release(root);variants.clear();glints.clear();disposed=true;},
  };
}
