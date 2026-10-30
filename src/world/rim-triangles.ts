import {gorgeSection} from './gorge-profile.ts';
import {riverX} from './river.ts';
import {CLIFF} from '../content/cliffs.ts';
export type SurfaceVertex={x:number;y:number;z:number};
/** Cut real triangles along both the crest and its narrow stone cap, keeping shared intersections. */
export function splitRimTriangle(triangle:SurfaceVertex[],height:(x:number,z:number)=>number){
  let polygons=[triangle];
  for(const side of [-1,1])for(const cap of [0,CLIFF.stoneCap]){
    const signed=(v:SurfaceVertex)=>side*(v.x-gorgeSection(riverX(v.z)+side*30,v.z).rim)-cap;
    const next:SurfaceVertex[][]=[];
    for(const polygon of polygons){const ds=polygon.map(signed);if(Math.min(...ds)>=-1e-7||Math.max(...ds)<=1e-7){next.push(polygon);continue;}
      for(const sign of [-1,1]){const out:SurfaceVertex[]=[];
        for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=ds[i],db=ds[(i+1)%polygon.length],inside=sign*da>=-1e-7;
          if(inside)out.push(a);
          if((da>1e-7&&db<-1e-7)||(da<-1e-7&&db>1e-7)){const t=da/(da-db),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;out.push({x,y:height(x,z),z});}
        }
        if(out.length>=3)next.push(out);
      }
    }
    polygons=next;
  }
  const triangles:SurfaceVertex[][]=[];
  for(const polygon of polygons)for(let i=1;i<polygon.length-1;i++){
    const [a,b,c]=[polygon[0],polygon[i],polygon[i+1]],area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
    if(Math.abs(area)>1e-7)triangles.push([a,b,c]);
  }
  return triangles;
}
