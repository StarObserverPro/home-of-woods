export const WORLD_SAVE_DATABASE = 'home-of-woods-save-v1';
const STORE = 'world';
export type SaveRecords = { primary: string | null; backup: string | null };
export interface WorldSaveStore {
  read(): Promise<SaveRecords>;
  compareAndSwap(expected: SaveRecords, next: SaveRecords): Promise<boolean>;
}

/** This adapter owns all durable writes. One IDB transaction commits both records. */
export function createBrowserWorldSaveStore(databaseName = WORLD_SAVE_DATABASE): WorldSaveStore {
  let connection: Promise<IDBDatabase> | null = null;
  const open = () => connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => { connection = null; reject(request.error); };
    request.onblocked = () => { blocked = true; connection = null; reject(new Error('存档数据库正被其他页面占用')); };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      if (!db.objectStoreNames.contains(STORE)) { db.close(); connection = null; reject(new Error('存档数据库结构不兼容')); return; }
      db.onversionchange = () => { db.close(); connection = null; };
      resolve(db);
    };
  }).catch(error => { connection = null; throw error; });
  return {
    async read() {
      const db = await open();
      return new Promise<SaveRecords>((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readonly'), store = transaction.objectStore(STORE);
        const primary = store.get('primary'), backup = store.get('backup');
        transaction.oncomplete = () => resolve({ primary: primary.result ?? null, backup: backup.result ?? null });
        transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('存档读取失败'));
      });
    },
    async compareAndSwap(expected, next) {
      const db = await open();
      return new Promise<boolean>((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite', { durability: 'strict' }), store = transaction.objectStore(STORE);
        const primary = store.get('primary'), backup = store.get('backup');
        let reads = 0, changed = false;
        const ready = () => {
          if (++reads !== 2) return;
          if ((primary.result ?? null) !== expected.primary || (backup.result ?? null) !== expected.backup) return;
          // No asynchronous gap between the comparison and these writes.
          store.put(next.primary, 'primary'); store.put(next.backup, 'backup'); changed = true;
        };
        primary.onsuccess = backup.onsuccess = ready;
        transaction.oncomplete = () => resolve(changed);
        transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('存档事务失败'));
      });
    },
  };
}
