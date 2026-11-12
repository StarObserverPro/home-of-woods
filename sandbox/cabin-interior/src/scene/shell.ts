import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Resources} from '../../../../src/scene/resources.ts';
import {woodCoordinates,woodMaterial} from '../../../../src/scene/wood-grain.ts';
import {CABIN} from '../content.ts';
import {panelWithHoles,cleanMesh,toGeometry} from '../vendor/geometry-quality-kit/procedural-mesh.js';
import {auditMeshData} from '../vendor/geometry-quality-kit/mesh-topology-audit.js';

export type CutMode='auto'|'stage'|'closed';
export type WallSide='north'|'south'|'west'|'east';
type Aperture={id:string;left:number;bottom:number;width:number;height:number;kind:'window'|'door'};
type WallPlan={id:WallSide;length:number;origin:readonly[number,number,number];yaw:number;normal:readonly[number,number];openings:Aperture[]};
const {width:W,depth:D,height:H,wallThickness:T}=CABIN;
export const SECTION_HEIGHT=.72;
export const ROOF_PROFILE={rise:1.38,halfSpan:W/2+.38,thickness:.16,eaveOffset:.10} as const;
/** Outer roof plane, including thickness, shared with the stove flashing. */
export function roofSurfaceAt(x:number){
  const {rise,halfSpan,thickness,eaveOffset}=ROOF_PROFILE;
  const angle=Math.atan2(rise,halfSpan);
  return {height:H+rise+eaveOffset-Math.abs(x)*rise/halfSpan+thickness/(2*Math.cos(angle)),rotationZ:-Math.sign(x)*angle};
}
/** Geometry, caps and window framing are compiled from these inspectable placements. */
export const SHELL_PLAN:readonly WallPlan[]=[
  {id:'north',length:W,origin:[-W/2,0,-D/2-T],yaw:0,normal:[0,-1],openings:[{id:'sleep-window',left:.65,bottom:1.36,width:1.8,height:1.30,kind:'window'}]},
  {id:'south',length:W,origin:[-W/2,0,D/2],yaw:0,normal:[0,1],openings:[{id:'entrance',left:(W-CABIN.doorWidth)/2,bottom:0,width:CABIN.doorWidth,height:CABIN.doorHeight,kind:'door'}]},
  {id:'west',length:D,origin:[-W/2,0,-D/2],yaw:-Math.PI/2,normal:[-1,0],openings:[{id:'table-window',left:3.65,bottom:1.48,width:1.8,height:1.18,kind:'window'}]},
  {id:'east',length:D,origin:[W/2,0,D/2],yaw:Math.PI/2,normal:[1,0],openings:[]},
];

export function createCabinShell(r:Resources){
  const root=new THREE.Group();root.name='cabin-shell';
  const wood=woodMaterial(r,'#bb9369',.87),trim=woodMaterial(r,'#795138',.84),pale=woodMaterial(r,'#d8b686',.84);
  const floorMaterials=['#ae8253','#bb9060','#b58b5d','#c19b6d'].map(c=>woodMaterial(r,c,.84));
  const roofMaterial=r.material('#435a4b',.92),stone=r.material('#756f60',.96),iron=r.material('#443e35',.65);
  const glass=r.own(new THREE.MeshStandardMaterial({color:'#9db3b3',transparent:true,opacity:.20,roughness:.36,metalness:0,depthWrite:false}));
  const geometryReports:{id:string;ok:boolean;faces:number}[]=[];
  function mesh(parent:THREE.Object3D,name:string,g:THREE.BufferGeometry,m:THREE.Material){
    const part=new THREE.Mesh(g,m);part.name=name;part.castShadow=part.receiveShadow=true;parent.add(part);return part;
  }
  function box(parent:THREE.Object3D,name:string,size:readonly[number,number,number],p:readonly[number,number,number],m:THREE.Material,bevel=.012){
    const key=`cabin-box:${size.join(',')}:${bevel}`;
    const g=r.geometry(key,()=>woodCoordinates(new RoundedBoxGeometry(...size,1,Math.min(bevel,...size.map(v=>v/4)))));
    const obj=mesh(parent,name,g,m);obj.position.set(...p);return obj;
  }
  const platform=new THREE.Group();platform.name='continuous-floor-and-porch';root.add(platform);
  box(platform,'room-foundation',[W+.50,.30,D+.50],[0,-.23,0],trim,.045);
  box(platform,'porch-foundation',[CABIN.porchWidth,.30,CABIN.porchDepth],[0,-.23,D/2+CABIN.porchDepth/2],trim,.035);
  // Plank surfaces are exactly Y=0. A foundation below closes every seam.
  function deck(name:string,width:number,depth:number,z:number){
    const batches:THREE.BufferGeometry[][]=[[],[],[],[]];
    const rows=Math.ceil(depth/.32),pitch=depth/rows;
    for(let row=0;row<rows;row++){
      const ends=row%2===0?[-width/2,-width/6,width/6,width/2]:[-width/2,-width*.30,width*.04,width*.36,width/2];
      for(let part=0;part<ends.length-1;part++){
        const a=ends[part],b=ends[part+1];
        const g=woodCoordinates(new RoundedBoxGeometry(b-a-.008,.08,pitch-.006,1,.007),'board','x');
        g.translate((a+b)/2,-.04,z-depth/2+(row+.5)*pitch);batches[(row+part*3)%4].push(g);
      }
    }
    batches.forEach((items,i)=>{const merged=r.own(mergeGeometries(items)!);items.forEach(g=>g.dispose());mesh(platform,`${name}:boards:${i}`,merged,floorMaterials[i]);});
  }
  deck('room',W,D,0);deck('porch',CABIN.porchWidth,CABIN.porchDepth,D/2+CABIN.porchDepth/2);
  box(platform,'door-threshold',[CABIN.doorWidth,.05,.25],[0,-.025,D/2],pale,.008);
  for(const x of [-W/2+.25,W/2-.25])for(const z of [-D/2+.35,D/2-.35])box(root,`stone-support:${x}:${z}`,[.66,.23,.65],[x,-.47,z],stone,.09);
  for(const x of [-CABIN.porchWidth/2+.55,CABIN.porchWidth/2-.55])box(root,`porch-support:${x}`,[.6,.23,.6],[x,-.47,D/2+CABIN.porchDepth-.4],stone,.07);

  const walls=new Map<WallSide,{upper:THREE.Group;cap:THREE.Group;cut:boolean}>();
  const apertureGeometry=(plan:WallPlan,y0:number,y1:number)=>{
    const holes=plan.openings.filter(a=>a.bottom<y1&&a.bottom+a.height>y0).map(a=>[a.left,Math.max(0,a.bottom-y0),a.left+a.width,Math.min(y1-y0,a.bottom+a.height-y0)]);
    const design=cleanMesh(panelWithHoles(plan.length,y1-y0,T,holes));
    // An entrance reaching the split edge makes two intentional disconnected jambs.
    const report=auditMeshData(design,{maxComponents:4});
    geometryReports.push({id:`${plan.id}:${y0}`,ok:report.ok,faces:design.faces.length});
    if(!report.ok)throw new Error(`Invalid cabin wall topology: ${plan.id}: ${JSON.stringify(report.issues)}`);
    const g=woodCoordinates(toGeometry(design),'board','x');g.translate(0,y0,0);return r.own(g);
  };
  for(const plan of SHELL_PLAN){
    const wall=new THREE.Group();wall.name=`wall:${plan.id}`;wall.position.set(...plan.origin);wall.rotation.y=plan.yaw;root.add(wall);
    const upper=new THREE.Group();upper.name=`wall:${plan.id}:upper`;wall.add(upper);
    const cap=new THREE.Group();cap.name=`wall:${plan.id}:section-cap`;wall.add(cap);
    mesh(wall,`${plan.id}:solid-base`,apertureGeometry(plan,0,SECTION_HEIGHT),wood);
    mesh(upper,`${plan.id}:solid-upper`,apertureGeometry(plan,SECTION_HEIGHT,H),wood);
    // Cladding seams are narrow proud wood beads; they never fill an aperture.
    for(let y=.24;y<H;y+=.31){
      let intervals:[[number,number]]|[number,number][]=[[.02,plan.length-.02]];
      for(const a of plan.openings.filter(a=>y>a.bottom-.025&&y<a.bottom+a.height+.025)){
        intervals=intervals.flatMap(([lo,hi])=>[[lo,Math.min(hi,a.left)],[Math.max(lo,a.left+a.width),hi]].filter(([l,h])=>h-l>.015) as [number,number][]);
      }
      for(const [lo,hi] of intervals){
        const parent=y>SECTION_HEIGHT?upper:wall;
        // Both sides share the same row datum. Subtle seam depth, not high-frequency grain geometry.
        box(parent,`${plan.id}:seam:${y}:${lo}:inside`,[hi-lo,.013,.012],[(lo+hi)/2,y,T+.005],trim,.003);
        box(parent,`${plan.id}:seam:${y}:${lo}:outside`,[hi-lo,.013,.012],[(lo+hi)/2,y,-.005],trim,.003);
      }
    }
    const intervals=plan.openings.some(a=>a.kind==='door')?[[0,(W-CABIN.doorWidth)/2],[(W+CABIN.doorWidth)/2,W]]:[[0,plan.length]];
    for(const [lo,hi] of intervals)box(cap,`${plan.id}:cut-surface:${lo}`,[hi-lo,.035,T+.04],[(lo+hi)/2,SECTION_HEIGHT+.008,T/2],pale,.007);
    for(const x of [.085,plan.length-.085]){
      box(wall,`${plan.id}:post-base:${x}`,[.18,SECTION_HEIGHT,.24],[x,SECTION_HEIGHT/2,T/2],trim,.012);
      box(upper,`${plan.id}:post-upper:${x}`,[.18,H-SECTION_HEIGHT,.24],[x,(H+SECTION_HEIGHT)/2,T/2],trim,.012);
    }
    box(upper,`${plan.id}:top-beam`,[plan.length+.08,.19,.28],[plan.length/2,H-.08,T/2],trim,.015);
    for(const a of plan.openings){
      const frame=new THREE.Group();frame.name=a.id;upper.add(frame);
      const x=a.left+a.width/2,y=a.bottom+a.height/2;
      for(const sx of [-1,1])box(frame,`${a.id}:jamb:${sx}`,[.10,a.height+.17,T+.12],[x+sx*(a.width/2+.045),y,T/2],pale,.012);
      box(frame,`${a.id}:lintel`,[a.width+.30,.13,T+.14],[x,a.bottom+a.height+.045,T/2],pale,.014);
      if(a.kind==='window'){
        box(frame,`${a.id}:sill`,[a.width+.38,.12,T+.44],[x,a.bottom-.035,T/2+.10],trim,.016);
        box(frame,`${a.id}:mullion`,[.064,a.height,.08],[x,y,T/2],pale,.009);
        box(frame,`${a.id}:transom`,[a.width,.064,.08],[x,y,T/2],pale,.009);
        const g=r.geometry(`window:${a.width}:${a.height}`,()=>new THREE.BoxGeometry(a.width-.02,a.height-.02,.012));
        const pane=mesh(frame,`${a.id}:glass`,g,glass);pane.position.set(x,y,T/2);pane.castShadow=false;
      }
    }
    walls.set(plan.id,{upper,cap,cut:false});
  }

  const doorPivot=new THREE.Group();doorPivot.name='door-hinge';doorPivot.position.set(-CABIN.doorWidth/2,0,D/2+.04);root.add(doorPivot);
  doorPivot.userData.pickId='door';
  const leaf=box(doorPivot,'door-leaf',[CABIN.doorWidth-.035,CABIN.doorHeight-.025,CABIN.doorThickness],[(CABIN.doorWidth-.035)/2,(CABIN.doorHeight-.025)/2,0],trim,.02);
  leaf.userData.pickId='door';
  for(let i=0;i<6;i++)box(doorPivot,`door-plank:${i}`,[(CABIN.doorWidth-.07)/6-.008,CABIN.doorHeight-.08,.024],[(i+.5)*(CABIN.doorWidth-.07)/6+.015,(CABIN.doorHeight-.08)/2+.02,.05],pale,.008);
  for(const y of [.44,2.45])box(doorPivot,`door-strap:${y}`,[CABIN.doorWidth-.14,.075,.04],[CABIN.doorWidth/2,y,.075],iron,.01);
  const handle=mesh(doorPivot,'door-handle',r.geometry('door-ring',()=>new THREE.TorusGeometry(.09,.015,6,16)),iron);handle.position.set(CABIN.doorWidth-.23,1.3,.09);
  for(const y of [.45,2.45])box(doorPivot,`door-hinge-band:${y}`,[.08,.19,.11],[.025,y,0],iron,.015);

  const roof=new THREE.Group();roof.name='roof-removable';root.add(roof);
  const {rise,halfSpan}=ROOF_PROFILE,slope=Math.atan2(rise,halfSpan),slopeLength=Math.hypot(rise,halfSpan);
  for(const side of [-1,1]){
    const piece=box(roof,`roof-panel:${side}`,[slopeLength,.16,D+.85],[side*halfSpan/2,H+rise/2+.10,0],roofMaterial,.025);
    piece.rotation.z=-side*slope;
    const fascia=box(roof,`eaves:${side}`,[.18,.24,D+.93],[side*halfSpan,H+.08,0],trim,.018);
    fascia.castShadow=true;
    for(const z of [-D/2-.36,D/2+.36]){
      const edge=box(roof,`roof-rake:${side}:${z}`,[slopeLength+.06,.20,.16],[side*halfSpan/2,H+rise/2+.10,z],trim,.016);edge.rotation.z=-side*slope;
    }
  }
  box(roof,'ridge-cap',[.18,.18,D+.96],[0,H+rise+.17,0],trim,.026);
  for(const z of [-D/2+.18,0,D/2-.18])box(roof,`tie-beam:${z}`,[W,.20,.19],[0,H-.16,z],trim,.016);
  for(const z of [-D/2-T/2,D/2+T/2]){
    const outline=new THREE.Shape();outline.moveTo(-W/2,0);outline.lineTo(W/2,0);outline.lineTo(0,rise-.03);outline.closePath();
    const g=r.own(woodCoordinates(new THREE.ExtrudeGeometry(outline,{depth:T,bevelEnabled:false,steps:1,curveSegments:1})));
    const gable=mesh(roof,`closed-gable:${z}`,g,wood);gable.position.set(0,H,z-T/2);
  }
  // Merge siblings only: walls, cut caps, window frames and the hinged door
  // retain their own visibility/motion roots. Wood coordinates stay authored
  // per component while positions and normals are baked into the parent frame.
  function batchStatic(parent:THREE.Object3D){
    for(const child of [...parent.children])if(!(child instanceof THREE.Mesh))batchStatic(child);
    const batches=new Map<string,THREE.Mesh<THREE.BufferGeometry,THREE.Material>[]>();
    for(const child of parent.children){
      if(!(child instanceof THREE.Mesh)||Array.isArray(child.material)||child.material.transparent)continue;
      const g:THREE.BufferGeometry=child.geometry;
      const attributes=Object.entries(g.attributes).map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join('|');
      const key=[child.material.uuid,!!g.index,attributes,child.castShadow,child.receiveShadow,child.renderOrder,child.layers.mask,child.visible,child.userData.pickId??''].join(';');
      const batch=batches.get(key)??[];batch.push(child);batches.set(key,batch);
    }
    for(const parts of batches.values()){
      if(parts.length<2)continue;
      let firstVertex=0;
      const ranges=parts.map(part=>{
        const vertexCount=part.geometry.getAttribute('position').count;
        const range={name:part.name,firstVertex,vertexCount};firstVertex+=vertexCount;return range;
      });
      const geometries=parts.map(part=>{part.updateMatrix();return part.geometry.clone().applyMatrix4(part.matrix);});
      const merged=mergeGeometries(geometries);
      geometries.forEach(g=>g.dispose());
      if(!merged)throw new Error(`Incompatible static cabin components: ${parent.name}`);
      const first=parts[0],batch=mesh(parent,`${parent.name}:batch:${batches.size}:${ranges[0].name}`,r.own(merged),first.material);
      batch.castShadow=first.castShadow;batch.receiveShadow=first.receiveShadow;batch.renderOrder=first.renderOrder;batch.layers.mask=first.layers.mask;batch.visible=first.visible;
      batch.userData={...first.userData,parts:ranges};
      for(const part of parts)parent.remove(part);
    }
  }
  batchStatic(root);
  let angle=-Math.PI/2;
  doorPivot.rotation.y=angle;
  function setDoor(open:boolean,dt:number){const target=open?-Math.PI/2:0;angle=THREE.MathUtils.damp(angle,target,9,dt);if(Math.abs(angle-target)<.001)angle=target;doorPivot.rotation.y=angle;}
  function setCut(mode:CutMode,camera:THREE.Vector3){
    roof.visible=mode==='closed';
    for(const plan of SHELL_PLAN){
      const state=walls.get(plan.id)!;
      const dot=camera.x*plan.normal[0]+camera.z*plan.normal[1];
      const cut=mode==='closed'?false:mode==='stage'?(plan.id==='south'||plan.id==='east'):(state.cut?dot>-.7:dot>.7);
      state.cut=cut;state.upper.visible=!cut;state.cap.visible=cut;
    }
  }
  return {root,roof,setDoor,setCut,geometryReports,stats:()=>({walls:4,apertures:SHELL_PLAN.reduce((n,w)=>n+w.openings.length,0),topology:geometryReports,doorAngle:angle,cutWalls:[...walls.entries()].filter(([,w])=>w.cut).map(([id])=>id)})};
}
