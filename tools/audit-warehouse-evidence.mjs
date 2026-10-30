import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {verifiedSourceReader} from './read-verified-source.mjs';
const root='evidence/warehouse-tree-resources/';
const read=file=>JSON.parse(fs.readFileSync(root+file,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const freeze=read('source-freeze.json');
assert.equal(sha(JSON.stringify(freeze.files)),freeze.runtimeFingerprint);
const source=verifiedSourceReader(root+'verified-source.zip');
for(const f of freeze.files)assert.equal(sha(source(f.file)),f.sha256,`verified source mismatch: ${f.file}`);
const branch=read('branch-result.json').current,pine=read('pine-circle-result.json').current,oak=read('oak-circle-result.json').current;
const quantity=(s,id)=>s.warehouse.items.find(i=>i.itemId===id).quantity;
assert.equal(quantity(branch,'branch'),3);assert.equal(quantity(pine,'mushroom'),2);assert.equal(quantity(oak,'mushroom'),4);
assert.equal(pine.gathering.action.sourceId,'gather.tree-slot-r3-hero-0.mushrooms');assert.equal(oak.gathering.action.sourceId,'gather.tree-slot-17-11.mushrooms');
assert.equal(pine.gathering.action.phase,'completed');assert.equal(oak.gathering.action.phase,'completed');
assert.equal(pine.gatheringSources[pine.gathering.action.sourceId].remaining,0);assert.equal(oak.gatheringSources[oak.gathering.action.sourceId].remaining,0);
assert.deepEqual(oak.gatheringPresentation,{sources:10,patches:38,batches:4,hits:10});
assert.equal(oak.warehouse.items.find(i=>i.itemId==='mushroom').processing[0].outputs[0],'干蘑菇');
assert.equal(oak.warehouse.items.find(i=>i.itemId==='branch').processing[0].parametersReady,false);
const pause=read('warehouse-pause.json');assert.equal(pause.before.current.loop.paused,true);assert.equal(pause.after.current.loop.paused,true);
assert.equal(pause.before.current.gameTime,pause.after.current.gameTime);assert.deepEqual(pause.before.current.player,pause.after.current.player);
assert.ok(pause.before.current.routeNodes>0);assert.equal(pause.before.current.gathering.action.phase,'approaching');
assert.match(pause.filteredText,/晾制蘑菇/);assert.match(pause.filteredText,/配比与耗时待定/);
for(const [file,width,height] of [['mobile-portrait.json',390,844],['mobile-narrow.json',320,844],['mobile-landscape.json',844,390]]){
 const r=read(file);assert.equal(r.layout.width,width);assert.equal(r.layout.height,height);assert.equal(r.layout.scrollWidth,width);
 assert.ok(r.layout.dialog.width<=width&&r.layout.dialog.height<=height);
 for(const b of r.layout.buttons)assert.ok(b.width>=43.99&&b.height>=43.99,`small warehouse control: ${b.name}`);
}
const cycles=read('lifecycle-cycles.json').cycles;assert.equal(cycles.length,3);
for(const {current,audit} of cycles){
 assert.deepEqual(current.warehouse,cycles[0].current.warehouse);assert.deepEqual(current.gatheringSources,cycles[0].current.gatheringSources);
 assert.deepEqual(current.resources,cycles[0].current.resources);assert.deepEqual(current.gpu,cycles[0].current.gpu);
 const old=audit.at(-1);assert.deepEqual(old.resources,{geometries:0,materials:0,extras:0,disposed:true});assert.equal(old.gatheringHits,0);assert.equal(old.loop.running,false);
}
const forestry=read('forestry-result.json').current;assert.ok(forestry.forestry.wood>0);
assert.equal(quantity(forestry,'wood'),forestry.forestry.wood);assert.equal(quantity(forestry,'branch'),3);assert.equal(quantity(forestry,'mushroom'),4);
assert.equal(forestry.forestry.selectedTree.status,'stump');assert.equal(forestry.forestry.points.reserved,0);
const production=read('production-smoke.json');assert.equal(production.runtimeFingerprint,freeze.runtimeFingerprint);
assert.ok(production.scripts.length>0&&production.scripts.every(s=>s.includes('/assets/')&&!s.includes('@vite/client')));
assert.equal(production.consoleErrors.length,0);assert.match(production.warehouseText,/加工方向/);assert.equal(production.current.loop.paused,true);
console.log(JSON.stringify({version:freeze.version,runtimeFingerprint:freeze.runtimeFingerprint,cycles:3,views:3,sources:10,patches:38,batches:4,result:'passed',sourceMode:process.env.HOW_VERIFICATION_SOURCE_ROOT?'explicit frozen source archive':'bundled frozen source archive',mode:'read-only warehouse/tree-resource evidence'}));
