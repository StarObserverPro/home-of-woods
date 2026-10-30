import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const dest=path.join(root,'public/assets/characters');fs.mkdirSync(dest,{recursive:true});
const chars=path.join(root,'sources/kaykit/adventurers');
const anim=path.join(root,'sources/kaykit/animations');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const parse=f=>{const b=fs.readFileSync(f),n=b.readUInt32LE(12);return {g:JSON.parse(b.subarray(20,20+n).toString()),bin:b.subarray(28+n)};};
const sets={General:['Idle_A','PickUp'],MovementBasic:['Walking_A'],CombatMelee:['Melee_2H_Attack_Chop','Melee_2H_Attack_Slice'],Simulation:['Waving']};
let result={asset:{version:'2.0',generator:'Home of Woods isolated animation subset'},scenes:[{nodes:[]}],scene:0,nodes:[],animations:[],accessors:[],bufferViews:[],buffers:[]},chunks=[],bytes=0;
for(const [set,names] of Object.entries(sets)){
  const {g,bin}=parse(path.join(anim,set+'.glb'));
  if(!result.nodes.length){result.nodes=g.nodes.map(n=>{const c={...n};delete c.mesh;delete c.skin;return c;});result.scenes=g.scenes;result.scene=g.scene??0;}
  const mapping=g.nodes.map(n=>result.nodes.findIndex(v=>v.name===n.name));
  const accessorMap=new Map();
  function accessor(old){
    if(accessorMap.has(old))return accessorMap.get(old);
    const a={...g.accessors[old]},bv=g.bufferViews[a.bufferView];
    const padding=(4-bytes%4)%4;if(padding){chunks.push(Buffer.alloc(padding));bytes+=padding;}
    const data=bin.subarray(bv.byteOffset??0,(bv.byteOffset??0)+bv.byteLength);
    a.bufferView=result.bufferViews.length;result.bufferViews.push({...bv,buffer:0,byteOffset:bytes});chunks.push(data);bytes+=data.length;
    const id=result.accessors.length;result.accessors.push(a);accessorMap.set(old,id);return id;
  }
  for(const a of g.animations.filter(a=>names.includes(a.name))){
    result.animations.push({...a,samplers:a.samplers.map(s=>({...s,input:accessor(s.input),output:accessor(s.output)})),channels:a.channels.map(c=>({...c,target:{...c.target,node:mapping[c.target.node]}}))});
  }
}
const pad=(4-bytes%4)%4;if(pad){chunks.push(Buffer.alloc(pad));bytes+=pad;}
result.buffers=[{byteLength:bytes}];
let json=Buffer.from(JSON.stringify(result));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bytes,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(bytes);bh.writeUInt32LE(0x004e4942,4);
fs.writeFileSync(path.join(dest,'motions.glb'),Buffer.concat([header,json,bh,...chunks]));
console.log('Prepared embedded character motions:',result.animations.map(a=>a.name).join(', '));
