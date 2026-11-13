import {OCCLUSION} from '../content/occlusion.ts';
export type XYZ = readonly [number,number,number];
/** A soft region of reduced ambient light, NOT a new collision box. */
export type OcclusionVolume = {id:string;center:XYZ;halfSize:XYZ;yaw:number;softness:number;strength:number;detail:boolean};
export type CanopySeed = {x:number;z:number;radius:number;height:number;coverage?:number};
export type FieldBounds = {minX:number;maxX:number;minZ:number;maxZ:number};
export type CanopyField = {size:number;bounds:FieldBounds;data:Uint8Array};
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function smooth01(x:number){x=clamp(x);return x*x*(3-2*x);}
export function nearOcclusionWeight(distance:number){return 1-smooth01((distance-OCCLUSION.nearFull)/(OCCLUSION.nearEnd-OCCLUSION.nearFull));}
export function volumeWeight(v:OcclusionVolume,p:XYZ){
  const dx=p[0]-v.center[0],dy=p[1]-v.center[1],dz=p[2]-v.center[2],c=Math.cos(v.yaw),s=Math.sin(v.yaw);
  const qx=Math.max(0,Math.abs(c*dx-s*dz)-v.halfSize[0]);
  const qy=Math.max(0,Math.abs(dy)-v.halfSize[1]);
  const qz=Math.max(0,Math.abs(s*dx+c*dz)-v.halfSize[2]);
  return (1-smooth01(Math.hypot(qx,qy,qz)/Math.max(.001,v.softness)))*v.strength;
}
/** Max-composition avoids multiplying overlapping corners into black stains. */
export function localAmbientAt(volumes:readonly OcclusionVolume[],point:XYZ,distance=0){
  let broad=0,detail=0;
  for(const v of volumes){const value=volumeWeight(v,point);if(v.detail)detail=Math.max(detail,value);else broad=Math.max(broad,value);}
  return Math.max(OCCLUSION.minimumAmbient,1-Math.max(broad,detail*nearOcclusionWeight(distance)));
}
export function floorOccluder(id:string,x:number,y:number,z:number,width:number,height:number,depth:number,yaw=0,feet=false):OcclusionVolume[]{
  const shadeHeight=Math.max(.05,Math.min(height*.48,.55));
  const result:OcclusionVolume[]=[{id,center:[x,y+shadeHeight*.35,z],halfSize:[width*.40,shadeHeight*.35,depth*.40],yaw,softness:Math.min(.38,Math.max(.12,height*.25)),strength:.34,detail:true}];
  if(feet)for(const sx of [-1,1])for(const sz of [-1,1]){
    const px=sx*width*.36,pz=sz*depth*.34,c=Math.cos(yaw),s=Math.sin(yaw);
    result.push({id:`${id}:foot:${sx}:${sz}`,center:[x+c*px+s*pz,y+.025,z-s*px+c*pz],halfSize:[.045,.015,.045],yaw,softness:.24,strength:.46,detail:true});
  }
  return result;
}
/** CPU splat once on layout/tree-stage change. R=density, G=ground, B=canopy height. */
export function bakeCanopyField(size:number,bounds:FieldBounds,seeds:readonly CanopySeed[],heightAt:(x:number,z:number)=>number,previous?:CanopyField):CanopyField{
  if(!Number.isInteger(size)||size<2||size>512||bounds.maxX<=bounds.minX||bounds.maxZ<=bounds.minZ)throw new Error('Invalid canopy field dimensions');
  const density=new Float32Array(size*size),height=new Float32Array(size*size),data=new Uint8Array(size*size*4);
  const dx=(bounds.maxX-bounds.minX)/(size-1),dz=(bounds.maxZ-bounds.minZ)/(size-1);
  for(const seed of seeds){
    if(![seed.x,seed.z,seed.radius,seed.height,seed.coverage??1].every(Number.isFinite)||seed.radius<=0||seed.height<=0)continue;
    const radius=seed.radius*1.65,weight=clamp(seed.coverage??1);
    const x0=Math.max(0,Math.floor((seed.x-radius-bounds.minX)/dx)),x1=Math.min(size-1,Math.ceil((seed.x+radius-bounds.minX)/dx));
    const z0=Math.max(0,Math.floor((seed.z-radius-bounds.minZ)/dz)),z1=Math.min(size-1,Math.ceil((seed.z+radius-bounds.minZ)/dz));
    for(let iz=z0;iz<=z1;iz++)for(let ix=x0;ix<=x1;ix++){
      const r=Math.hypot(bounds.minX+ix*dx-seed.x,bounds.minZ+iz*dz-seed.z)/radius;
      if(r>=1)continue;
      const w=(1-smooth01(r))*weight,index=iz*size+ix;
      density[index]+=w*1.5;height[index]+=seed.height*w*1.5;
    }
  }
  const reuse=previous&&previous.size===size&&JSON.stringify(previous.bounds)===JSON.stringify(bounds);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const i=z*size+x,k=i*4,ground=reuse?previous!.data[k+1]:Math.round(clamp((heightAt(bounds.minX+x*dx,bounds.minZ+z*dz)-OCCLUSION.heightMin)/OCCLUSION.heightRange)*255);
    data[k]=Math.round((1-Math.exp(-density[i]))*255);data[k+1]=Number.isFinite(ground)?ground:0;
    data[k+2]=Math.round(clamp((density[i]>0?height[i]/density[i]:6)/OCCLUSION.canopyHeightRange)*255);data[k+3]=255;
  }
  return {size,bounds:{...bounds},data};
}
