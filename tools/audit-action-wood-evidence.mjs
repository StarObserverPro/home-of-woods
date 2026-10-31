import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root='evidence/action-wood/';
const read=name=>JSON.parse(fs.readFileSync(root+name,'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const freeze=read('source-freeze.json');
for(const f of freeze.files)assert.equal(sha(fs.readFileSync(f.file,'utf8').replaceAll('\r\n','\n')),f.sha256,`Action source changed: ${f.file}`);
for(const f of freeze.evidenceFiles)assert.equal(sha(fs.readFileSync(root+f.file)),f.sha256,`Action evidence changed: ${f.file}`);
assert.match(fs.readFileSync(root+'check.log','utf8'),/# pass 88\s+# fail 0/);
const pickup=read('pickup-mobile.json').current,cancelled=read('pickup-cancelled.json').current;
assert.equal(pickup.canvas.width,390);assert.equal(pickup.gathering.action.phase,'performing');assert.equal(pickup.loop.paused,true);
assert.equal(cancelled.gathering.action.phase,'cancelled');assert.equal(cancelled.loop.paused,false);
assert.deepEqual(pickup.worldState.inventory,cancelled.worldState.inventory);
assert.deepEqual(pickup.gatheringSources,cancelled.gatheringSources);
for(const name of ['prayer.json','prayer-mobile.json']){const c=read(name).current;assert.equal(c.worldState.ritual.phase,'performing');assert.equal(c.loop.paused,true);assert.equal(c.shaderErrors,0);}
const fell=read('fell-close.json').current;assert.equal(fell.forestry.active.phase,'falling');assert.equal(fell.forestry.wood,8);assert.equal(fell.forestry.points.used,8);
console.log(JSON.stringify({version:freeze.version,tests:88,desktopActions:5,mobileActions:2,result:'passed',limits:'mobile viewport only; true device and long sessions untested'}));
