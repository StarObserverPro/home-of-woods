import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const rand=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453123;return x-Math.floor(x)};
const species=['松','云杉','冷杉','栎','桦','杨','榆','鹅掌楸'];
const foliage=['#57763c','#416658','#536b53','#718e42','#9bac60','#8baf5e','#648b4d','#799950'];
const bark=['#876444','#6f5c4b','#858377','#786248','#d6d3bf','#a4a99a','#756857','#82765e'];
const ballGeo=new THREE.IcosahedronGeometry(1,1),coneGeo=new THREE.ConeGeometry(1,1,9),woodGeo=new THREE.CylinderGeometry(.55,1,1,7), markGeo=new THREE.BoxGeometry(1,1,1);
function branch(group,mat,a,b,r){const dir=new THREE.Vector3().subVectors(b,a);let m=new THREE.Mesh(woodGeo,mat);m.position.copy(a).add(b).multiplyScalar(.5);m.scale.set(r,dir.length(),r);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());m.castShadow=true;m.name='wood-branch';group.add(m);}
function crown(group,mat,x,y,z,sx,sy,sz,shapeSeed){
 shapeSeed ??= group.userData.treeSeed*17+(group.userData.crownIndex++);
 let geometry=ballGeo;
 if(shapeSeed!==undefined){
  geometry=new THREE.IcosahedronGeometry(1,group.userData.detail??2);const p=geometry.attributes.position,phase=rand(shapeSeed*31)*6.28;
  for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i),v=1+.13*Math.sin(x*3.4+z*2.1+phase)*Math.cos(y*3.0-phase*.7)+.07*Math.sin(z*5.1-y*3.7+phase*1.6)+.045*Math.cos(x*6.1+y*4.2+z*3.0+phase);p.setXYZ(i,x*v+.09*(y*y-.3),y*v,z*v)}
  geometry.computeVertexNormals();
 }
 let m=new THREE.Mesh(geometry,mat);m.name='crown';m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;group.add(m)
}
function cone(group,mat,y,r,h,offset=0){let m=new THREE.Mesh(coneGeo,mat);m.name='crown';m.position.set(offset,y,0);m.scale.set(r,h,r);m.castShadow=true;group.add(m)}
export function makeTree(kind,id,detail=2){
 const g=new THREE.Group(),wood=new THREE.MeshStandardMaterial({color:bark[kind],roughness:.92}),leaves=new THREE.MeshStandardMaterial({color:foliage[kind],roughness:.86,flatShading:true});
 g.userData.detail=detail;g.userData.treeSeed=id;g.userData.crownIndex=0;
 leaves.color.offsetHSL((rand(id*41)-.5)*.075,(rand(id*47)-.5)*.08,(rand(id*43)-.5)*.10);wood.color.offsetHSL(0,0,(rand(id*59)-.5)*.05);
 const V=(x,y,z)=>new THREE.Vector3(x,y,z), trunk=(h,r)=>branch(g,wood,V(0,0,0),V(0,h,0),r);
 if(kind===0){ // pine: open, irregular branches and flattened needle masses
  const bend=(rand(id*71)-.5)*.3;branch(g,wood,V(0,0,0),V(bend,3.4,0),.43);branch(g,wood,V(bend,3.4,0),V(-bend*.4,6.65,0),.29);
  for(let i=0;i<6;i++){let a=i*2.4+.35+(rand(id*13+i)-.5)*.38,y=4.1+(i%3)*.8+(rand(id*19+i)-.5)*.25,r=1.15+rand(id*23+i)*.8,x=Math.cos(a)*r,z=Math.sin(a)*r;
   const mid=V(x*.52,y-.38,z*.52);branch(g,wood,V(bend*.4,y-.85,0),mid,.14);branch(g,wood,mid,V(x,y,z),.085);
   crown(g,leaves,x,y+.24,z,1.0+rand(id*29+i)*.3,.53+rand(id*31+i)*.17,.85+rand(id*37+i)*.25)}
  crown(g,leaves,-bend*.4,6.6,0,1.05,.65,1.0);
 }else if(kind===1){ // spruce: blue-green, broad branch layers
  trunk(6.8,.32);for(let i=0;i<5;i++){let y=1.65+i*1.05,r=2.0-i*.29;cone(g,leaves,y,r,2.05)}
 }else if(kind===2){ // fir: dense narrow spire, smooth gray bark
  trunk(7.1,.29);for(let i=0;i<6;i++){let y=1.35+i*.98,r=1.47-i*.195;cone(g,leaves,y,r,1.85)}
 }else if(kind===3){ // oak: short irregular trunk and massive, spreading limbs
  branch(g,wood,V(0,0,0),V(.12,2.2,0),.76);branch(g,wood,V(.12,2.2,0),V(-.15,3.5,0),.55);
  for(let i=0;i<5;i++){let a=i*Math.PI*2/5,r=2.0+(i%2)*.5,x=Math.cos(a)*r,z=Math.sin(a)*r,y=3.9+(i%3)*.38;branch(g,wood,V(.1,2.3+(i%2)*.35,0),V(x,y,z),.32);crown(g,leaves,x,y+.45,z,1.55,.9,1.3)}crown(g,leaves,0,4.85,0,1.65,1,1.5);
 }else if(kind===4){ // birch: slim, slightly bent stem and fine drooping limbs
  branch(g,wood,V(0,0,0),V(.12,3.7,0),.25);branch(g,wood,V(.12,3.7,0),V(-.12,7.15,0),.17);let marks=new THREE.MeshStandardMaterial({color:'#777b6c'});for(let i=0;i<7;i++){let m=new THREE.Mesh(markGeo,marks);m.position.set(.04,1+i*.68,.24);m.scale.set(.28,.055,.045);g.add(m)}for(let i=0;i<5;i++){let a=i*2.4,r=1.0+(i%2)*.35,x=Math.cos(a)*r,z=Math.sin(a)*r,y=4.4+(i%3)*.7;branch(g,wood,V(.08,y-.1,0),V(x,y-.45,z),.07);crown(g,leaves,x,y-.15,z,.7,1,.65)}crown(g,leaves,-.1,6.65,0,.8,1,.75);
 }else if(kind===5){ // upright poplar: continuous tapering stem, ascending limbs enter an uneven narrow crown
  branch(g,wood,V(0,0,0),V(.04,4.5,0),.38);branch(g,wood,V(.04,4.5,0),V(.0,8.9,0),.25);
  for(let i=0;i<6;i++){let a=i*2.4+.2,r=.68+(i%3)*.10,x=Math.cos(a)*r,z=Math.sin(a)*r,y=4.0+i*.34;
   branch(g,wood,V(.03,y,0),V(x*.55,y+.95,z*.55),.105);branch(g,wood,V(x*.55,y+.95,z*.55),V(x,y+1.85,z),.065)}
  crown(g,leaves,.12,7.15,0,1.02,2.25,1.0,id);
 }else if(kind===6){ // elm: vase of exposed rising major limbs with a wide high canopy
  trunk(2.9,.52);for(let i=0;i<5;i++){let a=i*Math.PI*2/5,r=2.25,x=Math.cos(a)*r,z=Math.sin(a)*r,y=5.4+(i%2)*.3;branch(g,wood,V(0,2.3,0),V(x,y,z),.23);crown(g,leaves,x,y+.28,z,1.42,.8,1.14)}crown(g,leaves,0,6.0,0,1.5,.85,1.35);
 }else{ // tuliptree: clear bole with a tapered leader and asymmetrical rising branches
  branch(g,wood,V(0,0,0),V(.04,4.8,0),.55);branch(g,wood,V(.04,4.8,0),V(.12,8.8,0),.37);
  for(let i=0;i<6;i++){let a=i*2.35+.35,r=1.55+(i%3)*.2,x=Math.cos(a)*r,z=Math.sin(a)*r,y=5.05+(i%3)*.32;
   const mid=V(x*.55,y+.8,z*.55),end=V(x,y+1.95+(i%2)*.25,z);
   branch(g,wood,V(.05,y,0),mid,.20);branch(g,wood,mid,end,.11);
   let side=V(x*1.12,y+2.25,z*1.12);branch(g,wood,V(x*.78,y+1.4,z*.78),side,.065);
  }
  crown(g,leaves,.18,8.05,0,2.1,1.65,1.8,id);crown(g,leaves,-1.05,7.55,.12,1.05,.85,1.0,id+91);crown(g,leaves,1.0,7.75,-.18,1.0,1.0,.95,id+107);

 }
 g.updateMatrixWorld(true);const woodParts=[];const branches=[];
 g.traverse(o=>{if(o.isMesh&&o.name==='wood-branch'){woodParts.push(o.geometry.clone().applyMatrix4(o.matrixWorld));branches.push(o);}});
 const trunkGeometry=mergeGeometries(woodParts,false);woodParts.forEach(p=>p.dispose());branches.forEach(o=>o.removeFromParent());
 const stem=new THREE.Mesh(trunkGeometry,wood);stem.name='trunk';g.add(stem);
 const width=.90+rand(id*19)*.20,height=.92+rand(id*17)*.16,lean=(rand(id*23)-.5)*.045;
 g.updateMatrixWorld(true);g.traverse(o=>{if(!o.isMesh)return;const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld),p=geometry.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);p.setXYZ(i,p.getX(i)*width+Math.max(0,y-2)*lean,y*height,p.getZ(i)*width);}geometry.computeVertexNormals();o.geometry=geometry;o.position.set(0,0,0);o.quaternion.identity();o.scale.setScalar(1);});
 return g;
}
