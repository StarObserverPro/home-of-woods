import test from 'node:test';
import assert from 'node:assert/strict';
import {createStarterState} from '../src/domain/state.ts';
import {createLocalClock,calendarAt} from '../src/domain/local-clock.ts';
import {advanceToEveningStop,dayCycleSnapshot} from '../src/domain/day-cycle.ts';
import {createSaveContext} from '../src/domain/save-context.ts';
import {serializeWorldSave,prepareWorldSave} from '../src/domain/world-save.ts';
import {createLoop} from '../src/app/runtime-loop.ts';

test('an ordinary new game starts at 14:00 with a running 1x clock',()=>{
  const state=createStarterState();
  assert.deepEqual(createLocalClock(),{speed:1});
  assert.equal(calendarAt(state.time).hour,14);
  assert.equal(dayCycleSnapshot(state).eveningStopped,false);
  assert.equal(advanceToEveningStop(state,5),false);
  assert.equal(state.time,5);
  assert.equal(state.clock.speed,1);
});

test('a stopped midday save preserves 0x and resumes when the player explicitly selects 1x',async()=>{
  const state=createStarterState(),context=createSaveContext();
  state.time=17.125;
  state.clock={speed:0};
  const raw=await serializeWorldSave(state,context,{sequence:1,savedAt:1});
  const loaded=await prepareWorldSave(raw,context);
  assert.equal(loaded.decision,'restored');
  if(loaded.decision!=='restored')throw new Error(loaded.diagnostics.join(';'));
  assert.equal(loaded.value.clock.speed,0);
  assert.equal(dayCycleSnapshot(loaded.value).eveningStopped,false,'midday 0x is distinct from the 18:00 stop');
  assert.equal(advanceToEveningStop(loaded.value,30),false);
  assert.equal(loaded.value.time,17.125,'resuming the page does not silently override a saved speed choice');
  loaded.value.clock={speed:1};
  assert.equal(advanceToEveningStop(loaded.value,.25),false);
  assert.equal(loaded.value.time,17.375);
});

test('a restored evening stop can advance on its first fixed step without stopping again at the same dusk',async()=>{
  const state=createStarterState(),context=createSaveContext();
  state.time=199.98;state.clock={speed:12};
  assert.equal(advanceToEveningStop(state,1/30),true);
  assert.equal(state.time,200);
  assert.equal(dayCycleSnapshot(state).eveningStopped,true);
  const raw=await serializeWorldSave(state,context,{sequence:1,savedAt:1});
  const loaded=await prepareWorldSave(raw,context);
  assert.equal(loaded.decision,'restored');
  if(loaded.decision!=='restored')throw new Error(loaded.diagnostics.join(';'));
  loaded.value.clock={speed:1};
  assert.equal(dayCycleSnapshot(loaded.value).eveningStopped,false);
  assert.equal(advanceToEveningStop(loaded.value,1/30),false);
  assert.ok(Math.abs(loaded.value.time-(200+1/30))<1e-10);
  assert.equal(loaded.value.dayCycle.lastEveningStopDay,1);
});

test('frame pause and the hourglass speed are independent, and frame resume never catches up paused time',()=>{
  const state=createStarterState(),pending=new Map<number,(now:number)=>void>();
  let nextId=1;
  const loop=createLoop(dt=>advanceToEveningStop(state,dt),{
    request(callback){const id=nextId++;pending.set(id,callback);return id;},
    cancel(id){pending.delete(id);},
  });
  const frame=(now:number)=>{
    const entry=pending.entries().next().value;
    assert.ok(entry,'the active loop has exactly one scheduled frame');
    const [id,callback]=entry;pending.delete(id);callback(now);
    assert.equal(pending.size,1);
  };
  loop.setPaused(false);frame(0);frame(100);
  assert.equal(state.time,.1);
  loop.setPaused(true);
  assert.equal(pending.size,0);
  assert.equal(state.clock.speed,1);
  loop.setPaused(false);frame(10_000);
  assert.equal(state.time,.1,'the first resumed frame only establishes a new baseline');
  frame(10_100);
  assert.equal(state.time,.2);
  state.clock={speed:0};
  loop.setPaused(true);loop.setPaused(false);frame(20_000);frame(20_100);
  assert.equal(state.time,.2,'the visible continue action cannot replace a separate 0x clock choice');
  assert.equal(loop.stats().running,true);
  state.clock={speed:1};frame(20_200);
  assert.ok(Math.abs(state.time-.3)<1e-10);
  loop.destroy();assert.equal(pending.size,0);
});
