import * as THREE from "three";
import {createTree} from "./actions/tree.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import {geometryContactTarget} from './axe-contact.ts';
import { PALETTE } from "../content/world.ts";
import { RUNTIME_MODELS } from '../content/assets.ts';
import type { Tree } from "../world/layout.ts";
import type { Resources } from "./resources.ts";
export class Models {
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
    const source=this.templates.get(tree.kind)!;
    source.updateMatrixWorld(true);root.updateWorldMatrix(true,false);
    const name=tree.kind==='pine'?'chunky_pine_trunk':'broadleaf_flared_trunk';
    let trunk:THREE.Mesh|undefined;source.traverse(o=>{if(o instanceof THREE.Mesh&&o.name.startsWith(name))trunk=o;});
    if(!trunk)throw new Error(`Missing actual trunk: ${tree.kind}`);
    return geometryContactTarget(trunk.geometry,root.matrixWorld.clone().multiply(trunk.matrixWorld));
  }
  clear(){this.templates.clear();this.animations.clear();}
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
  treeGeometry(kind: "pine" | "broadleaf", medium=true) {
    return this.r.geometry(`merged-${kind}-${medium}`, () => {
      const composed=medium?createTree(this.templates.get(kind)!,kind):null;composed?.update(0,'climb',true,false);
      const tree=composed?.root??this.templates.get(kind)!;tree.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      tree.traverse((o) => {
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
  distantTreeGeometry(kind:'pine'|'broadleaf'){
    return this.r.geometry(`distant-${kind}-r3`,()=>{
      const parts:THREE.BufferGeometry[]=[];
      const add=(g:THREE.BufferGeometry,color:string)=>{
        const c=new THREE.Color(color),v=new Float32Array(g.getAttribute('position').count*3);
        for(let i=0;i<v.length/3;i++)c.toArray(v,i*3);
        g.setAttribute('color',new THREE.BufferAttribute(v,3));g.deleteAttribute('uv');parts.push(g);
      };
      add(new THREE.CylinderGeometry(.29,.42,2.4,7).translate(0,1.2,0),PALETTE.wood);
      if(kind==='pine'){
        for(const [y,r,h] of [[2.9,2,2.5],[4.3,1.62,2.35],[5.65,1.2,2.35]])
          add(new THREE.ConeGeometry(r,h,7).translate(0,y,0),PALETTE.pine);
      }else{
        for(const [x,y,z,s] of [[-1.1,4,-.3,1.55],[1.1,4.1,0,1.5],[0,5,0,1.9],[0,5.5,.6,1.6]])
          add(new THREE.SphereGeometry(s,7,5).translate(x,y,z),PALETTE.leaf);
      }
      const merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
      if(!merged)throw new Error('Distant tree merge failed');return merged;
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
      const far = trees.filter((t) => t.kind === kind && t.role === "scenery");
      const instances = new THREE.InstancedMesh(
        this.distantTreeGeometry(kind),
        sceneryMaterial,
        far.length,
      );
      const dummy = new THREE.Object3D();
      far.forEach((t, i) => {
        dummy.position.set(t.x, 0, t.z);
        dummy.rotation.y = t.variant * Math.PI * 2;
        dummy.scale.setScalar(t.scale);
        dummy.updateMatrix();
        instances.setMatrixAt(i, dummy.matrix);
      });
      instances.name = `scenic-${kind}`;
      group.add(instances);
      const near = trees.filter((t) => t.kind === kind && t.role !== "scenery");
      near.forEach((t) => {
        const mesh = new THREE.Mesh(this.treeGeometry(kind,t.role!=='landmark'), material);
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
