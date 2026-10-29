import { BUILDINGS, GAME } from '../content/config';
import { getSurface, surfaceSupportsRectangle } from '../world/surface';
import { footprint, hasOccupiedFootprint, isPositionWalkable } from './occupancy';
import type { Building, GameState, Plot, Tree } from './types';

type RecordValue = Record<string, unknown>;
export type LoadResult = { ok: true; state: GameState } | { ok: false; error: string };
const record = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => finite(value, min, max) && Number.isSafeInteger(value);
const gridPoint = (value: RecordValue) => integer(value.x, -16, 16) && integer(value.z, -13, 13);
const validId = (value: unknown): value is string => typeof value === 'string' && /^(tree|plot|building)-(start-)?[1-9]\d{0,7}$/.test(value);
const bad = (error: string): LoadResult => ({ ok: false, error });

export function serializeGame(state: GameState): string {
  // This module serializes data only. The app's save-controller is the only storage writer.
  return JSON.stringify(state);
}

export function deserializeGame(raw: string): LoadResult {
  if (typeof raw !== 'string' || raw.length > 500_000) return bad('存档内容过大，已保留原始数据');
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return bad('存档无法读取，已保留原始数据'); }
  if (!record(input)) return bad('存档格式不正确，已保留原始数据');
  if (input.schemaVersion !== 1) return bad('存档版本暂不支持，已保留原始数据');
  if (!integer(input.seed, 0, 0xffffffff) || !finite(input.time, 0, 1e12) || !integer(input.revision) || !integer(input.nextId, 1, 99_999_999)) return bad('存档时间或标识异常，已保留原始数据');
  const player = input.player;
  if (!record(player) || !finite(player.x, -16, 16) || !finite(player.z, -13, 13) || !finite(player.facing, -Math.PI, Math.PI)) return bad('角色位置无效，已保留原始数据');
  const inventory = input.inventory;
  if (!record(inventory) || !['wood', 'seeds', 'saplings', 'carrots'].every(k => integer(inventory[k], 0, 1_000_000_000))) return bad('背包数量无效，已保留原始数据');
  const progress = input.progress;
  if (!record(progress) || !['chopped', 'planted', 'harvested', 'built'].every(k => integer(progress[k], 0, 1_000_000_000))) return bad('进度记录无效，已保留原始数据');
  if (!Array.isArray(input.trees) || input.trees.length > GAME.maxTrees || !Array.isArray(input.plots) || input.plots.length > GAME.maxPlots || !Array.isArray(input.buildings) || input.buildings.length > GAME.maxBuildings) return bad('世界记录不完整，已保留原始数据');

  const ids = new Set<string>();
  let largestGeneratedId = 0;
  function acceptId(id: unknown, prefix: string): id is string {
    if (!validId(id) || !id.startsWith(`${prefix}-`) || ids.has(id)) return false;
    ids.add(id);
    const generated = id.match(/^(?:tree|plot|building)-(\d+)$/);
    if (generated) largestGeneratedId = Math.max(largestGeneratedId, Number(generated[1]));
    return true;
  }
  const trees: Tree[] = [];
  for (const t of input.trees) {
    if (!record(t) || !acceptId(t.id, 'tree') || !gridPoint(t) || !finite(t.age, 0, GAME.treeMatureSeconds) || !integer(t.hp, 1, GAME.treeHits) || !integer(t.variant, 0, 2)) return bad('树木记录无效，已保留原始数据');
    const expectedStage = t.age >= GAME.treeMatureSeconds ? 'mature' : t.age >= GAME.treeYoungSeconds ? 'young' : 'sapling';
    if (t.stage !== expectedStage || (t.stage !== 'mature' && t.hp !== GAME.treeHits)) return bad('树木成长记录无效，已保留原始数据');
    trees.push({ id: t.id, x: t.x as number, z: t.z as number, stage: expectedStage, age: t.age, hp: t.hp, variant: t.variant });
  }
  const plots: Plot[] = [];
  for (const p of input.plots) {
    if (!record(p) || !acceptId(p.id, 'plot') || !gridPoint(p) || (p.crop !== null && p.crop !== 'carrot') || typeof p.watered !== 'boolean' || !finite(p.growth, 0, GAME.cropSeconds)) return bad('田地记录无效，已保留原始数据');
    if ((p.crop === null && (p.watered || p.growth !== 0)) || (!p.watered && p.growth !== 0)) return bad('作物成长记录无效，已保留原始数据');
    plots.push({ id: p.id, x: p.x as number, z: p.z as number, crop: p.crop, watered: p.watered, growth: p.growth });
  }
  const buildings: Building[] = [];
  for (const b of input.buildings) {
    if (!record(b) || !acceptId(b.id, 'building') || !gridPoint(b) || (b.kind !== 'cabin' && b.kind !== 'fence') || !integer(b.rotation, 0, 3)) return bad('建筑记录无效，已保留原始数据');
    buildings.push({ id: b.id, x: b.x as number, z: b.z as number, kind: b.kind, rotation: b.rotation as Building['rotation'] });
  }
  if (input.nextId <= largestGeneratedId) return bad('存档标识冲突，已保留原始数据');
  const state: GameState = {
    schemaVersion: 1, seed: input.seed, time: input.time, revision: input.revision, nextId: input.nextId,
    player: { x: player.x, z: player.z, facing: player.facing },
    inventory: { wood: inventory.wood as number, seeds: inventory.seeds as number, saplings: inventory.saplings as number, carrots: inventory.carrots as number },
    progress: { chopped: progress.chopped as number, planted: progress.planted as number, harvested: progress.harvested as number, built: progress.built as number },
    trees, plots, buildings,
  };
  for (const entity of [...trees, ...plots]) {
    if (getSurface(entity.x, entity.z).kind !== 'grass' || !surfaceSupportsRectangle(entity.x, entity.z, 0.95, 0.95) || hasOccupiedFootprint(state, entity, 'stage' in entity ? 1.05 : 0.94, 'stage' in entity ? 1.05 : 0.94, entity.id)) return bad('世界中有重叠或越界对象，已保留原始数据');
  }
  for (const building of buildings) {
    if (!BUILDINGS[building.kind]) return bad('未知建筑，已保留原始数据');
    const f = footprint(building.kind, building.rotation);
    if (!surfaceSupportsRectangle(building.x, building.z, f.width, f.depth) || hasOccupiedFootprint(state, building, f.width, f.depth, building.id)) return bad('建筑占地无效，已保留原始数据');
  }
  if (!isPositionWalkable(state, state.player.x, state.player.z)) return bad('角色位置被阻挡，已保留原始数据');
  return { ok: true, state };
}
