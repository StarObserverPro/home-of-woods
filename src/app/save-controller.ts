import type { GameState } from '../domain/state.ts';
import type { SaveContext } from '../domain/save-context.ts';
import { prepareWorldSave, serializeWorldSave } from '../domain/world-save.ts';
import type { WorldLoadResult, WorldSaveMeta } from '../domain/world-save.ts';
import type { SaveRecords, WorldSaveStore } from './world-save-store.ts';

export type SaveStatus = {
  state: 'loading' | 'ready' | 'saving' | 'saved' | 'protected' | 'conflict' | 'failed';
  message: string; savedAt: number | null; canSave: boolean; canRestore: boolean;
  hasPrimary: boolean; hasBackup: boolean; diagnostics: string[];
};
export const INITIAL_SAVE_STATUS: SaveStatus = { state: 'loading', message: '正在读取存档', savedAt: null, canSave: false, canRestore: false, hasPrimary: false, hasBackup: false, diagnostics: [] };
type ValidSave = Extract<WorldLoadResult, { decision: 'restored' | 'migrated' }>;

function checkpointToken(state: GameState) {
  return JSON.stringify([state.inventory.revision, state.forestry.ledger,
    state.forestry.active?.id, state.forestry.active?.phase,
    state.gathering.action?.actionId, state.gathering.action?.phase,
    Object.values(state.gathering.sources).map(source => source.version),
    Object.values(state.forestry.slots).map(tree => [tree.generation, tree.status])]);
}

export function createSaveController(store: WorldSaveStore, context: SaveContext) {
  let status = INITIAL_SAVE_STATUS, expected: SaveRecords = { primary: null, backup: null };
  let primary: ValidSave | null = null, backup: ValidSave | null = null;
  let sequence = 0, writable = false, lastTime = -Infinity, lastToken = '', retryAfter = 0;
  let loadPromise: Promise<GameState | null> | null = null, inFlight: Promise<boolean> | null = null;
  let restoring = false;
  const listeners = new Set<() => void>();
  const update = (next: Partial<SaveStatus>) => { status = { ...status, ...next }; for (const listener of listeners) listener(); };
  const blocked = (state: 'protected' | 'conflict', message: string, diagnostics: string[] = []) => {
    writable = false; update({ state, message, diagnostics, canSave: false, canRestore: state === 'protected' && !!(primary || backup) });
  };
  const read = async () => {
    writable = false; primary = backup = null;
    update({ ...INITIAL_SAVE_STATUS });
    try {
      expected = await store.read();
      const [p, b] = await Promise.all([prepareWorldSave(expected.primary, context), prepareWorldSave(expected.backup, context)]);
      if (p.decision === 'restored' || p.decision === 'migrated') primary = p;
      if (b.decision === 'restored' || b.decision === 'migrated') backup = b;
      sequence = Math.max(primary?.meta.sequence ?? 0, backup?.meta.sequence ?? 0);
      update({ hasPrimary: expected.primary !== null, hasBackup: expected.backup !== null });
      if (p.decision === 'protected' || b.decision === 'protected') {
        blocked('protected', '存档校验未通过，原始数据已保留。可导出或使用有效副本恢复。', [...p.diagnostics, ...b.diagnostics]);
        return primary ? structuredClone(primary.value) : null;
      }
      if (primary && backup && backup.meta.sequence > primary.meta.sequence) {
        blocked('protected', '主档与备份的顺序不一致，已保留原始数据。'); return structuredClone(primary.value);
      }
      writable = true;
      const chosen = primary ?? backup;
      update({ state: chosen ? 'saved' : 'ready', message: chosen ? primary ? '已恢复世界存档' : '已从有效备份读取世界' : '新世界，等待首次保存',
        savedAt: chosen?.meta.savedAt ?? null, canSave: true, canRestore: !!backup, diagnostics: [...p.diagnostics, ...b.diagnostics] });
      lastToken = ''; lastTime = -Infinity;
      return chosen ? structuredClone(chosen.value) : null;
    } catch (error) {
      update({ state: 'failed', message: '存档暂时无法读取，已有数据不会被覆盖。', canSave: false, diagnostics: [String(error)] }); return null;
    }
  };

  const write = (state: GameState): Promise<boolean> => {
    if (!writable || restoring || inFlight) return inFlight ?? Promise.resolve(false);
    let snapshot: GameState, token: string;
    try { snapshot = structuredClone(state); token = checkpointToken(snapshot); }
    catch (error) { blocked('protected', '当前世界无法生成完整快照，旧档已保留。', [String(error)]); return Promise.resolve(false); }
    inFlight = Promise.resolve().then(async () => {
      update({ state: 'saving', message: '正在保存世界', diagnostics: [] });
      const meta: WorldSaveMeta = { sequence: sequence + 1, savedAt: Date.now() };
      let raw: string;
      try { raw = await serializeWorldSave(snapshot, context, meta); }
      catch (error) { blocked('protected', '当前世界未通过校验，上一份有效存档已保留。', [String(error)]); return false; }
      const next: SaveRecords = { primary: raw, backup: expected.primary ?? expected.backup };
      try {
        if (!await store.compareAndSwap(expected, next)) { blocked('conflict', '存档已被另一页面更新，请重新读取后继续。'); return false; }
        backup = primary ?? backup;
        primary = { decision: 'restored', value: snapshot, meta, diagnostics: [] };
        expected = next; sequence = meta.sequence; lastTime = snapshot.time; lastToken = token;
        update({ state: 'saved', message: '世界已保存', savedAt: meta.savedAt, canSave: true, canRestore: !!backup, hasPrimary: true, hasBackup: next.backup !== null });
        return true;
      } catch (error) {
        retryAfter = Date.now() + 5000;
        update({ state: 'failed', message: '保存失败，上一份有效存档仍保留。可重试或导出。', canSave: true, diagnostics: [String(error)] }); return false;
      }
    }).finally(() => { inFlight = null; });
    return inFlight;
  };

  return {
    async load() {
      await (loadPromise ??= read());
      // The cached read promise must never become a second mutable world owner.
      const chosen = primary ?? (writable ? backup : null);
      return chosen ? structuredClone(chosen.value) : null;
    },
    status: () => status,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    observe(state: GameState) {
      if (!writable || restoring || inFlight || Date.now() < retryAfter) return;
      try {
        const interval = state.forestry.active || state.gathering.action?.phase === 'approaching' || state.gathering.action?.phase === 'performing' ? 1 : 5;
        if (state.time - lastTime >= interval || checkpointToken(state) !== lastToken) void write(state);
      } catch (error) { blocked('protected', '当前世界无法生成完整快照，旧档已保留。', [String(error)]); }
    },
    async saveNow(state: GameState) { if (inFlight) await inFlight; return write(state); },
    async reload() {
      if (inFlight) await inFlight;
      if (restoring) return null;
      if (status.state !== 'loading' || !loadPromise) loadPromise = read();
      const loaded = await loadPromise;
      return loaded ? structuredClone(loaded) : null;
    },
    async restoreValidCopy(): Promise<GameState | null> {
      if (inFlight) await inFlight;
      if (restoring) return null;
      const chosen = status.state === 'protected' ? primary ?? backup : backup;
      if (!chosen) return null;
      const meta = { sequence: sequence + 1, savedAt: Date.now() };
      const wasWritable = writable; restoring = true; writable = false;
      update({ state: 'saving', message: '正在使用有效副本恢复世界', canSave: false });
      try {
        const raw = await serializeWorldSave(chosen.value, context, meta);
        const next = { primary: raw, backup: raw };
        if (!await store.compareAndSwap(expected, next)) { blocked('conflict', '存档已被另一页面更新，请重新读取。'); return null; }
        expected = next; primary = backup = { decision: 'restored', value: structuredClone(chosen.value), meta, diagnostics: [] };
        sequence = meta.sequence; writable = true; lastToken = ''; lastTime = -Infinity;
        update({ state: 'saved', message: '已使用有效副本恢复世界', canSave: true, canRestore: true, savedAt: meta.savedAt, hasPrimary: true, hasBackup: true, diagnostics: [] });
        return structuredClone(chosen.value);
      } catch (error) { writable = wasWritable; update({ state: 'failed', message: '副本恢复未完成，原始数据仍保留。', canSave: writable, diagnostics: [String(error)] }); return null; }
      finally { restoring = false; }
    },
    async exportRaw(which: 'primary' | 'backup') {
      const records = await store.read(), raw = records[which];
      if (raw === null) return null;
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
    },
    flush: () => inFlight ?? Promise.resolve(false),
  };
}
export type SaveController = ReturnType<typeof createSaveController>;
