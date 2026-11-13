import * as THREE from 'three';
import type {OcclusionVolume} from '../../world/occlusion.ts';

/** Read original named GLB parts before material batching; never include upgrade ghosts or guy ropes. */
export function buildingOcclusionVolumes(id:'cabin'|'tent',source:THREE.Object3D,placement:THREE.Object3D):OcclusionVolume[]{
  source.updateWorldMatrix(true,true);placement.updateWorldMatrix(true,false);
  const parts=new Map<string,THREE.Box3>();
  source.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
    const name=o.name.replace(/[._]?\d+$/,'');
    if(!['wood_floor','stone_foundation','back_log','side_log','front_left','front_right','groundsheet','canvas_panel','canvas_back'].includes(name))return;
    o.geometry.computeBoundingBox();const box=o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld);
    const key=name==='side_log'?`${name}:${Math.sign(box.getCenter(new THREE.Vector3()).x)}`:name;
    if(parts.has(key))parts.get(key)!.union(box);else parts.set(key,box);
  });
  const floor=parts.get(id==='cabin'?'wood_floor':'groundsheet');
  if(!floor)throw new Error(`Missing authored floor for ambient occlusion: ${id}`);
  const scale=new THREE.Vector3(),q=new THREE.Quaternion();placement.matrixWorld.decompose(new THREE.Vector3(),q,scale);
  const yaw=new THREE.Euler().setFromQuaternion(q,'YXZ').y,volumes:OcclusionVolume[]=[];
  function add(name:string,x:number,y:number,z:number,w:number,h:number,d:number,strength:number,detail:boolean,softness=.55){
    const p=new THREE.Vector3(x,y,z).applyMatrix4(placement.matrixWorld);
    volumes.push({id:`${id}:${name}`,center:p.toArray() as [number,number,number],halfSize:[w*Math.abs(scale.x)/2,h*Math.abs(scale.y)/2,d*Math.abs(scale.z)/2],yaw,softness,strength,detail});
  }
  const c=floor.getCenter(new THREE.Vector3()),s=floor.getSize(new THREE.Vector3()),y=floor.max.y;
  const ceiling=id==='cabin'?(parts.get('back_log')?.max.y??y+2.5):(parts.get('canvas_panel')?.max.y??y+3.5);
  const h=Math.max(.5,ceiling-y)*(id==='tent'?.45:.80);
  add('enclosure',c.x,y+h/2,c.z,s.x*(id==='tent'?.72:.94),h,s.z*.94,id==='tent'?.14:.20,false,.65);
  if(id==='cabin'){
    for(const [name,box] of parts)if(/^(back_log|front_left|front_right|side_log)/.test(name)){
      const p=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
      add(`wall-root:${name}`,p.x,y+.05,p.z,size.x,.10,size.z,.34,true);
    }
  }else{
    for(const side of [-1,1])add(`canvas-root:${side}`,c.x+side*s.x/2,y+.035,c.z,.05,.07,s.z,.28,true,.65);
    const back=parts.get('canvas_back');if(back){const p=back.getCenter(new THREE.Vector3()),size=back.getSize(new THREE.Vector3());add('canvas-root:back',p.x,y+.035,p.z,size.x,.07,.05,.28,true,.65);}
  }
  const base=parts.get(id==='cabin'?'stone_foundation':'groundsheet')??floor,p=base.getCenter(new THREE.Vector3()),size=base.getSize(new THREE.Vector3());
  add('foundation-contact',p.x,base.min.y+.02,p.z,size.x,.04,size.z,.26,true,.55);
  return volumes;
}
