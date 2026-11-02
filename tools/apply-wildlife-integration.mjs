/** One-time transport patch: checks both old and final source hashes, then removes itself. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const lines=s=>s.match(/[^\n]*\n|[^\n]+$/g)??[];
const edits=JSON.parse(fs.readFileSync('tools/wildlife-integration.json','utf8'));
const outputs=[];
for(const edit of edits){
  assert.ok(!edit.path.includes('..')&&!edit.path.startsWith('/'));
  const old=fs.readFileSync(edit.path,'utf8').replaceAll('\r\n','\n');
  assert.equal(hash(old),edit.before,`Unexpected base: ${edit.path}`);
  const next=lines(old);
  for(const hunk of [...edit.hunks].reverse())next.splice(hunk.line,hunk.count,...lines(hunk.text));
  const content=next.join('');assert.equal(hash(content),edit.after,`Unexpected output: ${edit.path}`);
  outputs.push([edit.path,content]);
}
for(const [path,content] of outputs)fs.writeFileSync(path,content);
fs.unlinkSync('tools/wildlife-integration.json');
fs.unlinkSync('tools/apply-wildlife-integration.mjs');
console.log(`Applied ${outputs.length} hash-locked integration edits.`);
