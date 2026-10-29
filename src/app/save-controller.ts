import { createGameState } from '../domain/game-state';
import { deserializeGame, serializeGame } from '../domain/save';
import type { GameState } from '../domain/types';

export const SAVE_KEY = 'home-of-woods-save-v1';
export function createSaveController(storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
  let protectedOriginal = false, status = '进度自动保存在这台设备上';
  return {
    load(): GameState {
      if (!storage) { status = '当前无法保存；这次可以继续游玩'; return createGameState(); }
      try {
        const raw = storage.getItem(SAVE_KEY);
        if (raw === null) return createGameState();
        const result = deserializeGame(raw);
        if (result.ok) return result.state;
        protectedOriginal = true; status = `${result.error}。本次进度暂不覆盖旧存档`;
      } catch { status = '当前无法读取存档；这次可以继续游玩'; protectedOriginal = true; }
      return createGameState();
    },
    write(state: GameState): boolean {
      if (protectedOriginal || !storage) return false;
      try { storage.setItem(SAVE_KEY, serializeGame(state)); status = '进度已保存在这台设备上'; return true; }
      catch { status = '设备空间不足或保存受限；本次进度还未保存'; return false; }
    },
    get status() { return status; }, get protectedOriginal() { return protectedOriginal; },
  };
}
