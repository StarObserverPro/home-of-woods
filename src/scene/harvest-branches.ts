import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Models} from './models.ts';
import type {Resources} from './resources.ts';
import type {Tree} from '../world/layout.ts';
import {heightAt} from '../world/surface.ts';

/** Five tapered, connected segments. The root is +X-facing and seated slightly inside wood. */
export function harvestBranchTemplate(r:Resources,models:Models){
  const geometry=r.geometry('harvest-fork-v1',()=>{
    const segments=[
      [[-.05,0,0],[.72,.27,0],.09,.065],
      [[.72,.27,0],[1.38,.38,.12],.065,.028],
      [[.64,.24,0],[.99,.65,-.31],.05,.018],
      [[1.02,.33,.06],[1.45,.57,.36],.028,.009],
      [[.99,.65,-.31],[1.25,.79,-.37],.018,.006],
    ] as const;
    const parts=segments.map(([a,b,base,tip])=>{
      const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
      const g=new THREE.CylinderGeometry(tip,base,direction.length(),6,1).toNonIndexed();
      const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,uv.getY(i)*direction.length()/2);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
      g.translate(...start.add(end).multiplyScalar(.5).toArray());return g;
    });
    const merged=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());return merged;
  });
  const material=r.own(new THREE.MeshStandardMaterial({color:'#927457',roughness:.86,...models.barkSurface}));
  const root=new THREE.Group();root.add(new THREE.Mesh(geometry,material));return root;
}

/** Surface resolution consumes the exact static/action tree geometry, never changes its world root. */
export function harvestBranchMatrix(tree:Tree,models:Models,approach:{x:number;z:number}){
  const yaw=tree.variant*Math.PI*2,angle=Math.atan2(approach.z-tree.z,approach.x-tree.x);
  const worldDirection=new THREE.Vector3(Math.cos(angle),0,Math.sin(angle));
  const localDirection=worldDirection.clone().applyAxisAngle(new THREE.Vector3(0,1,0),-yaw);
  const geometry=models.treeGeometry(tree.kind,true,tree),probe=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
  // The action-compatible lower bole is guaranteed below the branching crown.
  const y=1.85+(tree.variant*.35),origin=localDirection.clone().multiplyScalar(4);origin.y=y;
  probe.updateMatrixWorld();
  const ray=new THREE.Raycaster(origin,localDirection.clone().negate());
  const weights=geometry.getAttribute('barkWeight');
  const hit=ray.intersectObject(probe).find(hit=>hit.face&&weights.getX(hit.face.a)>.5);
  if(!hit)throw new Error(`No bark attachment for ${tree.id}`);
  // Dense conifer skirts must not slice the fork into disconnected visible tips.
  // Sample its vertical envelope and move the first fork beyond the outermost foliage.
  const stemRadius=hit.point.dot(localDirection);let canopyRadius=stemRadius;
  for(const rise of [0,.3,.6,.9]){
    ray.ray.origin.y=y+rise;
    for(const foliage of ray.intersectObject(probe))if(foliage.face&&weights.getX(foliage.face.a)<.5)
      canopyRadius=Math.max(canopyRadius,foliage.point.dot(localDirection));
  }
  (probe.material as THREE.Material).dispose();
  const position=hit.point.addScaledVector(localDirection,-.035).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).multiplyScalar(tree.scale);
  position.add(new THREE.Vector3(tree.x,heightAt(tree.x,tree.z),tree.z));
  // Bounded branch size: landmarks do not get building-sized collectible sticks.
  const scale=THREE.MathUtils.clamp(tree.scale,.85,1.55);
  const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-angle);
  rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),(tree.variant-.5)*.24));
  return new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(Math.max(scale*(.85+tree.variant*.3),(canopyRadius-stemRadius+.25)*tree.scale/.64),scale,scale));
}
