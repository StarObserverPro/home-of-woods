import {createWoodcraft,validateWoodcraft} from './woodcraft.ts';
import {createWorkshop,validateWorkshop,workshopTargetId} from './workshop.ts';
import {createLocalClock,CLOCK_SPEEDS} from './local-clock.ts';
import {canonicalInstances} from './owned-items.ts';
import { WAYPOINTS, WORLD_LAYOUT_VERSION, WORLD_RULESET_VERSION, WORLD_SEED } from '../content/world.ts';
import type { GameState } from './state.ts';
import type { SaveContext } from './save-context.ts';
import { createGathering } from './gathering.ts';
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
  fields(world, ['woodcraft','clock','workshop','ritual', 'seed', 'time', 'forestry', 'inventory', 'gathering', 'player', 'selected', 'route', 'visited'], 'world');
  requireValue(world.seed === WORLD_SEED, 'world.seed', '当前布局不支持此世界');
  const time = finite(world.time, 'world.time');
  const player = object(world.player, 'world.player'); fields(player, ['x', 'z', 'facing', 'moving'], 'world.player');
  point({ x: player.x, z: player.z }, 'world.player'); finite(player.facing, 'world.player.facing', -Number.MAX_VALUE);
  requireValue(typeof player.moving === 'boolean', 'world.player.moving', '移动状态无效');
  requireValue(Array.isArray(world.route), 'world.route', '路径无效');
  for (let i = 0; i < world.route.length; i++) point(world.route[i], `world.route[${i}]`);
  const visited = uniqueStrings(world.visited, 'world.visited');
  requireValue(visited.includes('home') && visited.every(id => WAYPOINTS.some(waypoint => waypoint.id === id)), 'world.visited', '未知探索地点');
  let inventory: InventoryState, diagnostics: string[] = [];
  if (mode === 'runtime') {
    const original = world.inventory as InventoryState;
    inventory = { schemaVersion: 1, revision: original?.revision, stacks: validateInventory(original), ...(original?.instances?{instances:canonicalInstances(original.instances)}:{}) };
  } else {
    const loaded = prepareInventoryData(world.inventory);
    requireValue(loaded.decision !== 'protected', 'world.inventory', loaded.diagnostics.join('；'));
    inventory = loaded.value; diagnostics = loaded.diagnostics;
  }
  const woodcraft=validateWoodcraft(world.woodcraft);
  const clock=object(world.clock,'world.clock');fields(clock,['speed'],'world.clock');
  requireValue(CLOCK_SPEEDS.includes(clock.speed as 1|4|12),'world.clock','沙漏速度无效');
  const workshop=validateWorkshop(world.workshop,time);
  const ownedPrefix=`crafted-${WORLD_SEED}-`;
  for(const item of inventory.instances??[]){
    if(item.instanceId.startsWith(ownedPrefix)){
      const n=Number(item.instanceId.slice(ownedPrefix.length));
      requireValue(Number.isSafeInteger(n)&&n>0&&n<workshop.nextInstance,'workshop.nextInstance','物品编号与分配计数冲突');
    }
  }
  requireValue((inventory.instances??[]).every(i=>i.createdAt<=time),'inventory.instances','物品生成时间晚于世界时间');
  requireValue(world.selected===null || typeof world.selected==='string' && (context.selectable.has(world.selected)||woodcraft.pieces.some(p=>p.id===world.selected)||(inventory.instances??[]).some(i=>i.instanceId===world.selected&&i.location.kind==='world')),'world.selected','未知目标引用');
  const forestry = validateSavedForestry(world.forestry, context, time);
  if (forestry.active?.phase === 'chopping') requireValue(world.selected === forestry.active.treeId, 'world.selected', '采伐目标冲突');
  const gathering = validateSavedGathering(world.gathering, context, forestry, time, world.selected as string | null);
  if(world.ritual !== null) {
    const a=object(world.ritual,'ritual');fields(a,['kind','phase','startedAt'],'ritual');
    requireValue(a.kind==='prayer' && ['approaching','performing','completed','cancelled'].includes(a.phase as string),'ritual','未知祈祷动作');
    if(a.startedAt!==null)requireValue(finite(a.startedAt,'ritual.startedAt')<=time,'ritual','未来动作时间');
    if(a.phase==='performing'||a.phase==='completed')requireValue(a.startedAt!==null,'ritual','缺少开始时间');
    if(a.phase==='approaching'||a.phase==='performing')requireValue(forestry.active===null && !['approaching','performing'].includes(gathering.action?.phase??'') && ['grove-altar','grove-altar:oracle'].includes(world.selected as string),'ritual','进行中祈祷与世界冲突');
  }
  if(workshop.job)requireValue(world.selected===workshopTargetId(workshop.job.kind)&&!forestry.active&&!['approaching','performing'].includes(gathering.action?.phase??'')&&!(world.ritual&&['approaching','performing'].includes((world.ritual as {phase:string}).phase)),'workshop.job','操作状态冲突');
  const state = { ...structuredClone(world), woodcraft, workshop, inventory, forestry, gathering } as unknown as GameState;
  return { state, diagnostics };
}

export async function serializeWorldSave(state: GameState, context: SaveContext, meta: WorldSaveMeta): Promise<string> {
  // Capture and validate synchronously before hashing yields to another frame.
  const snapshot = validateWorldState(state, context, 'runtime').state;
  integer(meta.sequence, 'save.sequence', 1); finite(meta.savedAt, 'save.savedAt');
  const core = { schemaVersion: 1, layoutVersion: WORLD_LAYOUT_VERSION, rulesetVersion: WORLD_RULESET_VERSION,
    sequence: meta.sequence, savedAt: meta.savedAt,
    world: { ...snapshot, inventory: { schemaVersion: snapshot.inventory.instances?3:2, stacks: snapshot.inventory.stacks, ...(snapshot.inventory.instances?{instances:snapshot.inventory.instances}:{}) } } };
  return canonicalJson({ ...core, checksum: await saveDigest(core) });
}

export async function prepareWorldSave(raw: string | null, context: SaveContext): Promise<WorldLoadResult> {
  if (raw === null) return { decision: 'no-save', diagnostics: [] };
  try {
    requireValue(typeof raw === 'string', 'save', '存储记录不是文本');
    const saved = object(JSON.parse(raw), 'save');
    fields(saved, ['schemaVersion', 'layoutVersion', 'rulesetVersion', 'sequence', 'savedAt', 'world', 'checksum'], 'save');
    requireValue(saved.schemaVersion === 1 && saved.layoutVersion === WORLD_LAYOUT_VERSION && (saved.rulesetVersion === WORLD_RULESET_VERSION || saved.rulesetVersion === 1 || saved.rulesetVersion === 2 || saved.rulesetVersion === 3), 'save', '未来格式或不兼容的世界版本');
    const sequence = integer(saved.sequence, 'save.sequence', 1), savedAt = finite(saved.savedAt, 'save.savedAt');
    requireValue(typeof saved.checksum === 'string' && /^[a-f0-9]{64}$/.test(saved.checksum), 'save.checksum', '校验记录无效');
    const { checksum, ...core } = saved;
    requireValue(await saveDigest(core) === checksum, 'save.checksum', '数据完整性校验失败');
    let upgraded = saved.world;
    if(saved.rulesetVersion!==WORLD_RULESET_VERSION){
      const legacy=object(upgraded,'world');
      upgraded={...legacy,woodcraft:Object.hasOwn(legacy,'woodcraft')?legacy.woodcraft:createWoodcraft(),clock:legacy.clock??createLocalClock(),workshop:legacy.workshop??createWorkshop()};
    }
    if (saved.rulesetVersion === 1) {
      // Validate the old exact source set before adding new pools; never heal corrupt old saves.
      const oldSources = new Map([...context.registry.sources].filter(([,s]) => s.definitionId !== 'forage.scrap-pile'));
      const legacyContext = {...context, registry: {...context.registry, sources: oldSources}};
      const old = validateWorldState({...object(upgraded,'world'),ritual:null}, legacyContext, 'persisted').state;
      const additions = createGathering(context.registry).sources;
      for (const [id, life] of Object.entries(additions)) if (!oldSources.has(id)) old.gathering.sources[id] = life;
      // Preserve settled history and rewards; cancel obsolete in-flight pickup semantics.
      if (old.gathering.action && ['approaching','performing'].includes(old.gathering.action.phase)) {
        old.gathering.action.phase = 'cancelled'; old.route = []; old.player.moving = false;
      }
      upgraded = {...old, inventory: {schemaVersion: 2, stacks: old.inventory.stacks}};
    }
    const loaded = validateWorldState(upgraded, context, 'persisted');
    if(saved.rulesetVersion!==WORLD_RULESET_VERSION)loaded.diagnostics.push('已接入营地物理岛；旧木作、原材料及世界进度保留');
    if (saved.rulesetVersion === 1) loaded.diagnostics.push('新增独立碎柴池；保留旧枝料与未知规格，旧进行中采集已取消');
    return { decision: loaded.diagnostics.length ? 'migrated' : 'restored', value: loaded.state, meta: { sequence, savedAt }, diagnostics: loaded.diagnostics };
  } catch (error) {
    return { decision: 'protected', raw, diagnostics: [error instanceof Error ? error.message : '无法校验存档'] };
  }
}

