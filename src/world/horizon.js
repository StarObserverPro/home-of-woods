import * as THREE from 'three';
import {heightAt,riverX as originalRiverX} from './surface.ts';
import {WORLD,PATH} from '../content/world.ts';
import {LANDSCAPE_ROUTES} from '../content/landscape-routes.ts';

export const clamp=THREE.MathUtils.clamp;
export const mix=THREE.MathUtils.lerp;
export const smooth=(a,b,v)=>THREE.MathUtils.smoothstep(v,a,b);
export function random(seed=104729){return()=>{seed+=0x6d2b79f5;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
export const insideOriginal=(x,z)=>Math.max(Math.abs(x),Math.abs(z))<=150;

// The accepted centerline is exact within its authored range. Hermite tails share
// the endpoint tangent; their bends carry water behind a real land shoulder.
export function riverX(z){
 if(z>=-150&&z<=150)return originalRiverX(z);
 if(z<-150){const d=-150-z;return 180+d*(76/115)+48*(1-Math.cos(Math.min(d,550)/135));}
 const d=z-150;return -135-d*(68/55)+78*(1-Math.cos(Math.min(d,650)/145));
}
export const riverY=z=>WORLD.waterY+(z<-180?(-180-z)*.035:z>180?-(z-180)*.012:0);
const hill=(x,z,cx,cz,rx,rz,h)=>h*Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));
export function exteriorHeight(x,z){
 const m=Math.max(Math.abs(x),Math.abs(z));if(m<=150)return heightAt(x,z);
 const cx=clamp(x,-150,150),cz=clamp(z,-150,150),d=m-150,edge=heightAt(cx,cz);
 const dx=x-cx,dz=z-cz,len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len;
 const derivative=clamp((edge-heightAt(cx-ux,cz-uz)),-1.4,1.4);
 const extrapolated=edge+derivative*Math.min(d,25);
 let hillHeight=20+7*Math.sin(x*.012+z*.004)+6*Math.cos(z*.014-x*.003);
 hillHeight+=hill(x,z,-350,-70,210,260,78)+hill(x,z,365,40,200,250,92);
 hillHeight+=hill(x,z,-250,420,260,210,72)+hill(x,z,250,380,230,230,78);
 hillHeight+=hill(x,z,70,-310,290,170,62)+hill(x,z,-590,-390,260,260,92);
 hillHeight+=hill(x,z,-720,120,180,450,90)+hill(x,z,720,100,200,450,100);
 hillHeight+=hill(x,z,-260,750,300,160,88)+hill(x,z,290,810,300,180,120);
 // A connected valley floor and paired shoulders, not a flat disc under the water.
 const bank=Math.abs(x-riverX(z));
 hillHeight=mix(riverY(z)-.9,hillHeight,smooth(8.0,62,bank));
 const blended=mix(extrapolated,hillHeight,smooth(0,82,d));
 // A nearest point on the square can lie on a hill even when the exterior
// point lies in the creek. Cut the connected channel through the blend collar.
 const bed=riverY(z)-.9,cut=mix(bed,blended,smooth(8,26,bank));
 return mix(blended,cut,smooth(0,.5,d));
}

const perimeterOrder=(x,z,s)=>z===-s?(x+s)/(8*s):x===s?.25+(z+s)/(8*s):z===s?.5+(s-x)/(8*s):.75+(s-z)/(8*s);
function riverIntersections(s){
 const out=[];
 for(const offset of [-16,-8,0,8,16]){
  for(const z of [-s,s]){const x=riverX(z)+offset;if(x>-s&&x<s)out.push([x,z]);}
  for(const x of [-s,s]){
   let prev=-s,pv=riverX(prev)+offset-x;
   for(let z=-s+5;z<=s;z+=5){const v=riverX(z)+offset-x;
    if(v*pv<0){let a=prev,b=z;for(let k=0;k<22;k++){const m=(a+b)/2;if((riverX(a)+offset-x)*(riverX(m)+offset-x)<=0)b=m;else a=m;}out.push([x,(a+b)/2]);}
    prev=z;pv=v;
   }
  }
 }
 return out;
}
export function buildApron(originalGeometry){
 const positions=[],indices=[],colors=[],rings=[];
 const old=originalGeometry.getAttribute('position'),rim=new Map();
 for(let i=0;i<old.count;i++){
  const x=old.getX(i),y=old.getY(i),z=old.getZ(i);
  if(y>-44&&Math.abs(Math.max(Math.abs(x),Math.abs(z))-150)<1e-4)rim.set(`${x}:${z}`,[x,y,z]);
 }
 const first=[...rim.values()].sort((a,b)=>perimeterOrder(a[0],a[2],150)-perimeterOrder(b[0],b[2],150));
 const add=(x,y,z,s)=>{const i=positions.length/3;positions.push(x,y,z);return {i,t:perimeterOrder(x,z,s)};};
 rings.push(first.map(([x,y,z])=>add(x,y,z,150)));
 const sizes=[150.5,151,152,154,157,...Array.from({length:15},(_,i)=>160+i*10),...Array.from({length:37},(_,i)=>320+i*20),1100,1180,1300,1440,1600];
 for(const size of sizes){
  const n=Math.ceil(size*2/(size<300?12:20)),points=new Map();
  for(let side=0;side<4;side++)for(let j=0;j<n;j++){
   const c=-size+2*size*j/n;const [x,z]=side===0?[c,-size]:side===1?[size,c]:side===2?[-c,size]:[-size,-c];points.set(`${x.toFixed(5)}:${z.toFixed(5)}`,[x,z]);
  }
  for(const [x,z] of riverIntersections(size))points.set(`${x.toFixed(5)}:${z.toFixed(5)}`,[x,z]);
  rings.push([...points.values()].sort((a,b)=>perimeterOrder(a[0],a[1],size)-perimeterOrder(b[0],b[1],size)).map(([x,z])=>add(x,exteriorHeight(x,z),z,size)));
 }
 const triangle=(a,b,c)=>{const cross=(positions[b*3]-positions[a*3])*(positions[c*3+2]-positions[a*3+2])-(positions[b*3+2]-positions[a*3+2])*(positions[c*3]-positions[a*3]);if(cross>0)indices.push(a,c,b);else indices.push(a,b,c);};
 for(let k=1;k<rings.length;k++){
  const a=rings[k-1],b=rings[k];let i=0,j=0;
  while(i<a.length||j<b.length){const ta=i+1<a.length?a[i+1].t:1,tb=j+1<b.length?b[j+1].t:1;
   if(i<a.length&&(j===b.length||ta<=tb)){triangle(a[i%a.length].i,b[j%b.length].i,a[(i+1)%a.length].i);i++;}
   else{triangle(a[i%a.length].i,b[j%b.length].i,b[(j+1)%b.length].i);j++;}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
 const normals=g.getAttribute('normal'),green=new THREE.Color('#7f985e'),forest=new THREE.Color('#526e59'),rock=new THREE.Color('#87918a'),bankColor=new THREE.Color('#a2a889'),air=new THREE.Color('#97b4c5'),c=new THREE.Color();
 for(let i=0;i<positions.length/3;i++){
  const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2],dist=Math.hypot(x,z),river=Math.abs(x-riverX(z));
  c.copy(green).lerp(forest,smooth(45,180,y)*.7).lerp(rock,(1-smooth(.55,.83,normals.getY(i)))*.7);
  c.lerp(bankColor,(1-smooth(5,20,river))*.75).multiplyScalar(.96+.04*Math.sin(x*.12+z*.09));
  c.lerp(air,smooth(260,1100,dist)*.6);c.toArray(colors,i*3);
 }
 g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeBoundingSphere();g.userData={seamVertices:first.length,rings:rings.length};return g;
}

// These are scenery routes. Their visible ends disappear into terrain/tree cover.
// Gameplay region coordinates and navigation are never derived from this list.
export const ROUTES=LANDSCAPE_ROUTES;
export function sampleRoute(route,spacing=1.2){
 const p=route.points.map(([x,z])=>new THREE.Vector3(x,0,z)),result=[p[0].clone()];
 const line=(a,b)=>{const n=Math.max(1,Math.ceil(a.distanceTo(b)/spacing));for(let i=1;i<=n;i++)result.push(a.clone().lerp(b,i/n));};
 let last=p[0];
 for(let i=1;i<p.length-1;i++){
  const v=p[i],a=p[i-1],b=p[i+1],r=Math.min(.9,v.distanceTo(a)*.24,v.distanceTo(b)*.24);
  const enter=v.clone().lerp(a,r/v.distanceTo(a)),exit=v.clone().lerp(b,r/v.distanceTo(b));line(last,enter);
  const curve=new THREE.QuadraticBezierCurve3(enter,v,exit),n=Math.max(3,Math.ceil(curve.getLength()/spacing));for(let j=1;j<=n;j++)result.push(curve.getPoint(j/n));last=exit;
 }line(last,p.at(-1));return result;
}
export function portalFrame(route){
 const [x,z]=route.gate,points=sampleRoute(route,.7);let closest=0,best=Infinity;
 points.forEach((p,i)=>{const d=Math.hypot(p.x-x,p.z-z);if(d<best){best=d;closest=i;}});
 const a=points[Math.max(0,closest-1)],b=points[Math.min(points.length-1,closest+1)],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
 return {x,z,nx:-dz/len,nz:dx/len,facing:Math.atan2(-dx,-dz)};
}
export function routeDistance(x,z){
 let result=Infinity;for(const route of ROUTES)for(let i=1;i<route.points.length;i++){
  const a=route.points[i-1],b=route.points[i],dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz),0,1);result=Math.min(result,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
 }return result;
}
export function buildRiver(zStart,zEnd){
 const positions=[],uv=[],indices=[];const n=Math.ceil((zEnd-zStart)/2);
 for(let i=0;i<=n;i++){
  const z=mix(zStart,zEnd,i/n),x=riverX(z),w=4.5+(insideOriginal(x,z)?0:smooth(160,500,Math.abs(z))*1.4);
  for(const side of [-1,1]){positions.push(x+side*w,riverY(z),z);uv.push((side+1)/2,z*.13);}
  if(i)indices.push(i*2-2,i*2,i*2-1,i*2-1,i*2,i*2+1);
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
