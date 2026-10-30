import * as THREE from 'three';
import { CHARACTER } from '../content/characters.ts';

export type SolidTarget = {kind:'solid';points:THREE.Vector3[];axes:THREE.Vector3[];depth:number};
export type SupportTarget = {kind:'support';x:number;z:number;y:number;radius:number};
export type AxeTarget = SolidTarget|SupportTarget;
export type AxeSamples = {head:THREE.Mesh;points:THREE.Vector3[];axes:THREE.Vector3[]};
export type AxeContact = {clearance:number;point:THREE.Vector3|null};
export type AxeStop = AxeContact & {fraction:number;found:boolean};
const ease=(t:number)=>t*t*(3-2*t);
const shapes=new WeakMap<THREE.BufferGeometry,{points:THREE.Vector3[];axes:THREE.Vector3[]}>();
function shapeFor(geometry:THREE.BufferGeometry){
  const known=shapes.get(geometry);if(known)return known;
  const points:THREE.Vector3[]=[],keys=new Set<string>(),p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++){
    const v=new THREE.Vector3().fromBufferAttribute(p,i),key=v.toArray().map(n=>n.toFixed(6)).join(',');
    if(!keys.has(key)){keys.add(key);points.push(v);}
  }
  const shape={points,axes:geometryAxes(geometry)};shapes.set(geometry,shape);return shape;
}
export function stoppedStrokeFraction(phase:number,start:number,contact:number){
  const p=THREE.MathUtils.clamp(phase,0,1);
  if(p<CHARACTER.strikePhase)return THREE.MathUtils.lerp(start,contact,ease(p/CHARACTER.strikePhase));
  if(p<CHARACTER.releasePhase)return contact;
  return THREE.MathUtils.lerp(contact,start,ease((p-CHARACTER.releasePhase)/(1-CHARACTER.releasePhase)));
}
function geometryAxes(geometry:THREE.BufferGeometry){
  const axes:THREE.Vector3[]=[],keys=new Set<string>(),p=geometry.getAttribute('position'),index=geometry.index;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<(index?.count??p.count);i+=3){
    a.fromBufferAttribute(p,index?index.getX(i):i);b.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);
    const n=b.sub(a).cross(c.sub(a));if(n.lengthSq()<1e-14)continue;n.normalize();
    if(n.x<-.00001||(Math.abs(n.x)<.00001&&n.y<-.00001)||(Math.abs(n.x)+Math.abs(n.y)<.00001&&n.z<0))n.negate();
    const key=n.toArray().map(v=>Math.round(v*10000)).join(',');
    if(!keys.has(key)){keys.add(key);axes.push(n.clone());}
  }
  return axes;
}
export function axeHeadSamples(tool:THREE.Object3D):AxeSamples{
  const head=tool.getObjectByName('woodcutting_axe_head');
  if(!(head instanceof THREE.Mesh))throw new Error('Missing cutting head');
  const shape=shapeFor(head.geometry);
  return {head,points:shape.points,axes:shape.axes};
}
/** Read actual exported trunk vertices; do not mutate or allocate shared GPU geometry. */
export function geometryContactTarget(geometry:THREE.BufferGeometry,matrix:THREE.Matrix4,depth=CHARACTER.maxWoodBite):SolidTarget{
  const shape=shapeFor(geometry),points=shape.points.map(p=>p.clone().applyMatrix4(matrix));
  const normal=new THREE.Matrix3().getNormalMatrix(matrix);
  return {kind:'solid',points,axes:shape.axes.map(v=>v.clone().applyMatrix3(normal).normalize()),depth};
}
/** Conservative projections test the whole blade, including edges that straddle a thin trunk. */
export function contactClearance(samples:AxeSamples,target:AxeTarget):AxeContact{
  samples.head.updateWorldMatrix(true,false);
  const world=samples.points.map(p=>p.clone().applyMatrix4(samples.head.matrixWorld));
  if(target.kind==='solid'){
    const normal=new THREE.Matrix3().getNormalMatrix(samples.head.matrixWorld);
    const axes=[...target.axes,...samples.axes.map(v=>v.clone().applyMatrix3(normal).normalize())];
    let gap=-Infinity,point=world[0];
    for(const axis of axes){
      let minA=Infinity,maxA=-Infinity,minB=Infinity,maxB=-Infinity,minIndex=0,maxIndex=0;
      for(let i=0;i<world.length;i++){const projection=world[i].dot(axis);if(projection<minA){minA=projection;minIndex=i;}if(projection>maxA){maxA=projection;maxIndex=i;}}
      for(const p of target.points){const projection=p.dot(axis);minB=Math.min(minB,projection);maxB=Math.max(maxB,projection);}
      const separation=Math.max(minA-maxB,minB-maxA);
      if(separation>gap){gap=separation;point=world[minA-maxB>minB-maxA?minIndex:maxIndex];}
    }
    return {clearance:gap+target.depth,point};
  }
  const box=new THREE.Box3().setFromPoints(world);
  const nearest=new THREE.Vector3(target.x,0,target.z).clamp(new THREE.Vector3(box.min.x,0,box.min.z),new THREE.Vector3(box.max.x,0,box.max.z));
  if(Math.hypot(nearest.x-target.x,nearest.z-target.z)>target.radius)return {clearance:Infinity,point:null};
  const point=world.reduce((a,b)=>a.y<b.y?a:b);
  return {clearance:point.y-target.y,point};
}
export function findAxeStop(sample:(fraction:number)=>void,samples:AxeSamples,target:AxeTarget,start:number,end:number):AxeStop{
  let previous=start;
  sample(start);let result=contactClearance(samples,target);
  if(result.clearance<=0)return {fraction:start,...result,found:true};
  for(let i=1;i<=48;i++){
    const fraction=THREE.MathUtils.lerp(start,end,i/48);sample(fraction);result=contactClearance(samples,target);
    if(result.clearance<=0){
      let low=previous,high=fraction;
      for(let n=0;n<22;n++){const mid=(low+high)/2;sample(mid);if(contactClearance(samples,target).clearance<=0)high=mid;else low=mid;}
      sample(low);return {fraction:low,...contactClearance(samples,target),found:true};
    }
    previous=fraction;
  }
  sample(end);return {fraction:end,...contactClearance(samples,target),found:false};
}
