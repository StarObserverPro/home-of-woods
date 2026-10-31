import * as THREE from "three";
import {createTree} from "./actions/tree.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {geometryContactTarget} from './axe-contact.ts';
import {heightAt} from '../world/surface.ts';
import { PALETTE } from "../content/world.ts";
import { RUNTIME_MODELS } from '../content/assets.ts';
import type { Tree } from "../world/layout.ts";
import type { Resources } from "./resources.ts";
import {makeTree} from './forest-shapes.js';
import {treeVisual} from '../world/tree-appearance.ts';
export class Models {
  shapeTemplates=new Map<string,THREE.Group>();
  sourceForTree(tree:Tree,distant=false){
    const visual=treeVisual(tree),key=`${visual.key}-${distant}`;let source=this.shapeTemplates.get(key);
    if(!source){source=makeTree(visual.species,visual.seed,distant?1:2);source.traverse(o=>{if(o instanceof THREE.Mesh){this.r.own(o.geometry);const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>this.r.own(m));}});this.shapeTemplates.set(key,source);}
    return source;
  }
  templates = new Map<string, THREE.Group>();
  animations = new Map<string, THREE.AnimationClip[]>();
  private r: Resources;
  constructor(r: Resources) {
    this.r = r;
  }
  async load() {
    const loader = new GLTFLoader();
    let failed = false;
    try {
      await Promise.all(
        RUNTIME_MODELS.map(async ({name, url}) => {
          const gltf = await loader.loadAsync(url);
          gltf.scene.traverse((o) => {
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
          if (!failed && !this.r.disposed){this.templates.set(name, gltf.scene);this.animations.set(name,gltf.animations);}
        }),
      );
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
      const composed=medium?createTree(source,kind):null;composed?.update(0,'climb',true,false);
      const treeRoot=composed?.root??source;treeRoot.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      treeRoot.traverse((o) => {
        let shown=true;for(let parent:THREE.Object3D|null=o;parent;parent=parent.parent)shown=shown&&parent.visible;
        if (shown && o instanceof THREE.Mesh) {
          const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld);
          g.deleteAttribute("uv");
          const color = new THREE.Color(
            (o.material as THREE.MeshStandardMaterial).color,
          );
          const count = g.getAttribute("position").count,
            values = new Float32Array(count * 3);
          for (let i = 0; i < count; i++) color.toArray(values, i * 3);
          g.setAttribute("color", new THREE.BufferAttribute(values, 3));
          parts.push(g);
        }
      });
      const merged = mergeGeometries(parts, false);
      parts.forEach((g) => g.dispose());composed?.dispose();
      if (!merged) throw new Error("Tree geometry merge failed");
      return merged;
    });
  }
  createForest(trees: Tree[]) {
    const group = new THREE.Group(),
      selections = new Map<string, THREE.Object3D>();
    const material = this.r.own(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.65,
        metalness: 0,
      }),
    );
    const sceneryMaterial = this.r.own(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.82,
        metalness: 0,
      }),
    );
    const mappings = new Map<THREE.Object3D, string[]>();
    for (const kind of ["pine", "broadleaf"] as const) {
      const far = trees.filter(t=>t.kind===kind&&t.role==='scenery');
      const keys=[...new Set(far.map(t=>treeVisual(t).key))];
      for(const key of keys){const members=far.filter(t=>treeVisual(t).key===key);
        const instances=this.r.own(new THREE.InstancedMesh(this.treeGeometry(kind,true,members[0],true),sceneryMaterial,members.length));
        const dummy=new THREE.Object3D();members.forEach((t,i)=>{dummy.position.set(t.x,heightAt(t.x,t.z),t.z);dummy.rotation.y=t.variant*Math.PI*2;dummy.scale.setScalar(t.scale);dummy.updateMatrix();instances.setMatrixAt(i,dummy.matrix);});
        instances.name=`scenic-shape-${key}`;instances.computeBoundingSphere();group.add(instances);
      }
      const near = trees.filter((t) => t.kind === kind && t.role !== "scenery");
      near.forEach((t) => {
        const mesh = new THREE.Mesh(this.treeGeometry(kind,true,t), material);
        mesh.name = t.id;
        mesh.position.set(t.x, 0, t.z);
        mesh.rotation.y = t.variant * Math.PI * 2;
        mesh.scale.setScalar(t.scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        selections.set(t.id, mesh);
        mappings.set(mesh, [t.id]);
      });
    }
    return { group, selections, mappings, material };
  }
}
export function createSign(r: Resources, label: string) {
  const group = new THREE.Group();
  const post = new THREE.Mesh(
    r.geometry(
      "sign-post",
      () => new THREE.CylinderGeometry(0.13, 0.17, 2.4, 7),
    ),
    r.material(PALETTE.wood),
  );
  post.position.y = 1.2;
  post.castShadow = true;
  group.add(post);
  const board = new THREE.Mesh(
    r.geometry("sign-board", () => new THREE.BoxGeometry(2.7, 0.95, 0.18)),
    r.material("#c0a270"),
  );
  board.position.set(0, 2.1, 0);
  board.castShadow = true;
  group.add(board);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#443f2c";
  ctx.font = '600 55px "Microsoft YaHei",sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 256, 80);
  const texture = r.own(new THREE.CanvasTexture(canvas));
  texture.colorSpace = THREE.SRGBColorSpace;
  const text = new THREE.Mesh(
    r.geometry("sign-text", () => new THREE.PlaneGeometry(2.55, 0.8)),
    r.own(
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      }),
    ),
  );
  text.position.set(0, 2.1, 0.1);
  group.add(text);
  return group;
}
