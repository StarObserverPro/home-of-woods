import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveController, SAVE_KEY } from '../src/app/save-controller';
import { createGameState } from '../src/domain/game-state';
import { serializeGame } from '../src/domain/save';

function memoryStorage(raw: string | null = null) {
  let value = raw;
  const writes: Array<{ key: string; value: string }> = [];
  return {
    writes,
    get value() { return value; },
    getItem(key: string) { assert.equal(key, SAVE_KEY); return value; },
    setItem(key: string, next: string) { assert.equal(key, SAVE_KEY); writes.push({ key, value: next }); value = next; },
  };
}

test('valid progress loads and writes through the single game save key', () => {
  const original = createGameState(); original.inventory.wood = 8; original.time = 20;
  const storage = memoryStorage(serializeGame(original));
  const controller = createSaveController(storage);
  const state = controller.load();
  assert.deepEqual(state, original);
  state.inventory.wood = 12;
  assert.equal(controller.write(state), true);
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.writes[0].key, 'home-of-woods-save-v1');
  assert.equal(JSON.parse(storage.value!).inventory.wood, 12);
  assert.equal(controller.protectedOriginal, false);
});

test('corrupt and future saves stay byte-for-byte intact through repeated autosave attempts', () => {
  for (const raw of ['{broken original', '{"schemaVersion":2,"futureData":"keep this"}', '{"schemaVersion":1,"inventory":{"wood":-4}}']) {
    const storage = memoryStorage(raw);
    const controller = createSaveController(storage);
    const fresh = controller.load();
    assert.equal(fresh.schemaVersion, 1);
    assert.equal(controller.protectedOriginal, true);
    fresh.inventory.wood = 100;
    assert.equal(controller.write(fresh), false);
    assert.equal(controller.write(fresh), false);
    assert.equal(storage.value, raw);
    assert.equal(storage.writes.length, 0);
    assert.match(controller.status, /不覆盖旧存档/);
  }
});

test('a failed storage read protects unknown existing data from later writes', () => {
  let attempts = 0;
  const controller = createSaveController({
    getItem() { throw new Error('storage permission denied'); },
    setItem() { attempts++; },
  });
  const state = controller.load();
  assert.equal(controller.protectedOriginal, true);
  assert.equal(controller.write(state), false);
  assert.equal(attempts, 0);
  assert.match(controller.status, /无法读取存档/);
});

test('quota refusal reports unsaved progress without changing old data; a later write can recover', () => {
  const original = serializeGame(createGameState());
  let raw = original;
  let reject = true;
  const controller = createSaveController({
    getItem() { return raw; },
    setItem(_key, next) { if (reject) throw new Error('quota exceeded'); raw = next; },
  });
  const state = controller.load(); state.inventory.carrots = 3;
  assert.equal(controller.write(state), false);
  assert.equal(raw, original);
  assert.match(controller.status, /还未保存/);
  reject = false;
  assert.equal(controller.write(state), true);
  assert.equal(JSON.parse(raw).inventory.carrots, 3);
  assert.match(controller.status, /已保存/);
});

test('denied browser storage still supplies a playable state and never claims a successful save', () => {
  const controller = createSaveController(null);
  const state = controller.load();
  assert.equal(state.schemaVersion, 1);
  assert.equal(controller.write(state), false);
  assert.match(controller.status, /无法保存/);
});

test('an empty save slot is writable and does not activate corruption protection', () => {
  const storage = memoryStorage();
  const controller = createSaveController(storage);
  const state = controller.load();
  assert.equal(controller.protectedOriginal, false);
  assert.equal(storage.writes.length, 0);
  assert.equal(controller.write(state), true);
  assert.equal(storage.writes.length, 1);
});
