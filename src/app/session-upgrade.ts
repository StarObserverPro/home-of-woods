import type { GameState } from '../domain/state.ts';
import type { SaveContext } from '../domain/save-context.ts';
import { validateWorldState } from '../domain/world-save.ts';

/** Validate a current session atomically. Historical in-memory shapes are unsupported. */
export function validateWorldSession(state: GameState, context: SaveContext) {
  Object.assign(state, validateWorldState(state, context, 'runtime').state);
}
