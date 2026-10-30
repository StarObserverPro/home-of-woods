import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ALTAR_LAYOUT,oracleFor} from '../content/altar.ts';
import type {ReviewState} from '../content/scene-review.ts';
import type {Resources} from './resources.ts';

function createOracleTexture(r:Resources){
  const canvas=typeof document==='undefined'?null:document.createElement('canvas');
  if(canvas){canvas.width=512;canvas.height=640;}
  const texture=r.own(canvas?new THREE.CanvasTexture(canvas):new THREE.DataTexture(new Uint8Array([228,215,173,255]),1,1));
  texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
  let revision=0;
  return {texture,revision:()=>revision,draw(state:ReviewState){
    revision++;const ctx=canvas?.getContext('2d');if(!ctx)return;
    const text=oracleFor(state.altar,state.offering);ctx.fillStyle='#e5d9b6';ctx.fillRect(0,0,512,640);
    ctx.strokeStyle='#9a9d74';ctx.lineWidth=3;ctx.strokeRect(26,28,460,582);ctx.strokeRect(36,38,440,562);
    ctx.fillStyle='#365b4b';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 48px "KaiTi", "SimSun", serif';ctx.fillText(text.title,256,101);
    ctx.save();ctx.translate(256,201);ctx.beginPath();ctx.moveTo(0,39);ctx.bezierCurveTo(-66,12,-45,-52,0,-43);ctx.bezierCurveTo(47,-49,62,12,0,39);ctx.strokeStyle='#738e62';ctx.lineWidth=5;ctx.stroke();ctx.beginPath();ctx.moveTo(0,29);ctx.lineTo(0,-30);ctx.moveTo(0,8);ctx.lineTo(-23,-8);ctx.moveTo(0,-3);ctx.lineTo(25,-20);ctx.stroke();ctx.restore();
    ctx.font='64px "KaiTi", "SimSun", serif';text.lines.forEach((line,i)=>ctx.fillText(line,256,330+i*100));
    ctx.fillStyle='#8e8c69';ctx.font='28px "Microsoft YaHei", sans-serif';ctx.fillText('供奉预览',256,551);texture.needsUpdate=true;
  }};
}

function shardGeometry(a:number,span:number){
  const inner=1.09,outer=1.35,mid=a+span/2,shape=new THREE.Shape();
  shape.moveTo(Math.cos(a)*inner,Math.sin(a)*inner);
  for(let i=0;i<=3;i++){const t=a+span*i/3;shape.lineTo(Math.cos(t)*outer,Math.sin(t)*outer);}
  for(let i=3;i>=0;i--){const t=a+span*i/3;shape.lineTo(Math.cos(t)*inner,Math.sin(t)*inner);}shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:.26,bevelEnabled:false,steps:1}).translate(-Math.cos(mid)*1.22,-Math.sin(mid)*1.22,-.13);
}

export function createAltarCrown(r:Resources){
  const group=new THREE.Group();group.name='r5c-floating-forest-shrine';
  const stone=r.material('#80998c',.81),gold=r.material('#b6ac78',.7);
  const luminous=r.own(new THREE.MeshStandardMaterial({color:'#b0edc9',emissive:'#78dfb4',emissiveIntensity:.6,roughness:.48,metalness:0,flatShading:true}));
  const rune=r.own(new THREE.MeshBasicMaterial({color:'#a9f0ce',transparent:true,opacity:.5,depthWrite:false}));
  const add=(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0)=>{const mesh=new THREE.Mesh(r.own(geometry),material);mesh.position.set(x,y,z);mesh.receiveShadow=true;parent.add(mesh);return mesh;};
  // A broad, supported front ledge keeps the three offerings physically separate from the hovering crown.
  add(group,new THREE.CylinderGeometry(1.50,1.56,.20,8).scale(1,1,.46),stone,0,1.04,.75);
  for(const x of [-1.05,1.05])add(group,new THREE.BoxGeometry(.32,.42,.46),stone,x,.77,.75);
  const slots=ALTAR_LAYOUT.offeringSlots.map(slot=>{
    const root=new THREE.Group();root.name=slot.id;root.position.set(slot.x,slot.y,slot.z);group.add(root);
    add(root,new THREE.CylinderGeometry(.30,.34,.12,10),r.material('#bcc3a8',.85),0,-.09);
    add(root,new THREE.TorusGeometry(.27,.028,4,16).rotateX(Math.PI/2),gold,0,-.018);
    const contents=new THREE.Group();contents.name=slot.id+':contents';root.add(contents);return {root,contents};
  });
  const stems:THREE.BufferGeometry[]=[],caps:THREE.BufferGeometry[]=[];
  for(const [x,z,h] of [[-.12,-.05,.23],[.11,.08,.27]]){stems.push(new THREE.CylinderGeometry(.045,.055,h,6).translate(x,h/2,z));caps.push(new THREE.SphereGeometry(.17,7,4,0,Math.PI*2,0,Math.PI/2).translate(x,h,z));}
  const batch=(root:THREE.Object3D,parts:THREE.BufferGeometry[],material:THREE.Material)=>{const merged=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(!merged)throw new Error('Altar item batch failed');return add(root,merged,material);};
  batch(slots[0].contents,stems,r.material('#e7d5aa'));batch(slots[0].contents,caps,r.material('#bf8564'));
  const branches:THREE.BufferGeometry[]=[];for(let i=0;i<4;i++)branches.push(new THREE.CylinderGeometry(.035,.045,.48,6).rotateZ(Math.PI/2).rotateY(-.4+i*.2).translate(0,.04+(i%2)*.065,(i-1.5)*.06));batch(slots[1].contents,branches,r.material('#9c744b'));
  const logs:THREE.BufferGeometry[]=[],ends:THREE.BufferGeometry[]=[];
  for(const [x,y] of [[-.11,.1],[.11,.1],[0,.28]]){logs.push(new THREE.CylinderGeometry(.10,.115,.43,8).rotateX(Math.PI/2).translate(x,y,0));ends.push(new THREE.CircleGeometry(.088,8).translate(x,y,.217));}
  batch(slots[2].contents,logs,r.material('#785438'));batch(slots[2].contents,ends,r.material('#d8b780'));
  const fragments:Array<{root:THREE.Group;home:THREE.Vector3;phase:number}>=[];
  for(let i=0;i<7;i++){
    const a=-.22+i/7*Math.PI*2,span=.64+(i%3)*.035,mid=a+span/2,root=new THREE.Group();root.name=`altar-floating-stone-${i}`;
    const home=new THREE.Vector3(Math.cos(mid)*1.22,ALTAR_LAYOUT.seed.y+Math.sin(mid)*1.22,ALTAR_LAYOUT.seed.z);root.position.copy(home);group.add(root);
    add(root,shardGeometry(a,span),stone);
    const line=new THREE.TorusGeometry(1.12,.018,3,12,span*.74).rotateZ(a+span*.13).translate(-Math.cos(mid)*1.22,-Math.sin(mid)*1.22,.142);add(root,line,rune);
    fragments.push({root,home,phase:i*1.71});
  }
  const seed=add(group,new THREE.OctahedronGeometry(.42,0).scale(.63,1.34,.63),luminous,ALTAR_LAYOUT.seed.x,ALTAR_LAYOUT.seed.y,ALTAR_LAYOUT.seed.z);seed.name='altar-levitating-seed';
  const orbit=new THREE.Group();orbit.position.copy(seed.position);group.add(orbit);
  for(let i=0;i<2;i++){const ring=add(orbit,new THREE.TorusGeometry(.63+i*.18,.015,3,48),rune);ring.rotation.set(.35+i*1.1,.55+i*.7,.25+i*.4);}
  const floor=add(group,new THREE.TorusGeometry(1.65,.02,3,48).rotateX(Math.PI/2),rune,0,.58,0);floor.name='altar-floor-sigil';
  // Thin threads lead from actual item anchors towards the seed; these are visual cues, not transactions.
  const linkPoints:number[]=[];
  for(const slot of ALTAR_LAYOUT.offeringSlots){let previous=new THREE.Vector3(slot.x,slot.y+.22,slot.z);
    for(let i=1;i<=10;i++){const t=i/10,next=new THREE.Vector3(slot.x*(1-t),slot.y+.22+(ALTAR_LAYOUT.seed.y-slot.y-.22)*t,slot.z+(ALTAR_LAYOUT.seed.z-slot.z)*t+Math.sin(t*Math.PI)*.18);linkPoints.push(...previous.toArray(),...next.toArray());previous=next;}
  }
  const linkMaterial=r.own(new THREE.LineBasicMaterial({color:'#91e0bb',transparent:true,opacity:.18,depthWrite:false}));
  const links=new THREE.LineSegments(r.own(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(linkPoints,3))),linkMaterial);group.add(links);
  const sparks=new THREE.InstancedMesh(r.geometry('r5c-altar-spark',()=>new THREE.OctahedronGeometry(.029,0)),luminous,20),dummy=new THREE.Object3D();group.add(sparks);
  const oracle=new THREE.Group();oracle.name='altar-oracle-anchor';oracle.position.set(ALTAR_LAYOUT.oracle.x,ALTAR_LAYOUT.oracle.y,ALTAR_LAYOUT.oracle.z);oracle.rotation.y=-.12;group.add(oracle);
  const text=createOracleTexture(r),paperGeometry=r.geometry('r5c-curled-oracle',()=>{
    const g=new THREE.PlaneGeometry(1.23,1.56,6,8),p=g.getAttribute('position');
    for(let i=0;i<p.count;i++)p.setZ(i,.055*Math.sin(p.getY(i)*3.2)+.06*(p.getX(i)/.615)**2);g.computeVertexNormals();return g;
  });
  const paper=new THREE.Mesh(paperGeometry,r.own(new THREE.MeshBasicMaterial({map:text.texture,color:'#fff5dd',side:THREE.FrontSide})));paper.name='altar-readable-oracle';paper.userData.reviewId=ALTAR_LAYOUT.oracle.id;oracle.add(paper);
  const reverse=new THREE.Mesh(paperGeometry,r.material('#ded2aa',.9));(reverse.material as THREE.MeshStandardMaterial).side=THREE.BackSide;oracle.add(reverse);
  for(const y of [-.79,.79])add(oracle,new THREE.CylinderGeometry(.043,.043,1.36,8).rotateZ(Math.PI/2),gold,0,y,.01);
  const light=new THREE.PointLight('#8debc0',8,10,2);light.position.copy(seed.position);group.add(light);
  let phase=0,previousText='',currentState='ready',currentOffering='forest';
  return {group,oracleHit:paper,oracleAnchor:oracle,slots:slots.map(s=>s.root),update(time:number,state:ReviewState,reduced:boolean){
    if(!reduced)phase=time;const active=state.altar==='answering',ready=state.altar==='ready',dormant=state.altar==='dormant';currentState=state.altar;currentOffering=state.offering;
    const key=state.altar+':'+state.offering;if(key!==previousText){text.draw(state);previousText=key;}
    luminous.emissiveIntensity=active?2.1:ready?.65:dormant?0:.12;rune.opacity=active?.65:ready?.34:dormant?0:.1;
    fragments.forEach(({root,home,phase:offset})=>{root.position.copy(home);root.position.y+=(dormant?-.12:Math.sin(phase*1.1+offset)*(active?.07:.035));root.rotation.set(dormant?0:Math.sin(phase*.6+offset)*.035,Math.sin(offset)*.10,Math.sin(phase*.7+offset)*.025);});
    seed.position.y=ALTAR_LAYOUT.seed.y+(dormant?-.12:Math.sin(phase*1.4)*.07);seed.rotation.y=phase*.35;orbit.position.copy(seed.position);orbit.rotation.y=phase*.18;orbit.visible=!dormant;
    slots.forEach(({contents},i)=>{contents.visible=state.offering!=='empty'&&(i<2||state.offering==='mixed');contents.position.y=active?Math.sin(phase*2+i)*.025:0;});
    links.visible=!dormant&&state.offering!=='empty';linkMaterial.opacity=active?.38:.12;floor.visible=!dormant;
    oracle.visible=!dormant;oracle.position.y=ALTAR_LAYOUT.oracle.y+(active?.16:0)+Math.sin(phase*1.15)*.045;oracle.rotation.z=Math.sin(phase*.7)*.025;
    sparks.visible=active;for(let i=0;i<20;i++){const t=(phase*.11+i*.618)%1,a=i*2.4+phase*.25;dummy.position.set(Math.cos(a)*(.55+t*.6),2.1+t*1.6,ALTAR_LAYOUT.seed.z+Math.sin(a)*.55);dummy.scale.setScalar(Math.sin(t*Math.PI));dummy.updateMatrix();sparks.setMatrixAt(i,dummy.matrix);}sparks.instanceMatrix.needsUpdate=true;sparks.computeBoundingSphere();
    light.intensity=active?30:ready?6:0;
  },stats(){let meshes=0,triangles=0;group.traverse(o=>{if(o instanceof THREE.Mesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3*(o instanceof THREE.InstancedMesh?o.count:1);}});return {fragments:7,offeringSlots:slots.length,offering:currentOffering,oracleState:currentState,oracleAnchor:oracle.position.toArray(),textRevision:text.revision(),meshes,triangles,visualTime:phase};}};
}
