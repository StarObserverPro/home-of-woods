import fs from 'node:fs';
import crypto from 'node:crypto';
import {ART_ICONS} from '../src/ui/art-icons.ts';
const source='sandbox/ui-art-r1';
const manifest=JSON.parse(fs.readFileSync(`${source}/manifest.json`,'utf8').replace(/^\uFEFF/,''));
const records=[];
fs.mkdirSync('public/assets/ui-r1/icons',{recursive:true});
for(const id of Object.keys(ART_ICONS)){
 const entry=manifest.assets.find(a=>a.id===id);if(!entry)throw Error(id);
 for(const size of [64,128]){
  const input=`${source}/${entry.file.replace('-256.png',`-${size}.png`)}`;
  const file=`public/assets/ui-r1/icons/${id}-${size}.png`;
  const bytes=fs.readFileSync(input);fs.writeFileSync(file,bytes);
  records.push({id,size,file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceBatch:entry.batch});
 }
}
// Use only an empty slot skin; readable panel backgrounds remain native CSS.
const slot=manifest.assets.find(a=>a.id==='inventory-slot');
const bytes=fs.readFileSync(`${source}/${slot.file}`);const file='public/assets/ui-r1/inventory-slot.png';fs.writeFileSync(file,bytes);
records.push({id:'inventory-slot',file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
fs.writeFileSync('public/assets/ui-r1/manifest.json',JSON.stringify({batch:'HOW-UI-ART-R1',source:'Built-in imagegen; original prompts and generated sheets retained in sandbox/ui-art-r1.',rights:'AI-generated artwork. Not CC0. No third-party image inputs.',files:records},null,2)+'\n');
console.log(`Adopted ${records.length} UI PNGs, ${Math.round(records.reduce((s,r)=>s+r.bytes,0)/1024)} KiB`);
