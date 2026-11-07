import * as THREE from 'three';
import {heightAt} from '../world/surface.ts';
import {random,riverX,riverY,ROUTES,portalFrame} from '../world/horizon.js';
const ownMesh=(r,geometry,material,name)=>{const mesh=new THREE.Mesh(r.own(geometry),material);mesh.name=name;return mesh;};
export function createRocks(r,sample){
 const group=new THREE.Group(),rng=random(3821),dummy=new THREE.Object3D(),positions=[];
 // Existing river banks, distant floodplain, and termini use the same height field.
 for(let i=0;i<235;i++){
  const z=-470+rng()*1040,x=riverX(z)+(rng()<.5?-1:1)*(7+rng()*12);
  if(x>5&&x<47&&Math.abs(z-38)<6)continue;
  const y=sample(x,z);if(y>riverY(z)+13)continue;
  positions.push({x,y:y-.25,z,s:.65+rng()*2.3,ry:rng()*6.28});
 }
 for(const route of ROUTES)if(route.gate){
  const {x,z,nx,nz}=portalFrame(route);for(const side of [-1,1]){const px=x+nx*side*4.2,pz=z+nz*side*4.2;positions.push({x:px,y:sample(px,pz)-.3,z:pz,s:2.1,ry:side*.7});}
 }
 const geo=r.own(new THREE.IcosahedronGeometry(1,0)),mat=r.own(new THREE.MeshStandardMaterial({color:'#a2aaa0',roughness:.94,flatShading:true}));
 const mesh=new THREE.InstancedMesh(geo,mat,positions.length);
 positions.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(.1,p.ry,.1);dummy.scale.set(p.s,p.s*.66,p.s*.87);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
 mesh.receiveShadow=true;mesh.castShadow=true;mesh.computeBoundingSphere();r.own(mesh);group.name='riverbank-and-portal-rocks';group.add(mesh);return group;
}
function makeSign(r,text){
 const group=new THREE.Group(),wood=r.material('#70543a',.9),box=r.geometry('sign-unit',()=>new THREE.BoxGeometry(1,1,1));
 const post=new THREE.Mesh(box,wood);post.position.y=1.25;post.scale.set(.18,2.5,.18);group.add(post);
 const board=new THREE.Mesh(box,r.material('#c2a575',.9));board.position.y=2.2;board.scale.set(3.2,1.15,.18);group.add(board);
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#c8b58b';ctx.fillRect(0,0,512,192);ctx.strokeStyle='#927449';ctx.lineWidth=8;ctx.strokeRect(8,8,496,176);
 ctx.fillStyle='#3d4938';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 42px "Microsoft YaHei",sans-serif';
 const lines=text.split('\n');lines.forEach((line,i)=>ctx.fillText(line,256,lines.length===1?96:62+i*73));
 const texture=r.own(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;
 const face=ownMesh(r,new THREE.PlaneGeometry(3.07,1.04),r.own(new THREE.MeshStandardMaterial({map:texture,roughness:.9,side:THREE.DoubleSide})),'wayfinding-text');face.position.set(0,2.2,.098);group.add(face);return group;
}
export function portalProps(r,sample){
 const group=new THREE.Group(),wood=r.material('#756447',.95),box=r.geometry('portal-unit',()=>new THREE.BoxGeometry(1,1,1));
 for(const route of [...ROUTES.filter(r=>r.gate),{...ROUTES.find(r=>r.id==='bridge'),gate:[8,38]}]){
  if(!route.gate)continue;const {x,z,nx,nz,facing}=portalFrame(route),sign=makeSign(r,`${route.name}\n${route.id==='bridge'?'待修建':'暂未开放'}`);
  const sx=x+nx*3.3,sz=z+nz*3.3;sign.position.set(sx,sample(sx,sz),sz);sign.rotation.y=facing;group.add(sign);
  for(const side of [-1,1]){const px=x+nx*side*2.2,pz=z+nz*side*2.2,y=sample(px,pz),post=new THREE.Mesh(box,wood);post.position.set(px,y+.7,pz);post.scale.set(.14,1.4,.14);post.rotation.z=side*.08;group.add(post);}
  const curve=new THREE.CatmullRomCurve3([-1,0,1].map(side=>{const px=x+nx*side*2.2,pz=z+nz*side*2.2;return new THREE.Vector3(px,sample(px,pz)+(side?1.1:.65),pz);}));
  group.add(ownMesh(r,new THREE.TubeGeometry(curve,12,.055,4,false),r.material('#b29d74',1),`rope-${route.id}`));
 }
 const fork=makeSign(r,'← 营地　溪岸 →');fork.position.set(-27,heightAt(-27,54),54);group.add(fork);
 const lookout=makeSign(r,'山口 ↑　↓ 溪谷');lookout.position.set(-23,heightAt(-23,-68),-68);group.add(lookout);
 group.name='route-termini-and-direction-signs';return group;
}
