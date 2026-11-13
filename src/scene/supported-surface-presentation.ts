import {woodCoordinates,woodMaterial} from './wood-grain.ts';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {geometryParts,verifiedGeometrySpec} from '../domain/parametric-crafting.ts';
import type {GeometryPart,GeometrySpec} from '../domain/parametric-crafting.ts';
import type {Resources} from './resources.ts';

export type SupportedSurfaceLook='bench'|'table';
/** Shared parts, material palette and geometry caches for furniture and its assembly preview. */
export function createSupportedSurfaceFactory(r:Resources){
  const materials={surface:woodMaterial(r,'#d1ac72',.78),frame:woodMaterial(r,'#9d7246',.84),endgrain:woodMaterial(r,'#624936',.88)};
  const keyFor=(part:GeometryPart)=>`${part.primitive}:${part.dimensions.x}:${part.dimensions.y}:${part.dimensions.z}`;
  function partGeometry(part:GeometryPart){
    return r.geometry('supported-part:'+keyFor(part),()=>{
      const {x,y,z}=part.dimensions;
      return part.primitive==='cylinder'?woodCoordinates(new THREE.CylinderGeometry(x/2,z/2,y,9),'round-board','y'):woodCoordinates(new RoundedBoxGeometry(x,y,z,1,Math.min(.045,x/4,y/4,z/4)));
    });
  }
  function partEdges(part:GeometryPart){return r.geometry('supported-guide:'+keyFor(part),()=>{
    const geometry=new THREE.EdgesGeometry(partGeometry(part),25),positions=geometry.getAttribute('position'),distances=new Float32Array(positions.count);
    for(let i=0;i<positions.count;i+=2)distances[i+1]=Math.hypot(positions.getX(i+1)-positions.getX(i),positions.getY(i+1)-positions.getY(i),positions.getZ(i+1)-positions.getZ(i));
    geometry.setAttribute('lineDistance',new THREE.BufferAttribute(distances,1));return geometry;
  });}
  function geometryKey(value:GeometrySpec){
    const spec=verifiedGeometrySpec(value);
    return `${spec.templateId}:${spec.version}:`+Object.entries(spec.parameters).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>`${key}=${value}`).join(',');
  }
  function merge(key:string,parts:()=>THREE.BufferGeometry[]){
    return r.geometry(key,()=>{
      const originals=parts(),normalized=originals.map(part=>part.index?part.toNonIndexed():part.clone());
      try{
        const geometry=mergeGeometries(normalized,false);if(!geometry)throw Error('Cannot merge supported-surface parts');
        geometry.computeBoundingSphere();return geometry;
      }finally{for(const part of [...originals,...normalized])part.dispose();}
    });
  }
  function mesh(root:THREE.Group,geometry:THREE.BufferGeometry,material:THREE.Material,name:string){
    const object=new THREE.Mesh(geometry,material);object.name=name;object.castShadow=object.receiveShadow=true;root.add(object);return object;
  }
  function create(value:GeometrySpec,look:SupportedSurfaceLook){
    const spec=verifiedGeometrySpec(value);if(spec.family!=='supported-surface')throw Error('Expected a supported surface');
    const parts=geometryParts(spec),key=geometryKey(spec),root=new THREE.Group();
    const placed=(part:GeometryPart)=>partGeometry(part).clone().translate(part.center.x,part.center.y,part.center.z);
    mesh(root,merge('supported-surface:'+key,()=>parts.filter(part=>part.id==='surface').map(placed)),materials.surface,'supported-surface');
    mesh(root,merge('supported-frame:'+key,()=>parts.filter(part=>part.id!=='surface').map(placed)),materials.frame,'supported-frame');
    if(look==='bench'){
      const p=spec.parameters,length=p.length as number,width=p.width as number,height=p.height as number,inset=p.supportInset as number,backZ=-width/2+.07;
      const box=(x:number,y:number,z:number,cx:number,cy:number,cz:number)=>woodCoordinates(new RoundedBoxGeometry(x,y,z,1,Math.min(.045,x/4,y/4,z/4))).translate(cx,cy,cz);
      mesh(root,merge('supported-bench-back:'+key,()=>[
        box(length,.25,.14,0,height+.55,backZ),
        ...[-1,1].map(side=>box(.12,.7,.12,side*(length/2-inset),height+.25,backZ)),
      ]),materials.surface,'bench-backrest');
    }else{
      const p=spec.parameters,length=p.length as number,width=p.width as number,height=p.height as number;
      const bowlScale=Math.min(1,width/.65),bowlX=length*.23,bowlZ=width*.12;
      mesh(root,merge('supported-prep-kit:'+key,()=>{
        const profile=[new THREE.Vector2(0,0),new THREE.Vector2(.09,0),new THREE.Vector2(.15,.07),new THREE.Vector2(.17,.16),new THREE.Vector2(.145,.16),new THREE.Vector2(.12,.07),new THREE.Vector2(0,.035)];
        return [
          woodCoordinates(new RoundedBoxGeometry(length*.4,.04,width*.48,1,.015)).translate(-length*.22,height+.022,0),
          woodCoordinates(new THREE.LatheGeometry(profile,9),'board','y').scale(bowlScale,bowlScale,bowlScale).translate(bowlX,height+.002,bowlZ),
        ];
      }),materials.frame,'prep-board-and-empty-bowl');
      mesh(root,merge('supported-prep-spoon:'+key,()=>[
        woodCoordinates(new THREE.CylinderGeometry(.023,.026,.38,7),'round-board','y').rotateZ(Math.PI/2).rotateY(-.22).translate(-length*.20,height+.065,0),
        woodCoordinates(new THREE.SphereGeometry(.075,7,4),'board','x').scale(1,.25,.7).translate(-length*.20+.20,height+.065,-.045),
      ]),materials.surface,'prep-wooden-spoon');
      root.userData.prepKit='fixed-empty-utensils';
    }
    root.userData.ambientOccluder={width:spec.parameters.length,height:spec.parameters.height,depth:spec.parameters.width};
    root.userData.supportedGeometryKey=key;root.userData.supportedLook=look;root.userData.supportedPartIds=parts.map(part=>part.id);return root;
  }
  return {create,partGeometry,partEdges,geometryKey,materials,signature:(spec:GeometrySpec,look:SupportedSurfaceLook)=>`${look}:${geometryKey(spec)}`};
}
