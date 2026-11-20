import { CARRY_PROFILES, CARRY_RULES } from '../content/carrying.ts';
import type { Point } from '../content/world.ts';
import type { ExpeditionMapId, ExpeditionResourceSite } from '../content/forest-expedition.ts';
import {
  EXPEDITION_CARRY_ITEMS, EXPEDITION_RECIPES, EXPEDITION_RESOURCES,
  EXPEDITION_RULES, expeditionResourceItem,
} from '../content/expedition-resources.ts';
import type { ExpeditionRecipe } from '../content/expedition-resources.ts';
import { atLocation, carriedStacks, carryingLoad } from './carrying.ts';
import type { CarryIntent } from './carrying.ts';
import { ITEM_CATALOG, isStableId } from './item-catalog.ts';
import {
  createInventory, inventoryTransaction, isRecord, recognizedStack, stackIdentity, stackKey, validateInventory, woodBatch,
} from './inventory.ts';
import type { InventoryDelta, InventoryStack, InventoryState, StackIdentity } from './inventory.ts';
import { assertItemJson } from './item-data.ts';
import { carryMethod, isCarried, isStored, transportLocation } from './transport-location.ts';
import type { TransportLocation } from './transport-location.ts';

export const EXPEDITION_ITEM_CATALOG = ITEM_CATALOG;
const carryRegistry = { sizes: EXPEDITION_CARRY_ITEMS, catalog: EXPEDITION_ITEM_CATALOG };

export type ExpeditionMapContext = {
  id: ExpeditionMapId; spawn: Point; supply: Point; resourceSites: readonly ExpeditionResourceSite[];
};
/** World owns terrain/path facts. The module neither imports a second surface nor starts a clock. */
export type ExpeditionContext = {
  maps: Readonly<Record<ExpeditionMapId, ExpeditionMapContext>>;
  canInteract?: (mapId: ExpeditionMapId, from: Point, to: Point) => boolean;
  canStand?: (mapId: ExpeditionMapId, point: Point) => boolean;
  campPendingTimber?: (mapId: ExpeditionMapId) => number;
};
export type ExpeditionSourceState = { remaining: number; version: number; nextReadyAt: number | null };
type ExpeditionActionBase = {
  id: string; sequence: number; mapId: ExpeditionMapId; startedAt: number; finishAt: number;
  startPosition: Point; inventoryRevision: number;
};
export type ExpeditionAction = ExpeditionActionBase & (
  { kind: 'gather'; sourceId: string; sourceVersion: number } |
  { kind: 'process'; recipeId: string; deltas: InventoryDelta[] }
);
export type ForestExpeditionState = {
  schemaVersion: typeof EXPEDITION_RULES.schemaVersion; revision: number; time: number; activeMapId: ExpeditionMapId;
  player: Point; positions: Record<ExpeditionMapId, Point>;
  /** This is the sole inventory for the three sample plots, not a mirror of camp stock. */
  inventory: InventoryState; sources: Record<string, ExpeditionSourceState>;
  action: ExpeditionAction | null; nextAction: number; lastSettledAction: number;
  timber: { limit: number; used: number }; sapCanIssued: boolean;
};
export type ExpeditionResult = { ok: boolean; state: ForestExpeditionState; message: string; approach?: Point };
export type ExpeditionHostOptions = { time?: number; inventory?: InventoryState; initialMapId?: ExpeditionMapId };
const point = (p: Point): Point => ({ x: p.x, z: p.z });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const validTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const validPoint = (p: unknown): p is Point => isRecord(p) && typeof p.x === 'number' && typeof p.z === 'number' && Number.isFinite(p.x) && Number.isFinite(p.z);
const isMapId = (id: unknown): id is ExpeditionMapId => EXPEDITION_RULES.mapIds.includes(id as ExpeditionMapId);
const result = (state: ForestExpeditionState, message = '', ok = true, approach?: Point): ExpeditionResult => ({ ok, state, message, ...(approach ? { approach: point(approach) } : {}) });
const changed = (state: ForestExpeditionState, patch: Partial<ForestExpeditionState>): ForestExpeditionState => ({ ...state, ...patch, revision: state.revision + 1 });
const passable = (context: ExpeditionContext, mapId: ExpeditionMapId, from: Point, to: Point) => context.canInteract?.(mapId, from, to) ?? true;

function findSource(context: ExpeditionContext, id: string) {
  for (const mapId of EXPEDITION_RULES.mapIds) {
    const site = context.maps[mapId].resourceSites.find(source => source.id === id);
    if (site) return { site, mapId, definition: EXPEDITION_RESOURCES[site.role] };
  }
  return null;
}

export function createForestExpedition(context: ExpeditionContext, options: ExpeditionHostOptions = {}): ForestExpeditionState {
  const time = options.time ?? 0, activeMapId = options.initialMapId ?? 'upper';
  if (!validTime(time) || !isMapId(activeMapId)) throw new Error('Invalid expedition initial state');
  const sources: Record<string, ExpeditionSourceState> = {};
  for (const mapId of EXPEDITION_RULES.mapIds) {
    const map = context.maps[mapId];
    if (map.id !== mapId || !validPoint(map.spawn) || !validPoint(map.supply)) throw new Error('Invalid expedition map context');
    for (const site of map.resourceSites) {
      if (!isStableId(site.id) || sources[site.id] || !EXPEDITION_RESOURCES[site.role] || !validPoint(site)) throw new Error('Invalid or duplicate expedition resource source');
      sources[site.id] = { remaining: EXPEDITION_RESOURCES[site.role].capacity, version: 0, nextReadyAt: null };
    }
  }
  const inventory = structuredClone(options.inventory ?? createInventory());
  inventory.stacks = validateInventory(inventory);
  const positions = Object.fromEntries(EXPEDITION_RULES.mapIds.map(id => [id, point(context.maps[id].spawn)])) as Record<ExpeditionMapId, Point>;
  return {
    schemaVersion: EXPEDITION_RULES.schemaVersion, revision: 0, time, activeMapId, player: point(positions[activeMapId]), positions,
    inventory, sources, action: null, nextAction: 1, lastSettledAction: 0,
    timber: { limit: EXPEDITION_RULES.timberAllowance, used: 0 }, sapCanIssued: false,
  };
}

export function expeditionLoad(state: ForestExpeditionState) {
  return carryingLoad(carriedStacks(state.inventory), CARRY_PROFILES[carryMethod(state.inventory.carryMode)], 1, carryRegistry);
}
const loadOf = (inventory: InventoryState) => carryingLoad(carriedStacks(inventory), CARRY_PROFILES[carryMethod(inventory.carryMode)], 1, carryRegistry);
function pendingOrigin(stack: InventoryStack): ExpeditionMapId | null {
  const origin = stack.expeditionHarvest;
  return isRecord(origin) && isMapId(origin.mapId) ? origin.mapId : null;
}
export function pendingTimberIn(stacks: readonly InventoryStack[], mapId: ExpeditionMapId) {
  return stacks.reduce((total, stack) => total + (pendingOrigin(stack) === mapId ? stack.quantity : 0), 0);
}
export function pendingExpeditionTimber(state: ForestExpeditionState, mapId: ExpeditionMapId, context?: ExpeditionContext): number {
  return pendingTimberIn(state.inventory.stacks, mapId) + (context?.campPendingTimber?.(mapId) ?? 0);
}
function supplyNear(state: ForestExpeditionState, context: ExpeditionContext) {
  const supply = context.maps[state.activeMapId].supply;
  return distance(state.player, supply) <= EXPEDITION_RULES.storageRange && passable(context, state.activeMapId, state.player, supply);
}
function busyReason(state: ForestExpeditionState) { return state.action ? '先完成或取消手头的操作。' : ''; }

/** Moving goods preserves their origin. Only delivery clears the pending timber obligation. */
function located(item: StackIdentity, destination?: TransportLocation, mapId?: ExpeditionMapId): StackIdentity {
  const value = atLocation(item, destination);
  delete value.expeditionMapId;
  if (destination?.kind === 'ground') value.expeditionMapId = mapId;
  if (!destination) delete value.expeditionHarvest;
  return value;
}
function sourceReward(state: ForestExpeditionState, sourceId: string, context: ExpeditionContext): StackIdentity {
  const source = findSource(context, sourceId)!;
  const reward: StackIdentity = {
    itemId: expeditionResourceItem(source.site.role, source.mapId), qualityId: 'ordinary',
    expeditionOrigin: { mapId: source.mapId, sourceId, role: source.site.role },
  };
  if (source.site.role === 'branch' || source.site.role === 'curved-branch') {
    reward.wood = woodBatch({ lengthMm: source.site.role === 'branch' ? 850 : 1200, thicknessMm: 80, straightness: source.site.role === 'branch' ? 'straight' : 'curved' });
  }
  if (source.site.role === 'long-timber') {
    reward.wood = woodBatch({ lengthMm: 2600, thicknessMm: 180, straightness: 'straight' });
    reward.expeditionHarvest = { mapId: source.mapId, sourceId, actionId: state.action?.id ?? `expedition-${state.nextAction}` };
  }
  return located(reward, source.definition.destination === 'ground' ? { kind: 'ground', x: source.site.x, z: source.site.z } : { kind: 'carried' }, source.mapId);
}
function gatherInventory(state: ForestExpeditionState, sourceId: string, context: ExpeditionContext): InventoryState {
  const source = findSource(context, sourceId)!;
  const deltas: InventoryDelta[] = [];
  if (source.site.role === 'sap') {
    const container = carriedStacks(state.inventory).find(stack => stack.itemId === 'sap-can' && stack.quantity > 0);
    if (!container) throw new Error('要先从补给架带上一只空收液罐。');
    deltas.push({ ...container, delta: -1 });
  }
  deltas.push({ ...sourceReward(state, sourceId, context), delta: 1 });
  return inventoryTransaction(state.inventory, deltas, EXPEDITION_ITEM_CATALOG);
}
/** Read-only UI checks share the load formula without running inventory transactions each frame. */
function gatherLoadReason(state: ForestExpeditionState, sourceId: string, context: ExpeditionContext): string {
  const source = findSource(context, sourceId)!;
  if (source.definition.destination === 'ground') return '';
  let carried = carriedStacks(state.inventory);
  if (source.site.role === 'sap') {
    const index = carried.findIndex(stack => stack.itemId === 'sap-can' && stack.quantity > 0);
    if (index < 0) return '要先从补给架带上一只空收液罐。';
    carried = carried.map((stack, i) => i === index ? { ...stack, quantity: stack.quantity - 1 } : stack);
  }
  return carryingLoad([...carried, { ...sourceReward(state, sourceId, context), quantity: 1 }], CARRY_PROFILES[carryMethod(state.inventory.carryMode)], 1, carryRegistry).reason;
}
function gatherReason(state: ForestExpeditionState, sourceId: string, context: ExpeditionContext, ignoreBusy = false): string {
  const source = findSource(context, sourceId), life = state.sources[sourceId];
  if (!source || !life) return '这处物产已经不在当前样区。';
  if (source.mapId !== state.activeMapId) return '先前往这处物产所在的林地。';
  if (!ignoreBusy && state.action) return busyReason(state);
  if (life.remaining <= 0) return source.definition.recoverSeconds === null ? '这处定额长材已经收取。' : '这里暂时采空了，等成熟后再来。';
  if (source.definition.timberCost) {
    if (pendingExpeditionTimber(state, source.mapId, context) > 0) return '本林区尚未收运的长材交到补给架或营地后，才能收下一根。';
    if (state.timber.used + source.definition.timberCost > state.timber.limit) return '三个林地共用的长材额度已用完。';
  }
  return gatherLoadReason(state, sourceId, context);
}

export function expeditionSourceView(state: ForestExpeditionState, sourceId: string, context: ExpeditionContext) {
  const source = findSource(context, sourceId), life = state.sources[sourceId];
  if (!source || !life) return null;
  const d = source.definition, sameMap = state.activeMapId === source.mapId;
  const separation = sameMap ? distance(state.player, source.site) : Infinity;
  const near = sameMap && separation <= d.range && passable(context, source.mapId, state.player, source.site);
  const reason = gatherReason(state, sourceId, context);
  return {
    id: sourceId, sourceId, mapId: source.mapId, role: source.site.role, point: point(source.site),
    name: d.name, label: d.name, hint: d.hint, itemId: expeditionResourceItem(source.site.role, source.mapId),
    capacity: d.capacity, remaining: life.remaining, nextReadyAt: life.nextReadyAt,
    waitSeconds: life.nextReadyAt === null ? 0 : Math.max(0, life.nextReadyAt - state.time),
    durationSeconds: d.durationSeconds, distance: separation, near, recoverable: d.recoverSeconds !== null,
    depleted: life.remaining === 0, reason, disabledReason: near ? reason : '',
    canGather: near && !reason, actionLabel: near ? (d.timberCost ? '回收长材' : '采集') : '走近', timberCost: d.timberCost,
  };
}

export function beginExpeditionGather(state: ForestExpeditionState, sourceId: string, context: ExpeditionContext): ExpeditionResult {
  const view = expeditionSourceView(state, sourceId, context);
  if (!view) return result(state, '请先选中林间物产。', false);
  if (view.mapId !== state.activeMapId) return result(state, '先前往这处物产所在的林地。', false);
  if (!view.near) return result(state, '先走近，再收取这里的物产。', false, view.point);
  if (view.reason) return result(state, view.reason, false);
  const sequence = state.nextAction;
  const action: ExpeditionAction = {
    id: `expedition-${sequence}`, sequence, kind: 'gather', sourceId, mapId: state.activeMapId,
    sourceVersion: state.sources[sourceId].version, startedAt: state.time, finishAt: state.time + view.durationSeconds,
    startPosition: point(state.player), inventoryRevision: state.inventory.revision,
  };
  return result(changed(state, { action, nextAction: sequence + 1 }), view.role === 'long-timber' ? '正在整理回收长材。' : `正在收取${view.name}。`);
}

export function cancelExpeditionAction(state: ForestExpeditionState, message = '已取消，材料与额度都没有消耗。'): ExpeditionResult {
  return state.action ? result(changed(state, { action: null }), message) : result(state);
}
export function moveExpeditionPlayer(state: ForestExpeditionState, destination: Point, context: ExpeditionContext): ExpeditionResult {
  if (!validPoint(destination) || (context.canStand && !context.canStand(state.activeMapId, destination))) return result(state, '这里暂时不能站立。', false);
  if (distance(state.player, destination) < .00001) return result(state);
  const cancelled = !!state.action;
  return result(changed(state, {
    player: point(destination), positions: { ...state.positions, [state.activeMapId]: point(destination) }, action: null,
  }), cancelled ? '移动已取消手头的操作，材料没有消耗。' : '');
}
export function switchExpeditionMap(state: ForestExpeditionState, mapId: ExpeditionMapId, context: ExpeditionContext): ExpeditionResult {
  if (!isMapId(mapId) || !context.maps[mapId]) return result(state, '这处林地尚未准备好。', false);
  if (state.activeMapId === mapId) return result(state);
  return result(changed(state, {
    activeMapId: mapId, player: point(state.positions[mapId]),
    positions: { ...state.positions, [state.activeMapId]: point(state.player) }, action: null,
  }), state.action ? '已取消手头操作，回到所选林地的上次停留处。' : '回到所选林地的上次停留处。');
}

function recipePlan(state: ForestExpeditionState, recipe: ExpeditionRecipe) {
  const stored = state.inventory.stacks.filter(stack => isStored(stack) && !stack.expeditionHarvest && !stack.harvest && !stack.wood?.reserved);
  const deltas: InventoryDelta[] = [], missing: string[] = [];
  const available = new Map(stored.map(stack => [stackKey(stack), stack.quantity]));
  for (const input of recipe.inputs) {
    let needed = input.quantity;
    for (const stack of stored) {
      if (!input.itemIds.includes(stack.itemId) || needed === 0) continue;
      const key = stackKey(stack), quantity = Math.min(needed, available.get(key) ?? 0);
      if (!quantity) continue;
      deltas.push({ ...stack, delta: -quantity }); available.set(key, available.get(key)! - quantity); needed -= quantity;
    }
    if (needed) missing.push(`${input.label}还差 ${needed} 份`);
  }
  for (const output of recipe.outputs) deltas.push({ itemId: output.itemId, qualityId: 'ordinary', expeditionPrepared: recipe.id, delta: output.quantity });
  return { deltas, missing };
}
export function beginExpeditionProcess(state: ForestExpeditionState, recipeId: string, context: ExpeditionContext): ExpeditionResult {
  if (!supplyNear(state, context)) return result(state, '先走近样区补给架，把原料入库后加工。', false, context.maps[state.activeMapId].supply);
  if (state.action) return result(state, busyReason(state), false);
  const recipe = EXPEDITION_RECIPES.find(value => value.id === recipeId);
  if (!recipe) return result(state, '这项加工尚未开放。', false);
  const plan = recipePlan(state, recipe);
  if (plan.missing.length) return result(state, `先把所需原料存入样区补给架：${plan.missing.join('，')}。`, false);
  // Validate the entire transaction now, but debit only after the timed operation completes.
  try { inventoryTransaction(state.inventory, plan.deltas, EXPEDITION_ITEM_CATALOG); }
  catch { return result(state, '原料已经变化，请重新选择加工。', false); }
  const sequence = state.nextAction;
  const action: ExpeditionAction = {
    id: `expedition-${sequence}`, sequence, kind: 'process', recipeId, deltas: plan.deltas,
    mapId: state.activeMapId, startedAt: state.time, finishAt: state.time + recipe.durationSeconds,
    startPosition: point(state.player), inventoryRevision: state.inventory.revision,
  };
  return result(changed(state, { action, nextAction: sequence + 1 }), `正在${recipe.name}，完成时一起结算。`);
}

/** The app calls this with its sole game clock. No wall time, RAF, intervals or offline refill. */
export function advanceExpedition(state: ForestExpeditionState, now: number, context: ExpeditionContext): ExpeditionResult {
  if (!validTime(now) || now < state.time) return result(state, '游戏时间不能倒退。', false);
  let next = now === state.time ? state : { ...state, time: now };
  let message = '', didChange = false;
  const action = next.action;
  if (action) {
    const source = action.kind === 'gather' ? findSource(context, action.sourceId) : null;
    const target = source?.site ?? context.maps[action.mapId].supply;
    const range = source?.definition.range ?? EXPEDITION_RULES.storageRange;
    const moved = action.mapId !== next.activeMapId || distance(next.player, action.startPosition) > .05 ||
      distance(next.player, target) > range || !passable(context, action.mapId, next.player, target);
    const stale = action.sequence <= next.lastSettledAction || action.inventoryRevision !== next.inventory.revision ||
      (action.kind === 'gather' && (!source || next.sources[action.sourceId]?.version !== action.sourceVersion));
    if (moved || stale) {
      next = { ...next, action: null }; didChange = true;
      message = moved ? '离开操作位置，已取消；材料没有消耗。' : '物产或库存已经变化，操作已取消。';
    } else if (now >= action.finishAt) {
      try {
        if (action.kind === 'gather') {
          const reason = gatherReason(next, action.sourceId, context, true);
          if (reason) throw new Error(reason);
          const life = next.sources[action.sourceId], definition = source!.definition;
          const inventory = gatherInventory(next, action.sourceId, context);
          const remaining = life.remaining - 1;
          next = {
            ...next, inventory, action: null, lastSettledAction: action.sequence,
            sources: { ...next.sources, [action.sourceId]: {
              remaining, version: life.version + 1,
              nextReadyAt: definition.recoverSeconds === null ? null : life.nextReadyAt ?? now + definition.recoverSeconds,
            } },
            timber: { ...next.timber, used: next.timber.used + definition.timberCost },
          };
          const label = EXPEDITION_ITEM_CATALOG.items.get(expeditionResourceItem(source!.site.role, source!.mapId))!.name;
          message = definition.destination === 'ground' ? '长材已放在身旁，拿起后交到样区补给架。' : `收到了 1 份${label}。`;
        } else {
          const recipe = EXPEDITION_RECIPES.find(value => value.id === action.recipeId)!;
          next = { ...next, inventory: inventoryTransaction(next.inventory, action.deltas, EXPEDITION_ITEM_CATALOG, action.inventoryRevision), action: null, lastSettledAction: action.sequence };
          message = `${recipe.name}完成，成品已放进样区补给架。`;
        }
        didChange = true;
      } catch (error) {
        next = { ...next, action: null }; didChange = true;
        message = error instanceof Error ? error.message : '操作没有完成，原料保持原样。';
      }
    }
  }
  // Recovery is capped once, across all plots; inactive scenes do not need tick/render owners.
  let sources = next.sources;
  for (const mapId of EXPEDITION_RULES.mapIds) for (const site of context.maps[mapId].resourceSites) {
    const life = sources[site.id], definition = EXPEDITION_RESOURCES[site.role];
    if (definition.recoverSeconds === null || life.nextReadyAt === null || life.nextReadyAt > now || (next.action?.kind === 'gather' && next.action.sourceId === site.id)) continue;
    if (sources === next.sources) sources = { ...sources };
    sources[site.id] = { remaining: definition.capacity, version: life.version + 1, nextReadyAt: null }; didChange = true;
  }
  if (sources !== next.sources) next = { ...next, sources };
  if (didChange) next = { ...next, revision: state.revision + 1 };
  return result(next, message);
}

export function changeExpeditionCarrying(state: ForestExpeditionState, intent: CarryIntent, context: ExpeditionContext): ExpeditionResult {
  if (state.action) return result(state, busyReason(state), false);
  if (intent.kind === 'method') {
    const method = carryMethod(intent.method), load = carryingLoad(carriedStacks(state.inventory), CARRY_PROFILES[method], 1, carryRegistry);
    if (load.reason) return result(state, load.reason, false);
    const inventory = { ...state.inventory, revision: state.inventory.revision + 1, carryMode: method };
    return result(changed(state, { inventory }), method === 'bundle' ? '已整理打捆，重量保持不变。' : '已改为双手散拿。');
  }
  if (intent.kind === 'store') {
    if (!supplyNear(state, context)) return result(state, '先走近样区补给架，再把材料入库。', false, context.maps[state.activeMapId].supply);
    const stacks = carriedStacks(state.inventory).filter(stack => intent.key === undefined || stackKey(stack) === intent.key);
    if (!stacks.length) return result(state, '手里没有需要存放的材料。', false);
    const inventory = inventoryTransaction(state.inventory, stacks.flatMap(stack => [{ ...stack, delta: -stack.quantity }, { ...located(stack), delta: stack.quantity }]), EXPEDITION_ITEM_CATALOG);
    return result(changed(state, { inventory }), '材料已存进三个样区共用的补给架。');
  }
  const stack = state.inventory.stacks.find(value => stackKey(value) === intent.key);
  if (!stack || !recognizedStack(stack, EXPEDITION_ITEM_CATALOG) || stack.wood?.reserved) return result(state, '这份材料已经变化或暂不能搬动。', false);
  let destination: TransportLocation;
  if (intent.kind === 'drop') {
    if (!isCarried(stack)) return result(state, '只能放下随身材料。', false);
    if (context.canStand && !context.canStand(state.activeMapId, state.player)) return result(state, '先走到空地再放下材料。', false);
    destination = { kind: 'ground', x: state.player.x, z: state.player.z };
  } else if (intent.kind === 'withdraw') {
    if (!isStored(stack)) return result(state, '这份材料不在样区补给架。', false);
    if (!supplyNear(state, context)) return result(state, '先走近样区补给架，再取材料。', false, context.maps[state.activeMapId].supply);
    destination = { kind: 'carried' };
  } else {
    const location = transportLocation(stack);
    if (location?.kind !== 'ground' || stack.expeditionMapId !== state.activeMapId) return result(state, '这份材料不在当前林地的地面上。', false);
    if (distance(state.player, location) > CARRY_RULES.pickupReach || !passable(context, state.activeMapId, state.player, location)) return result(state, '先走近这堆材料。', false, location);
    destination = { kind: 'carried' };
  }
  const transfer = (quantity: number) => inventoryTransaction(state.inventory, [
    { ...stack, delta: -quantity }, { ...located(stack, destination, state.activeMapId), delta: quantity },
  ], EXPEDITION_ITEM_CATALOG);
  let quantity = intent.quantity === 'max' ? stack.quantity : intent.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > stack.quantity) return result(state, '搬运数量已经变化。', false);
  if (intent.quantity === 'max' && destination.kind === 'carried') {
    let low = 0, high = quantity;
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (loadOf(transfer(middle)).reason) high = middle - 1; else low = middle; }
    quantity = low;
    if (!quantity) return result(state, loadOf(transfer(1)).reason || '已经拿满了。', false);
  }
  const inventory = transfer(quantity), reason = destination.kind === 'carried' ? loadOf(inventory).reason : '';
  if (reason) return result(state, reason, false);
  return result(changed(state, { inventory }), intent.kind === 'drop' ? '材料留在脚边，换图后仍可回来拿。' : `拿起了 ${quantity} 份${expeditionStackName(stack)}。`);
}

/** One explicit sample-kit issue. Reload/map switching cannot issue another empty can. */
export function claimExpeditionContainer(state: ForestExpeditionState, context: ExpeditionContext): ExpeditionResult {
  if (!supplyNear(state, context)) return result(state, '先走近样区补给架领取工具。', false, context.maps[state.activeMapId].supply);
  if (state.action) return result(state, busyReason(state), false);
  if (state.sapCanIssued) return result(state, '收液罐已经领过；可在行囊、地面或补给架找回。', false);
  const inventory = inventoryTransaction(state.inventory, [{ itemId: 'sap-can', qualityId: 'ordinary', expeditionEquipment: 'sap-can', transport: { kind: 'carried' }, delta: 1 }], EXPEDITION_ITEM_CATALOG);
  const reason = loadOf(inventory).reason;
  if (reason) return result(state, reason, false);
  return result(changed(state, { inventory, sapCanIssued: true }), '领到一只空收液罐，已放入行囊。');
}

export function expeditionStackName(stack: StackIdentity): string {
  if (stack.itemId === 'branch' && stack.wood?.spec?.straightness === 'curved') return '弯曲枝料';
  if (stack.itemId === 'wood' && stack.expeditionOrigin) return '回收长材';
  return EXPEDITION_ITEM_CATALOG.items.get(stack.itemId)?.name ?? stack.itemId;
}
export function expeditionSnapshot(state: ForestExpeditionState, context: ExpeditionContext) {
  const describe = (stack: InventoryStack) => ({ key: stackKey(stack), itemId: stack.itemId, name: expeditionStackName(stack), label: expeditionStackName(stack), quantity: stack.quantity, pendingMapId: pendingOrigin(stack) });
  const near = supplyNear(state, context), busy = !!state.action;
  const ground = state.inventory.stacks.filter(stack => transportLocation(stack)?.kind === 'ground' && stack.expeditionMapId === state.activeMapId).map(stack => {
    const location = transportLocation(stack)! as { kind: 'ground'; x: number; z: number };
    const local = distance(state.player, location) <= CARRY_RULES.pickupReach && passable(context, state.activeMapId, state.player, location);
    const load = carryingLoad([...carriedStacks(state.inventory), { ...stack, quantity: 1 }], CARRY_PROFILES[carryMethod(state.inventory.carryMode)], 1, carryRegistry);
    return { ...describe(stack), id: `expedition-haul:${stackKey(stack)}`, x: location.x, z: location.z, point: point(location), mapId: state.activeMapId, near: local, distance: distance(state.player, location), takeReason: busy ? busyReason(state) : load.reason };
  });
  const active = state.action;
  const action = active ? {
    ...active,
    name: active.kind === 'gather' ? expeditionSourceView(state, active.sourceId, context)?.name ?? '采集' : EXPEDITION_RECIPES.find(recipe => recipe.id === active.recipeId)?.name ?? '加工',
    progress: Math.max(0, Math.min(1, (state.time - active.startedAt) / (active.finishAt - active.startedAt))),
    remainingSeconds: Math.max(0, active.finishAt - state.time),
  } : null;
  const recipes = EXPEDITION_RECIPES.map(recipe => {
    const plan = recipePlan(state, recipe), reason = !near ? '先走近补给架' : busy ? busyReason(state) : plan.missing.join('，');
    return { ...recipe, ready: !reason, enabled: !reason, reason, missing: plan.missing };
  });
  const timber = { ...state.timber, remaining: state.timber.limit - state.timber.used, pendingByMap: Object.fromEntries(EXPEDITION_RULES.mapIds.map(mapId => [mapId, pendingExpeditionTimber(state, mapId, context)])) as Record<ExpeditionMapId, number> };
  return {
    time: state.time, activeMapId: state.activeMapId, player: point(state.player), carryLoad: expeditionLoad(state), carryMethod: carryMethod(state.inventory.carryMode),
    carried: carriedStacks(state.inventory).map(describe), stored: state.inventory.stacks.filter(isStored).map(describe), ground,
    sources: context.maps[state.activeMapId].resourceSites.map(site => expeditionSourceView(state, site.id, context)!),
    action, recipes, timber, quota: timber,
    storage: { near, point: point(context.maps[state.activeMapId].supply), label: '样区共用补给架', canClaimContainer: near && !busy && !state.sapCanIssued, containerIssued: state.sapCanIssued },
  };
}
export type ForestExpeditionSnapshot = ReturnType<typeof expeditionSnapshot>;

/** The host is the only persistence writer; these functions are snapshot adapters only. */
export function exportForestExpedition(state: ForestExpeditionState): ForestExpeditionState {
  return structuredClone({ ...state, positions: { ...state.positions, [state.activeMapId]: point(state.player) } });
}
export function serializeForestExpedition(state: ForestExpeditionState): string { return JSON.stringify(exportForestExpedition(state)); }
export function restoreForestExpedition(raw: string | unknown, context: ExpeditionContext): ForestExpeditionState {
  const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw);
  assertItemJson(value);
  const legacySources = isRecord(value) && value.schemaVersion === 1;
  if (!isRecord(value) || (!legacySources && value.schemaVersion !== EXPEDITION_RULES.schemaVersion) || !validInteger(value.revision) || !validTime(value.time) || !isMapId(value.activeMapId) || !validPoint(value.player) ||
    !isRecord(value.positions) || !isRecord(value.sources) || !isRecord(value.inventory) || typeof value.sapCanIssued !== 'boolean' ||
    !validInteger(value.nextAction) || value.nextAction < 1 || !validInteger(value.lastSettledAction) || value.lastSettledAction >= value.nextAction ||
    !isRecord(value.timber) || value.timber.limit !== EXPEDITION_RULES.timberAllowance || !validInteger(value.timber.used) || value.timber.used > value.timber.limit) throw new Error('Invalid expedition snapshot');
  for (const mapId of EXPEDITION_RULES.mapIds) {
    if (!validPoint(value.positions[mapId])) throw new Error('Invalid expedition return position');
    for (const site of context.maps[mapId].resourceSites) {
      const definition = EXPEDITION_RESOURCES[site.role];
      if (legacySources && value.sources[site.id] === undefined) {
        value.sources[site.id] = {remaining: definition.capacity, version: 0, nextReadyAt: null};
      }
      const life = value.sources[site.id];
      if (!isRecord(life) || !validInteger(life.remaining) || life.remaining > definition.capacity || !validInteger(life.version) ||
        !(life.nextReadyAt === null || validTime(life.nextReadyAt)) || (definition.recoverSeconds === null && life.nextReadyAt !== null)) throw new Error('Invalid expedition source state');
    }
  }
  const inventory = value.inventory as InventoryState;
  inventory.stacks = validateInventory(inventory);
  for (const stack of inventory.stacks) {
    if (stack.expeditionMapId !== undefined && !isMapId(stack.expeditionMapId)) throw new Error('Invalid expedition ground map');
    if (stack.expeditionHarvest !== undefined && (!isRecord(stack.expeditionHarvest) || !isMapId(stack.expeditionHarvest.mapId) || typeof stack.expeditionHarvest.sourceId !== 'string')) throw new Error('Invalid expedition timber origin');
  }
  const action = value.action;
  if (action !== null) {
    if (!isRecord(action) || !['gather', 'process'].includes(action.kind as string) || !validInteger(action.sequence) || action.sequence <= value.lastSettledAction || action.sequence >= value.nextAction ||
      action.id !== `expedition-${action.sequence}` || action.mapId !== value.activeMapId || !validTime(action.startedAt) || !validTime(action.finishAt) || action.finishAt <= action.startedAt ||
      !validPoint(action.startPosition) || !validInteger(action.inventoryRevision)) throw new Error('Invalid expedition action');
    if (action.kind === 'gather' && (typeof action.sourceId !== 'string' || !findSource(context, action.sourceId) || !validInteger(action.sourceVersion))) throw new Error('Invalid expedition gather action');
    if (action.kind === 'process' && (!EXPEDITION_RECIPES.some(recipe => recipe.id === action.recipeId) || !Array.isArray(action.deltas))) throw new Error('Invalid expedition process action');
  }
  if (legacySources) {
    for (const mapId of EXPEDITION_RULES.mapIds) {
      const position = value.positions[mapId];
      if (validPoint(position) && context.canStand?.(mapId,position) === false) value.positions[mapId] = point(context.maps[mapId].spawn);
    }
    if (context.canStand?.(value.activeMapId,value.player) === false) value.player = point(context.maps[value.activeMapId].spawn);
    value.schemaVersion = EXPEDITION_RULES.schemaVersion;
  }
  return value as ForestExpeditionState;
}
