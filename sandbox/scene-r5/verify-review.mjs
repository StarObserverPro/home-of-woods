import {readFile,writeFile,readdir,access,mkdir} from 'node:fs/promises';
import {resolve,join,relative,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=import.meta.dirname,sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const html=await readFile(resolve(root,'review.html'),'utf8');
const map=JSON.parse(html.match(/const offlineAssets=(\{.*?\});const nativeFetch/s)[1]);
const source=await readFile(resolve(root,'src/content/assets.ts'),'utf8'),urls=[...source.matchAll(/url: '([^']+)'/g)].map(m=>m[1]);
assert.deepEqual(Object.keys(map).sort(),urls.sort());
for(const [url,data] of Object.entries(map)){const embedded=Buffer.from(data,'base64'),original=await readFile(resolve(root,'public','.'+url));assert.equal(embedded.subarray(0,4).toString(),'glTF');assert.equal(sha(embedded),sha(original));}
assert.ok(!/<script[^>]+src=|<link[^>]+href=/i.test(html),'no external module or stylesheet');
const notices=JSON.parse(html.match(/id="third-party-notices">([\s\S]*?)<\/script>/)[1]);
assert.ok(notices.software.includes('Copyright © 2010-2026 three.js authors'));
const js=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
await mkdir(resolve(root,'.cache'),{recursive:true});const moduleFile=resolve(root,'.cache/offline-module.mjs');await writeFile(moduleFile,js);
const checked=spawnSync(process.execPath,['--check',moduleFile],{encoding:'utf8'});assert.equal(checked.status,0,checked.stderr?.split('\n').slice(-5).join('\n'));
for(const doc of ['README.md','ASSET_REGISTER.md','VERIFICATION.md','VERIFICATION-R5B.md','VERIFICATION-R5C.md']){
  const text=await readFile(resolve(root,doc),'utf8');
  for(const m of text.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)){if(/^(https?:|file:)/.test(m[1])||m[1]==='evidence/source-freeze.json')continue;await access(resolve(dirname(resolve(root,doc)),m[1]));}
}
const files=[];
async function collect(path){for(const e of await readdir(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())await collect(p);else files.push(p);}}
await collect(resolve(root,'src'));await collect(resolve(root,'tests'));
for(const file of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','export-review.mjs','verify-review.mjs','README.md','VERIFICATION-R5C.md'])files.push(resolve(root,file));
for(const url of urls)files.push(resolve(root,'public','.'+url));
await collect(resolve(root,'public/assets/licenses'));files.push(resolve(root,'public/third-party-notices.txt'),resolve(root,'ASSET_REGISTER.md'));
const fingerprints=await Promise.all(files.sort().map(async p=>({path:relative(root,p).replaceAll('\\','/'),sha256:sha(await readFile(p))})));
const before=JSON.parse(await readFile(resolve(root,'evidence/r5a-source-freeze.json'),'utf8'));
for(const path of ['src/scene/creek.ts','src/content/world.ts'])assert.equal(fingerprints.find(f=>f.path===path).sha256,before.files.find(f=>f.path===path).sha256,`accepted creek changed: ${path}`);
const r5b=JSON.parse(await readFile(resolve(root,'evidence/r5b-source-freeze.json'),'utf8'));
for(const path of ['src/scene/fire.ts','src/scene/stone-foundation.ts','src/world/prop-foundation.ts','src/world/gorge-profile.ts','src/world/rim-triangles.ts'])assert.equal(fingerprints.find(f=>f.path===path).sha256,r5b.files.find(f=>f.path===path).sha256,`accepted R5b module changed: ${path}`);
const report={date:'2026-10-30',scope:'independent R5 sandbox with pre-integration refinements; project integration recorded separately; not merged or published',acceptedCreekAppearanceAndLayoutUnchanged:true,acceptedFireFoundationAndCrestModulesUnchanged:true,runtimeAssets:urls.length,offlineBytes:Buffer.byteLength(html),offlineSha256:sha(html),offlineAssetBytesMatch:true,offlineModuleSyntaxValid:true,offlineFileProtocolBrowserTest:'not run: browser URL policy blocks file scheme',files:fingerprints};
await writeFile(resolve(root,'evidence/source-freeze.json'),JSON.stringify(report,null,2));
console.log(`Verified ${urls.length} embedded GLBs, module syntax, document links; froze ${fingerprints.length} source/test/asset files.`);
