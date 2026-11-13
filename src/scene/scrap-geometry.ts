import {WOOD_TONES} from '../content/wood-tones.ts';
import {woodCoordinates,woodMaterial} from './wood-grain.ts';
import * as THREE from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SCRAP_HULL} from '../content/scrap-shape.ts';
import type {Resources} from './resources.ts';
/** Angular broken ends and a pale split face; a single shared vertex-colour material. */
export function scrapGeometry(seed:string|number='scrap'){
  const points=[];for(let i=0;i<SCRAP_HULL.length;i+=3)points.push(new THREE.Vector3(SCRAP_HULL[i],SCRAP_HULL[i+1],SCRAP_HULL[i+2]));
  const geometry=new ConvexGeometry(points),normal=geometry.attributes.normal,colors:number[]=[];
  const bark=new THREE.Color(WOOD_TONES.scrap.bark),split=new THREE.Color(WOOD_TONES.scrap.face),end=new THREE.Color(WOOD_TONES.scrap.end);
  for(let i=0;i<normal.count;i++)(Math.abs(normal.getY(i))>.65?end:normal.getZ(i)>.4?split:bark).toArray(colors,i*3);
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));woodCoordinates(geometry,'board','y',seed);
  const grain=geometry.getAttribute('woodCoord');for(let i=0;i<normal.count;i++)if(Math.abs(normal.getY(i))<=.65&&normal.getZ(i)<=.4)grain.setZ(i,1);
  return geometry;
}
export function scrapMaterial(r:Resources){return woodMaterial(r,'#ffffff',.88,true);}
export function groundScrapGeometry(){
  const pieces=[];
  for(let i=0;i<5;i++){
    const g=scrapGeometry(`ground-scrap:${i}`);g.rotateZ(Math.PI/2+.1*(i%2)).rotateY(i*2.4);g.scale(1+(i%3)*.15,1,1);g.computeBoundingBox();
    g.translate(Math.sin(i*2.3)*.32,-g.boundingBox!.min.y+.02,Math.cos(i*2.7)*.25);pieces.push(g);
  }
  const merged=mergeGeometries(pieces)!;pieces.forEach(p=>p.dispose());return merged;
}
