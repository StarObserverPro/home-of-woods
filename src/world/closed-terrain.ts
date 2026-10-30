import * as THREE from 'three';
import {heightAt,cliffFaceAt,vertexHeight} from './surface.ts';
import {splitRimTriangle} from './rim-triangles.ts';
import {facetRockTriangle} from './rock-facets.ts';
/** Zippered square rings: all adjoining edges share identical vertex indices. */
export function buildClosedTerrain(){
  const p:number[]=[],ix:number[]=[],top=new Map<string,number>();let facetedPatches=0;
  const vertex=(x:number,z:number,height?:number)=>{x=Math.round(x*1e6)/1e6;z=Math.round(z*1e6)/1e6;const key=`${x}:${z}`;if(top.has(key))return top.get(key)!;const id=p.length/3;p.push(x,height??heightAt(x,z),z);top.set(key,id);return id;};
  const tri=(a:number,b:number,c:number)=>{
    const points=[a,b,c].map(i=>({x:p[i*3],y:p[i*3+1],z:p[i*3+2]}));
    for(const patch of splitRimTriangle(points,vertexHeight)){const pieces=facetRockTriangle(patch,cliffFaceAt);if(pieces.length>1)facetedPatches++;for(const triangle of pieces){const [a,b,c]=triangle.map(v=>vertex(v.x,v.z,v.y));const cross=(p[b*3]-p[a*3])*(p[c*3+2]-p[a*3+2])-(p[b*3+2]-p[a*3+2])*(p[c*3]-p[a*3]);if(cross>0)ix.push(a,c,b);else ix.push(a,b,c);}}
  };
  const n=90,step=2;
  for(let z=-n;z<n;z+=step)for(let x=-n;x<n;x+=step){const a=vertex(x,z),b=vertex(x+step,z),c=vertex(x,z+step),d=vertex(x+step,z+step);tri(a,c,b);tri(b,c,d);}
  const ring=(size:number,count:number)=>Array.from({length:count*4},(_,i)=>{const side=Math.floor(i/count),t=(i%count)/count,coord=-size+2*size*t;return side===0?vertex(coord,-size):side===1?vertex(size,coord):side===2?vertex(-coord,size):vertex(-size,-coord);});
  let inner=ring(90,90);
  for(const [size,count] of [[98,49],[114,38],[132,33],[150,30]]){
    const outer=ring(size,count);let a=0,b=0;
    while(a<inner.length||b<outer.length){const nextA=(a+1)/inner.length,nextB=(b+1)/outer.length;if(a<inner.length&&(b===outer.length||nextA<=nextB)){tri(inner[a%inner.length],outer[b%outer.length],inner[(a+1)%inner.length]);a++;}else{tri(inner[a%inner.length],outer[b%outer.length],outer[(b+1)%outer.length]);b++;}}
    inner=outer;
  }
  // Crest clipping can insert vertices on the outer rim; include them in the side-wall loop.
  inner=[...top.values()].filter(i=>Math.abs(p[i*3])===150||Math.abs(p[i*3+2])===150).sort((a,b)=>{
    const order=(id:number)=>{const x=p[id*3],z=p[id*3+2];return z===-150?x+150:x===150?450+z:z===150?750-x:1050-z;};return order(a)-order(b);
  });
  const topTriangles=ix.length/3,bottom:number[]=[];
  for(const id of inner){bottom.push(p.length/3);p.push(p[id*3],-45,p[id*3+2]);}
  // Outward side walls and a bottom fan close the full volume (no DoubleSide disguise).
  const center=p.length/3;p.push(0,-45,0);
  inner.forEach((a,i)=>{const j=(i+1)%inner.length,b=inner[j],c=bottom[i],d=bottom[j];ix.push(a,b,c,b,d,c,center,c,d);});
  // Split only material-boundary vertices: grass normals never average with the cliff face.
  // The coincident positions remain a sealed physical volume; index identity is per normal domain.
  const grass:number[]=[],rock:number[]=[];
  for(let i=0;i<ix.length;i+=3){const a=ix[i],b=ix[i+1],c=ix[i+2],x=(p[a*3]+p[b*3]+p[c*3])/3,z=(p[a*3+2]+p[b*3+2]+p[c*3+2])/3;
    (i>=topTriangles*3||cliffFaceAt(x,z)?rock:grass).push(a,b,c);
  }
  const positions:number[]=[],colors:number[]=[],indices:number[]=[],split=new Map<string,number>();
  for(const [kind,list] of [grass,rock].entries())for(const id of list){const key=`${id}:${kind}`;let next=split.get(key);if(next===undefined){next=positions.length/3;split.set(key,next);positions.push(p[id*3],p[id*3+1],p[id*3+2]);const color=new THREE.Color(kind?'#a0aa9b':'#ffffff');color.multiplyScalar(kind?.94+.06*Math.sin(p[id*3]*.21+p[id*3+2]*.13):1);colors.push(color.r,color.g,color.b);}indices.push(next);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.addGroup(0,grass.length,0);g.addGroup(grass.length,rock.length,1);g.computeVertexNormals();g.computeBoundingSphere();g.userData={topTriangles,totalTriangles:ix.length/3,closed:true,hardRim:true,rockTriangles:rock.length/3,facetedPatches};return g;
}
