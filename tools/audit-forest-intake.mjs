import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root='evidence/forest-intake/';
const read=f=>JSON.parse(fs.readFileSync(root+f,'utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const freeze=read('source-freeze.json');
for(const f of freeze.files)assert.equal(sha(fs.readFileSync(f.file,'utf8').replaceAll('\r\n','\n')),f.sha256,`Forest integration drift: ${f.file}`);
for(const f of freeze.evidence)assert.equal(sha(fs.readFileSync(root+f.file)),f.sha256,`Forest evidence drift: ${f.file}`);
const current=read('final.json').current;
assert.equal(current.treeCount,580);assert.equal(Object.keys(current.treeShapes).length,8);assert.equal(Object.values(current.treeShapes).reduce((a,b)=>a+b,0),580);
assert.ok(current.understory.ferns>20&&current.understory.triangles<100000);assert.ok(current.understory.batches<=10);assert.equal(current.shaderErrors,0);
const fell=read('fell.json').current,completed=read('completed.json').current;
assert.equal(fell.forestry.active.phase,'falling');assert.equal(fell.forestry.wood,5);assert.equal(completed.forestry.wood,5);
assert.equal(completed.gathering.inventory.find(i=>i.typeId==='wood.branch').quantity,3);
const audit=read('reentry.json').audit;assert.equal(audit.length,2);for(const state of audit){assert.ok(state.destroyed&&state.resources.disposed);assert.deepEqual([state.resources.geometries,state.resources.materials,state.resources.extras],[0,0,0]);}
const mobile=read('mobile.json').current;assert.equal(mobile.canvas.width,390);assert.equal(mobile.shaderErrors,0);
assert.match(fs.readFileSync(root+'check.txt','utf8'),/# pass 90\s+# fail 0/);
console.log(JSON.stringify({version:'HOW-FOREST-INTAKE-1',treeCount:580,species:8,understory:current.understory,tests:90,reentries:2,result:'passed',limits:'viewport emulation, not physical mobile GPU validation'}));
