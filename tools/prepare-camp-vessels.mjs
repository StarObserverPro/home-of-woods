import {readFile, writeFile, mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mergeGeometries, mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

globalThis.FileReader ??= class {
  async readAsArrayBuffer(blob) {
    this.result = await blob.arrayBuffer();
    this.onloadend();
  }
};

const root = new URL('../',import.meta.url);
const models = [
  {file:'sources/codels/potion-v1.glb', name:'amber-bottle', x:-.59, height:.27, turn:.16,
    paint:{glass:'#a56b35',cork:'#a5885b',twine:'#bca57e'}},
  {file:'sources/quaternius/pickup-jar/pickup-jar.glb', name:'terracotta-jar', x:-.15, height:.26, turn:-.45,
    paint:{Atlas:'#9b5940'}},
  {file:'sources/codels/tea-pot-v1.glb', name:'sage-teapot', x:.54, height:.20, turn:.27,
    paint:{glaze:'#718676',foot:'#97826b',accent:'#bea680'}},
];

// The shelf uses a shared matte palette. Drop the source atlas before loading
// the jar geometry so there is no external texture decode or image dependency.
function withoutTexture(bytes) {
  const jsonEnd = 20 + bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20,jsonEnd));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials) {
    delete material.pbrMetallicRoughness?.baseColorTexture;
  }
  let encoded = JSON.stringify(json);
  encoded += ' '.repeat((4-Buffer.byteLength(encoded)%4)%4);
  const header=Buffer.from(bytes.subarray(0,20));
  const binary=bytes.subarray(jsonEnd);
  header.writeUInt32LE(20+Buffer.byteLength(encoded)+binary.length,8);
  header.writeUInt32LE(Buffer.byteLength(encoded),12);
  return Buffer.concat([header,Buffer.from(encoded),binary]);
}

const loader=new GLTFLoader(),group=new THREE.Group();
group.name='camp-drying-shelf-vessels';
let previousRight=-1.01;
for(const spec of models){
  const bytes=withoutTexture(await readFile(new URL(spec.file,root)));
  const {scene}=await loader.parseAsync(new Uint8Array(bytes).buffer,'');
  scene.updateMatrixWorld(true);
  const parts=new Map();
  scene.traverse(mesh=>{
    if(!mesh.isMesh || mesh.name.startsWith('dot'))return;
    const color=spec.paint[mesh.material.name];
    if(!color)return;
    const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
    for(const key of Object.keys(geometry.attributes))
      if(key!=='position'&&key!=='normal')geometry.deleteAttribute(key);
    geometry.applyMatrix4(mesh.matrixWorld);
    if(!geometry.hasAttribute('normal'))geometry.computeVertexNormals();
    if(!parts.has(color))parts.set(color,[]);
    parts.get(color).push(geometry);
  });
  const vessel=new THREE.Group();
  vessel.name=spec.name;
  for(const [color,pieces] of parts){
    const geometry=mergeGeometries(pieces);
    assert.ok(geometry);
    vessel.add(new THREE.Mesh(mergeVertices(geometry),new THREE.MeshStandardMaterial({color,roughness:.73,metalness:0})));
    geometry.dispose();
    pieces.forEach(piece=>piece.dispose());
  }
  const bounds=new THREE.Box3().setFromObject(vessel);
  assert.ok(!bounds.isEmpty());
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=spec.height/size.y;
  for(const child of vessel.children){
    child.geometry.translate(-center.x,-bounds.min.y,-center.z).scale(scale,scale,scale);
  }
  vessel.rotation.y=spec.turn;vessel.position.x=spec.x;
  const normalized=new THREE.Box3().setFromObject(vessel,true);
  assert.ok(Math.abs(normalized.min.y)<.0001);
  assert.ok(normalized.min.x>previousRight+.035&&normalized.max.x<1.01&&normalized.max.z-normalized.min.z<.45,
    `${spec.name} exceeds shelf footprint: ${normalized.min.toArray()} / ${normalized.max.toArray()}`);
  previousRight=normalized.max.x;
  group.add(vessel);
}

let triangles=0;
group.traverse(mesh=>{if(mesh.isMesh)triangles+=mesh.geometry.index.count/3;});
assert.ok(triangles<2500);
const output=new URL('public/assets/camp/drying-vessels.glb',root);
await mkdir(new URL('.',output),{recursive:true});
const binary=await new GLTFExporter().parseAsync(group,{binary:true});
await writeFile(output,Buffer.from(binary));
console.log(`Exported three vessels, ${triangles} triangles, ${binary.byteLength} bytes`);
