import * as THREE from 'three';

/** Rectangular board with one flat chamfer along each long and short edge. */
export function beveledTimber(width:number,height:number,depth:number,chamfer:number) {
  const bevel=Math.min(chamfer,Math.min(width,height,depth)*.24);
  const x=width/2-bevel,y=height/2-bevel,core=depth-2*bevel;
  const section=new THREE.Shape([
    new THREE.Vector2(-x,-y),new THREE.Vector2(x,-y),
    new THREE.Vector2(x,y),new THREE.Vector2(-x,y),
  ]);
  return new THREE.ExtrudeGeometry(section,{
    depth:core,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,steps:1,
  }).translate(0,0,-core/2);
}
