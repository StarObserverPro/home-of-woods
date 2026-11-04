import * as THREE from 'three';
import {CABIN, TENT} from '../content/world.ts';
import type {Point} from '../content/world.ts';
import {WOODCRAFT} from '../content/woodcraft.ts';
import {WORKBENCH, WORKBENCH_STOOL} from '../content/workshop.ts';
import {heightAt} from '../world/surface.ts';
import type {Resources} from './resources.ts';

type Target = Point & {sourceId?:string;role?:string;kind?:unknown;radius?:number};
const SEGMENTS_PER_ARC = 18;
const ARC_GAP = Math.PI / 12;

/** A thin screen-width cue, not a filled surface or an object in the scene. */
export function createSelectionMarker(resources:Resources) {
  const positions = new Float32Array(4 * SEGMENTS_PER_ARC * 2 * 3);
  const geometry = resources.own(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = resources.own(new THREE.LineBasicMaterial({
    color:'#fff0c2',transparent:true,opacity:.6,depthWrite:false,toneMapped:false,
  }));
  const object = new THREE.LineSegments(geometry, material);
  object.name = 'selection-ground-cue';
  object.visible = false;
  object.renderOrder = 3;
  let lastId:string|null = null, lastX = NaN, lastZ = NaN;
  return {object, update(id:string|null, target:Target|null) {
    object.visible = !!target;
    if (!target || (lastId===id && lastX===target.x && lastZ===target.z)) return;
    lastId=id;lastX=target.x;lastZ=target.z;
    let x=target.x,z=target.z,rx=1.15,rz=1.15;
    if(id==='cabin'){x=CABIN.x;z=CABIN.z+1.4;rx=8;rz=7.5;}
    else if(id==='tent'){x=TENT.x;z=TENT.z;rx=rz=4.8;}
    else if(id===WOODCRAFT.id){rx=WOODCRAFT.halfX+.35;rz=WOODCRAFT.halfZ+.35;}
    else if(id===WORKBENCH.id){rx=WORKBENCH.halfX+.35;rz=WORKBENCH.halfZ+.35;}
    else if(id===WORKBENCH_STOOL.id)rx=rz=WORKBENCH_STOOL.radius+.2;
    else if(target.sourceId)rx=rz=1.1;
    else if(target.role==='landmark')rx=rz=3.8;
    else if(target.kind)rx=rz=1.6;
    else if(target.radius)rx=rz=target.radius+.35;
    object.position.set(x,0,z);
    let vertex=0;
    for(let arc=0;arc<4;arc++)for(let segment=0;segment<SEGMENTS_PER_ARC;segment++)for(let end=0;end<2;end++){
      const angle=arc*Math.PI/2+ARC_GAP+(segment+end)/SEGMENTS_PER_ARC*(Math.PI/2-2*ARC_GAP);
      const px=Math.cos(angle)*rx,pz=Math.sin(angle)*rz;
      positions[vertex++]=px;
      positions[vertex++]=heightAt(x+px,z+pz)+.045;
      positions[vertex++]=pz;
    }
    geometry.attributes.position.needsUpdate=true;
    geometry.computeBoundingSphere();
  }};
}
