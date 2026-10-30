import {gorgeSection} from './gorge-profile.ts';
import type {SurfaceVertex} from './rim-triangles.ts';
/** Sparse shallow chips inside rock faces; all original edges and the accepted crest stay fixed. */
export function facetRockTriangle(triangle:SurfaceVertex[],allowed:(x:number,z:number)=>boolean){
  const [a,b,c]=triangle,x=(a.x+b.x+c.x)/3,z=(a.z+b.z+c.z)/3;
  const area=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))*.5;
  if(area<.35||area>3||!allowed(x,z))return [triangle];
  const section=gorgeSection(x,z);if(section.inset<1.5||section.inset>section.width-.8)return [triangle];
  const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const up=Math.abs(ny)/Math.hypot(nx,ny,nz);if(up>.72)return [triangle];
  let hash=Math.imul(Math.round(x*1000),73856093)^Math.imul(Math.round(z*1000),19349663);hash=(Math.imul(hash^(hash>>>13),1274126177)^(hash>>>16))>>>0;
  if(hash%17>=4)return [triangle];
  // A vertical displacement projects weakly onto a steep wall. Keep the visible
  // chip depth near 16–36cm instead of losing it along the slope's tangent.
  const random=(salt:number)=>{let n=Math.imul(hash^salt,1597334677);n=Math.imul(n^(n>>>15),2246822519);return ((n^(n>>>13))>>>0)/4294967296;};
  const bump=(random(31)<.53?1:-1)*Math.min(1.35,(.16+random(79)*.20)/Math.max(.2,up));
  const weights=[.26+random(137)*.74,.26+random(251)*.74,.26+random(419)*.74],sum=weights.reduce((a,b)=>a+b);
  const [wa,wb,wc]=weights.map(w=>w/sum);
  const m={x:a.x*wa+b.x*wb+c.x*wc,y:a.y*wa+b.y*wb+c.y*wc+bump,z:a.z*wa+b.z*wb+c.z*wc};
  return [[a,b,m],[b,c,m],[c,a,m]];
}
