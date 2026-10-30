import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.posix.join(dir,e.name);if(e.isDirectory())walk(file);else files.push(file);}}
walk('src');walk('public');
files.push('package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html');files.sort();
const records=files.map(file=>{const b=fs.readFileSync(file);return{file,bytes:b.length,sha256:sha(b)};});
const result={version:'HOW-M0-R4-INTEGRATION',createdAt:new Date().toISOString(),runtimeFingerprint:sha(JSON.stringify(records)),files:records};
const capture=JSON.parse(fs.readFileSync('evidence/r4/source-freeze.json','utf8'));
const intake=JSON.parse(fs.readFileSync('evidence/integration/intake.json','utf8'));
const original=new Map(intake.files.map(f=>[f.file,f]));
const changes=[];
for(const before of capture.files){
 const after=records.find(f=>f.file===before.file);
 if(!after)throw new Error(`Captured runtime file removed: ${before.file}`);
 if(before.sha256===after.sha256)continue;
 const bytes=fs.readFileSync(after.file),normalized=sha(Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n')));
 changes.push({file:before.file,beforeSha256:before.sha256,afterSha256:after.sha256,kind:normalized===original.get(before.file)?.normalizedTextSha256?'line-endings':'content-changed'});
}
const bridge={captureRuntimeFingerprint:capture.runtimeFingerprint,integratedRuntimeFingerprint:result.runtimeFingerprint,changes,addedFiles:records.filter(f=>!capture.files.some(c=>c.file===f.file)).map(f=>f.file),
 note:'R4 screenshots/video are immutable historical captures. Current source is separately frozen and tested; source differences are explicit, not relabelled as an identical recording.'};
fs.mkdirSync('evidence/integration',{recursive:true});
fs.writeFileSync('evidence/integration/source-freeze.json',JSON.stringify(result,null,2)+'\n');
fs.writeFileSync('evidence/integration/capture-bridge.json',JSON.stringify(bridge,null,2)+'\n');
console.log(JSON.stringify({runtimeFingerprint:result.runtimeFingerprint,files:records.length,captureDifferences:changes.length}));
