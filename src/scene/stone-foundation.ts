import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {heightAt} from '../world/surface.ts';
import type {planStoneFoundation} from '../world/prop-foundation.ts';
import type {Resources} from './resources.ts';
type Plan=ReturnType<typeof planStoneFoundation>;
export function buildFoundationGeometry(plan:Plan){
  const sides=16,p:number[]=[],indices:number[]=[];
  for(let i=0;i<sides;i++){const a=i/sides*Math.PI*2,x=Math.cos(a)*plan.radius,z=Math.sin(a)*plan.radius;
    p.push(x,0,z,x,heightAt(plan.x+x,plan.z+z)-plan.levelY-.25,z);
  }
  const top=p.length/3;p.push(0,0,0);const bottom=p.length/3;p.push(0,plan.low-plan.levelY-.3,0);
  for(let i=0;i<sides;i++){const a=i*2,b=((i+1)%sides)*2;indices.push(top,b,a,a,b,a+1,b,b+1,a+1,bottom,a+1,b+1);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();g.userData={levelY:plan.levelY,radius:plan.radius,bottomEmbeds:.25};return g;
}
export function createStoneFoundation(r:Resources,plan:Plan){
  const group=new THREE.Group();group.name='r5b-grounded-level-stone-foundation';
  const core=new THREE.Mesh(r.own(buildFoundationGeometry(plan)),r.material('#596b62',.9));core.receiveShadow=true;core.castShadow=true;group.add(core);
  const batches:THREE.BufferGeometry[][]=[[],[],[]],step=.46;
  // Solid core closes every joint; the staggered facing blocks reveal the downhill stone courses.
  for(let row=0;row<Math.ceil((plan.levelY-plan.low+.3)/step);row++)for(let i=0;i<20;i++){
    const a=(i+(row%2)*.5)/20*Math.PI*2,x=Math.cos(a)*(plan.radius-.09),z=Math.sin(a)*(plan.radius-.09);
    const top=-row*step-.035,bottom=Math.max(-(row+1)*step+.025,plan.low-plan.levelY-.22);
    if(top<=bottom+.02)continue;
    if(top<heightAt(plan.x+x,plan.z+z)-plan.levelY-.08)continue;
    const block=new THREE.BoxGeometry(.92,top-bottom,.42).rotateY(Math.PI/2-a).translate(x,(top+bottom)/2,z);batches[(row+i)%3].push(block);
  }
  batches.forEach((parts,i)=>{if(!parts.length)return;const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(!g)throw new Error('Foundation merge failed');const mesh=new THREE.Mesh(r.own(g),r.material(['#819385','#98a48d','#74877b'][i],.86));mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);});
  return group;
}
