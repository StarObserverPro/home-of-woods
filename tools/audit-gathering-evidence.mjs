import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {verifiedSourceReader} from './read-verified-source.mjs';
const folder='evidence/gathering/';
const read=name=>JSON.parse(fs.readFileSync(folder+name,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const freeze=read('source-freeze.json');
assert.equal(sha(JSON.stringify(freeze.files)),freeze.runtimeFingerprint);
// This directory now holds historical v1 receipts. Current-source ownership moves to the active freeze.
const activeFreeze=JSON.parse(fs.readFileSync('evidence/warehouse-tree-resources/source-freeze.json','utf8'));
assert.equal(sha(JSON.stringify(activeFreeze.files)),activeFreeze.runtimeFingerprint);
const activeSource=verifiedSourceReader('evidence/warehouse-tree-resources/verified-source.zip');
for(const file of activeFreeze.files)assert.equal(sha(activeSource(file.file)),file.sha256,`verified runtime changed: ${file.file}`);
const branch=read('branches-result.json').current,mushroom=read('mushrooms-result.json').current;
const quantity=(snapshot,id)=>snapshot.gathering.inventory.find(i=>i.itemId===id).quantity;
assert.equal(quantity(branch,'branch'),3);assert.equal(branch.gatheringSources['gather.home.branches'].remaining,0);
assert.equal(branch.gathering.action.phase,'completed');assert.equal(branch.gathering.action.progress,1);
assert.equal(quantity(mushroom,'branch'),3);assert.equal(quantity(mushroom,'mushroom'),2);
assert.equal(mushroom.gatheringSources['gather.home.mushrooms'].remaining,0);
assert.equal(mushroom.forestry.wood,0);assert.equal(mushroom.forestry.points.used,0);
const cancelled=read('cancelled.json').current;
assert.equal(cancelled.gathering.action.phase,'cancelled');assert.equal(cancelled.gathering.action.sourceId,'gather.trail.mushrooms');
assert.equal(cancelled.gatheringSources['gather.trail.mushrooms'].remaining,1);assert.equal(quantity(cancelled,'branch'),6);assert.equal(quantity(cancelled,'mushroom'),2);
const cycles=read('lifecycle-cycles.json').cycles;assert.equal(cycles.length,3);
for(const {current,audit} of cycles){
 assert.equal(quantity(current,'branch'),6);assert.equal(quantity(current,'mushroom'),2);
 assert.deepEqual(current.gatheringSources,cancelled.gatheringSources);assert.equal(current.gatheringHits,4);
 assert.deepEqual(current.resources,cycles[0].current.resources);assert.deepEqual(current.gpu,cycles[0].current.gpu);
 const old=audit.at(-1);assert.deepEqual(old.resources,{geometries:0,materials:0,extras:0,disposed:true});assert.equal(old.gatheringHits,0);
 assert.equal(old.loop.running,false);assert.equal(old.loop.scheduled,false);assert.equal(old.destroyed,true);
}
const paused=read('forestry-paused.json').current,felled=read('forestry-result.json').current;
assert.equal(paused.loop.paused,true);assert.equal(paused.forestry.wood,0);assert.equal(paused.forestry.points.reserved,5);
assert.equal(felled.forestry.wood,5);assert.deepEqual(felled.forestry.points,{year:1,available:19,used:5,reserved:0});
assert.equal(felled.forestry.selectedTree.status,'stump');assert.equal(quantity(felled,'branch'),6);assert.equal(quantity(felled,'mushroom'),2);
for(const [name,width,height] of [['mobile-portrait.json',390,844],['mobile-landscape.json',844,390]]){
 const receipt=read(name);assert.equal(receipt.layout.width,width);assert.equal(receipt.layout.height,height);assert.equal(receipt.layout.scrollWidth,width);
 for(const b of receipt.layout.buttons)assert.ok(b.rect.width>=43.99&&b.rect.height>=43.99,`undersized product control: ${b.name}`);
}
const phone=read('mobile-portrait.json');assert.equal(quantity(phone.before.current,'branch'),0);assert.equal(quantity(phone.after.current,'branch'),3);
const landscape=read('mobile-landscape.json').current.current;assert.equal(quantity(landscape,'branch'),3);assert.equal(quantity(landscape,'mushroom'),2);
const input=read('mobile-input.json');assert.ok(Math.hypot(input.after.current.player.x-input.before.current.player.x,input.after.current.player.z-input.before.current.player.z)>.2);assert.notEqual(input.before.current.yaw,input.after.current.yaw);
const production=read('production-smoke.json');assert.equal(production.runtimeFingerprint,freeze.runtimeFingerprint);
assert.equal(quantity(production.after.current,'branch'),3);assert.equal(quantity(production.after.current,'mushroom'),2);
assert.equal(production.after.current.forestry.wood,0);assert.equal(production.localEvidencePostStatus,404);assert.equal(production.devSaveButtons,0);
assert.ok(production.scripts.every(s=>s.includes('/assets/')&&!s.includes('@vite/client')));assert.equal(production.consoleErrors.length,0);
const media=read('media.json'),video=fs.readFileSync(folder+'captures/gathering.webm');
assert.equal(video.subarray(0,4).toString('hex'),'1a45dfa3');assert.ok(video.length>100000);
assert.equal(media.sha256,sha(video));assert.equal(media.bytes,video.length);assert.ok(media.duration>18&&media.duration<22);assert.equal(media.error,null);
console.log(JSON.stringify({version:freeze.version,historicalRuntimeFingerprint:freeze.runtimeFingerprint,cycles:cycles.length,videoBytes:video.length,result:'passed',mode:'read-only historical gathering receipts; active source checked separately'}));
