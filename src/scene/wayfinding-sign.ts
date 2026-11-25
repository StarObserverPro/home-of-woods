import * as THREE from 'three';
import {beveledTimber} from './beveled-timber.ts';
import type {Resources} from './resources.ts';
import {woodCoordinates,woodMaterial} from './wood-grain.ts';

export function createSign(r:Resources,label:string) {
  const dimensions=label.includes('\n')?[3.2,1.16] as const:[2.7,.95] as const;
  const [width,height]=dimensions;
  const group=new THREE.Group();
  const add=(key:string,make:()=>THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number)=>{
    const mesh=new THREE.Mesh(r.geometry(key,make),material);
    mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;
    group.add(mesh);
  };
  const post=()=>woodCoordinates(beveledTimber(.27,2.47,.25,.028),'board','y');
  add('wayfinding-post',post,woodMaterial(r,'#75573b'),0,1.17,-.115);
  const board=()=>woodCoordinates(beveledTimber(width,height,.17,.035),'board','x');
  add(`wayfinding-board-${width}`,board,woodMaterial(r,'#c7a273'),0,2.1,.035);
  const peg=()=>new THREE.CylinderGeometry(.043,.043,.06,8).rotateX(Math.PI/2);
  for(const side of [-1,1])add('wayfinding-peg',peg,r.material('#5b513d',.92),side*(width*.5-.13),2.1,.104);

  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=192;
  const ctx=canvas.getContext('2d')!;
  const lines=label.split('\n');
  ctx.textAlign='center';ctx.textBaseline='middle';
  lines.forEach((line,index)=>{
    ctx.fillStyle=index===0?'#382d20':'#59472e';
    ctx.font=`700 ${lines.length===1?64:index===0?58:44}px "Microsoft YaHei",sans-serif`;
    ctx.fillText(line,256,lines.length===1?96:60+index*70,443);
  });
  const texture=r.own(new THREE.CanvasTexture(canvas));texture.colorSpace=THREE.SRGBColorSpace;
  const text=new THREE.Mesh(r.geometry(`wayfinding-face-${width}`,()=>new THREE.PlaneGeometry(width-.28,height-.1)),
    r.own(new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false})));
  text.position.set(0,2.1,.122);
  group.add(text);
  return group;
}
