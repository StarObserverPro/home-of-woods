import * as T from 'three';
import {grassTuft,canopyMask,colonyField,SHADE_THRESHOLD} from './understory-geometry.js';
import {heightAt,pathDistance,riverX,slopeAt} from '../world/surface.ts';
import {HOME,CABIN,TENT,WORLD} from '../content/world.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {treeScaleFactor} from '../domain/forestry.ts';
export function createUnderstory(r,trees,selections){
let seed=731;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
const sphere=new T.IcosahedronGeometry(1,1),leaf=new T.OctahedronGeometry(1,0),rod=new T.CylinderGeometry(1,1,1,7),dummy=new T.Object3D();
const grassGeometry=grassTuft();const box=new T.BoxGeometry(1,1,1);const rock=new T.IcosahedronGeometry(1,0);rock.scale(1,.64,.85);rock.computeVertexNormals();
const shrub=new T.IcosahedronGeometry(1,1);const sp=shrub.attributes.position;for(let i=0;i<sp.count;i++){const x=sp.getX(i),y=sp.getY(i),z=sp.getZ(i);sp.setXYZ(i,x*(1+.17*Math.sin(y*5+z*3)),y*.72,z*(1+.13*Math.cos(x*6)));}shrub.computeVertexNormals();
const fallen=new T.BufferGeometry();fallen.setAttribute('position',new T.Float32BufferAttribute([0,.10,0,-.6,0,-.35,0,.03,-1,0,.10,0,0,.03,-1,.6,.02,-.35,0,.10,0,.6,.02,-.35,.4,.05,.6,0,.10,0,.4,.05,.6,0,.18,1,0,.10,0,0,.18,1,-.5,0,.5,0,.10,0,-.5,0,.5,-.6,0,-.35],3));fallen.computeVertexNormals();
const broken=new T.CylinderGeometry(.83,1,1,7,1);const bp=broken.attributes.position;for(let i=0;i<bp.count;i++){const y=bp.getY(i);bp.setY(i,y+(y>0?.12*Math.sin(bp.getX(i)*13+bp.getZ(i)*9):.04*Math.cos(bp.getX(i)*8)));}broken.computeVertexNormals();

const group=new T.Group();group.name='integrated-understory';let batches={},host=null;
const height=heightAt;
function put(name,g,color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){if(!batches[name])batches[name]={g,color,items:[]};dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(rx,ry,rz);dummy.updateMatrix();batches[name].items.push({matrix:dummy.matrix.clone(),host,tint:.88+rnd()*.24});}
function fern(x,z,size){const y=height(x,z);for(let f=0;f<7;f++){const a=f*Math.PI*2/7+rnd()*.3;for(let j=1;j<=6;j++){const t=j/7,r=t*size;const cy=y+Math.sin(t*Math.PI*.8)*size*.65;for(const side of [-1,1]){const spread=(1-t)*size*.23;put('fern',leaf,0x39744b,x+Math.cos(a)*r+Math.cos(a+1.4)*spread*side,cy,z+Math.sin(a)*r+Math.sin(a+1.4)*spread*side,.075*size,.027*size,spread+.04,0,-a+side*.75,side*.15);}}
put('stem',rod,0x678347,x+Math.cos(a)*size*.37,y+size*.30,z+Math.sin(a)*size*.37,.012,size*.88,.012,Math.sin(a)*.9,0,-Math.cos(a)*.9);}}

const eligible=trees.filter(t=>t.role==='managed');
const crowns=eligible.map(t=>{const mesh=selections.get(t.id);mesh.geometry.computeBoundingBox();const b=mesh.geometry.boundingBox;return {x:t.x,z:t.z,rx:Math.max(.8,(b.max.x-b.min.x)*t.scale*.50),rz:Math.max(.8,(b.max.z-b.min.z)*t.scale*.50),id:t.id};});
const clear=(x,z)=>height(x,z)>WORLD.waterY+.3&&pathDistance(x,z)>2.8&&Math.abs(x-riverX(z))>WORLD.riverHalfWidth+1&&slopeAt(x,z)<.7&&[HOME,CABIN,TENT,...Object.values(CAMP_PROPS)].every(p=>Math.hypot(x-p.x,z-p.z)>(p===HOME?7:p===CABIN?9:p===TENT?6:(p.radius??2)+1.5))&&trees.every(t=>Math.hypot(x-t.x,z-t.z)>.8*t.scale);
const fernHosts=new Set([...eligible].sort((a,b)=>Math.hypot(a.x-HOME.x,a.z-HOME.z)-Math.hypot(b.x-HOME.x,b.z-HOME.z)).slice(0,6).map(t=>t.id));
let fernCount=0,grassCount=0,shrubCount=0,stoneCount=0,logCount=0;
// Fixed candidate passes distribute the budget across hosts rather than exhausting it on one tree.
for(let pass=0;pass<160;pass++)for(const tree of eligible){
 if(pass>=5&&!fernHosts.has(tree.id))continue;
 const crown=crowns.find(c=>c.id===tree.id);const x=tree.x+(rnd()-.5)*crown.rx*2.4,z=tree.z+(rnd()-.5)*crown.rz*2.4;
 if(!clear(x,z))continue;const shade=canopyMask(x,z,crowns),field=colonyField(x,z,shade);host=tree.id;
 if(fernCount<90&&fernHosts.has(tree.id)&&shade>=SHADE_THRESHOLD&&rnd()<field*.65){fern(x,z,.30+.38*field+rnd()*.1);fernCount++;}
 if(pass<4){put('litter',fallen,0x786342,x,height(x,z)+.025,z,.16,.15,.22,0,rnd()*6);}
 host=null;
 if(grassCount<320&&pass<5){const gx=x+(rnd()-.5)*5,gz=z+(rnd()-.5)*5;if(clear(gx,gz)){const scale=1+rnd()*.65;put('grass',grassGeometry,0x829c4e,gx,height(gx,gz)+.01,gz,scale,scale,scale,0,rnd()*6);grassCount++;}}
 if(shrubCount<40&&pass===0){put('shrub',shrub,0x72934d,x,height(x,z)+.38,z,.65+rnd()*.3,.65,.6,0,rnd()*6);shrubCount++;}
 if(stoneCount<45&&pass===1){put('stone',rock,0x969d8d,x,height(x,z)+.07,z,.25+rnd()*.2,.20,.35,0,rnd()*6);stoneCount++;}
 if(logCount<12&&pass===2&&clear(x+1,z)&&clear(x-1,z)){
 const y=height(x,z)+.18;put('log',broken,0x67503c,x,y,z,.25,1.7,.23,0,0,Math.PI/2);put('hollow',rod,0x342c24,x-.85,y,z,.16,.018,.14,0,0,Math.PI/2);put('moss',shrub,0x7f934e,x,y+.17,z,.45,.06,.15);put('snag',broken,0x67503c,x+.2,y+.15,z,.05,.5,.05,.6,0,.5);logCount++;
 }
}
const live=[];let triangles=0;
for(const [name,b] of Object.entries(batches)){
 const geometry=r.own(b.g.clone()),material=r.own(new T.MeshStandardMaterial({color:b.color,roughness:.85,side:T.DoubleSide}));
 const mesh=r.own(new T.InstancedMesh(geometry,material,b.items.length));mesh.name=`understory-${name}`;mesh.receiveShadow=true;
 b.items.forEach((v,i)=>{mesh.setMatrixAt(i,v.matrix);mesh.setColorAt(i,new T.Color().setScalar(v.tint));});mesh.computeBoundingSphere();group.add(mesh);live.push({mesh,items:b.items});triangles+=(geometry.index?.count??geometry.attributes.position.count)/3*b.items.length;
}
new Set([sphere,leaf,rod,grassGeometry,box,rock,shrub,fallen,broken]).forEach(g=>g.dispose());
let last='';return {group,update(state){const signature=eligible.map(t=>{const life=state.forestry.slots[t.id];return `${life?.status}:${Math.round(treeScaleFactor(life,state.time)*10)}`;}).join('|');if(signature===last)return;last=signature;
 for(const batch of live){if(!batch.items.some(v=>v.host))continue;batch.items.forEach((v,i)=>{if(!v.host)return;const life=state.forestry.slots[v.host];const active=life?.status!=='stump'&&life?.status!=='falling'&&treeScaleFactor(life,state.time)>.75;batch.mesh.setMatrixAt(i,active?v.matrix:new T.Matrix4().makeScale(0,0,0));});batch.mesh.instanceMatrix.needsUpdate=true;}
 },stats:()=>({version:'forest-intake-1',ferns:fernCount,grassTufts:grassCount,shrubs:shrubCount,stones:stoneCount,logs:logCount,triangles,batches:live.length,shadeThreshold:SHADE_THRESHOLD})};
}
