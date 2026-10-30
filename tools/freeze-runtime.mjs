import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.posix.join(dir,e.name);if(e.isDirectory())walk(file);else files.push(file);}}
walk('src');walk('public');
files.push('package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html');files.sort();
const records=files.map(file=>{const b=fs.readFileSync(file);return{file,bytes:b.length,sha256:sha(b)};});
const result={version:'HOW-CHARACTERS-1',createdAt:new Date().toISOString(),runtimeFingerprint:sha(JSON.stringify(records)),files:records};
// Historical integration files and their capture bridge are immutable.
fs.mkdirSync('evidence/characters',{recursive:true});
fs.writeFileSync('evidence/characters/source-freeze.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({runtimeFingerprint:result.runtimeFingerprint,files:records.length,destination:'evidence/characters/source-freeze.json'}));
