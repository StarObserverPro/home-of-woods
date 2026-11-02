import * as THREE from 'three';
import type { Resources } from './resources.ts';
import { itemRarity } from '../domain/item-properties.ts';
import type { RarityId } from '../content/rarities.ts';
import { ITEM_VFX, ITEM_VFX_SPEED, ITEM_VFX_LIGHT, isRarityVfxMode } from '../content/item-vfx.ts';
import type { EffectRarity, RarityVfxMode } from '../content/item-vfx.ts';
import { createGlintFactory } from './item-glints.ts';
import { createEmblemFactory } from './item-emblem.ts';

type Binding = {mesh:THREE.Mesh;original:THREE.Material|THREE.Material[];glints?:THREE.Points;glintRarity?:EffectRarity};
/** Enchanted surface: broad moving sheen + bright cores + surface-anchored soft star glints. */
export function createItemSurface(resources: Resources) {
  const variants = new Map<string,THREE.MeshStandardMaterial>();
  const bindings = new Map<THREE.Object3D,Binding[]>();
  const grades = new WeakMap<THREE.Object3D,RarityId>();
  const time = {value:0}, night = {value:0};
  const glints = createGlintFactory(resources,time,night);
  const emblems = createEmblemFactory(resources,night);
  const stickers = new Map<THREE.Object3D,{mesh:THREE.Mesh;object:THREE.Mesh;rarity:EffectRarity}>();
  let mode:RarityVfxMode='full';
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
      Object.assign(shader.uniforms,{raritySurfaceTint:tint,rarityLightScale:{value:new THREE.Vector2(ITEM_VFX_LIGHT[id].day,ITEM_VFX_LIGHT[id].night)},rarityParams:params,rarityTime:time,rarityNight:night,rarityMin:{value:min},raritySize:{value:size}});
      shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
        uniform vec3 rarityMin,raritySize;
        varying vec3 vRarityLocal;
        varying float vRarityOffset;`);
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vRarityLocal=(position-rarityMin)/raritySize;
        vRarityOffset=fract(dot(modelMatrix[3].xyz,vec3(.173,.071,.139)));`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        uniform vec3 raritySurfaceTint;
        uniform vec4 rarityParams; uniform vec2 rarityLightScale;
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
        totalEmissiveRadiance+=rarityLight*rarityAlbedo*mix(rarityLightScale.x,rarityLightScale.y,rarityNight);`);
    };
    result.customProgramCacheKey=()=>`${previousKey}:rarity-enchantment-v4`;
    variants.set(key,result);return result;
  }
  function present(root:THREE.Object3D,rarity:RarityId){
    const owned=bindings.get(root)??[];
    stickers.get(root)?.object.removeFromParent();
    for(const binding of owned){
      binding.glints?.removeFromParent();
      binding.mesh.material=binding.original;
    }
    if(rarity!=='epic'&&rarity!=='legendary'||mode==='off')return;
    if(mode==='full'){
      for(const binding of owned){
        binding.mesh.material=Array.isArray(binding.original)?binding.original.map(m=>variant(m,binding.mesh.geometry,rarity)):variant(binding.original,binding.mesh.geometry,rarity);
        if(!binding.glints||binding.glintRarity!==rarity){binding.glints=glints.create(binding.mesh,rarity);binding.glintRarity=rarity;}
        binding.mesh.add(binding.glints);
      }
    }else{
      let sticker=stickers.get(root);
      if(!sticker||sticker.rarity!==rarity){
        // One sticker per item, on its largest supported mesh. Never one per material slot.
        const candidates=[...owned].sort((a,b)=>{
          a.mesh.geometry.computeBoundingBox();b.mesh.geometry.computeBoundingBox();
          return b.mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).lengthSq()-a.mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).lengthSq();
        });
        stickers.delete(root);sticker=undefined;
        for(const binding of candidates){
          const object=emblems.create(binding.mesh,rarity);
          if(object){sticker={mesh:binding.mesh,object,rarity};stickers.set(root,sticker);break;}
        }
      }
      sticker?.mesh.add(sticker.object);
    }
  }
  function apply(root:THREE.Object3D,item:unknown){
    if(disposed)return;
    const rarity=itemRarity(item);
    if(grades.get(root)===rarity.id)return;
    if(!bindings.has(root)){
      const owned:Binding[]=[];
      root.traverse(object=>{if(object instanceof THREE.Mesh && !(object instanceof THREE.SkinnedMesh) && !(object instanceof THREE.InstancedMesh))owned.push({mesh:object,original:object.material});});
      bindings.set(root,owned);
    }
    present(root,rarity.id);grades.set(root,rarity.id);
  }
  function release(root:THREE.Object3D){
    for(const binding of bindings.get(root)??[]){binding.glints?.removeFromParent();binding.mesh.material=binding.original;}
    stickers.get(root)?.object.removeFromParent();stickers.delete(root);
    bindings.delete(root);grades.delete(root);
  }
  return {apply,release,
    setMode(value:RarityVfxMode){
      if(disposed||!isRarityVfxMode(value)||value===mode)return;
      mode=value;for(const root of bindings.keys())present(root,grades.get(root)!);
    },
    update(dt:number,reducedMotion=false,nightAmount=0){
      if(disposed)return;
      if(mode==='full' && !reducedMotion && Number.isFinite(dt) && dt>0)elapsed+=Math.min(dt,.1);
      time.value=reducedMotion?.7:elapsed;
      night.value=THREE.MathUtils.clamp(nightAmount,0,1);
    },
    stats:()=>({mode,emblemDraws:[...stickers.values()].filter(s=>!!s.object.parent).length,...emblems.stats(),variants:variants.size,activeRoots:bindings.size,glintDraws:[...bindings.values()].reduce((n,b)=>n+b.filter(m=>!!m.glints?.parent).length,0),elapsed:time.value,...glints.stats()}),
    dispose(){if(disposed)return;for(const root of bindings.keys())release(root);variants.clear();glints.clear();emblems.clear();disposed=true;},
  };
}
