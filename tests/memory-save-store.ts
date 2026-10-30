import type { SaveRecords, WorldSaveStore } from '../src/app/world-save-store.ts';
export class MemorySaveStore implements WorldSaveStore {
  records: SaveRecords = { primary: null, backup: null };
  failRead = false; failWrite = false; writes = 0;
  async read() { if (this.failRead) throw new Error('read unavailable'); return structuredClone(this.records); }
  async compareAndSwap(expected: SaveRecords, next: SaveRecords) {
    if (this.failWrite) throw new Error('quota: transaction aborted');
    if (this.records.primary !== expected.primary || this.records.backup !== expected.backup) return false;
    this.records = structuredClone(next); this.writes++; return true;
  }
}
