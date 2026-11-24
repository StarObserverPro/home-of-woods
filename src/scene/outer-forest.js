import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {random,riverX,riverY,routeDistance,smooth} from '../world/horizon.js';
import {clusterDistantForest} from './distant-forest-mass.js';
import {createImpostorBatch} from './impostors/runtime.ts';
import {RAINIER_CAMP,RAINIER_TREE_ARCHETYPES,rainierForestWeights,rainierDensityAt,rainierTreeScale} from '../content/rainier-ecology.ts';

export const OUTER_FOREST={seed:105071,triangleBudget:57000,maxTrees:2850,impostorMinExtent:360};
const definitions=RAINIER_TREE_ARCHETYPES;

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
 const trunkHeight=kind==='pine'?5.6:kind==='oak'?2.8:4.3;
 const trunk=new THREE.CylinderGeometry(.15,kind==='fir'?.40:.28,trunkHeight,3,1,true);trunk.translate(0,trunkHeight/2,0);pieces.push(colored(trunk,spec.trunk));
 const leaf=(geometry,scale,position)=>{geometry.scale(...scale).translate(...position);pieces.push(colored(geometry,spec.leaf));};
 if(kind==='oak')leaf(new THREE.IcosahedronGeometry(1,0),[2.65,2.1,2.25],[.2,4.25,0]);
 else if(kind==='poplar')leaf(new THREE.OctahedronGeometry(1,0),[1.35,3.6,1.45],[.15,4.9,0]);
 else if(kind==='pine'){
  leaf(new THREE.OctahedronGeometry(1,0),[2.15,1.65,1.75],[-.5,4.8,.2]);
  leaf(new THREE.OctahedronGeometry(1,0),[1.7,2.15,1.5],[.4,6.3,-.15]);
 }else if(kind==='spruce'){
  const canopy=crownProfile([[1.3,1.85],[3.8,1.35],[7.9,0]],5),p=canopy.getAttribute('position');
  for(let i=0;i<p.count;i++)if(p.getY(i)>6)p.setX(i,p.getX(i)+.28);
  pieces.push(colored(canopy,spec.leaf));
 }else pieces.push(colored(crownProfile([[1.35,2.15],[4.25,1.25],[8.1,0]],4),spec.leaf));
 const geometry=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.name=`distant-${kind}`;return geometry;
}

export function forestWeights(y,bankDistance){
 return rainierForestWeights(y,bankDistance);
}
function choose(weights,value){let n=value*Object.values(weights).reduce((a,b)=>a+b);for(const [key,weight] of Object.entries(weights)){n-=weight;if(n<=0)return key;}return 'fir';}

export function planOuterForest(sample,triangleCounts,existing=[]){
 const rng=random(OUTER_FOREST.seed),placements=[];let triangles=0;
 for(let i=0;i<30000&&placements.length<OUTER_FOREST.maxTrees;i++){
  const x=-640+rng()*1300,z=-510+rng()*1120;if(Math.max(Math.abs(x),Math.abs(z))<132||Math.hypot(x,z)>740)continue;
  const y=sample(x,z),bank=Math.abs(x-riverX(z));
  if(!Number.isFinite(y)||bank<18||routeDistance(x,z)<6||y<riverY(z)+4||y>200)continue;
  const slope=Math.hypot(sample(x+1,z)-sample(x-1,z),sample(x,z+1)-sample(x,z-1))/2;
  if(rng()>rainierDensityAt({x,z,height:y,bankDistance:bank,slope})||existing.some(t=>Math.hypot(x-t.x,z-t.z)<4.5))continue;
  const kind=choose(forestWeights(y,bank),rng()),cost=triangleCounts[kind];
  if(triangles+cost>OUTER_FOREST.triangleBudget)break;
  const {width,height}=rainierTreeScale(kind,x,z,y);
  placements.push({x,y,z,kind,width,height,angle:rng()*Math.PI*2,tone:rng()});triangles+=cost;
 }
 return {placements,triangles};
}

export function createOuterForest(r,sample,existing=[],options={}){
 const group=new THREE.Group();group.name='scenery-only-altitude-forest';
 const geometries=Object.fromEntries(Object.keys(definitions).map(key=>[key,r.own(distantTreeGeometry(key))]));
 const counts=Object.fromEntries(Object.entries(geometries).map(([key,g])=>[key,(g.index?.count??g.getAttribute('position').count)/3]));
 const requested=options.mode??(options.mass===false?'trees':'mass');
 const atlas=options.atlas,atlasLoaded=!!atlas;
 const effective=requested==='impostor'&&!atlasLoaded?'mass':requested;
 const plan=planOuterForest(sample,counts,existing),visual=clusterDistantForest(plan.placements,{enabled:effective!=='trees'});
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 const mat=r.own(new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,flatShading:true}));
 const summary={};
 for(const key of Object.keys(definitions)){
  const list=visual.singles.filter(p=>p.kind===key);summary[key]=plan.placements.filter(p=>p.kind===key).length;
  const mesh=r.own(new THREE.InstancedMesh(geometries[key],mat,list.length));mesh.name=`horizon-tree-${key}`;
  list.forEach((p,i)=>{
   dummy.position.set(p.x,p.y-.08,p.z);dummy.rotation.set(0,p.angle,0);dummy.scale.set(p.width,p.height,p.width);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   color.set('#ffffff').multiplyScalar(.86+p.tone*.24);mesh.setColorAt(i,color);
  });mesh.computeBoundingSphere();group.add(mesh);
 }
 let cardCount=0,geometryMassCount=visual.masses.length,cardTextureBytes=0,cardSourceTriangles=0;
 if(visual.masses.length){
  const shape=r.own(new THREE.IcosahedronGeometry(1,0));
  const indexedMasses=visual.masses.map((mass,index)=>({mass,index}));
  const cards=effective==='impostor'?indexedMasses.filter(({mass:p})=>p.conifer&&Math.max(Math.abs(p.x),Math.abs(p.z))>=OUTER_FOREST.impostorMinExtent):[];
  const cardSet=new Set(cards.map(({index})=>index)),geometryMasses=indexedMasses.filter(({index})=>!cardSet.has(index));
  geometryMassCount=geometryMasses.length;
  if(cards.length){
   const sourceBox=new THREE.Box3(new THREE.Vector3().fromArray(atlas.manifest.bounds.min),new THREE.Vector3().fromArray(atlas.manifest.bounds.max));
   const sourceSize=sourceBox.getSize(new THREE.Vector3()),sourceCenter=new THREE.Vector3().fromArray(atlas.manifest.center);
   if(sourceSize.x<=0||sourceSize.y<=0||sourceSize.z<=0)throw new Error('Impostor source bounds must have positive dimensions');
   const vertices=shape.getAttribute('position'),point=new THREE.Vector3(),box=new THREE.Box3(),size=new THREE.Vector3(),center=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
   const placements=cards.map(({mass:p,index})=>{
    // Fit the actual former proxy's bounds, including its authored yaw. Quarter
    // turns vary the baked cluster without changing the resulting world AABB.
    dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,(index*2.3999632297)%(Math.PI*2),0);dummy.scale.set(p.rx,p.ry,p.rz);dummy.updateMatrix();
    box.makeEmpty();for(let i=0;i<vertices.count;i++)box.expandByPoint(point.fromBufferAttribute(vertices,i).applyMatrix4(dummy.matrix));
    box.getSize(size);box.getCenter(center);
    const quarter=index%4,yaw=quarter*Math.PI/2,odd=quarter%2===1;
    const scale=new THREE.Vector3((odd?size.z:size.x)/sourceSize.x,size.y/sourceSize.y,(odd?size.x:size.z)/sourceSize.z);
    const origin=sourceCenter.clone().multiply(scale).applyAxisAngle(up,yaw).negate().add(center);
    return {position:origin.toArray(),scale:scale.toArray(),yaw,tone:.83+p.tone*.17};
   });
   const batch=r.own(createImpostorBatch(atlas,placements));
   batch.material.userData.forestImpostor=true;
   group.add(batch.mesh);
   const stats=batch.stats();cardCount=stats.instances;cardTextureBytes=stats.textureBytes;cardSourceTriangles=stats.sourceTrianglesPerInstance;
  }
  if(geometryMasses.length){
  const material=r.own(new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,flatShading:true}));
  const mesh=r.own(new THREE.InstancedMesh(shape,material,geometryMasses.length));
  mesh.name='horizon-visual-canopy-masses';
  const leaves=new THREE.Color();
  geometryMasses.forEach(({mass:p,index},i)=>{
   dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,(index*2.3999632297)%(Math.PI*2),0);
   dummy.scale.set(p.rx,p.ry,p.rz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
   leaves.set(p.conifer?'#4d7353':'#7d9456').multiplyScalar(.83+p.tone*.17);
   mesh.setColorAt(i,leaves);
  });
  mesh.computeBoundingSphere();group.add(mesh);
  }
 }
 const geometryTriangles=visual.singles.reduce((sum,t)=>sum+counts[t.kind],0)+geometryMassCount*20;
 const triangles=geometryTriangles+cardCount*2;
 // Occlusion retains the original visual seed; nothing in this layer gains an entity ID.
 group.userData.canopySeeds=plan.placements.map(p=>({x:p.x,z:p.z,radius:(p.kind==='oak'?2.65:2.05)*p.width,height:8*p.height}));
 group.userData={...group.userData,trees:plan.placements.length,renderedSingles:visual.singles.length,
  visualMasses:visual.masses.length,mergedTreeAnchors:visual.mergedTrees,triangles,sourceTriangles:plan.triangles,
  geometryMasses:geometryMassCount,geometryTriangles,requestedMode:requested,effectiveMode:effective,
  impostor:{requested:requested==='impostor',atlasLoaded,atlas:atlas?.manifest.id??null,
    status:requested!=='impostor'?'disabled':!atlasLoaded?'fallback':'ready',cards:cardCount,triangles:cardCount*2,
    geometryMasses:geometryMassCount,textureBytes:cardTextureBytes,sourceTrianglesPerCard:cardSourceTriangles,
    replacedProxyTriangles:cardCount*20,minExtent:OUTER_FOREST.impostorMinExtent},
  species:summary,biome:RAINIER_CAMP.id,speciesNames:Object.fromEntries(Object.entries(definitions).map(([key,s])=>[key,s.name])),
  placement:'rendered-terrain',representation:'scenery-only',triangleBudget:OUTER_FOREST.triangleBudget};
 return group;
}
