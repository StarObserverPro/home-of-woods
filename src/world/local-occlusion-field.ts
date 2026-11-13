import {volumeWeight} from './occlusion.ts';
import type {OcclusionVolume,XYZ} from './occlusion.ts';
export type LocalOcclusionField={min:XYZ;max:XYZ;size:XYZ;data:Uint8Array};
/** Bake on layout changes, not per frame. R=stable room shade, G=near contact detail. */
export function bakeLocalOcclusion(volumes:readonly OcclusionVolume[]):LocalOcclusionField{
  if(!volumes.length)return {min:[0,0,0],max:[1,1,1],size:[1,1,1],data:new Uint8Array(2)};
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const boxes=volumes.map(v=>{
    const c=Math.abs(Math.cos(v.yaw)),s=Math.abs(Math.sin(v.yaw));
    const h=[c*v.halfSize[0]+s*v.halfSize[2]+v.softness,v.halfSize[1]+v.softness,s*v.halfSize[0]+c*v.halfSize[2]+v.softness];
    const low=h.map((n,a)=>v.center[a]-n),high=h.map((n,a)=>v.center[a]+n);
    for(let a=0;a<3;a++){min[a]=Math.min(min[a],low[a]);max[a]=Math.max(max[a],high[a]);}
    return {v,low,high};
  });
  // Bound memory in large camp layouts; compact rooms keep ~12 cm detail samples.
  const size=min.map((n,a)=>Math.max(2,Math.min(a===1?48:128,Math.ceil((max[a]-n)/.12)+1))) as [number,number,number];
  const step=size.map((n,a)=>(max[a]-min[a])/(n-1));
  const data=new Uint8Array(size[0]*size[1]*size[2]*2);
  for(const {v,low,high} of boxes){
    const from=low.map((n,a)=>Math.max(0,Math.floor((n-min[a])/step[a]))),to=high.map((n,a)=>Math.min(size[a]-1,Math.ceil((n-min[a])/step[a])));
    for(let z=from[2];z<=to[2];z++)for(let y=from[1];y<=to[1];y++)for(let x=from[0];x<=to[0];x++){
      const w=volumeWeight(v,[min[0]+x*step[0],min[1]+y*step[1],min[2]+z*step[2]]);
      const i=((z*size[1]+y)*size[0]+x)*2+(v.detail?1:0);data[i]=Math.max(data[i],Math.round(w*255));
    }
  }
  return {min:min as [number,number,number],max:max as [number,number,number],size,data};
}
