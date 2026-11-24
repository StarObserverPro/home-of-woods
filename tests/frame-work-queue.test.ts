import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameWorkQueue} from '../src/scene/frame-work-queue.ts';

test('work yields at its deadline, records a non-preemptible overrun, and resumes', () => {
  let now = 0, steps = 0;
  const queue = createFrameWorkQueue(() => now);
  queue.enqueue({key:'chunk',priority:1,step:() => { steps++; now += 1.2; return steps === 5; }});
  queue.run({budgetMs:2,maxSteps:10});
  assert.equal(steps,2); assert.equal(queue.stats().pending,1);
  assert.equal(queue.stats().overruns,1); assert.equal(queue.stats().lastMs,2.4);
  queue.run({budgetMs:2,maxSteps:10}); assert.equal(steps,4);
  queue.run({budgetMs:2,maxSteps:10}); assert.equal(queue.stats().pending,0);
  assert.equal(queue.stats().completed,1);
});

test('latest keyed intent replaces stale work and cancellation releases only its prepared objects', () => {
  const queue = createFrameWorkQueue(() => 0), calls:string[]=[];
  queue.enqueue({key:'same',priority:1,step:() => {calls.push('old'); return true;},onCancel:()=>calls.push('cancel-old')});
  queue.enqueue({key:'same',priority:1,step:() => {calls.push('new'); return true;}});
  queue.enqueue({key:'urgent',priority:100,step:() => {calls.push('urgent'); return true;}});
  queue.run({budgetMs:3,maxSteps:10});
  assert.deepEqual(calls,['cancel-old','urgent','new']); assert.equal(queue.stats().replaced,1);
  queue.enqueue({key:'dispose',priority:1,step:()=>{throw Error('stale');},onCancel:()=>calls.push('dispose')});
  queue.dispose(); queue.run({budgetMs:3}); assert.equal(calls.at(-1),'dispose');
  assert.equal(queue.stats().pending,0);
});

test('constant clocks still have a step cap and equal priority continuations share it', () => {
  const queue=createFrameWorkQueue(()=>0), calls:string[]=[];
  for(const key of ['a','b'])queue.enqueue({key,priority:1,step:()=>{calls.push(key); return false;}});
  queue.run({budgetMs:3,maxSteps:3}); assert.deepEqual(calls,['a','b','a']);
  queue.run({budgetMs:0,maxSteps:3}); assert.equal(calls.length,3);
  queue.run({budgetMs:NaN}); assert.equal(calls.length,3);
  queue.clear(); assert.equal(queue.stats().cancelled,2);
});

test('an old running callback cannot complete a replacement enqueued under its own key', () => {
  const queue=createFrameWorkQueue(()=>0),calls:string[]=[];
  queue.enqueue({key:'x',priority:1,step:()=>{queue.enqueue({key:'x',priority:1,step:()=>{calls.push('replacement');return true;}});return true;}});
  queue.run({budgetMs:3,maxSteps:1}); assert.equal(queue.stats().pending,1);
  queue.run({budgetMs:3,maxSteps:1}); assert.deepEqual(calls,['replacement']);
});
