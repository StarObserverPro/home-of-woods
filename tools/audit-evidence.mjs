import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root='evidence/r4/';
const read=name=>JSON.parse(fs.readFileSync(root+name,'utf8'));
const captureFreeze=read('source-freeze.json');
const freeze=JSON.parse(fs.readFileSync('evidence/integration/source-freeze.json','utf8'));
const bridge=JSON.parse(fs.readFileSync('evidence/integration/capture-bridge.json','utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(sha(JSON.stringify(freeze.files)),freeze.runtimeFingerprint);
assert.equal(bridge.captureRuntimeFingerprint,captureFreeze.runtimeFingerprint);
assert.equal(bridge.integratedRuntimeFingerprint,freeze.runtimeFingerprint);
for(const f of freeze.files)assert.equal(sha(fs.readFileSync(f.file)),f.sha256,`frozen runtime changed: ${f.file}`);
for(const before of captureFreeze.files){
 const change=bridge.changes.find(c=>c.file===before.file);
 if(change){assert.equal(change.beforeSha256,before.sha256);assert.equal(sha(fs.readFileSync(before.file)),change.afterSha256);}
 else assert.equal(sha(fs.readFileSync(before.file)),before.sha256,`undocumented capture difference: ${before.file}`);
}
const receipt=read('REVIEW_MANIFEST.json');
for(const f of receipt.files.filter(f=>f.file.startsWith(root)))assert.equal(sha(fs.readFileSync(f.file)),f.sha256,`historical evidence changed: ${f.file}`);
const paused=read('chop-paused.json').current,cancelled=read('chop-cancelled.json').current,felled=read('forestry-result.json').current;
assert.equal(paused.loop.paused,true);assert.equal(paused.forestry.active?.phase,'chopping');
assert.equal(paused.forestry.wood,0);assert.equal(paused.forestry.points.reserved,5);
assert.deepEqual(cancelled.forestry.points,{year:1,available:24,used:0,reserved:0});assert.equal(cancelled.forestry.wood,0);assert.equal(cancelled.forestry.active,null);
assert.equal(felled.forestry.wood,5);assert.deepEqual(felled.forestry.points,{year:1,available:19,used:5,reserved:0});assert.equal(felled.forestry.selectedTree.status,'stump');
const cycles=read('lifecycle-cycles.json').cycles;assert.equal(cycles.length,5);
for(const cycle of cycles){
 const c=cycle.current,old=cycle.audit.at(-1);
 assert.deepEqual(c.resources,{geometries:33,materials:9,extras:169,disposed:false});
 assert.deepEqual(c.gpu,cycles[0].current.gpu);assert.ok(c.gpu.geometries>=48&&c.gpu.geometries<=54);assert.equal(c.gpu.textures,8);assert.ok(c.samples>=90);
 assert.equal(c.forestry.wood,5);assert.deepEqual(c.forestry.points,{year:1,available:19,used:5,reserved:0});
 assert.deepEqual(old.resources,{geometries:0,materials:0,extras:0,disposed:true});
 assert.equal(old.destroyed,true);assert.equal(old.contextLost,true);assert.equal(old.loop.running,false);assert.equal(old.loop.scheduled,false);
 assert.deepEqual(old.gpu,{geometries:0,textures:1});
}
for(const [name,width,height] of [['mobile-input.json',390,844],['mobile-landscape-input.json',844,390]]){
 const f=read(name);assert.equal(f.layout.width,width);assert.equal(f.layout.height,height);assert.equal(f.layout.scrollWidth,width);
 assert.ok(Math.hypot(f.before.current.player.x-f.after.current.player.x,f.before.current.player.z-f.after.current.player.z)>.2);
 assert.equal(f.after.current.routeNodes,0);
 for(const b of f.layout.buttons){assert.ok(b.rect.width>=43.99&&b.rect.height>=43.99,`small product target: ${b.name}`);}
}
const reduced=read('reduced-motion.json');
assert.ok(reduced.after.current.gameTime-reduced.before.current.gameTime>1);
assert.ok(Math.abs(reduced.after.current.environment.visualTime-reduced.before.current.environment.visualTime)<.3);
assert.ok(Math.abs(reduced.after.current.river.visualTime-reduced.before.current.river.visualTime)<.3);
assert.deepEqual(reduced.before.current.player,reduced.after.current.player);
const keyboard=read('keyboard-pause.json');assert.equal(keyboard.paused.current.loop.paused,true);assert.equal(keyboard.resumed.current.loop.paused,false);
const camera=read('input-and-camera.json');assert.notEqual(camera.before.current.yaw,camera.afterDragAndZoom.current.yaw);assert.ok(camera.afterDragAndZoom.current.zoom>camera.before.current.zoom);
assert.equal(camera.afterReset.current.yaw,-.13);assert.equal(camera.afterReset.current.zoom,.76);assert.deepEqual(camera.before.current.player,camera.afterReset.current.player);assert.equal(camera.afterReset.current.routeNodes,0);
const creek=read('creek-arrival.json').current,lookout=read('lookout-arrival.json').current;
assert.equal(creek.routeNodes,0);assert.ok(Math.hypot(creek.player.x-3,creek.player.z-48)<.3);assert.equal(lookout.routeNodes,0);assert.ok(Math.hypot(lookout.player.x+27,lookout.player.z+70)<.3);
const consoleAudit=read('console-audit.json');assert.equal(consoleAudit.errors.length,0);
assert.match(fs.readFileSync(root+'production-pick.txt','utf8'),/永久保护地标/);
const log=name=>{const b=fs.readFileSync(root+name);return b[0]===255&&b[1]===254?b.toString('utf16le'):b.toString('utf8');};
const videos=[['forestry.webm','forestry-decode.log'],['walk-and-camera.webm','walk-decode.log']].map(([name,decode])=>{
 const b=fs.readFileSync(root+name),s=log(decode);
 assert.equal(b.subarray(0,4).toString('hex'),'1a45dfa3');assert.ok(b.length>100000);
 assert.doesNotMatch(s,/Error while|Invalid data|corrupt frame/i);
 const stats=[...s.matchAll(/frame=\s*(\d+)[^\r\n]*time=(\d+):(\d+):([\d.]+)/g)].at(-1);assert.ok(stats,`decoded frame audit missing: ${decode}`);
 const seconds=Number(stats[2])*3600+Number(stats[3])*60+Number(stats[4]);assert.ok(seconds>18&&seconds<22);assert.ok(Number(stats[1])>250);
 return{file:root+name,bytes:b.length,sha256:sha(b),codec:'VP9',width:1528,height:686,decodedFrames:Number(stats[1]),decodedSeconds:seconds,source:'actual canvas capture; normal UI actions; no synthetic animation'};
});
const media=read('media.json');
assert.equal(media.runtimeFingerprint,captureFreeze.runtimeFingerprint);
for(const v of videos){const recorded=media.videos.find(r=>r.file===v.file);assert.ok(recorded);assert.equal(recorded.sha256,v.sha256);assert.equal(recorded.bytes,v.bytes);assert.equal(recorded.decodedFrames,v.decodedFrames);}
const smoke=JSON.parse(fs.readFileSync('evidence/integration/production-smoke.json','utf8'));
assert.equal(smoke.runtimeFingerprint,freeze.runtimeFingerprint);
assert.ok(smoke.assets.scripts.every(s=>s.includes('/assets/')&&!s.includes('@vite/client')));
assert.equal(smoke.start.current.forestry.wood,0);assert.equal(smoke.paused.current.loop.paused,true);
assert.equal(smoke.paused.current.forestry.points.reserved,5);
assert.equal(smoke.after.current.forestry.wood,5);assert.deepEqual(smoke.after.current.forestry.points,{year:1,available:19,used:5,reserved:0});
assert.equal(smoke.after.current.forestry.selectedTree.status,'stump');assert.equal(smoke.consoleErrors.length,0);
assert.equal(smoke.localEvidencePostStatus,404);assert.equal(smoke.devSaveButtons,0);
const currentCycles=JSON.parse(fs.readFileSync('evidence/integration/lifecycle-cycles.json','utf8'));
assert.equal(currentCycles.runtimeFingerprint,freeze.runtimeFingerprint);assert.equal(currentCycles.cycles.length,5);
for(const {current,audit} of currentCycles.cycles){
 assert.deepEqual(current.resources,{geometries:33,materials:9,extras:169,disposed:false});
 assert.deepEqual(current.gpu,currentCycles.cycles[0].current.gpu);assert.equal(current.forestry.wood,5);
 assert.deepEqual(current.forestry.points,{year:1,available:19,used:5,reserved:0});
 const old=audit.at(-1);assert.deepEqual(old.resources,{geometries:0,materials:0,extras:0,disposed:true});
 assert.equal(old.loop.running,false);assert.equal(old.loop.scheduled,false);assert.equal(old.contextLost,true);
}
const currentPhone=JSON.parse(fs.readFileSync('evidence/integration/mobile-input.json','utf8'));
assert.equal(currentPhone.runtimeFingerprint,freeze.runtimeFingerprint);
assert.equal(currentPhone.layout.width,390);assert.equal(currentPhone.layout.height,844);assert.equal(currentPhone.layout.scrollWidth,390);
assert.ok(Math.hypot(currentPhone.after.current.player.x-currentPhone.before.current.player.x,currentPhone.after.current.player.z-currentPhone.before.current.player.z)>.2);
assert.notEqual(currentPhone.before.current.yaw,currentPhone.after.current.yaw);assert.equal(currentPhone.after.current.routeNodes,0);
for(const b of currentPhone.layout.buttons)assert.ok(b.rect.width>=43.99&&b.rect.height>=43.99,`small integrated product target: ${b.name}`);
console.log(JSON.stringify({currentRuntimeFingerprint:freeze.runtimeFingerprint,captureRuntimeFingerprint:captureFreeze.runtimeFingerprint,captureDifferences:bridge.changes.length,captureCycles:5,currentCycles:5,videos:videos.map(v=>({file:v.file,frames:v.decodedFrames,seconds:v.decodedSeconds})),result:'passed',mode:'read-only'}));
