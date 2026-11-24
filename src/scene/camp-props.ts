import {WOOD_TONES} from '../content/wood-tones.ts';
import {setWoodInstanceTone} from './wood-tones.ts';
import {woodCoordinates,woodMaterial} from './wood-grain.ts';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {beveledTimber} from './beveled-timber.ts';
import {CAMP_PROPS,DINING_SEAT} from '../content/scene-props.ts';
import {LOG_SHELTER_POSTS} from '../content/weather.ts';
import type {SceneAppearance} from '../content/scene-props.ts';
import type {InventoryState} from '../domain/inventory.ts';
import {logPresentation} from '../domain/scene-props.ts';
import {heightAt} from '../world/surface.ts';
import type {Resources} from './resources.ts';
import {createFlames} from './fire.ts';
import {planStoneFoundation} from '../world/prop-foundation.ts';
import {createStoneFoundation} from './stone-foundation.ts';
import {createAltarCrown} from './altar.ts';

export function createCampProps(r:Resources,dryingVessels?:THREE.Group){
  const group=new THREE.Group();group.name='r5-camp-and-grove';
  const roots=new Map<string,THREE.Group>();
  for(const spec of Object.values(CAMP_PROPS)){const root=new THREE.Group();root.name=spec.id;root.userData.propId=spec.id;root.position.set(spec.x,heightAt(spec.x,spec.z),spec.z);roots.set(spec.id,root);group.add(root);}
  const fire=roots.get(CAMP_PROPS.fire.id)!,store=roots.get(CAMP_PROPS.logs.id)!,altar=roots.get(CAMP_PROPS.altar.id)!;
  const foundation=planStoneFoundation(CAMP_PROPS.altar.x,CAMP_PROPS.altar.z);
  altar.position.y=foundation.levelY;altar.add(createStoneFoundation(r,foundation));
  const mesh=(parent:THREE.Object3D,g:THREE.BufferGeometry,color:string,x=0,y=0,z=0)=>{const m=new THREE.Mesh(r.own(g),r.material(color,.78));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const merge=(parent:THREE.Object3D,parts:THREE.BufferGeometry[],color:string)=>{const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());if(!g)throw new Error('Cannot merge prop');return mesh(parent,g,color);};
  const woodMesh=(parent:THREE.Object3D,g:THREE.BufferGeometry,color:string,x=0,y=0,z=0)=>{const m=new THREE.Mesh(r.own(g),woodMaterial(r,color,.78));m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
  const woodCylinder=(top:number,bottom:number,height:number,segments=8)=>woodCoordinates(new THREE.CylinderGeometry(top,bottom,height,segments),'raw','y');
  const woodBox=(x:number,y:number,z:number,axis?:'x'|'y'|'z')=>woodCoordinates(beveledTimber(x,y,z,.022),'board',axis);
  const timberBrace=(parent:THREE.Object3D,a:THREE.Vector3,b:THREE.Vector3,width:number)=>{
    const line=b.clone().sub(a),center=a.clone().lerp(b,.5);
    const brace=woodMesh(parent,woodBox(width,line.length(),width,'y'),'#886549',center.x,center.y,center.z);
    brace.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),line.normalize());
  };
  const stones:THREE.BufferGeometry[]=[];
  for(let i=0;i<11;i++){const a=i/11*Math.PI*2;stones.push(new THREE.IcosahedronGeometry(.36,0).scale(1.1,.7,.9).rotateY(a).translate(Math.cos(a)*1.15,.2,Math.sin(a)*1.15));}
  merge(fire,stones,'#8c9690');mesh(fire,new THREE.CylinderGeometry(1.04,1.1,.11,12),'#41392e',0,.06);
  const fireLogs:THREE.BufferGeometry[]=[];
  const charHeads:THREE.BufferGeometry[]=[],ashEnds:THREE.BufferGeometry[]=[];
  for(let i=0;i<5;i++){const a=i/5*Math.PI,y=.24+(i%2)*.14;fireLogs.push(new THREE.CylinderGeometry(.18,.21,1.75,7).rotateZ(Math.PI/2).rotateY(a).translate(0,y,0));
    for(const side of [-1,1]){const x=Math.cos(a)*.87*side,z=-Math.sin(a)*.87*side;charHeads.push(new THREE.IcosahedronGeometry(.22,0).scale(1,.72,.85).rotateY(a).translate(x,y,z));ashEnds.push(new THREE.RingGeometry(.13,.185,7,1,0,4.5).rotateY(a+Math.PI/2+(side<0?Math.PI:0)).translate(x*1.04,y,z*1.04));}
  }
  const hearthLogs=merge(fire,fireLogs,'#69503a'),warmLogs=hearthLogs.material,coldLogs=r.material('#383c38',.92);hearthLogs.name='charred-hearth-logs';
  merge(fire,charHeads,'#272e2b').name='blackened-charcoal-heads';
  const ashes=merge(fire,ashEnds,'#a4a797');ashes.name='cold-ash-on-log-ends';
  const coalMaterial=r.own(new THREE.MeshStandardMaterial({color:'#6b3520',emissive:'#ff3e09',emissiveIntensity:.5,roughness:.85}));
  const coals=new THREE.Mesh(r.own(new THREE.IcosahedronGeometry(.65,0).scale(1,.25,1)),coalMaterial);coals.position.y=.3;fire.add(coals);
  // A small low-poly drying rack; this is a single campsite station, not a new kitchen.
  const dryer=roots.get(CAMP_PROPS.dryer.id)!;
  // The unbuilt station needs a visible worksite; an invisible hit target is not discoverable.
  const dryerSite=new THREE.Group();dryerSite.name='unbuilt-drying-rack-worksite';dryer.add(dryerSite);
  for(const [x,z] of [[-.95,-.5],[.95,-.5],[-.95,.5],[.95,.5]]){
    woodMesh(dryerSite,woodCylinder(.09,.11,.38,6),'#b28b5e',x,.19,z);
  }
  woodMesh(dryerSite,woodCylinder(.08,.08,1.7,6).rotateZ(Math.PI/2).rotateY(.45),'#97754b',0,.18,0);
  const dryerFrame=new THREE.Group();dryerFrame.name='built-drying-rack';dryer.add(dryerFrame);
  for(const x of [-.95,.95])for(const z of [-.5,.5]){
    const foot=heightAt(CAMP_PROPS.dryer.x+x,CAMP_PROPS.dryer.z+z)-dryer.position.y;
    const base=foot+.09,top=2.09;
    woodMesh(dryerFrame,woodBox(.14,top-base,.145,'y'),'#856747',x,(top+base)/2,z);
    mesh(dryerFrame,new RoundedBoxGeometry(.235,.13,.23,1,.025),'#858074',x,foot+.055,z);
  }
  for(const z of [-.5,.5]){
    woodMesh(dryerFrame,woodBox(2.21,.16,.15,'x'),'#b38a60',0,2.10,z);
    for(const x of [-.95,.95])timberBrace(dryerFrame,new THREE.Vector3(x,1.62,z),new THREE.Vector3(x*.66,2.05,z),.09);
  }
  for(const x of [-.95,.95]){
    woodMesh(dryerFrame,woodBox(.12,.11,1.18,'z'),'#a88056',x,1.98,0);
    woodMesh(dryerFrame,woodBox(.15,.11,1.14,'z'),'#a88056',x,.695,0);
  }
  woodMesh(dryerFrame,woodBox(2.04,.07,.075,'x'),'#b88d62',0,1.95,0);
  for(const z of [-.38,-.23,-.08,.08,.23,.38])woodMesh(dryerFrame,woodBox(2.05,.05,.115,'x'),'#bd986b',0,.77,z);
  if(dryingVessels){
    dryingVessels.position.y=.795;
    dryerFrame.add(dryingVessels);
  }
  const dryingMushrooms=new THREE.Group();dryingMushrooms.name='hung-mushrooms';dryerFrame.add(dryingMushrooms);
  for(let i=0;i<5;i++){
    const x=-.76+i*.38;
    mesh(dryingMushrooms,new THREE.CylinderGeometry(.022,.022,.38,5),'#c7b690',x,1.77,0);
    const cap=new THREE.LatheGeometry([[0,0],[.1,0],[.165,.045],[.13,.095],[.07,.12],[0,.126]].map(([r,y])=>new THREE.Vector2(r,y)),9);
    mesh(dryingMushrooms,cap,'#ac7951',x,1.51,0);
  }
  // An unobtrusive stump for voluntary evening reading beside the existing fire.
  const sitX=DINING_SEAT.x-CAMP_PROPS.fire.x,sitZ=DINING_SEAT.z-CAMP_PROPS.fire.z;
  const seatGround=heightAt(DINING_SEAT.x,DINING_SEAT.z)-heightAt(CAMP_PROPS.fire.x,CAMP_PROPS.fire.z);
  const capThickness=.04,stumpHeight=DINING_SEAT.height-capThickness;
  woodMesh(fire,woodCylinder(.45,.51,stumpHeight,9),'#86613e',sitX,seatGround+stumpHeight/2,sitZ).name='evening-reading-stump-body';
  const seatTop=woodMesh(fire,woodCylinder(.43,.43,capThickness,9),'#c29a62',sitX,seatGround+DINING_SEAT.height-capThickness/2,sitZ);
  seatTop.name='evening-reading-stump';
  const coreMat=r.own(new THREE.MeshBasicMaterial({color:'#ffe7a0',transparent:true,opacity:.92,depthWrite:false}));
  const flames=createFlames(r);fire.add(flames.group);
  const fireLight=new THREE.PointLight('#ff9a42',65,18,2);fireLight.position.y=1.4;fire.add(fireLight);
  const glowMaterial=r.own(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{strength:{value:.14}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;uniform float strength;void main(){float fade=pow(max(0.,1.-length(vUv-.5)*2.),2.);gl_FragColor=vec4(.84,.32,.035,fade*strength);}'}));
  const glow=new THREE.Mesh(r.geometry('r5-warm-ground',()=>new THREE.PlaneGeometry(7.4,7.4)),glowMaterial);glow.rotation.x=-Math.PI/2;glow.position.y=.025;fire.add(glow);
  const embers=new THREE.InstancedMesh(r.geometry('r5-ember',()=>new THREE.IcosahedronGeometry(.035,0)),coreMat,16);fire.add(embers);
  // Low-poly smoke uses a single transparent draw; texture is optional, licensed separately.
  const smokeMat=r.own(new THREE.MeshBasicMaterial({color:'#b6b7a9',transparent:true,opacity:.12,depthWrite:false}));
  const smoke=new THREE.InstancedMesh(r.geometry('r5-smoke',()=>new THREE.IcosahedronGeometry(.4,0)),smokeMat,6);fire.add(smoke);
  for(const x of [-1.8,1.8])woodMesh(store,woodBox(.18,1.9,3),'#786044',x,.9);
  for(const z of [-1.4,1.4])woodMesh(store,woodBox(4,.2,.2),'#786044',0,.15,z);
  // The stored stock has a real roof matching the sheltered weather footprint.
  const canopy=new THREE.Group();canopy.name='log-store-rain-canopy';store.add(canopy);
  for(const post of LOG_SHELTER_POSTS){
    const foot=heightAt(CAMP_PROPS.logs.x+post.x,CAMP_PROPS.logs.z+post.z)-store.position.y-.06;
    woodMesh(canopy,woodBox(.14,2.58-foot,.14,'y'),'#795b3b',post.x,(foot+2.58)/2,post.z);
    timberBrace(canopy,new THREE.Vector3(post.x,2.16,post.z),new THREE.Vector3(post.x,2.52,post.z*.64),.10);
  }
  for(const side of [-1,1])woodMesh(canopy,woodBox(.16,.22,3.46,'z'),'#856244',side*1.9,2.595,0);
  const roofAngle=Math.atan2(.55,2.2),roofLength=Math.hypot(2.2,.55);
  for(const side of [-1,1]){
    const slope=new THREE.Group();
    slope.position.set(side*1.1,2.925,0);slope.rotation.z=-side*roofAngle;canopy.add(slope);
    const roof=woodMesh(slope,woodBox(roofLength+.10,.09,3.6,'x'),'#765c44');
    roof.name='log-store-roof';
    for(let i=0;i<9;i++){
      const color=['#946f50','#896749','#9c7855'][i%3];
      woodMesh(slope,woodBox(roofLength+.12,.065,.387,'x'),color,0,.062,(i-4)*.4);
    }
  }
  woodMesh(canopy,woodBox(.17,.16,3.75),'#a5855b',0,3.23,0).name='log-store-roof-ridge';
  const logGeo=r.geometry('r5-stock-log',()=>woodCoordinates(new THREE.CylinderGeometry(.31,.33,2.6,9),'raw','y').rotateX(Math.PI/2));
  const capGeo=r.geometry('r5-stock-cap',()=>woodCoordinates(new THREE.CircleGeometry(.274,9),'end','z'));
  const logs=new THREE.InstancedMesh(logGeo,woodMaterial(r,WOOD_TONES.neutral.bark),18),caps=new THREE.InstancedMesh(capGeo,woodMaterial(r,WOOD_TONES.neutral.end),36);store.add(logs,caps);
  const dummy=new THREE.Object3D();let index=0;
  for(let row=0;row<4;row++)for(let col=0;col<6-row&&index<18;col++){
    const x=(col-(5-row)/2)*.65,y=.52+row*.55;
    dummy.position.set(x,y,0);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();logs.setMatrixAt(index,dummy.matrix);setWoodInstanceTone(logs,index,`stored-log:${index}`);
    for(let side=0;side<2;side++){dummy.position.set(x,y,side?1.303:-1.303);dummy.rotation.set(0,side?0:Math.PI,0);dummy.updateMatrix();caps.setMatrixAt(index*2+side,dummy.matrix);setWoodInstanceTone(caps,index*2+side,`stored-log:${index}`);}index++;
  }
  logs.computeBoundingSphere();caps.computeBoundingSphere();
  // The accepted lower octagonal stonework stays beneath the separate floating crown.
  mesh(altar,new THREE.CylinderGeometry(2.6,2.8,.25,8),'#6f8179',0,.12);
  mesh(altar,new THREE.CylinderGeometry(1.9,2.2,.34,8),'#9baa99',0,.38);
  mesh(altar,new THREE.CylinderGeometry(1.3,1.5,.38,8),'#b9bfa9',0,.72);
  const crown=createAltarCrown(r);altar.add(crown.group);
  const moss:THREE.BufferGeometry[]=[];for(let i=0;i<7;i++)moss.push(new THREE.IcosahedronGeometry(.4,0).scale(1.6,.3,1).translate(Math.cos(i*2)*2.1,.32,Math.sin(i*2)*1.7));merge(altar,moss,'#6e914d');
  const hits:THREE.Object3D[]=[crown.oracleHit];
  for(const [id,root] of roots){const s=Object.values(CAMP_PROPS).find(s=>s.id===id)!,h=id===CAMP_PROPS.altar.id?1.7:3.3,m=new THREE.Mesh(r.own(new THREE.CylinderGeometry(s.radius,s.radius,h,8)),r.own(new THREE.MeshBasicMaterial({visible:false})));m.position.y=h/2;m.userData.propId=id;root.add(m);hits.push(m);}
  let lastQuantity=-1,disposed=false;
  return {group,hits,roots,foundation,update(time:number,state:SceneAppearance,inventory:InventoryState,night:number,reduced:boolean,foodDrying=false,rackBuilt=false){
    if(disposed)return;const t=reduced?0:time,stock=logPresentation(inventory);
    if(stock.quantity!==lastQuantity){logs.count=stock.visible;caps.count=stock.visible*2;lastQuantity=stock.quantity;}
    dryerSite.visible=!rackBuilt;
    dryerFrame.visible=rackBuilt;
    dryingMushrooms.visible=foodDrying&&rackBuilt;
    hearthLogs.material=state.fire?warmLogs:coldLogs;ashes.visible=!state.fire;
    embers.visible=smoke.visible=state.fire;coalMaterial.color.set(state.fire?'#6b3520':'#303632');coalMaterial.emissiveIntensity=state.fire?.8:0;glow.visible=state.fire;glowMaterial.uniforms.strength.value=.08+night*.24;
    flames.update(time,night,reduced,state.fire);
    fireLight.intensity=state.fire?(32+night*62)*(1+(reduced?0:.075*Math.sin(t*8))):0;
    for(let i=0;i<16;i++){const p=(t*.22+i*.618)%1;dummy.position.set(Math.sin(i*2.4+p)*.5,.8+p*2.8,Math.cos(i*2.4)*.4);dummy.scale.setScalar(1-p);dummy.updateMatrix();embers.setMatrixAt(i,dummy.matrix);}embers.instanceMatrix.needsUpdate=true;
    for(let i=0;i<6;i++){const p=(t*.1+i/6)%1;dummy.position.set(p*.7,1.2+p*4.3,Math.sin(i)*.25);dummy.scale.setScalar(.6+p*1.4);dummy.updateMatrix();smoke.setMatrixAt(i,dummy.matrix);}smoke.instanceMatrix.needsUpdate=true;smoke.computeBoundingSphere();embers.computeBoundingSphere();
    crown.update(time,state,reduced);crown.oracleHit.userData.propActive=state.altar!=='dormant';
  },stats:()=>({stock:lastQuantity,logs:logs.count,logCaps:caps.count,hearth:flames.group.visible?'burning':'charcoal',flames:flames.stats(),altar:crown.stats(),foundation:{levelY:foundation.levelY,low:foundation.low,high:foundation.high,radius:foundation.radius},fireLights:1,altarLights:1,entities:[...roots.keys()],disposed}),dispose(){if(disposed)return;disposed=true;roots.clear();hits.length=0;group.removeFromParent();group.clear();}};
}

