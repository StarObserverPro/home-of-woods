import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {RUNTIME_MODELS} from '../src/content/assets.ts';
import {Models} from '../src/scene/models.ts';
import {Resources} from '../src/scene/resources.ts';

/** Actual mesh, skin and clip bytes; image decoding is exercised in the real browser. */
export async function parseGeometryFile(file:string):Promise<GLTF>{
  const bytes=await readFile(new URL('../'+file,import.meta.url)),n=bytes.readUInt32LE(12);
  const json=JSON.parse(bytes.subarray(20,20+n).toString());
  delete json.images;delete json.textures;delete json.materials;
  for(const mesh of json.meshes??[])for(const p of mesh.primitives)delete p.material;
  let text=Buffer.from(JSON.stringify(json));text=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,32)]);
  const bin=bytes.subarray(20+n),header=Buffer.from(bytes.subarray(0,20));header.writeUInt32LE(20+text.length+bin.length,8);header.writeUInt32LE(text.length,12);
  const result=Buffer.concat([header,text,bin]);
  return new GLTFLoader().parseAsync(result.buffer.slice(result.byteOffset,result.byteOffset+result.byteLength) as ArrayBuffer,'');
}
export async function characterModels(){
  const resources=new Resources(),models=new Models(resources);
  for(const spec of RUNTIME_MODELS){
    const gltf=await parseGeometryFile('public'+spec.url);
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){resources.own(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])resources.own(m);}});
    models.templates.set(spec.name,gltf.scene);models.animations.set(spec.name,gltf.animations);
  }
  return {resources,models};
}
