import {SHADOW_PROFILES} from '../content/shadows.ts';

export type ShadowPoint = readonly [number, number, number];
export type ShadowBounds = {min:ShadowPoint;max:ShadowPoint};
export type ProjectedCanopy = {id:string;center:ShadowPoint;radii:ShadowPoint;density?:number};
export type ProjectedCanopyField = {
  bounds:ShadowBounds;size:[number,number,number];data:Uint8Array;
  direction:[number,number,number];sourceCount:number;touchedCells:number;
};
const C=SHADOW_PROFILES.outdoor.canopy;
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const dot=(a:ShadowPoint,b:ShadowPoint)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

export function normalizeShadowDirection(value:ShadowPoint):[number,number,number]{
  const length=Math.hypot(...value);
  if(!value.every(Number.isFinite)||length<1e-7)throw new Error('Invalid shadow direction');
  return value.map(n=>n/length) as [number,number,number];
}

/** Light-space grid snapping changes coverage, never the direction illuminating the surface. */
export function snappedShadowPose(focus:ShadowPoint,direction:ShadowPoint,span=SHADOW_PROFILES.outdoor.span,mapSize=SHADOW_PROFILES.outdoor.mapSize,distance=SHADOW_PROFILES.outdoor.lightDistance){
  if(!focus.every(Number.isFinite)||span<=0||mapSize<1)throw new Error('Invalid shadow focus/coverage');
  const w=normalizeShadowDirection(direction);
  const right=normalizeShadowDirection(Math.abs(w[1])>.999 ? [1,0,0] : [w[2],0,-w[0]]);
  const up:[number,number,number]=[w[1]*right[2]-w[2]*right[1],w[2]*right[0]-w[0]*right[2],w[0]*right[1]-w[1]*right[0]];
  const texel=span/mapSize;
  const dx=Math.round(dot(focus,right)/texel)*texel-dot(focus,right);
  const dy=Math.round(dot(focus,up)/texel)*texel-dot(focus,up);
  const target=focus.map((n,i)=>n+right[i]*dx+up[i]*dy) as [number,number,number];
  const position=target.map((n,i)=>n+w[i]*distance) as [number,number,number];
  return {target,position,direction:w,texel,right,up};
}

function validate(bounds:ShadowBounds,canopies:readonly ProjectedCanopy[]){
  if(![...bounds.min,...bounds.max].every(Number.isFinite)||bounds.min.some((n,i)=>n>=bounds.max[i]))throw new Error('Invalid canopy field bounds');
  const ids=new Set<string>();
  for(const c of canopies){
    if(ids.has(c.id)||!c.id||![...c.center,...c.radii,c.density??1].every(Number.isFinite)||c.radii.some(n=>n<=0)||(c.density??1)<0||(c.density??1)>1)throw new Error(`Invalid projected canopy: ${c.id}`);
    ids.add(c.id);
  }
}

/**
 * Smooth broad crown projection on one horizontal receiver slice. World-space geometry
 * is authoritative; sun travel expands the penumbra and conserved projected area makes
 * a high crown lighter. This is an ellipsoid approximation, not leaf-level PCSS.
 */
export function projectedCanopySlice(canopy:ProjectedCanopy,receiverY:number,direction:ShadowPoint){
  const sun=normalizeShadowDirection(direction),[cx,cy,cz]=canopy.center,[rx,ry,rz]=canopy.radii;
  if(sun[1]<=C.minimumSunY||receiverY>=cy+ry||(canopy.density??1)===0)return null;
  const sx=sun[0]/sun[1],sz=sun[2]/sun[1];
  const a=rx*rx+ry*ry*sx*sx,b=ry*ry*sx*sz,c=rz*rz+ry*ry*sz*sz;
  const determinant=a*c-b*b,root=Math.sqrt(determinant),denom=Math.sqrt(a+c+2*root);
  const gap=Math.max(0,(cy-ry-receiverY)/sun[1]);
  const softness=Math.min(C.maximumSoftness,C.baseSoftness+gap*C.angularSpread);
  // (sqrt(S)+softness*I)^2 expands both principal ellipse radii by the same world amount.
  const aa=a+2*softness*(a+root)/denom+softness*softness;
  const bb=b+2*softness*b/denom;
  const cc=c+2*softness*(c+root)/denom+softness*softness;
  const det=aa*cc-bb*bb;
  const heightWeight=smooth(0,2*ry,cy+ry-receiverY);
  const strength=C.strength*(canopy.density??1)*Math.sqrt(determinant/det)*heightWeight*smooth(C.minimumSunY,C.minimumSunY+.08,sun[1]);
  return {x:cx-(cy-receiverY)*sx,z:cz-(cy-receiverY)*sz,extentX:Math.sqrt(aa),extentZ:Math.sqrt(cc),a:aa,b:bb,c:cc,det,strength,softness,topY:cy+ry};
}

/** Source-local splats; never voxel-count × tree-count. RG = shade / upper crown height. */
export function bakeProjectedCanopyField(canopies:readonly ProjectedCanopy[],bounds:ShadowBounds,direction:ShadowPoint,size:readonly [number,number,number]=C.size):ProjectedCanopyField{
  validate(bounds,canopies);
  if(size.some(n=>!Number.isInteger(n)||n<2||n>256))throw new Error('Invalid canopy field size');
  const sun=normalizeShadowDirection(direction),[nx,ny,nz]=size;
  const data=new Uint8Array(nx*ny*nz*2),shade=new Float32Array(nx*ny*nz);
  const step=size.map((n,i)=>(bounds.max[i]-bounds.min[i])/(n-1));
  let touchedCells=0;
  for(const canopy of canopies){
    const top=Math.min(ny-1,Math.floor((canopy.center[1]+canopy.radii[1]-bounds.min[1])/step[1]));
    const encodedTop=Math.floor(clamp((canopy.center[1]+canopy.radii[1]-bounds.min[1])/(bounds.max[1]-bounds.min[1]))*255);
    for(let y=0;y<=top;y++){
      const slice=projectedCanopySlice(canopy,bounds.min[1]+y*step[1],sun);if(!slice||slice.strength<1/1024)continue;
      const x0=Math.max(0,Math.ceil((slice.x-slice.extentX-bounds.min[0])/step[0]));
      const x1=Math.min(nx-1,Math.floor((slice.x+slice.extentX-bounds.min[0])/step[0]));
      const z0=Math.max(0,Math.ceil((slice.z-slice.extentZ-bounds.min[2])/step[2]));
      const z1=Math.min(nz-1,Math.floor((slice.z+slice.extentZ-bounds.min[2])/step[2]));
      for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
        const dx=bounds.min[0]+x*step[0]-slice.x,dz=bounds.min[2]+z*step[2]-slice.z;
        const q=(slice.c*dx*dx-2*slice.b*dx*dz+slice.a*dz*dz)/slice.det;
        if(q>=1)continue;
        const alpha=slice.strength*(1-smooth(C.coreRatio*C.coreRatio,1,q));if(alpha<1/1024)continue;
        const index=(z*ny+y)*nx+x;shade[index]+=(1-shade[index])*alpha;touchedCells++;
        data[index*2+1]=Math.max(data[index*2+1],encodedTop);
      }
    }
  }
  for(let i=0;i<shade.length;i++)if(shade[i]>0)data[i*2]=Math.round(Math.min(C.maximumShade,shade[i])*255);
  return {bounds:{min:[...bounds.min],max:[...bounds.max]},size:[nx,ny,nz],data,direction:sun,sourceCount:canopies.length,touchedCells};
}

/** CPU mirror of trilinear sampling/height and world-boundary gates for numerical checks. */
export function sampleProjectedCanopyField(field:ProjectedCanopyField,position:ShadowPoint){
  const {bounds,size,data}=field,uv=position.map((n,i)=>(n-bounds.min[i])/(bounds.max[i]-bounds.min[i]));
  if(uv.some(n=>n<0||n>1))return 0;
  const grid=uv.map((n,i)=>n*(size[i]-1)),low=grid.map(Math.floor),f=grid.map((n,i)=>n-low[i]);
  let shade=0,top=0;
  for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
    const ix=Math.min(size[0]-1,low[0]+dx),iy=Math.min(size[1]-1,low[1]+dy),iz=Math.min(size[2]-1,low[2]+dz);
    const w=(dx?f[0]:1-f[0])*(dy?f[1]:1-f[1])*(dz?f[2]:1-f[2]);
    const index=((iz*size[1]+iy)*size[0]+ix)*2;shade+=data[index]/255*w;top+=data[index+1]/255*w;
  }
  if(position[1]>=bounds.min[1]+top*(bounds.max[1]-bounds.min[1]))return 0;
  const edge=Math.min(...grid,...grid.map((n,i)=>size[i]-1-n));
  return shade*smooth(0,C.boundaryCells,edge);
}
