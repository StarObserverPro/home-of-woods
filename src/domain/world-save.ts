import { WAYPOINTS, WORLD_LAYOUT_VERSION, WORLD_RULESET_VERSION, WORLD_SEED } from '../content/world.ts';
import type { GameState } from './state.ts';
import type { SaveContext } from './save-context.ts';
import { prepareInventoryData } from './inventory-persistence.ts';
import { validateInventory } from './inventory.ts';
import type { InventoryState } from './inventory.ts';
import { validateSavedForestry } from './save-forestry.ts';
import { validateSavedGathering } from './save-gathering.ts';
import { fields, finite, integer, object, point, requireValue, uniqueStrings } from './save-validation.ts';
import { canonicalJson, saveDigest } from './save-digest.ts';

export type WorldSaveMeta = { sequence: number; savedAt: number };
export type WorldLoadResult =
  | { decision: 'no-save'; diagnostics: string[] }
  | { decision: 'restored' | 'migrated'; value: GameState; meta: WorldSaveMeta; diagnostics: string[] }
  | { decision: 'protected'; raw: string; diagnostics: string[] };

export function validateWorldState(raw: unknown, context: SaveContext, mode: 'runtime' | 'persisted') {
  const world = object(raw, 'world');
  fields(world, ['seed', 'time', 'forestry', 'inventory', 'gathering', 'player', 'selected', 'route', 'visited'], 'world');
  requireValue(world.seed === WORLD_SEED, 'world.seed', '当前布局不支持此世界');
  const time = finite(world.time, 'world.time');
  const player = object(world.player, 'world.player'); fields(player, ['x', 'z', 'facing', 'moving'], 'world.player');
  point({ x: player.x, z: player.z }, 'world.player'); finite(player.facing, 'world.player.facing', -Number.MAX_VALUE);
  requireValue(typeof player.moving === 'boolean', 'world.player.moving', '移动状态无效');
  requireValue(world.selected === null || typeof world.selected === 'string' && context.selectable.has(world.selected), 'world.selected', '未知目标引用');
  requireValue(Array.isArray(world.route), 'world.route', '路径无效');
  for (let i = 0; i < world.route.length; i++) point(world.route[i], `world.route[${i}]`);
  const visited = uniqueStrings(world.visited, 'world.visited');
  requireValue(visited.includes('home') && visited.every(id => WAYPOINTS.some(waypoint => waypoint.id === id)), 'world.visited', '未知探索地点');
  let inventory: InventoryState, diagnostics: string[] = [];
  if (mode === 'runtime') {
    const original = world.inventory as InventoryState;
    inventory = { schemaVersion: 1, revision: original?.revision, stacks: validateInventory(original) };
  } else {
    const loaded = prepareInventoryData(world.inventory);
    requireValue(loaded.decision !== 'protected', 'world.inventory', loaded.diagnostics.join('；'));
    inventory = loaded.value; diagnostics = loaded.diagnostics;
  }
  const forestry = validateSavedForestry(world.forestry, context, time);
  if (forestry.active?.phase === 'chopping') requireValue(world.selected === forestry.active.treeId, 'world.selected', '采伐目标冲突');
  const gathering = validateSavedGathering(world.gathering, context, forestry, time, world.selected as string | null);
  const state = { ...structuredClone(world), inventory, forestry, gathering } as unknown as GameState;
  return { state, diagnostics };
}

export async function serializeWorldSave(state: GameState, context: SaveContext, meta: WorldSaveMeta): Promise<string> {
  // Capture and validate synchronously before hashing yields to another frame.
  const snapshot = validateWorldState(state, context, 'runtime').state;
  integer(meta.sequence, 'save.sequence', 1); finite(meta.savedAt, 'save.savedAt');
  const core = { schemaVersion: 1, layoutVersion: WORLD_LAYOUT_VERSION, rulesetVersion: WORLD_RULESET_VERSION,
    sequence: meta.sequence, savedAt: meta.savedAt,
    world: { ...snapshot, inventory: { schemaVersion: 1, stacks: snapshot.inventory.stacks } } };
  return canonicalJson({ ...core, checksum: await saveDigest(core) });
}

export async function prepareWorldSave(raw: string | null, context: SaveContext): Promise<WorldLoadResult> {
  if (raw === null) return { decision: 'no-save', diagnostics: [] };
  try {
    requireValue(typeof raw === 'string', 'save', '存储记录不是文本');
    const saved = object(JSON.parse(raw), 'save');
    fields(saved, ['schemaVersion', 'layoutVersion', 'rulesetVersion', 'sequence', 'savedAt', 'world', 'checksum'], 'save');
    requireValue(saved.schemaVersion === 1 && saved.layoutVersion === WORLD_LAYOUT_VERSION && saved.rulesetVersion === WORLD_RULESET_VERSION, 'save', '未来格式或不兼容的世界版本');
    const sequence = integer(saved.sequence, 'save.sequence', 1), savedAt = finite(saved.savedAt, 'save.savedAt');
    requireValue(typeof saved.checksum === 'string' && /^[a-f0-9]{64}$/.test(saved.checksum), 'save.checksum', '校验记录无效');
    const { checksum, ...core } = saved;
    requireValue(await saveDigest(core) === checksum, 'save.checksum', '数据完整性校验失败');
    const loaded = validateWorldState(saved.world, context, 'persisted');
    return { decision: loaded.diagnostics.length ? 'migrated' : 'restored', value: loaded.state, meta: { sequence, savedAt }, diagnostics: loaded.diagnostics };
  } catch (error) {
    return { decision: 'protected', raw, diagnostics: [error instanceof Error ? error.message : '无法校验存档'] };
  }
}
