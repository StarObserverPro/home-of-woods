import fs from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent??=class ProgressEvent{constructor(type,init){this.type=type;Object.assign(this,init);}};
// CPU-only geometry/bone verification; browser separately verifies the original embedded texture.
export async function loadModel(name){
  const b=await fs.readFile(new URL(`../public/assets/${name}.glb`,import.meta.url)),n=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+n));
  g.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+n).toString('base64');
  for(const m of g.materials??[]){if(m.pbrMetallicRoughness)delete m.pbrMetallicRoughness.baseColorTexture;delete m.normalTexture;delete m.emissiveTexture;delete m.occlusionTexture;}
  delete g.images;delete g.textures;return new GLTFLoader().parseAsync(JSON.stringify(g),'');
}
