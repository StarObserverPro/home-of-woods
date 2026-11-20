import { CAMP_FOREST_TRAIL } from '../content/forest-expedition.ts';
import { EXPEDITION_RULES } from '../content/expedition-resources.ts';
import type { Point } from '../content/world.ts';
import { cachedExpeditionLayout, expeditionCanStand, expeditionSegmentWalkable } from '../world/forest-expedition.ts';
import { createForestExpedition, exportForestExpedition, pendingTimberIn, restoreForestExpedition } from './forest-expedition.ts';
import type { ExpeditionContext, ForestExpeditionState } from './forest-expedition.ts';
import { isRecord, validateInventory } from './inventory.ts';
import type { InventoryState, InventoryStack } from './inventory.ts';
import type { GameState } from './state.ts';
import { isCarried, transportLocation } from './transport-location.ts';

/** The main save owns the bag. Only stock that physically stays in the forest lives here. */
export type CampExpedition = Omit<ForestExpeditionState, 'inventory'> & { active: boolean; localStacks: InventoryStack[] };
type CampWorld = Pick<GameState, 'expedition' | 'inventory'>;

export function campExpeditionContext(inventory: InventoryState): ExpeditionContext {
  const maps = {upper: cachedExpeditionLayout('upper'), mixed: cachedExpeditionLayout('mixed'), lower: cachedExpeditionLayout('lower')};
  const outside = inventory.stacks.filter(stack => !isCarried(stack) && !!stack.expeditionHarvest);
  return {
    maps,
    canStand: (id, point) => expeditionCanStand(maps[id], point.x, point.z),
    canInteract: (id, from, to) => expeditionSegmentWalkable(maps[id], from, to, .24),
    campPendingTimber: id => pendingTimberIn(outside, id),
  };
}
const near = (a: Point, b: Point) => Math.hypot(a.x-b.x, a.z-b.z) <= CAMP_FOREST_TRAIL.reach;
export const nearCampForestTrail = (player: Point) => near(player, CAMP_FOREST_TRAIL.point);
export function nearExpeditionExit(state: ForestExpeditionState, context: ExpeditionContext) {
  const exit = context.maps[state.activeMapId].spawn;
  return near(state.player, exit) && (context.canInteract?.(state.activeMapId, state.player, exit) ?? true);
}

function travelingInventory(main: InventoryState, localStacks: InventoryStack[]): InventoryState {
  return {
    schemaVersion: main.schemaVersion, revision: main.revision,
    carryMode: main.carryMode ?? 'hands', stacks: [...main.stacks.filter(isCarried), ...localStacks],
  };
}

export function validateCampExpedition(raw: unknown, inventory: InventoryState): CampExpedition {
  if (!isRecord(raw) || typeof raw.active !== 'boolean' || !Array.isArray(raw.localStacks)) throw new Error('林地存档无效');
  const { active, localStacks, ...journey } = raw;
  const local = validateInventory({...inventory, stacks: localStacks});
  for (const stack of local) {
    const location = transportLocation(stack);
    const hasMap = EXPEDITION_RULES.mapIds.some(id => id === stack.expeditionMapId);
    if (location?.kind === 'carried' || (location?.kind === 'ground' ? !hasMap : stack.expeditionMapId !== undefined)) throw new Error('林地货物位置无效');
  }
  const restored = restoreForestExpedition({...journey, inventory: travelingInventory(inventory, local)}, campExpeditionContext(inventory));
  if (!active && restored.action) throw new Error('离开的林地不能保留进行中的动作');
  const { inventory: combined, ...valid } = restored;
  void combined;
  return {...valid, active, localStacks: local};
}

export function openCampExpedition(world: CampWorld, context = campExpeditionContext(world.inventory)): ForestExpeditionState {
  const trip = world.expedition;
  if (!trip) return createForestExpedition(context,{inventory:travelingInventory(world.inventory,[])});
  const {localStacks, active, ...journey} = trip;
  const {x,z} = context.maps[journey.activeMapId].spawn;
  return {...journey, player: active ? journey.player : {x,z}, inventory: travelingInventory(world.inventory,localStacks)};
}

/** One checkpoint writes carried and local stock together. */
export function campWithExpedition<T extends CampWorld>(world: T, forest: ForestExpeditionState, active: boolean): T {
  if (forest.time < (world.expedition?.time ?? 0)) throw new Error('林地进度已更新');
  const {inventory, ...journey} = exportForestExpedition(forest);
  const stacks = [...world.inventory.stacks.filter(stack => !isCarried(stack)), ...inventory.stacks.filter(isCarried)];
  const mainInventory = {...world.inventory, revision: inventory.revision, carryMode: inventory.carryMode ?? 'hands', stacks};
  return {
    ...world, inventory: mainInventory,
    expedition: {...journey, action: active ? journey.action : null, active, localStacks: inventory.stacks.filter(stack => !isCarried(stack))},
  };
}
