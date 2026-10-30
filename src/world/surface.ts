import { HOME, PATH, WORLD } from "../content/world.ts";
import {CLIFF} from '../content/cliffs.ts';
import {riverX} from './river.ts';
export {riverX} from './river.ts';
import {gorgeSection,cutGorgeHeight} from './gorge-profile.ts';
import {splitRimTriangle} from './rim-triangles.ts';
import type {SurfaceVertex} from './rim-triangles.ts';
import {facetRockTriangle} from './rock-facets.ts';
import type { Point } from "../content/world.ts";
import valley from "../content/valley-r3.json" with { type: "json" };
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
function plateauHeight(x: number, z: number) {
  const columns=(valley.max-valley.min)/valley.step+1;
  const gx=clamp((x-valley.min)/valley.step,0,columns-1.000001),gz=clamp((z-valley.min)/valley.step,0,columns-1.000001);
  const xi=Math.floor(gx),zi=Math.floor(gz),u=gx-xi,v=gz-zi;
  const a=valley.heights[zi*columns+xi],b=valley.heights[zi*columns+xi+1],c=valley.heights[(zi+1)*columns+xi],d=valley.heights[(zi+1)*columns+xi+1];
  let h=u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
  const camp = 1 - smooth(12, 22, Math.hypot((x - HOME.x) * 0.92, (z - HOME.z)*0.67));
  return h * (1 - camp) + 21.5 * camp;
}
function preserveTrail(x:number,z:number){return pathDistance(x,z)<7||Math.hypot(x-HOME.x,z-HOME.z)<22;}
function baseHeight(x:number,z:number){
  const river=1-smooth(3.2,20,Math.abs(x-riverX(z))),legacy=plateauHeight(x,z)*(1-river)+.7*river;
  const weight=Math.min(smooth(7,10,pathDistance(x,z)),smooth(22,27,Math.hypot(x-HOME.x,z-HOME.z)));
  return legacy*(1-weight)+cutGorgeHeight(x,z,plateauHeight)*weight;
}
export function cliffFaceAt(x:number,z:number){
  if(preserveTrail(x,z))return false;
  const s=gorgeSection(x,z);
  return plateauHeight(s.rim,z)-.7>=CLIFF.minimumRelief&&s.inset>=.7&&s.inset<s.width+CLIFF.stoneCap;
}
// Large planar facets on the gorge; every gameplay consumer shares the result.
const terrainHeights=new Map<string,number>();
function rawHeight(x:number,z:number){
  const key=`${x}:${z}`;
  const cached=terrainHeights.get(key);if(cached!==undefined)return cached;
  const height=facetedHeight(x,z);terrainHeights.set(key,height);return height;
}
function facetedHeight(x:number,z:number){
  const original=baseHeight(x,z);
  if(pathDistance(x,z)<7||Math.hypot(x-HOME.x,z-HOME.z)<22)return original;
  const gorge=gorgeSection(x,z);
  if(Math.abs(gorge.inset-gorge.width)<8)return original;
  const slope=Math.hypot((baseHeight(x+2,z)-baseHeight(x-2,z))/4,(baseHeight(x,z+2)-baseHeight(x,z-2))/4);
  if(slope<.58)return original;
  const step=8,ax=Math.floor(x/step)*step,az=Math.floor(z/step)*step,u=(x-ax)/step,v=(z-az)/step;
  const a=baseHeight(ax,az),b=baseHeight(ax+step,az),c=baseHeight(ax,az+step),d=baseHeight(ax+step,az+step);
  const plane=u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
  const blend=smooth(.58,1.1,slope);
  return original*(1-blend)+plane*blend;
}
const surfaceCells=new Map<string,SurfaceVertex[][]>();
const rimRows=new Map<number,number[]>();
function needsRimCell(ix:number,iz:number){
  let bounds=rimRows.get(iz);
  if(!bounds){const z=WORLD.minZ+iz*WORLD.step;bounds=[];for(const side of [-1,1]){const a=gorgeSection(riverX(z)+side*30,z),b=gorgeSection(riverX(z+2)+side*30,z+2);bounds.push(Math.min(a.rim,b.rim,a.bank,b.bank)-2,Math.max(a.rim,b.rim,a.bank,b.bank)+2);}rimRows.set(iz,bounds);}
  const x=WORLD.minX+ix*WORLD.step;return (x+2>=bounds[0]&&x<=bounds[1])||(x+2>=bounds[2]&&x<=bounds[3]);
}
function cellTriangles(ix:number,iz:number){
  const key=`${ix}:${iz}`;if(surfaceCells.has(key))return surfaceCells.get(key)!;
  const x=WORLD.minX+ix*WORLD.step,z=WORLD.minZ+iz*WORLD.step;
  const v=(x:number,z:number)=>({x,y:rawHeight(x,z),z}),a=v(x,z),b=v(x+2,z),c=v(x,z+2),d=v(x+2,z+2);
  const triangles=[...splitRimTriangle([a,c,b],rawHeight),...splitRimTriangle([b,c,d],rawHeight)].flatMap(triangle=>facetRockTriangle(triangle,cliffFaceAt));surfaceCells.set(key,triangles);return triangles;
}
// Every gameplay consumer queries the same clipped triangles as the visible near terrain.
export function heightAt(x: number, z: number) {
  const gx = clamp(
    (x - WORLD.minX) / WORLD.step,
    0,
    (WORLD.maxX - WORLD.minX) / WORLD.step - 0.00001,
  );
  const gz = clamp(
    (z - WORLD.minZ) / WORLD.step,
    0,
    (WORLD.maxZ - WORLD.minZ) / WORLD.step - 0.00001,
  );
  const ix = Math.floor(gx),
    iz = Math.floor(gz),
    u = gx - ix,
    v = gz - iz;
  const ax = WORLD.minX + ix * WORLD.step,
    az = WORLD.minZ + iz * WORLD.step;
  const px=ax+u*WORLD.step,pz=az+v*WORLD.step;
  if(!needsRimCell(ix,iz)){
    const a=rawHeight(ax,az),b=rawHeight(ax+2,az),c=rawHeight(ax,az+2),d=rawHeight(ax+2,az+2);
    return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
  }
  for(const [a,b,c] of cellTriangles(ix,iz)){
    const det=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
    const wa=((b.z-c.z)*(px-c.x)+(c.x-b.x)*(pz-c.z))/det,wb=((c.z-a.z)*(px-c.x)+(a.x-c.x)*(pz-c.z))/det,wc=1-wa-wb;
    if(Math.min(wa,wb,wc)>=-1e-6)return a.y*wa+b.y*wb+c.y*wc;
  }
  throw new Error(`Surface triangle missing at ${x},${z}`);
}
export const vertexHeight = rawHeight;
export function slopeAt(x: number, z: number) {
  return Math.hypot(
    (heightAt(x + 0.3, z) - heightAt(x - 0.3, z)) / 0.6,
    (heightAt(x, z + 0.3) - heightAt(x, z - 0.3)) / 0.6,
  );
}
export function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = clamp(
    ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz),
    0,
    1,
  );
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
export function pathDistance(x: number, z: number) {
  return Math.min(
    ...PATH.slice(1).map((p, i) => segmentDistance({ x, z }, PATH[i], p)),
  );
}
export function inOpenArea(x: number, z: number) {
  return (
    x > -79 &&
    x < riverX(z) - 4.6 &&
    z > WORLD.minOpenZ &&
    z < 66 &&
    heightAt(x, z) > WORLD.waterY + 0.15
  );
}
export function zoneName(x: number, z: number) {
  if (z < -40) return "宅后望台";
  if (Math.hypot(x - HOME.x, z - HOME.z) < 18) return "山间营地";
  if (z > 36) return "溪谷河岸";
  return "下坡混交林";
}
