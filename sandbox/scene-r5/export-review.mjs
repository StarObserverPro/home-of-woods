import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
const root=import.meta.dirname,dist=resolve(root,'dist');
let html=await readFile(resolve(dist,'index.html'),'utf8');
const script=html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)[1],css=html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)[1];
const assets={};
async function add(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())await add(p);else if(/\.(glb|png|jpg)$/.test(e.name))assets['/'+relative(dist,p).replaceAll('\\','/')]=(await readFile(p)).toString('base64');}}
// Embed only models actually requested by the reviewed runtime; the replaced M0 ranger is excluded.
const catalog=await readFile(resolve(root,'src/content/assets.ts'),'utf8');
for(const match of catalog.matchAll(/url: '([^']+)'/g))assets[match[1]]=(await readFile(resolve(dist,'.'+match[1]))).toString('base64');
const boot=`const offlineAssets=${JSON.stringify(assets)};const nativeFetch=window.fetch.bind(window);window.fetch=(input,options)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;const path=decodeURIComponent(new URL(url,location.href).pathname);const key=Object.keys(offlineAssets).find(k=>path.endsWith(k));if(key){const bytes=Uint8Array.from(atob(offlineAssets[key]),c=>c.charCodeAt(0));return Promise.resolve(new Response(bytes,{status:200,headers:{'Content-Type':key.endsWith('.glb')?'model/gltf-binary':'image/png'}}));}return nativeFetch(input,options);};`;
const style=await readFile(resolve(dist,'.'+css),'utf8');
html=html.replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/,'').replace(/<link[^>]+href="[^"]+\.css"[^>]*>/,()=>`<style>${style}</style>`);
const js=(await readFile(resolve(dist,'.'+script),'utf8')).replaceAll('</script','<\\/script');
const licenses={software:await readFile(resolve(root,'public/third-party-notices.txt'),'utf8'),assets:{},register:await readFile(resolve(root,'ASSET_REGISTER.md'),'utf8')};
for(const file of await readdir(resolve(root,'public/assets/licenses')))licenses.assets[file]=await readFile(resolve(root,'public/assets/licenses',file),'utf8');
const notices=JSON.stringify(licenses).replaceAll('<','\\u003c');
html=html.replace('</body>',()=>`<script>${boot}</script><script type="module">${js}</script><script type="application/json" id="third-party-notices">${notices}</script></body>`);
await writeFile(resolve(root,'review.html'),html);
console.log(`Offline review exported: ${Object.keys(assets).length} embedded runtime assets, ${Buffer.byteLength(html)} bytes; no server needed.`);
