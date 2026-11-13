import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {random,riverX,riverY,routeDistance,smooth} from '../world/horizon.js';

export const OUTER_FOREST={seed:105071,triangleBudget:57000,maxTrees:2850};
const definitions={
 oak:{name:'块冠阔叶',leaf:'#779650'},
 poplar:{name:'狭冠阔叶',leaf:'#879f5d'},
 pine:{name:'开展松冠',leaf:'#577e50'},
 spruce:{name:'锥冠云杉',leaf:'#416c50'},
 fir:{name:'窄冠冷杉',leaf:'#537b62'},
};

function colored(geometry,hex){
 const g=geometry.index?geometry.toNonIndexed():geometry.clone(),color=new THREE.Color(hex),array=[];
 for(let i=0;i<g.getAttribute('position').count;i++)color.toArray(array,i*3);
 g.setAttribute('color',new THREE.Float32BufferAttribute(array,3));g.deleteAttribute('uv');geometry.dispose();return g;
}
function crownProfile(profile,sides){
 const positions=[],indices=[];
 for(const [y,r] of profile)for(let i=0;i<sides;i++){const angle=i/sides*Math.PI*2;positions.push(Math.cos(angle)*r,y,Math.sin(angle)*r);}
 for(let j=1;j<profile.length;j++)for(let i=0;i<sides;i++){const a=(j-1)*sides+i,b=(j-1)*sides+(i+1)%sides,c=j*sides+i,d=j*sides+(i+1)%sides;indices.push(a,c,b);if(profile[j][1]>0)indices.push(b,c,d);}
 const center=positions.length/3;positions.push(0,profile[0][0],0);for(let i=0;i<sides;i++)indices.push(center,i,(i+1)%sides);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function distantTreeGeometry(kind){
 const spec=definitions[kind],pieces=[];
 const trunk=new THREE.CylinderGeometry(.15,.28,kind==='pine'?4.5:3.6,3,1,true);trunk.translate(0,(kind==='pine'?4.5:3.6)/2,0);pieces.push(colored(trunk,'#795e40'));
 const leaf=(geometry,scale,position)=>{geometry.scale(...scale).translate(...position);pieces.push(colored(geometry,spec.leaf));};
 if(kind==='oak')leaf(new THREE.IcosahedronGeometry(1,0),[2.65,2.1,2.25],[.2,4.25,0]);
 else if(kind==='poplar')leaf(new THREE.OctahedronGeometry(1,0),[1.35,3.6,1.45],[.15,4.9,0]);
 else if(kind==='pine'){
  leaf(new THREE.OctahedronGeometry(1,0),[2.45,1.3,1.9],[-.7,4.1,.25]);
  leaf(new THREE.OctahedronGeometry(1,0),[2.05,1.3,1.8],[.85,5.55,-.2]);
 }else if(kind==='spruce')pieces.push(colored(crownProfile([[1.3,2.05],[3.8,1.55],[7.9,0]],5),spec.leaf));
 else pieces.push(colored(crownProfile([[1.35,1.55],[4.25,1.10],[8.1,0]],4),spec.leaf));
 const geometry=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.name=`distant-${kind}`;return geometry;
}

export function forestWeights(y,bankDistance){
 const high=smooth(40,115,y),wet=1-smooth(25,85,bankDistance);
 return {oak:.57*(1-high),poplar:(.07+.20*wet)*(1-high),pine:.25+.15*high,spruce:.07+.55*high,fir:.07+.32*high};
}
function choose(weights,value){let n=value*Object.values(weights).reduce((a,b)=>a+b);for(const [key,weight] of Object.entries(weights)){n-=weight;if(n<=0)return key;}return 'fir';}

export function planOuterForest(sample,triangleCounts,existing=[]){
 const rng=random(OUTER_FOREST.seed),placements=[];let triangles=0;
 for(let i=0;i<30000&&placements.length<OUTER_FOREST.maxTrees;i++){
  const x=-640+rng()*1300,z=-510+rng()*1120;if(Math.max(Math.abs(x),Math.abs(z))<132||Math.hypot(x,z)>740)continue;
  const y=sample(x,z),bank=Math.abs(x-riverX(z));
  if(!Number.isFinite(y)||bank<18||routeDistance(x,z)<6||y<riverY(z)+4||y>200)continue;
  const slope=Math.hypot(sample(x+1,z)-sample(x-1,z),sample(x,z+1)-sample(x,z-1))/2;
  if(slope>1.15||rng()<.25+.2*Math.sin(x*.035+z*.019)||existing.some(t=>Math.hypot(x-t.x,z-t.z)<4.5))continue;
  const kind=choose(forestWeights(y,bank),rng()),cost=triangleCounts[kind];
  if(triangles+cost>OUTER_FOREST.triangleBudget)break;
  const scale=1.0+rng()*1.1,width=scale*(.82+rng()*.36),height=scale*(.80+rng()*.35)*(1-.18*smooth(90,175,y));
  placements.push({x,y,z,kind,width,height,angle:rng()*Math.PI*2,tone:rng()});triangles+=cost;
 }
 return {placements,triangles};
}

export function createOuterForest(r,sample,existing=[]){
 const group=new THREE.Group();group.name='scenery-only-altitude-forest';
 const geometries=Object.fromEntries(Object.keys(definitions).map(key=>[key,r.own(distantTreeGeometry(key))]));
 const counts=Object.fromEntries(Object.entries(geometries).map(([key,g])=>[key,(g.index?.count??g.getAttribute('position').count)/3]));
 const plan=planOuterForest(sample,counts,existing),dummy=new THREE.Object3D(),color=new THREE.Color(),air=new THREE.Color('#b7c7cc');
 const mat=r.own(new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,flatShading:true}));
 const summary={};
 for(const key of Object.keys(definitions)){
  const list=plan.placements.filter(p=>p.kind===key);summary[key]=list.length;
  const mesh=r.own(new THREE.InstancedMesh(geometries[key],mat,list.length));mesh.name=`horizon-tree-${key}`;
  list.forEach((p,i)=>{
   dummy.position.set(p.x,p.y-.08,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.width,p.height,p.width);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   color.set('#ffffff').multiplyScalar(.86+p.tone*.24).lerp(air,smooth(260,800,Math.hypot(p.x,p.z))*.6);mesh.setColorAt(i,color);
  });mesh.computeBoundingSphere();group.add(mesh);
 }
 group.userData.canopySeeds=plan.placements.map(p=>({x:p.x,z:p.z,radius:(p.kind==='oak'?2.65:2.05)*p.width,height:8*p.height}));
 group.userData={...group.userData,trees:plan.placements.length,triangles:plan.triangles,species:summary,placement:'rendered-terrain',triangleBudget:OUTER_FOREST.triangleBudget};return group;
}
