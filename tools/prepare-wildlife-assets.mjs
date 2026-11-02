/** Rebuild the two admitted CC0 assets; normal builds never fetch the network. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const root=new URL('../',import.meta.url),source=new URL('sources/gobkit/animal006/',root);
const specs=[
  {name:'Squirrel',id:'squirrel',height:1.12,hash:'3ab524a913649fb08cc1fc264173a21ea04363f6f89d0d128eaaaa1ed714676f'},
  {name:'Hare',id:'hare',height:1.10,hash:'3342949e3b124441d4ac8a7bdffd93835c90752bfe0f3b7785a6cdd8f5b99cfb'},
];
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(source,{recursive:true});await mkdir(new URL('public/assets/wildlife/',root),{recursive:true});
// Geometry inspection only. Texture decoding is unnecessary for bind-pose bounds.
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:128,height:128,close(){}});
globalThis.ProgressEvent=class extends Event{constructor(type,init){super(type);Object.assign(this,init);}};
if(process.argv.includes('--download')){
  const response=await fetch('https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt',{signal:AbortSignal.timeout(30000)});
  assert.ok(response.ok);const license=Buffer.from(await response.arrayBuffer());
  assert.equal(hash(license),'a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499');
  await writeFile(new URL('public/assets/licenses/gobkit-CC0-1.0.txt',root),license);
}
const manifest=JSON.parse(await readFile(new URL('public/assets/manifest.json',root),'utf8'));
const report=[];
for(const spec of specs){
  const url=`https://gobkit.com/freebies/animal006/${spec.name}.glb`,src=new URL(spec.name+'.glb',source);
  if(process.argv.includes('--download')){
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.ok(response.ok,`${url}: ${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(bytes),spec.hash,'Upstream asset changed; review before replacing');await writeFile(src,bytes);
  }
  const bytes=await readFile(src);assert.equal(hash(bytes),spec.hash);
  assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(8),bytes.length);
  const jsonLength=bytes.readUInt32LE(12),doc=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
  const binOffset=20+jsonLength,bin=bytes.subarray(binOffset+8,binOffset+8+bytes.readUInt32LE(binOffset));
  assert.equal(doc.skins.length,1);assert.equal(doc.skins[0].joints.length,16);
  for(const name of ['idle','walk'])assert.ok(doc.animations.some(a=>a.name===name),`Missing ${name}`);
  const parsed=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const mixer=new THREE.AnimationMixer(parsed.scene);mixer.clipAction(THREE.AnimationClip.findByName(parsed.animations,'idle')).play();mixer.update(0);
  parsed.scene.updateMatrixWorld(true);parsed.scene.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});
  const bounds=new THREE.Box3().setFromObject(parsed.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),scale=spec.height/size.y;
  const scene=doc.scenes[doc.scene??0];doc.nodes.push({name:`HOW_${spec.id}_root`,children:scene.nodes,scale:[scale,scale,scale],translation:[-center.x*scale,-bounds.min.y*scale,-center.z*scale]});scene.nodes=[doc.nodes.length-1];
  doc.animations=doc.animations.filter(a=>['idle','walk'].includes(a.name));
  for(const material of doc.materials){material.pbrMetallicRoughness.metallicFactor=0;material.pbrMetallicRoughness.roughnessFactor=.68;material.pbrMetallicRoughness.baseColorFactor=[1,1,1,1];}
  doc.asset.extras={...doc.asset.extras,source:url,license:'CC0-1.0',adaptedFor:'HOW-WILDLIFE-PHASE1',modification:'Grounded shared-root scaling, common roughness and palette factor; idle/walk only.'};
  let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const out=Buffer.alloc(12+8+json.length+8+bin.length);out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(json.length,12);out.writeUInt32LE(0x4e4f534a,16);json.copy(out,20);const b=20+json.length;out.writeUInt32LE(bin.length,b);out.writeUInt32LE(0x004e4942,b+4);bin.copy(out,b+8);
  const file=`public/assets/wildlife/${spec.id}.glb`;await writeFile(new URL(file,root),out);
  const triangles=doc.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+doc.accessors[p.indices].count/3,0),0);
  const asset={assetId:`how-wildlife-${spec.id}`,batchId:'HOW-WILDLIFE-PHASE1',role:'runtime',status:'integrated-on-branch',file,bytes:out.length,sha256:hash(out),source:{author:'Gobkit',pack:'Gobkit animal006 / Animal Pack Vol.4',page:'https://gobkit.com/freebies',catalog:'https://gobkit.com/api/free',url,files:[{file:`sources/gobkit/animal006/${spec.name}.glb`,sha256:spec.hash}]},license:{id:'CC0-1.0',evidence:'public/assets/licenses/gobkit-CC0-1.0.txt',notice:'sources/gobkit/animal006/README.md'},adaptation:'Common .68 roughness, nonmetallic materials, centered grounded scale; keep idle and walk; no attack/death gameplay.',integration:{loader:'src/scene/models.ts',render:'src/scene/wildlife-presentation.ts',rules:'src/domain/wildlife.ts',disposal:'src/scene/resources.ts'},metrics:{triangles,joints:16,height:spec.height,clips:['idle','walk']},limitations:'Common decorative wildlife only; visual and performance acceptance tracked separately.'};
  manifest.assets=manifest.assets.filter(a=>a.assetId!==asset.assetId);manifest.assets.push(asset);
  report.push({name:spec.name,sourceSha256:spec.hash,outputSha256:asset.sha256,sourceBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},height:spec.height,scale,triangles,joints:16,bytes:out.length,clips:['idle','walk']});
  mixer.stopAllAction();mixer.uncacheRoot(parsed.scene);parsed.scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}if(o.isSkinnedMesh)o.skeleton.dispose();}});
}
await writeFile(new URL('public/assets/manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
await mkdir(new URL('evidence/wildlife-phase1/',root),{recursive:true});await writeFile(new URL('evidence/wildlife-phase1/asset-normalization.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
