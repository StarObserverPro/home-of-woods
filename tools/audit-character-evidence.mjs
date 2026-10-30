import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {verifiedSourceReader} from './read-verified-source.mjs';
const root='evidence/characters/';
const read=file=>JSON.parse(fs.readFileSync(root+file,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const freeze=read('source-freeze.json');
assert.equal(sha(JSON.stringify(freeze.files)),freeze.runtimeFingerprint);
const source=verifiedSourceReader(root+'verified-source.zip',false);
for(const f of freeze.files)assert.equal(sha(source(f.file)),f.sha256,`frozen character source mismatch: ${f.file}`);
// Inventory compatibility is progressing concurrently. Verify this delivery's live scene entry points,
// while binding its complete flow receipts to the exact tested source archive.
const liveEntries=['src/scene/characters.ts','src/scene/character-grip.ts','src/scene/axe-contact.ts','src/scene/create-scene.ts','src/content/characters.ts','src/content/assets.ts'];
for(const f of freeze.files.filter(f=>liveEntries.includes(f.file)||f.file.startsWith('public/assets/characters/')||f.file.startsWith('public/assets/licenses/KayKit-'))){
  const current=sha(fs.readFileSync(f.file));
  if(f.file==='src/scene/create-scene.ts'&&current!==f.sha256){
    // Scene integration intentionally adapts the composition root. Keep the original
    // receipt immutable and bind its successor to the full current scene evidence.
    const bridge=JSON.parse(fs.readFileSync('evidence/scene-r5/capture-bridge.json','utf8'));
    const change=bridge.changes.find(change=>change.file===f.file);
    assert.equal(change?.beforeSha256,f.sha256);assert.equal(change?.afterSha256,current);
    const next=JSON.parse(fs.readFileSync('evidence/scene-r5/source-freeze.json','utf8'));
    assert.equal(next.files.find(file=>file.file===f.file)?.sha256,current);
    assert.match(fs.readFileSync('evidence/scene-r5/check.log','utf8'),/# pass 81\s+# fail 0/);
  }else assert.equal(current,f.sha256,`integrated character entry changed: ${f.file}`);
}
for(const file of ['horizontal-stop.json','vertical-stop.json']){
  const c=read(file).current;assert.equal(c.characters.stopFound,true);
  assert.ok(Math.abs(c.characters.contactClearance)<1e-6);
  assert.ok(c.characters.grip.leftGripRadialGap<1e-6);
  assert.equal(c.loop.paused,true);assert.equal(c.forestry.wood,0);
}
const paused=read('chop-paused.json').current,cancelled=read('chop-cancelled.json').current,felled=read('forestry-result.json').current;
assert.equal(paused.loop.paused,true);assert.equal(paused.characters.stopFound,true);assert.equal(paused.forestry.wood,0);assert.equal(paused.forestry.points.reserved,5);
assert.deepEqual(cancelled.forestry.points,{year:1,available:24,used:0,reserved:0});assert.equal(cancelled.forestry.wood,0);assert.equal(cancelled.forestry.active,null);
assert.deepEqual(felled.forestry.points,{year:1,available:19,used:5,reserved:0});assert.equal(felled.forestry.wood,5);assert.equal(felled.forestry.selectedTree.status,'stump');
const warehouse=read('warehouse.json').stats.current;
assert.deepEqual(read('warehouse.json').stats,read('mobile-portrait.json').current);
assert.equal(warehouse.warehouse.items.find(i=>i.itemId==='wood').quantity,5);assert.equal(warehouse.loop.paused,true);
for(const [file,width,height] of [['mobile-portrait.json',390,844],['mobile-landscape.json',844,390]]){
  const {layout}=read(file);assert.equal(layout.width,width);assert.equal(layout.height,height);assert.equal(layout.scrollWidth,width);
  for(const b of layout.buttons??[])assert.ok(b.width>=44&&b.height>=44);
}
const cycles=read('lifecycle-cycles.json').cycles;assert.equal(cycles.length,3);
for(const {current,audit} of cycles){
  assert.equal(current.forestry.wood,5);assert.equal(current.forestry.points.used,5);
  assert.deepEqual(current.resources,cycles[0].current.resources);assert.equal(current.gpu.textures,12);
  const old=audit.at(-1);assert.equal(old.characters.disposed,true);assert.equal(old.loop.running,false);assert.equal(old.loop.scheduled,false);assert.equal(old.gatheringHits,0);
  assert.deepEqual(old.resources,{geometries:0,materials:0,extras:0,disposed:true});assert.equal(old.gpu.geometries,0);
}
const production=read('production-smoke.json');assert.equal(production.runtimeFingerprint,freeze.runtimeFingerprint);assert.equal(production.consoleErrors.length,0);assert.equal(production.mediaError,null);
assert.ok(production.scripts.length&&production.scripts.every(s=>s.includes('/assets/')&&!s.includes('@vite/client')));
const media=read('media.json'),video=fs.readFileSync(root+'forestry.webm');assert.equal(sha(video),media.sha256);assert.equal(video.length,media.bytes);assert.equal(video.subarray(0,4).toString('hex'),'1a45dfa3');assert.ok(media.timestampSpanSeconds>18&&media.timestampSpanSeconds<22);assert.equal(media.width,1280);assert.equal(media.height,720);
assert.match(fs.readFileSync(root+'tests.log','utf8'),/# pass 41\s+# fail 0/);
const build=read('verified-build.json'),bundle=verifiedSourceReader(root+'verified-build.zip',false);
assert.equal(build.runtimeFingerprint,freeze.runtimeFingerprint);
for(const f of build.files)assert.equal(sha(bundle(f.file)),f.sha256,`frozen build mismatch: ${f.file}`);
assert.equal(sha(fs.readFileSync(root+'verified-source.zip')),build.sourceArchiveSha256);
assert.equal(sha(fs.readFileSync(root+'verified-build.zip')),build.buildArchiveSha256);
console.log(JSON.stringify({version:freeze.version,runtimeFingerprint:freeze.runtimeFingerprint,cycles:3,tests:41,mediaBytes:video.length,result:'passed',sourceMode:'frozen complete runtime plus live character entries; concurrent inventory changes excluded'}));
