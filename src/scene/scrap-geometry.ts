import {woodCoordinates,woodMaterial} from './wood-grain.ts';
import * as THREE from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SCRAP_HULL} from '../content/scrap-shape.ts';
import type {Resources} from './resources.ts';
/** Angular broken ends and a pale split face; a single shared vertex-colour material. */
export function scrapGeometry(){
  const points=[];for(let i=0;i<SCRAP_HULL.length;i+=3)points.push(new THREE.Vector3(SCRAP_HULL[i],SCRAP_HULL[i+1],SCRAP_HULL[i+2]));
  const geometry=new ConvexGeometry(points),normal=geometry.attributes.normal,colors:number[]=[];
  const bark=new THREE.Color('#79573d'),split=new THREE.Color('#c59b68'),end=new THREE.Color('#b38a59');
  for(let i=0;i<normal.count;i++)(Math.abs(normal.getY(i))>.65?end:normal.getZ(i)>.4?split:bark).toArray(colors,i*3);
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));woodCoordinates(geometry,'board','y');
  const grain=geometry.getAttribute('woodCoord');for(let i=0;i<normal.count;i++)if(Math.abs(normal.getY(i))<=.65&&normal.getZ(i)<=.4)grain.setZ(i,1);
  return geometry;
}
export function scrapMaterial(r:Resources){return woodMaterial(r,'#ffffff',.88,true);}
export function groundScrapGeometry(){
  const pieces=[];
  for(let i=0;i<5;i++){
    const g=scrapGeometry();g.rotateZ(Math.PI/2+.1*(i%2)).rotateY(i*2.4);g.scale(1+(i%3)*.15,1,1);g.computeBoundingBox();
    g.translate(Math.sin(i*2.3)*.32,-g.boundingBox!.min.y+.02,Math.cos(i*2.7)*.25);pieces.push(g);
  }
  const merged=mergeGeometries(pieces)!;pieces.forEach(p=>p.dispose());return merged;
}
