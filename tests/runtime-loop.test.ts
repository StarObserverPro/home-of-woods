import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeLoop } from '../src/app/runtime-loop.js';

function scheduler() {
  let next = 1;
  const queued = new Map<number, FrameRequestCallback>();
  return {
    queued,
    request(callback: FrameRequestCallback) { const id = next++; queued.set(id, callback); return id; },
    cancel(id: number) { queued.delete(id); },
    frame(time: number) {
      const pending = [...queued.values()]; queued.clear();
      for (const callback of pending) callback(time);
    },
  };
}

test('one scheduling owner survives repeated start/resume and fixed-step updates', () => {
  const clock = scheduler(); const steps: number[] = []; let renders = 0;
  const loop = createRuntimeLoop({ request: clock.request, cancel: clock.cancel, fixedStep: 0.02, maxSteps: 3, step: dt => steps.push(dt), frame: () => { renders++; } });
  loop.start(); loop.start(); loop.resume();
  assert.equal(clock.queued.size, 1);
  assert.equal(loop.isRunning, true);
  clock.frame(0); clock.frame(20); clock.frame(40);
  assert.equal(clock.queued.size, 1);
  assert.deepEqual(steps, [0.02, 0.02]);
  assert.equal(loop.stepCount, 2);
  assert.equal(renders, 3);
  loop.destroy();
});

test('pausing cancels pending work; resuming never catches up background time', () => {
  const clock = scheduler(); let simulation = 0;
  const loop = createRuntimeLoop({ request: clock.request, cancel: clock.cancel, fixedStep: 0.02, step: dt => { simulation += dt; }, frame: () => {} });
  loop.start(); clock.frame(0); clock.frame(20);
  loop.pause(); loop.pause();
  assert.equal(clock.queued.size, 0); assert.equal(loop.isRunning, false);
  clock.frame(10000); assert.equal(simulation, 0.02);
  loop.resume(); clock.frame(10020);
  assert.equal(simulation, 0.02);
  clock.frame(10040); assert.equal(simulation, 0.04);
  loop.destroy();
});

test('a delayed frame has bounded simulation work and destroy is permanent', () => {
  const clock = scheduler(); let calls = 0;
  const loop = createRuntimeLoop({ request: clock.request, cancel: clock.cancel, fixedStep: 0.02, maxSteps: 3, step: () => { calls++; }, frame: () => {} });
  loop.start(); clock.frame(0); clock.frame(5000);
  assert.equal(calls, 3);
  loop.destroy(); loop.destroy(); loop.start(); loop.resume();
  assert.equal(loop.isDestroyed, true); assert.equal(loop.isRunning, false);
  assert.equal(clock.queued.size, 0);
  clock.frame(6000); assert.equal(calls, 3);
});

test('pause or destroy during a step cannot enqueue another frame', () => {
  for (const action of ['pause', 'destroy'] as const) {
    const clock = scheduler(); let calls = 0;
    const loop = createRuntimeLoop({ request: clock.request, cancel: clock.cancel, fixedStep: 0.02, maxSteps: 4, step: () => { calls++; loop[action](); }, frame: () => {} });
    loop.start(); clock.frame(0); clock.frame(100);
    assert.equal(calls, 1); assert.equal(clock.queued.size, 0);
    loop.destroy();
  }
});
