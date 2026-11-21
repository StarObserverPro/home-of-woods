import test from 'node:test';
import assert from 'node:assert/strict';
import { createNpcMemory, rememberNpcEvent, recordNpcDialogue, recordNpcPromise, resolveNpcPromise, recallNpcMemories,
  consolidateNpcMemory, memoryConsolidationRequest, applyMemoryConsolidation, validateNpcMemory } from '../src/domain/npc-memory.ts';
import type { NpcMemoryEvent } from '../src/domain/npc-memory.ts';

const event: NpcMemoryEvent = { id: 'visit-1:promise', kind: 'promise', topic: 'bring-beans', gist: '和主人约好捎些东西。', day: 1, importance: 2,
  details: [{ id: 'item', text: '捎一袋豆子。', alternatives: [{ id: 'quantity-confusion', text: '好像是两袋豆子。' }] },
    { id: 'date', text: '答应第三天上午回来。' }] };
function promisedMemory() {
  let memory = rememberNpcEvent(createNpcMemory('ridge-neighbour'), event);
  return recordNpcPromise(memory, { id: 'promise-1', memoryId: event.id, madeDay: 1, dueDay: 3, description: '第三天上午捎一袋豆子。' });
}

test('important semantic events are idempotent; navigation is not a memory kind', () => {
  const memory = rememberNpcEvent(createNpcMemory('ridge-neighbour'), event);
  assert.equal(rememberNpcEvent(memory, event), memory);
  assert.throws(() => rememberNpcEvent(memory, { ...event, id: 'path-1', kind: 'walking' as any }));
  assert.equal(memory.memories.length, 1);
  assert.deepEqual(validateNpcMemory(JSON.parse(JSON.stringify(memory))), memory);
});

test('memory becomes vague and is forgotten while the actual promise remains open', () => {
  const original = promisedMemory();
  const faded = consolidateNpcMemory(original, 7, 42);
  assert.equal(faded.memories[0].clarity, 'faded');
  assert.equal(faded.memories[0].details.length, 1);
  assert.ok(!JSON.stringify(recallNpcMemories(faded)).includes('第三天上午'));
  const fragment = consolidateNpcMemory(faded, 20, 42);
  assert.equal(fragment.memories[0].clarity, 'fragment');
  assert.deepEqual(fragment.memories[0].details, []);
  assert.ok(!JSON.stringify(recallNpcMemories(fragment)).includes('豆子'));
  const forgotten = consolidateNpcMemory(fragment, 45, 42);
  assert.deepEqual(recallNpcMemories(forgotten), []);
  assert.deepEqual(forgotten.promises, original.promises);
  assert.equal(forgotten.promises[0].status, 'open');
  assert.equal(original.memories[0].clarity, 'clear', 'consolidation does not mutate its input');
});

test('bounded mistake replaces remembered detail without changing or leaking the promise ledger', () => {
  const memory = promisedMemory();
  const result = applyMemoryConsolidation(memory, { schemaVersion: 1, npcId: memory.npcId, sourceRevision: memory.revision, atDay: 7,
    changes: [{ memoryId: event.id, clarity: 'faded', keepDetailIds: ['item'], mistakenDetail: { detailId: 'item', alternativeId: 'quantity-confusion' } }] });
  assert.equal(result.memories[0].details[0].text, '好像是两袋豆子。');
  assert.equal(result.memories[0].details[0].uncertain, true);
  assert.ok(!JSON.stringify(recallNpcMemories(result)).includes('一袋'));
  assert.ok(!JSON.stringify(memoryConsolidationRequest(result, 10)).includes('第三天上午'));
  assert.equal(result.promises[0].description, '第三天上午捎一袋豆子。');
});

test('invalid or stale model proposals cannot partly mutate memories or invent facts', () => {
  const memory = promisedMemory(), before = structuredClone(memory);
  const valid = { schemaVersion: 1, npcId: memory.npcId, sourceRevision: memory.revision, atDay: 7,
    changes: [{ memoryId: event.id, clarity: 'faded', keepDetailIds: ['item'] }] };
  assert.throws(() => applyMemoryConsolidation(memory, { ...valid, sourceRevision: memory.revision - 1 }));
  assert.throws(() => applyMemoryConsolidation(memory, { ...valid, changes: [...valid.changes, { memoryId: 'invented', clarity: 'forgotten', keepDetailIds: [] }] }));
  assert.throws(() => applyMemoryConsolidation(memory, { ...valid, changes: [{ memoryId: event.id, clarity: 'forgotten', keepDetailIds: [] }] }));
  assert.throws(() => applyMemoryConsolidation(memory, { ...valid, changes: [{ ...valid.changes[0], mistakenDetail: { detailId: 'item', alternativeId: 'gold-coins' } }] }));
  assert.deepEqual(memory, before);
  const faded = applyMemoryConsolidation(memory, valid);
  assert.throws(() => applyMemoryConsolidation(faded, { ...valid, sourceRevision: faded.revision, atDay: 10, changes: [{ memoryId: event.id, clarity: 'clear', keepDetailIds: ['item'] }] }));
});

test('reading does not rehearse memory; explicit reminder updates belief without altering promise facts', () => {
  const memory = consolidateNpcMemory(promisedMemory(), 20, 42), before = structuredClone(memory);
  recallNpcMemories(memory); memoryConsolidationRequest(memory, 23);
  assert.deepEqual(memory, before);
  const reminded = rememberNpcEvent(memory, { id: 'reminder-1', kind: 'conversation', topic: 'bring-beans', gist: '主人提醒了捎东西的约定。',
    day: 20, reminderOf: event.id, details: [{ id: 'player-claim', text: '主人说原先约的是一袋豆子。' }] });
  assert.equal(reminded.memories[0].clarity, 'clear');
  assert.equal(reminded.memories[0].kind, 'promise', 'a reminder remains recallable as the original promise');
  assert.equal(reminded.memories[0].lastRecalledDay, 20);
  assert.deepEqual(reminded.promises, memory.promises);
  assert.equal(resolveNpcPromise(reminded, 'promise-1', 'fulfilled', 20).promises[0].status, 'fulfilled');
});

test('day-based consolidation is idempotent; exact recent dialogue expires', () => {
  let memory = recordNpcDialogue(promisedMemory(), { day: 1, player: '第三天上午记得来。', npc: '嗯。' });
  const first = consolidateNpcMemory(memory, 7, 42);
  assert.equal(consolidateNpcMemory(first, 7, 42), first);
  assert.equal(consolidateNpcMemory(first, 8, 42), first);
  assert.deepEqual(first.recentDialogue, []);
  assert.deepEqual(consolidateNpcMemory(memory, 7, 42), first);
  assert.throws(() => validateNpcMemory({ ...first, memories: [{ ...first.memories[0], clarity: 'fragment', details: event.details }] }));
});
