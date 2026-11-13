import * as THREE from 'three';
import type {Models} from './models.ts';
import type {Resources} from './resources.ts';
import {attachedBranchGeometry} from './branch-attachment.ts';

/** Preserve the authored junction twig; its near bark borrows the forest's two shared maps. */
export function harvestBranchTemplate(r:Resources,models:Models){
  const geometry=r.geometry('attached-gather-branch',attachedBranchGeometry);
  const material=r.own(new THREE.MeshStandardMaterial({color:'#917254',roughness:.9,...models.barkSurface}));
  const root=new THREE.Group();root.add(new THREE.Mesh(geometry,material));return root;
}
