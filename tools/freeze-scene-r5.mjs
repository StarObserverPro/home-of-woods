import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),folder=resolve(root,'evidence/scene-r5'),sha=b=>createHash('sha256').update(b).digest('hex');
const paths=[];
async function collect(dir){for(const e of await readdir(resolve(root,dir),{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await collect(p);else paths.push(p.replaceAll('\\','/'));}}
await collect('src');await collect('tests');await collect('dist/assets');
paths.push('package.json','package-lock.json','vite.config.ts','index.html','dist/index.html','tools/scene-evidence-plugin.ts','tools/freeze-scene-r5.mjs','tools/audit-scene-r5-evidence.mjs','tools/audit-character-evidence.mjs','README.md','PARAMETERS.md','VERIFICATION.md','docs/RENDERING.md','docs/GAME_DESIGN.md','docs/MILESTONES.md','docs/ART_HUD.md','docs/ASSET_REGISTER.md','docs/ASSET_PIPELINE.md','docs/scopes/scene-r5-integration.md','evidence/scene-r5/README.md');
const files=await Promise.all(paths.sort().map(async file=>({file,sha256:sha(await readFile(resolve(root,file)))})));
const evidenceFiles=[];for(const file of await readdir(resolve(folder,'captures')))evidenceFiles.push({file:'captures/'+file,sha256:sha(await readFile(resolve(folder,'captures',file)))});
for(const file of ['intake.json','before-trees.json','before-save.json','check.log','production-smoke.json'])evidenceFiles.push({file,sha256:sha(await readFile(resolve(folder,file)))});
const intake=JSON.parse(await readFile(resolve(folder,'intake.json'),'utf8'));
const changes=intake.files.map(before=>({file:before.path,beforeSha256:before.sha256,afterSha256:files.find(f=>f.file===before.path)?.sha256})).filter(c=>c.afterSha256&&c.afterSha256!==c.beforeSha256);
await writeFile(resolve(folder,'capture-bridge.json'),JSON.stringify({date:'2026-10-30',scope:'authorized local scene integration; not merged or deployed',changes},null,2));
await writeFile(resolve(folder,'source-freeze.json'),JSON.stringify({version:'HOW-SCENE-R5D-1',date:'2026-10-30',runtimeFingerprint:sha(JSON.stringify(files)),files,evidenceFiles},null,2));
console.log(`Froze ${files.length} current source/test/build/doc files and ${evidenceFiles.length} evidence records; ${changes.length} adapted owning files.`);
