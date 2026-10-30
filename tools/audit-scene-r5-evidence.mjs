import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root='evidence/scene-r5/',sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=p=>JSON.parse(fs.readFileSync(root+p,'utf8'));
const frozen=read('source-freeze.json');assert.equal(sha(JSON.stringify(frozen.files)),frozen.runtimeFingerprint);
for(const f of frozen.files)assert.equal(sha(fs.readFileSync(f.file)),f.sha256,`Current scene source drift: ${f.file}`);
for(const f of frozen.evidenceFiles)assert.equal(sha(fs.readFileSync(root+f.file)),f.sha256,`Scene evidence drift: ${f.file}`);
assert.match(fs.readFileSync(root+'check.log','utf8'),/# pass 81\s+# fail 0/);
const captures=fs.readdirSync(root+'captures').filter(f=>f.endsWith('.json')).map(f=>({file:f,stats:read('captures/'+f)}));
const find=(view,hour,mobile)=>captures.find(c=>c.stats.scenePreset===view&&c.stats.appearance.hour===hour&&(c.stats.canvas.width<600)===mobile);
for(const mobile of [false,true])for(const [view,hour] of [['fire',14],['fire',23],['cliffs',14],['ritual',14]]){
  const c=find(view,hour,mobile);assert.ok(c,`Missing ${mobile?'mobile':'desktop'} ${view} ${hour}`);assert.equal(c.stats.shaderErrors,0);
  assert.equal(c.stats.terrain.totalTriangles,19896);assert.equal(c.stats.terrain.facetedPatches,166);
  assert.equal(c.stats.treeCount,580);assert.equal(c.stats.camp.altar.offeringSlots,3);
  if(view==='fire')assert.equal(c.stats.camp.hearth,hour===14?'charcoal':'burning');
}
const cycle=captures.find(c=>c.stats.audits?.length);assert.ok(cycle,'Missing live scene re-entry audit');
const old=cycle.stats.audits.at(-1);assert.equal(old.loop.running,false);assert.equal(old.loop.scheduled,false);assert.equal(old.camp.disposed,true);assert.equal(old.river.disposed,true);assert.deepEqual(old.resources,{geometries:0,materials:0,extras:0,disposed:true});
const bridge=read('capture-bridge.json');assert.equal(bridge.changes.find(c=>c.file==='src/scene/create-scene.ts').afterSha256,sha(fs.readFileSync('src/scene/create-scene.ts')));
const production=read('production-smoke.json');assert.deepEqual(production.consoleErrors,[]);assert.equal(production.shaderErrors,0);assert.equal(production.hearth,'charcoal');assert.ok(production.scripts.every(path=>path.startsWith('/assets/')&&fs.existsSync('dist'+path)));
console.log(JSON.stringify({version:frozen.version,tests:81,captures:captures.length,treeCount:580,facetedPatches:166,triangles:19896,liveReentry:true,result:'passed'}));
