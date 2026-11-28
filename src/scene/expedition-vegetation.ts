import * as THREE from 'three';
import type {ExpeditionTree, ExpeditionTreeKind} from '../content/forest-expedition.ts';
import {makeTree} from './forest-shapes.js';
import {configureForestBark, createBarkSurface} from './bark-surface.ts';
import {Resources} from './resources.ts';
import {V, VegetationBuilder, mergeVegetation, vegetationNoise as noise} from './expedition-vegetation-geometry.ts';
import type {VegetationQuality} from './expedition-vegetation-geometry.ts';
import {compileExpeditionFeature} from './expedition-vegetation-features.ts';
import type {ExpeditionVegetationFeature} from './expedition-vegetation-features.ts';

export type {VegetationQuality, ExpeditionVegetationFeature};
export type ExpeditionVegetationOptions = {heightAt?: (x:number,z:number)=>number};
/** Physical world bounds, independent of the camera-only crown opacity. */
export type ExpeditionCrownVolume = {id:string;center:[number,number,number];halfSize:[number,number,number];radius:number};

type Profile = {source?: number; bark: string; leaf: string; crownStart: number; roots: number};
const PROFILES: Record<ExpeditionTreeKind, Profile> = {
  redwood: {bark:'#91684e',leaf:'#426c50',crownStart:.65,roots:7},
  hemlock: {bark:'#766451',leaf:'#4e7661',crownStart:.48,roots:6},
  spruce: {source:1,bark:'#786651',leaf:'#496e5c',crownStart:.43,roots:6},
  fir: {source:2,bark:'#8a8a78',leaf:'#5e7865',crownStart:.36,roots:5},
  pine: {source:0,bark:'#977755',leaf:'#73864d',crownStart:.59,roots:5},
  cedar: {bark:'#8e7658',leaf:'#627b50',crownStart:.42,roots:7},
  oak: {source:3,bark:'#7e6b50',leaf:'#83944f',crownStart:.43,roots:6},
  maple: {bark:'#827b64',leaf:'#87a25d',crownStart:.44,roots:6},
  beech: {bark:'#a3a596',leaf:'#789459',crownStart:.49,roots:5},
  birch: {source:4,bark:'#dedac6',leaf:'#a1b76e',crownStart:.48,roots:4},
  aspen: {source:5,bark:'#bec9ad',leaf:'#a6bd70',crownStart:.47,roots:4},
  elm: {source:6,bark:'#817560',leaf:'#769354',crownStart:.56,roots:6},
  ash: {bark:'#a2a58d',leaf:'#8eab68',crownStart:.49,roots:5},
  hazel: {bark:'#8d785b',leaf:'#8a9f56',crownStart:.23,roots:3},
  berry: {bark:'#756848',leaf:'#6d8e53',crownStart:.18,roots:3},
  serviceberry: {bark:'#837c71',leaf:'#8ba661',crownStart:.36,roots:3},
};

type TreeTemplate = {
  key: string; trunk: THREE.BufferGeometry; roots: THREE.BufferGeometry | null;
  wood: THREE.BufferGeometry; crown: THREE.BufferGeometry; moss: THREE.BufferGeometry | null;
  bounds: THREE.Box3; quality: VegetationQuality; triangles: number;
  fruitTwigs: THREE.Vector3[];
};
type CrownBatch = {mesh: THREE.InstancedMesh; ids: string[]; opacity: THREE.InstancedBufferAttribute};
type WoodSegment = {a: [number,number,number]; b: [number,number,number]; radius: number};
const TRIANGLES = (g: THREE.BufferGeometry | null) => g ? (g.index?.count ?? g.getAttribute('position').count) / 3 : 0;
const hue = (colour: string, seed: number, spread = .04) => new THREE.Color(colour).offsetHSL((noise(seed)-.5)*.025,0,(noise(seed+31)-.5)*spread);

function addRoots(roots: VegetationBuilder, radius: number, profile: Profile, seed: number) {
  for (let i = 0; i < profile.roots; i++) {
    const angle = (i + noise(seed+i)*.35) / profile.roots * Math.PI*2;
    const direction = V(Math.cos(angle),0,Math.sin(angle));
    const reach = radius*(2.1+noise(seed+i+51)*.8);
    // Ends sink into the terrain instead of finishing above it as detached cylinders.
    roots.branch([
      direction.clone().multiplyScalar(radius*.48).setY(radius*.88),
      direction.clone().multiplyScalar(radius*1.18).setY(radius*.23),
      direction.clone().multiplyScalar(reach).setY(-radius*.28),
    ],[radius*.53,radius*.32,radius*.045],profile.bark);
  }
}

/** Reuse the accepted eight-shape silhouettes and branch graph without the action-tree cut collar. */
function inheritedShape(kind: ExpeditionTreeKind, profile: Profile, variant: number, quality: VegetationQuality,
  radius: number, crownRadius: number, crownStart: number, wood: VegetationBuilder, crown: VegetationBuilder) {
  const source = makeTree(profile.source!, 1043 + variant * 211 + profile.source! * 71, quality === 'far' ? 0 : 1);
  source.updateMatrixWorld(true);
  const crownMeshes: THREE.Mesh[] = [];
  source.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.name === 'crown') crownMeshes.push(object);
  });
  const canopy = new THREE.Box3();
  let maximumRadius = .01;
  for (const mesh of crownMeshes) {
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox(); canopy.union(geometry.boundingBox!);
    const p = geometry.getAttribute('position');
    for (let i=0;i<p.count;i++) maximumRadius=Math.max(maximumRadius,Math.hypot(p.getX(i),p.getZ(i)));
    geometry.dispose();
  }
  const width = crownRadius / maximumRadius;
  const yMap = (y: number) => y < canopy.min.y
    ? y / Math.max(.1,canopy.min.y) * crownStart
    : crownStart + (y-canopy.min.y) / Math.max(.1,canopy.max.y-canopy.min.y) * (10-crownStart);
  const point = (p: [number,number,number]) => V(p[0]*width,yMap(p[1]),p[2]*width);
  const segments = source.userData.woodSegments as WoodSegment[];
  const baseRadius = segments.find(segment=>segment.a[1]<.1)?.radius ?? .4;
  for (const segment of segments) {
    const r = segment.radius / baseRadius * radius;
    wood.branch([point(segment.a),point(segment.b)],[r,r*.56],profile.bark);
  }
  for (const [i,mesh] of crownMeshes.entries()) {
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const p=geometry.getAttribute('position');
    for(let v=0;v<p.count;v++) p.setXYZ(v,p.getX(v)*width,yMap(p.getY(v)),p.getZ(v)*width);
    geometry.computeVertexNormals(); crown.add(geometry,hue(profile.leaf,variant*103+i*17));
  }
  if (quality !== 'far' && kind==='birch') for(let i=0;i<7;i++) {
    const y=(i+.7)/7*canopy.min.y*.98;
    const segment=segments.find(s=>s.a[1]<=y&&s.b[1]>=y&&Math.hypot(s.b[0]-s.a[0],s.b[2]-s.a[2])<.5);
    if(!segment)continue;
    const t=(y-segment.a[1])/(segment.b[1]-segment.a[1]);
    const a=point(segment.a),b=point(segment.b),centre=a.clone().lerp(b,t);
    const markRadius=segment.radius/baseRadius*radius*(1-.44*t)+.003;
    const geometry=new THREE.CylinderGeometry(markRadius,markRadius,.04,4,1,true,.15+i*.61,1.2);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),b.clone().sub(a).normalize()));
    geometry.translate(centre.x,centre.y,centre.z);wood.add(geometry,'#737969',0);
  }
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  source.traverse(object=>{if(object instanceof THREE.Mesh){geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>materials.add(material));}});
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());
}

function authoredConifer(kind: ExpeditionTreeKind, profile: Profile, seed: number, radius: number, crownRadius: number,
  crownStart: number, wood: VegetationBuilder, crown: VegetationBuilder) {
  const hemlock=kind==='hemlock',cedar=kind==='cedar';
  const lean=(noise(seed+2)-.5)*.24;
  const top=hemlock?V(lean+.25,9.8,.05):V(lean,9.95,0);
  wood.branch([V(0,-.035,0),V(0,1,0),V(lean*.2,crownStart,0),V(lean,8.8,0),top],
    [radius*1.26,radius*.96,radius*.71,radius*.23,radius*.035],profile.bark);
  const layers=hemlock?7:cedar?6:6;
  const slots=Array.from({length:layers},(_,i)=>i).sort((a,b)=>noise(seed+a*37)-noise(seed+b*37));
  for(let i=0;i<layers;i++) {
    const t=(i+.38)/(layers+.3),y=crownStart+(9.15-crownStart)*t;
    const angle=(slots[i]+noise(seed+30+i)*.4)/layers*Math.PI*2;
    const extent=crownRadius*(.96-t*.64),dx=Math.cos(angle),dz=Math.sin(angle);
    const down=hemlock?.43:cedar?.36:.08;
    const start=V(lean*.2,y-.12,0),bend=V(dx*extent*.55,y+.02,dz*extent*.55),end=V(dx*extent,y-down,dz*extent);
    wood.branch([start,bend,end],[radius*(.20-t*.10),radius*.085,radius*.022],profile.bark);
    // Broad, asymmetric branch masses, with drooping terminal clumps on hemlock and cedar.
    crown.cluster(V(dx*extent*.55,y+.27,dz*extent*.55),V(extent*.75,.48+(1-t)*.32,extent*.68),hue(profile.leaf,seed+i),seed+i*29);
    if(hemlock||cedar)crown.cluster(end.clone().add(V(0,-.04,0)),V(extent*.29,.43,extent*.27),hue(profile.leaf,seed+i+50),seed+i*19);
  }
  crown.cluster(V(lean,9.25,0),V(crownRadius*.29,.76,crownRadius*.28),hue(profile.leaf,seed+29),seed+113);
  if(hemlock){
    wood.branch([V(lean,9.35,0),V(lean+.36,9.7,.03),V(lean+.5,9.45,.05)],[radius*.06,radius*.032,radius*.012],profile.bark);
    crown.cluster(V(lean+.35,9.6,.04),V(crownRadius*.13,.32,crownRadius*.14),profile.leaf,seed+119);
  }
}

function authoredBroadleaf(kind: ExpeditionTreeKind, profile: Profile, seed: number, radius: number, crownRadius: number,
  crownStart: number, landmark: boolean, wood: VegetationBuilder, crown: VegetationBuilder, moss: VegetationBuilder, hasMoss: boolean, fruitTwigs: THREE.Vector3[]) {
  const ash=kind==='ash',beech=kind==='beech',hazel=kind==='hazel',berry=kind==='berry';
  const shrub=hazel||berry,count=berry?5:shrub?6:ash?7:6;
  const fruitsOnTwigs=shrub||kind==='serviceberry';
  const lean=(noise(seed+2)-.5)*.34;
  if(!shrub)wood.branch([V(0,-.03,0),V(lean*.35,2.5,0),V(lean,crownStart+.45,.1),V(lean*.7,7.6,.08)],
    [radius*1.16,radius*.91,radius*.61,radius*.12],profile.bark);
  const order=Array.from({length:count},(_,i)=>i).sort((a,b)=>noise(seed+a*53)-noise(seed+b*53));
  for(let i=0;i<count;i++){
    const angle=(order[i]+noise(seed+i+31)*.35)/count*Math.PI*2;
    const dx=Math.cos(angle),dz=Math.sin(angle),reach=crownRadius*(.62+noise(seed+i*11)*.22);
    const start=shrub?V(dx*radius*.7,0,dz*radius*.7):V(lean*.7,crownStart-.4+i*.16,.05);
    const mid=V(dx*reach*.52,shrub?3.0+noise(seed+i+67)*1.1:6+noise(seed+i+67)*.4,dz*reach*.52);
    const tip=V(dx*reach,shrub?6.8+noise(seed+i+17)*.6:7.5+noise(seed+i+17)*.85,dz*reach);
    const r=radius*(shrub?.40:ash?.34:.43);
    wood.branch([start,mid,tip],[r,r*.53,r*.14],profile.bark);
    if(!shrub&&wood.quality!=='far'){
      const branchTip=tip.clone().add(V(-dz*crownRadius*.2,.66,dx*crownRadius*.2));
      wood.branch([mid.clone().lerp(tip,.55),branchTip],[r*.27,r*.035],profile.bark);
    }
    if(fruitsOnTwigs){
      const twigRoot=mid.clone().lerp(tip,.66);
      const twigTip=twigRoot.clone().add(V(dx*crownRadius*.25,-(shrub?.38:.48),dz*crownRadius*.25));
      wood.branch([twigRoot,twigTip],[r*.25,r*.065],profile.bark,1,5);
      fruitTwigs.push(twigRoot.clone().lerp(twigTip,.9));
    }
    const blobWidth=crownRadius*(berry?.54:shrub?.47:beech?.50:ash?.40:.48);
    crown.cluster(tip.clone().add(V(0,berry?.38:.25,0)),V(blobWidth,berry?1.30:shrub?1.6:beech?1.35:1.1,blobWidth*.88),
      hue(profile.leaf,seed+i,berry?.13:.06),seed+i*19,berry?0:undefined);
    if(hasMoss&&kind==='maple'&&i<3&&moss.quality!=='far'){
      const midpoint=mid.clone().lerp(tip,.28);
      moss.cluster(midpoint,V(reach*.21,.10,reach*.16),'#899855',seed+i+401,0);
      for(let strand=0;strand<(moss.quality==='near'?4:2);strand++){
        const anchor=mid.clone().lerp(tip,.15+strand*.16);
        moss.pendant(anchor,.7+noise(seed+strand+i*9)*1.2,radius*.23,'#889858',seed+strand+i*9);
      }
    }
  }
  crown.cluster(V(lean,8.4,0),V(crownRadius*(berry?.47:.53),berry?1.24:1.6,crownRadius*(berry?.42:.5)),hue(profile.leaf,seed+54),seed+199);
  if(landmark&&kind==='maple'){
    // Low, elbowed limb: this readable silhouette is intentionally absent from ordinary maples.
    const elbow=V(crownRadius*.63,3.6,-crownRadius*.12),tip=V(crownRadius*.94,4.1,-crownRadius*.17);
    wood.branch([V(0,2.6,0),elbow,tip],[radius*.7,radius*.35,radius*.075],profile.bark);
    crown.cluster(tip.clone().add(V(0,.8,0)),V(crownRadius*.28,.9,crownRadius*.27),profile.leaf,seed+202);
    if(hasMoss&&moss.quality!=='far')for(let i=0;i<6;i++)moss.pendant(elbow.clone().lerp(tip,i/6),1+noise(seed+i)*1.2,radius*.24,'#91a260',seed+i);
  }
  // Fruit belongs to the registered harvest visual, never to an always-ripe decoration template.
}

function normaliseTreeHeight(parts:(THREE.BufferGeometry|null)[]) {
  const crown=parts[1];if(!crown)return 1;
  crown.computeBoundingBox();const scale=10/Math.max(.1,crown.boundingBox!.max.y);
  for(const geometry of parts)if(geometry){geometry.scale(1,scale,1);geometry.computeBoundingBox();geometry.computeBoundingSphere();}
  return scale;
}

function normaliseCrownWidth(crown:THREE.BufferGeometry,trunk:THREE.BufferGeometry,moss:THREE.BufferGeometry|null,radius:number,crownRadius:number,fruitTwigs:THREE.Vector3[]) {
  const crownVertices=crown.getAttribute('position');let maximum=.01;
  for(let i=0;i<crownVertices.count;i++)maximum=Math.max(maximum,Math.hypot(crownVertices.getX(i),crownVertices.getZ(i)));
  const scale=crownRadius/maximum;
  crown.scale(scale,1,scale);
  const lateralScale=(r:number)=>1+(scale-1)*THREE.MathUtils.smoothstep(r,radius*1.5,radius*3.5);
  for(const twig of fruitTwigs){const s=lateralScale(Math.hypot(twig.x,twig.z));twig.x*=s;twig.z*=s;}
  // Keep the prescribed stem thickness; only the lateral branch scaffold follows crown width.
  for(const geometry of [trunk,moss])if(geometry){
    const p=geometry.getAttribute('position');
    for(let i=0;i<p.count;i++){
      const r=Math.hypot(p.getX(i),p.getZ(i));
      const localScale=lateralScale(r);p.setXYZ(i,p.getX(i)*localScale,p.getY(i),p.getZ(i)*localScale);
    }
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  }
  crown.computeBoundingBox();crown.computeBoundingSphere();
}

function compileTree(spec: ExpeditionTree, quality: VegetationQuality, key: string): TreeTemplate {
  const profile=PROFILES[spec.kind],radius=spec.trunkRadius/spec.height*10,crownRadius=spec.crownRadius/spec.height*10;
  const crownStart=(profile.crownStart+(spec.landmark&&['redwood','hemlock','cedar'].includes(spec.kind)?.035:0))*10;
  const seed=1031+Object.keys(PROFILES).indexOf(spec.kind)*237+spec.variant*79;
  const fruitTwigs: THREE.Vector3[]=[];
  const wood=new VegetationBuilder(quality),leaves=new VegetationBuilder(quality),roots=new VegetationBuilder(quality),moss=new VegetationBuilder(quality);
  if(profile.source!==undefined)inheritedShape(spec.kind,profile,spec.variant,quality,radius,crownRadius,crownStart,wood,leaves);
  else if(['redwood','hemlock','cedar'].includes(spec.kind))authoredConifer(spec.kind,profile,seed,radius,crownRadius,crownStart,wood,leaves);
  else authoredBroadleaf(spec.kind,profile,seed,radius,crownRadius,crownStart,spec.landmark,wood,leaves,moss,spec.moss,fruitTwigs);
  addRoots(roots,radius,profile,seed);
  if(spec.landmark&&spec.kind==='birch'){
    for(const side of [-1,1])wood.branch([V(side*radius*.75,0,0),V(side*radius*1.2,4.3,.12),V(side*crownRadius*.22,7.1,0)],
      [radius*.59,radius*.36,radius*.07],profile.bark);
  }
  if(spec.landmark&&spec.kind==='pine')wood.branch([V(radius*.7,0,-radius*.3),V(-radius*.5,4.2,-radius*.4),V(crownRadius*.24,7.6,-crownRadius*.2)],
    [radius*.65,radius*.40,radius*.10],profile.bark);
  if(spec.landmark&&spec.kind==='redwood'){
    const second=V(crownRadius*.43,9.2,-crownRadius*.16);
    wood.branch([V(0,6.4,0),V(crownRadius*.22,8.0,-crownRadius*.09),second],[radius*.40,radius*.22,radius*.04],profile.bark);
    leaves.cluster(second,V(crownRadius*.35,.75,crownRadius*.32),profile.leaf,seed+993);
  }
  if(spec.moss&&quality!=='far'){
    for(let i=0;i<(quality==='near'?5:3);i++){
      const angle=i*2.3+noise(seed),r=radius*(1.0+noise(seed+i)*.5);
      moss.cluster(V(Math.cos(angle)*r,radius*.07,Math.sin(angle)*r),V(radius*.85,radius*.18,radius*.6),'#7c9256',seed+i+700,0);
    }
    if(['redwood','hemlock','cedar'].includes(spec.kind))for(let i=0;i<3;i++){
      const angle=i*2.2, y=crownStart+.45+i*.55;
      const top=V(Math.cos(angle)*crownRadius*.44,y,Math.sin(angle)*crownRadius*.44);
      wood.branch([V(0,y+.10,0),top],[radius*.12,radius*.022],profile.bark);
      moss.pendant(top,.45+noise(seed+i+93)*.8,radius*.19,'#83995b',seed+i);
    }
  }
  const trunk=wood.finish()!,crown=leaves.finish()!,rootGeometry=roots.finish(),mossGeometry=moss.finish();
  const yScale=normaliseTreeHeight([trunk,crown,rootGeometry,mossGeometry]);
  for(const twig of fruitTwigs)twig.y*=yScale;
  normaliseCrownWidth(crown,trunk,mossGeometry,radius,crownRadius,fruitTwigs);
  const mergedWood=mergeVegetation([trunk,rootGeometry])!;
  const bounds=new THREE.Box3();for(const g of [mergedWood,crown,mossGeometry])if(g)bounds.union(g.boundingBox!);
  return {key,trunk,roots:rootGeometry,wood:mergedWood,crown,moss:mossGeometry,bounds,quality,fruitTwigs,
    triangles:TRIANGLES(mergedWood)+TRIANGLES(crown)+TRIANGLES(mossGeometry)};
}

function configureCanopyFade(material:THREE.MeshStandardMaterial) {
  material.alphaHash=true;
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float canopyFade; varying float vCanopyFade;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCanopyFade=canopyFade;');
    shader.fragmentShader='varying float vCanopyFade;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphahash_fragment>','diffuseColor.a *= vCanopyFade;\n#include <alphahash_fragment>');
  };
  material.customProgramCacheKey=()=>`how-expedition-canopy-fade-v1:${material.type}`;
}

/** One resource cache per woodland scene. Passing an owner keeps disposal with that scene. */
export function createExpeditionVegetation(owner?: Resources,options:ExpeditionVegetationOptions={}) {
  const resources=owner??new Resources(),ownsResources=!owner;
  let disposed=false;
  const templates=new Map<string,TreeTemplate>(),featureTemplates=new Map<string,ReturnType<typeof compileExpeditionFeature>>();
  const crownIndices=new Map<THREE.Group,Map<string,{batch:CrownBatch;index:number}>>();
  const allocated=new Set<{dispose():void}>();
  const own=<T extends {dispose():void}>(value:T):T=>{allocated.add(value);return resources.own(value);};
  const bark=createBarkSurface(resources);
  allocated.add(bark.map);allocated.add(bark.normalMap);
  const woodMaterial=own(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0,flatShading:true}));
  woodMaterial.normalScale.set(.17,.17);configureForestBark(woodMaterial,bark);
  const barkCompile=woodMaterial.onBeforeCompile,barkCacheKey=woodMaterial.customProgramCacheKey();
  woodMaterial.onBeforeCompile=(shader,renderer)=>{
    barkCompile.call(woodMaterial,shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      mat4 barkObjectMatrix = modelMatrix;
      #ifdef USE_INSTANCING
        barkObjectMatrix *= instanceMatrix;
      #endif
      float barkWorldScale = length(barkObjectMatrix[1].xyz);
      #ifdef USE_MAP
        vMapUv *= barkWorldScale;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv *= barkWorldScale;
      #endif`);
  };
  woodMaterial.customProgramCacheKey=()=>`${barkCacheKey}:world-scale-v1`;
  const distantWoodMaterial=own(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0,flatShading:true}));
  const crownMaterial=own(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.92,metalness:0,flatShading:true}));
  configureCanopyFade(crownMaterial);
  const mossMaterial=own(new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,flatShading:true}));
  const featureMaterial=own(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:0,flatShading:true}));
  const assertAlive=()=>{if(disposed||resources.disposed)throw new Error('Expedition vegetation factory disposed');};
  const keyOf=(spec:ExpeditionTree,quality:VegetationQuality)=>`${spec.kind}:${spec.variant}:${spec.landmark?1:0}:${spec.moss?1:0}:${(spec.trunkRadius/spec.height).toFixed(5)}:${(spec.crownRadius/spec.height).toFixed(5)}:${quality}`;
  const template=(spec:ExpeditionTree,quality:VegetationQuality)=>{
    assertAlive();const key=keyOf(spec,quality);let result=templates.get(key);
    if(!result){result=compileTree(spec,quality,key);for(const g of [result.trunk,result.roots,result.wood,result.crown,result.moss])if(g)own(g);templates.set(key,result);}
    return result;
  };
  const matrixFor=(spec:ExpeditionTree)=>new THREE.Matrix4().compose(V(spec.x,spec.y,spec.z),new THREE.Quaternion().setFromAxisAngle(V(0,1,0),spec.rotation),V(1,1,1).multiplyScalar(spec.height/10));

  function fruitTwigsFor(spec:ExpeditionTree) {
    const matrix=matrixFor(spec);
    return template(spec,'mid').fruitTwigs.map(point=>point.clone().applyMatrix4(matrix));
  }

  function trunkSurface(spec:ExpeditionTree, approach:THREE.Vector3, height:number) {
    // Raycast the same trunk template and transform used by the rendered instance.
    const probe=new THREE.Mesh(template(spec,'mid').trunk,woodMaterial);
    probe.matrixWorld.copy(matrixFor(spec));
    const axis=V(spec.x,spec.y+height,spec.z);
    const outward=V(approach.x-spec.x,0,approach.z-spec.z).normalize();
    const ray=new THREE.Raycaster(axis.clone().addScaledVector(outward,spec.trunkRadius*5+1),outward.clone().negate());
    return ray.intersectObject(probe)[0]?.point;
  }

  function groundedRoots(base:THREE.BufferGeometry,spec:ExpeditionTree,worldSpace:boolean,onlyBasalVertices=false) {
    const geometry=base.clone(),matrix=matrixFor(spec);geometry.applyMatrix4(matrix);
    const p=geometry.getAttribute('position');
    for(let i=0;i<p.count;i++){
      if(onlyBasalVertices&&p.getY(i)-spec.y>spec.trunkRadius*.55)continue;
      const x=p.getX(i),z=p.getZ(i),distance=Math.hypot(x-spec.x,z-spec.z);
      const weight=THREE.MathUtils.smoothstep(distance,spec.trunkRadius*.7,spec.trunkRadius*1.4);
      p.setY(i,p.getY(i)+(options.heightAt!(x,z)-spec.y)*weight);
    }
    if(worldSpace){
      const uv=geometry.getAttribute('uv'),scale=spec.height/10;
      for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*scale,uv.getY(i)*scale);
    }else geometry.applyMatrix4(matrix.clone().invert());
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return geometry;
  }

  function canopyBatch(base:THREE.BufferGeometry,members:readonly ExpeditionTree[],local=false):CrownBatch {
    // A batch owns its opacity stream and vertex copy; releasing it cannot free a live sibling's VBO.
    const geometry=own(base.clone());
    const opacity=new THREE.InstancedBufferAttribute(new Float32Array(members.length).fill(1),1);
    geometry.setAttribute('canopyFade',opacity);
    const mesh=own(new THREE.InstancedMesh(geometry,crownMaterial,members.length));
    members.forEach((member,index)=>mesh.setMatrixAt(index,local?new THREE.Matrix4():matrixFor(member)));
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
    // A camera reveal is never a physical hole in the canopy. The outdoor-lighting
    // owner selects soft field shading; the fallback depth path stays opaque.
    mesh.name='crown';mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.userData.entityIds=members.map(member=>member.id);mesh.userData.vegetationPart='crown';
    mesh.userData.ownsCanopyGeometry=true;
    return {mesh,ids:members.map(member=>member.id),opacity};
  }

  function annotate(group:THREE.Group,members:readonly ExpeditionTree[],triangles:number,crowns:CrownBatch[]) {
    group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(group);
    group.userData.entityIds=members.map(member=>member.id);
    group.userData.bounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
    group.userData.triangleEstimate=triangles;
    group.userData.crownBatches=crowns;
    const crownIndex=new Map<string,{batch:CrownBatch;index:number}>();
    for(const batch of crowns)for(let index=0;index<batch.ids.length;index++)crownIndex.set(batch.ids[index],{batch,index});
    crownIndices.set(group,crownIndex);
    const crownVolumes:ExpeditionCrownVolume[]=[];
    for(const batch of crowns)for(let i=0;i<batch.ids.length;i++){
      const instance=new THREE.Matrix4();batch.mesh.getMatrixAt(i,instance);
      const world=batch.mesh.matrixWorld.clone().multiply(instance);
      const box=batch.mesh.geometry.boundingBox!.clone().applyMatrix4(world);
      const center=box.getCenter(new THREE.Vector3()),halfSize=box.getSize(new THREE.Vector3()).multiplyScalar(.5);
      crownVolumes.push({id:batch.ids[i],center:center.toArray(),halfSize:halfSize.toArray(),radius:halfSize.length()});
    }
    group.userData.crownVolumes=crownVolumes;
    group.userData.vegetationVersion='expedition-vegetation-1';
    return group;
  }

  function createTree(spec:ExpeditionTree,quality:VegetationQuality='near') {
    const t=template(spec,quality),group=new THREE.Group();group.name=spec.id;
    group.position.set(spec.x,spec.y,spec.z);group.rotation.y=spec.rotation;group.scale.setScalar(spec.height/10);
    const rootGeometry=options.heightAt&&t.roots?own(groundedRoots(t.roots,spec,false)):t.roots;
    const mossGeometry=options.heightAt&&t.moss?own(groundedRoots(t.moss,spec,false,true)):t.moss;
    for(const [name,geometry,material] of [['trunk',t.trunk,quality==='far'?distantWoodMaterial:woodMaterial],['roots',rootGeometry,quality==='far'?distantWoodMaterial:woodMaterial],['moss',mossGeometry,mossMaterial]] as const){
      if(!geometry)continue;const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=quality!=='far';mesh.receiveShadow=true;mesh.userData.vegetationPart=name;
      mesh.userData.ownsVegetationGeometry=(name==='roots'&&rootGeometry!==t.roots)||(name==='moss'&&mossGeometry!==t.moss);group.add(mesh);
    }
    const crowns=canopyBatch(t.crown,[spec],true);group.add(crowns.mesh);
    group.userData.tree=spec;group.userData.templateKey=t.key;
    return annotate(group,[spec],t.triangles,[crowns]);
  }

  function batchTrees(specs:readonly ExpeditionTree[],quality:VegetationQuality='mid') {
    assertAlive();const group=new THREE.Group();group.name=`expedition-trees-${quality}`;
    const batches=new Map<string,ExpeditionTree[]>();
    for(const spec of specs){const key=keyOf(spec,quality);const members=batches.get(key)??[];members.push(spec);batches.set(key,members);}
    let triangles=0;const crowns:CrownBatch[]=[],groundedParts:THREE.BufferGeometry[]=[],groundedMossParts:THREE.BufferGeometry[]=[];
    for(const members of batches.values()){
      const t=template(members[0],quality);triangles+=t.triangles*members.length;
      if(options.heightAt&&t.roots)for(const spec of members)groundedParts.push(groundedRoots(t.roots,spec,true));
      if(options.heightAt&&t.moss)for(const spec of members)groundedMossParts.push(groundedRoots(t.moss,spec,true,true));
      for(const [name,geometry,material] of [[options.heightAt?'trunk':'trunk-roots',options.heightAt?t.trunk:t.wood,quality==='far'?distantWoodMaterial:woodMaterial],['moss',options.heightAt?null:t.moss,mossMaterial]] as const){
        if(!geometry)continue;const mesh=own(new THREE.InstancedMesh(geometry,material,members.length));
        members.forEach((spec,index)=>mesh.setMatrixAt(index,matrixFor(spec)));
        mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();
        mesh.name=name;mesh.castShadow=quality!=='far';mesh.receiveShadow=true;mesh.userData.entityIds=members.map(spec=>spec.id);mesh.userData.vegetationPart=name;group.add(mesh);
      }
      const crown=canopyBatch(t.crown,members);crown.mesh.castShadow=quality!=='far';crowns.push(crown);group.add(crown.mesh);
    }
    if(groundedParts.length){
      const geometry=own(mergeVegetation(groundedParts)!);groundedParts.forEach(part=>part.dispose());
      const mesh=new THREE.Mesh(geometry,quality==='far'?distantWoodMaterial:woodMaterial);mesh.name='roots';
      mesh.castShadow=quality!=='far';mesh.receiveShadow=true;mesh.userData.vegetationPart='roots';mesh.userData.ownsVegetationGeometry=true;group.add(mesh);
    }
    if(groundedMossParts.length){
      const geometry=own(mergeVegetation(groundedMossParts)!);groundedMossParts.forEach(part=>part.dispose());
      const mesh=new THREE.Mesh(geometry,mossMaterial);mesh.name='moss';mesh.castShadow=quality!=='far';mesh.receiveShadow=true;
      mesh.userData.vegetationPart='moss';mesh.userData.ownsVegetationGeometry=true;group.add(mesh);
    }
    return annotate(group,specs,triangles,crowns);
  }

  /** Occlusion is a visual weight, with no effect on entity identity, ground collision or resource state. */
  function setCrownOpacity(group:THREE.Group,id:string,opacity:number) {
    const slot=crownIndices.get(group)?.get(id);if(!slot)return;
    // Compare in the storage precision so a stable decimal weight does not
    // dirty the same Float32 attribute on every frame.
    const value=Math.fround(THREE.MathUtils.clamp(opacity,0,1)),{batch,index}=slot;
    if(batch.opacity.getX(index)!==value){batch.opacity.setX(index,value);batch.opacity.needsUpdate=true;}
  }

  function createFeature(spec:ExpeditionVegetationFeature,quality:VegetationQuality='near') {
    assertAlive();
    const key=[spec.kind,spec.variant??0,spec.length??0,spec.radius??0,spec.height??0,quality].join(':');
    let built=featureTemplates.get(key);
    if(!built){built=compileExpeditionFeature(spec,quality);for(const g of [built.wood,built.green,built.moss])if(g)own(g);featureTemplates.set(key,built);}
    const group=new THREE.Group();group.name=spec.id;group.position.set(spec.x,spec.y,spec.z);group.rotation.y=spec.rotation??0;
    for(const [name,geometry,material]of [['wood',built.wood,quality==='far'?distantWoodMaterial:woodMaterial],['understory',built.green,featureMaterial],['moss',built.moss,mossMaterial]]as const){
      if(!geometry)continue;const mesh=new THREE.Mesh(geometry,material);mesh.name=`${spec.kind}-${name}`;mesh.castShadow=quality!=='far';mesh.receiveShadow=true;group.add(mesh);
    }
    group.userData.feature=spec;group.userData.triangleEstimate=TRIANGLES(built.wood)+TRIANGLES(built.green)+TRIANGLES(built.moss);
    group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(group);group.userData.bounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
    return group;
  }

  function batchFeatures(specs:readonly ExpeditionVegetationFeature[],quality:VegetationQuality='mid') {
    assertAlive();const group=new THREE.Group();group.name=`expedition-understory-${quality}`;
    const batches=new Map<string,ExpeditionVegetationFeature[]>();
    for(const spec of specs){const key=[spec.kind,spec.variant??0,spec.length??0,spec.radius??0,spec.height??0,quality].join(':');const list=batches.get(key)??[];list.push(spec);batches.set(key,list);}
    let triangles=0;
    for(const [key,members]of batches){
      let built=featureTemplates.get(key);
      if(!built){built=compileExpeditionFeature(members[0],quality);for(const geometry of [built.wood,built.green,built.moss])if(geometry)own(geometry);featureTemplates.set(key,built);}
      for(const [name,geometry,material]of [['wood',built.wood,quality==='far'?distantWoodMaterial:woodMaterial],['understory',built.green,featureMaterial],['moss',built.moss,mossMaterial]]as const){
        if(!geometry)continue;
        const mesh=own(new THREE.InstancedMesh(geometry,material,members.length));
        members.forEach((spec,i)=>mesh.setMatrixAt(i,new THREE.Matrix4().compose(V(spec.x,spec.y,spec.z),new THREE.Quaternion().setFromAxisAngle(V(0,1,0),spec.rotation??0),V(1,1,1))));
        mesh.name=`${members[0].kind}-${name}`;mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=quality!=='far';mesh.receiveShadow=true;mesh.userData.entityIds=members.map(spec=>spec.id);
        mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);triangles+=TRIANGLES(geometry)*members.length;
      }
    }
    group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(group);
    group.userData.bounds={min:bounds.min.toArray(),max:bounds.max.toArray()};group.userData.triangleEstimate=triangles;group.userData.entityIds=specs.map(spec=>spec.id);
    return group;
  }

  /** Release only per-batch instances/opacity buffers. Cached shared shapes survive a chunk switch. */
  function releaseGroup(group:THREE.Group) {
    crownIndices.delete(group);
    group.removeFromParent();
    group.traverse(object=>{
      if(object instanceof THREE.Mesh&&object.userData.ownsVegetationGeometry){resources.releaseOwned(object.geometry);allocated.delete(object.geometry);}
      if(!(object instanceof THREE.InstancedMesh))return;
      if(object.userData.ownsCanopyGeometry){resources.releaseOwned(object.geometry);allocated.delete(object.geometry);}
      resources.releaseOwned(object);allocated.delete(object);
    });
    group.clear();delete group.userData.crownBatches;
  }

  function dispose(){
    if(disposed)return;disposed=true;templates.clear();featureTemplates.clear();crownIndices.clear();
    if(ownsResources)resources.dispose();else for(const resource of allocated)resources.releaseOwned(resource);
    allocated.clear();
  }

  function stats(){
    return {treeTemplates:templates.size,featureTemplates:featureTemplates.size,
      geometryCount:[...allocated].filter(resource=>resource instanceof THREE.BufferGeometry).length,
      materialCount:[...allocated].filter(resource=>resource instanceof THREE.Material).length,
      textureCount:[...allocated].filter(resource=>resource instanceof THREE.Texture).length,
      templateTriangles:[...templates.values()].reduce((sum,t)=>sum+t.triangles,0),disposed};
  }
  return {createTree,batchTrees,createFeature,batchFeatures,fruitTwigsFor,trunkSurface,setCrownOpacity,releaseGroup,stats,dispose};
}
