import {CREEK_BRIDGE} from '../content/regions.ts';
import * as THREE from "three";
import {createTree} from "./actions/tree.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {geometryContactTarget} from './axe-contact.ts';
import {heightAt} from '../world/surface.ts';
import { ENABLED_RUNTIME_MODELS } from '../content/assets.ts';
import { LOCAL_CHARACTER_MODELS,LOCAL_CHARACTER_PREFIX } from '../content/characters.ts';
import type { Tree } from "../world/layout.ts";
import type { Resources } from "./resources.ts";
import {makeTree} from './forest-shapes.js';
import {barkUV,createBarkSurface,configureForestBark} from './bark-surface.ts';
import {treeVisual} from '../world/tree-appearance.ts';
import {usesActionTree} from '../world/tree-dimensions.ts';
import {makeCampTreeShape} from './camp-tree-shape.ts';
export class Models {
  barkSurface:ReturnType<typeof createBarkSurface>;
  shapeTemplates=new Map<string,THREE.Group>();
  sourceForTree(tree:Tree,distant=false){
    const visual=treeVisual(tree),key=`${visual.key}-${distant}`;let source=this.shapeTemplates.get(key);
    if (!source) {
      source = tree.woodland ? makeCampTreeShape(tree.woodland,visual.seed,distant) : makeTree(visual.species,visual.seed,distant?1:2);
      source.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        this.r.own(o.geometry);
        if (!distant && o.name === 'trunk') {
          const bark = o.material as THREE.MeshStandardMaterial;
          bark.map = this.barkSurface.map;
          bark.normalMap = this.barkSurface.normalMap;
        }
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach(material => this.r.own(material));
      });
      this.shapeTemplates.set(key,source);
    }
    return source;
  }
  templates = new Map<string, THREE.Group>();
  animations = new Map<string, THREE.AnimationClip[]>();
  private r: Resources;
  constructor(r: Resources) {
    this.r = r;
    this.barkSurface=createBarkSurface(r);
  }
  async load() {
    const loader = new GLTFLoader();
    let failed = false;
    const register=(name:string,gltf:GLTF)=>{
      gltf.scene.traverse((o) => {
        if (o instanceof THREE.SkinnedMesh) this.r.own(o.skeleton);
        if (o instanceof THREE.Mesh) {
          this.r.own(o.geometry);
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            this.r.own(m);
            for(const value of Object.values(m))if(value instanceof THREE.Texture)this.r.own(value);
          });
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      if (!failed && !this.r.disposed){
        this.templates.set(name,gltf.scene);this.animations.set(name,gltf.animations);
      }
    };
    try {
      const loading=ENABLED_RUNTIME_MODELS.map(async spec=>{
        const gltf=await loader.loadAsync(spec.url).catch(error=>{
          if('optional' in spec&&spec.optional){console.warn(`Optional wildlife unavailable: ${spec.name}`,error);return null;}
          throw error;
        });
        if(gltf)register(spec.name,gltf);
      });
      if(import.meta.env?.DEV)loading.push(...LOCAL_CHARACTER_MODELS.map(async name=>{
        try{
          const response=await fetch(`${LOCAL_CHARACTER_PREFIX}${name}.glb`);
          if(response.status===204)return;
          if(!response.ok)throw new Error(`HTTP ${response.status}`);
          register(name,await loader.parseAsync(await response.arrayBuffer(),''));
        }catch(error){console.warn(`Local character unavailable: ${name}`,error);}
      }));
      await Promise.all(loading);
    } catch (error) {
      failed = true;
      this.templates.clear();
      this.animations.clear();
      throw error;
    }
  }
  clone(name: string) {
    const source=this.templates.get(name);
    if(!source)throw new Error(`Missing model ${name}`);
    const object=cloneSkeleton(source) as THREE.Group;
    object.traverse(o=>{if(o instanceof THREE.SkinnedMesh)this.r.own(o.skeleton);});
    return object;
  }
  trunkContact(tree:Tree,root:THREE.Object3D){
    const dynamic=root.userData.actionTree as ReturnType<typeof createTree>|undefined;
    const collar=dynamic?.root.getObjectByName('cut-collar') as THREE.Mesh|undefined;
    if(collar){collar.updateWorldMatrix(true,false);return geometryContactTarget(collar.geometry,collar.matrixWorld);}
    const geometry=this.r.geometry(`contact-${treeVisual(tree).key}`,()=>{
      const parts=createTree(this.sourceForTree(tree),tree.kind);parts.root.updateMatrixWorld(true);
      const collar=parts.root.getObjectByName('cut-collar') as THREE.Mesh;
      const g=collar.geometry.clone().applyMatrix4(collar.matrixWorld);parts.dispose();return g;
    });root.updateWorldMatrix(true,false);return geometryContactTarget(geometry,root.matrixWorld);
  }

  clear(){this.shapeTemplates.clear();this.templates.clear();this.animations.clear();}
  staticClone(name: string) {
    const source = this.templates.get(name)!;
    source.updateMatrixWorld(true);
    const groups = new Map<
      THREE.Material,
      { material: THREE.Material; parts: THREE.BufferGeometry[] }
    >();
    source.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const material = o.material as THREE.Material;
        if (!groups.has(material))
          groups.set(material, { material, parts: [] });
        const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
        g.deleteAttribute("uv");
        groups.get(material)!.parts.push(g);
      }
    });
    const root = new THREE.Group();
    root.name = name;
    let index = 0;
    groups.forEach(({ material, parts }) => {
      const geometry = this.r.geometry(`static-${name}-${index++}`, () => {
        const merged = mergeGeometries(parts, false);
        if (!merged) throw new Error("Static model merge failed");
        return merged;
      });
      parts.forEach((p) => p.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    });
    return root;
  }
  treeGeometry(kind: "pine" | "broadleaf", medium=true, tree?:Tree,distant=false) {
    return this.r.geometry(`merged-${kind}-${medium}-${tree?treeVisual(tree).key:"legacy"}-${distant}`, () => {
      const source=tree?this.sourceForTree(tree,distant):this.templates.get(kind)!;
      const composed=medium&&(!tree||usesActionTree(tree))?createTree(source,kind):null;composed?.update(0,'climb',true,false);
      const treeRoot=composed?.root??source;treeRoot.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      treeRoot.traverse((o) => {
        let shown=true;for(let parent:THREE.Object3D|null=o;parent;parent=parent.parent)shown=shown&&parent.visible;
        if (shown && o instanceof THREE.Mesh) {
          const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
          const material=o.material as THREE.MeshStandardMaterial;
          const isBark=!!material.map;
          // Wood cut faces need solid shadows even when they have no bark texture.
          const isCrown=/crown|tier|leaf/i.test(o.name);
          g.setAttribute('shadowSolidWeight',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(isCrown?0:1),1));
          if(distant){g.deleteAttribute("uv");g.deleteAttribute('barkWeight');}
          else {barkUV(g,isBark);
            g.setAttribute('barkWeight',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(isBark?1:0),1));
          }
          if (!material.vertexColors || !g.hasAttribute('color')) {
            const count = g.getAttribute('position').count, values = new Float32Array(count * 3);
            for (let i = 0; i < count; i++) material.color.toArray(values, i * 3);
            g.setAttribute('color',new THREE.BufferAttribute(values,3));
          }
          parts.push(g);
        }
      });
      const merged = mergeGeometries(parts, false);
      parts.forEach((g) => g.dispose());composed?.dispose();
      if (!merged) throw new Error("Tree geometry merge failed");
      return merged;
    });
  }
  createForest(trees: Tree[],streaming=false) {
    // The visible roster also feeds canopy occlusion; bridge-cleared scenery cannot leave a shadow.
    // Managed trees retain their gameplay identity and can switch between near and distant views.
    const canopyTrees=trees.filter(t=>t.role!=='scenery'||!(Math.abs(t.z-CREEK_BRIDGE.west.z)<CREEK_BRIDGE.width/2+2&&t.x>CREEK_BRIDGE.west.x&&t.x<CREEK_BRIDGE.east.x+6));
    const group = new THREE.Group(),
      selections = new Map<string, THREE.Object3D>();
    const material = this.r.own(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.65,
        metalness: 0,
      }),
    );
    configureForestBark(material,this.barkSurface);
    const sceneryMaterial = this.r.own(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.82,
        metalness: 0,
      }),
    );
    const mappings = new Map<THREE.Object3D, string[]>();
    const sceneryBatches:{mesh:THREE.InstancedMesh;members:Tree[]}[]=[];
    for (const kind of ["pine", "broadleaf"] as const) {
      const far = canopyTrees.filter(t=>t.kind===kind&&(t.role==='scenery'||streaming&&t.role==='managed'));
      const keys=[...new Set(far.map(t=>treeVisual(t).key))];
      for(const key of keys){const members=far.filter(t=>treeVisual(t).key===key);
        const localScenery=members[0].role==='scenery'&&!!members[0].woodland&&!members[0].regeneration;
        const instances=this.r.own(new THREE.InstancedMesh(this.treeGeometry(kind,true,members[0],!localScenery),localScenery?material:sceneryMaterial,members.length));
        const dummy=new THREE.Object3D();members.forEach((t,i)=>{dummy.position.set(t.x,heightAt(t.x,t.z),t.z);dummy.rotation.y=t.variant*Math.PI*2;dummy.scale.setScalar(t.scale);dummy.updateMatrix();instances.setMatrixAt(i,dummy.matrix);});
        instances.name=`scenic-shape-${key}`;instances.castShadow=instances.receiveShadow=true;
        instances.computeBoundingSphere();group.add(instances);sceneryBatches.push({mesh:instances,members});
      }
      const near = trees.filter((t) => t.kind === kind && t.role !== "scenery");
      near.forEach((t) => {
        const mesh = new THREE.Mesh(this.treeGeometry(kind,true,t), material);
        mesh.name = t.id;
        mesh.position.set(t.x, heightAt(t.x,t.z), t.z);
        mesh.rotation.y = t.variant * Math.PI * 2;
        mesh.scale.setScalar(t.scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        selections.set(t.id, mesh);
        mappings.set(mesh, [t.id]);
      });
    }
    return { group, selections, mappings, material,sceneryBatches,canopyTrees };
  }
}
