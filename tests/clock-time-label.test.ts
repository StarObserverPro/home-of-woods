import test from 'node:test';
import assert from 'node:assert/strict';
import {formatClockTime} from '../src/ui/clock-time.ts';
import {calendarAt} from '../src/domain/local-clock.ts';
import {advanceToEveningStop} from '../src/domain/day-cycle.ts';
import {createStarterState} from '../src/domain/state.ts';

test('the HUD shows real world minutes at every running speed and stays fixed at 0x',()=>{
  for(const speed of [0,1,4,12] as const){
    const state=createStarterState();state.clock={speed};
    assert.equal(formatClockTime(calendarAt(state.time).hour),'14:00');
    advanceToEveningStop(state,5);
    assert.equal(formatClockTime(calendarAt(state.time).hour),({0:'14:00',1:'14:06',4:'14:24',12:'15:12'} as const)[speed]);
  }
});

test('clock labels follow dusk and midnight boundaries without an extra clock or a 24:00 label',()=>{
  const state=createStarterState();state.time=199.9;state.clock={speed:12};
  assert.equal(formatClockTime(calendarAt(state.time).hour),'17:59');
  assert.equal(advanceToEveningStop(state,1/30),true);
  assert.equal(formatClockTime(calendarAt(state.time).hour),'18:00');
  state.time=499.9;
  assert.equal(formatClockTime(calendarAt(state.time).hour),'23:59');
  state.time=500;
  assert.equal(formatClockTime(calendarAt(state.time).hour),'00:00');
  assert.equal(formatClockTime(24),'00:00');
});
