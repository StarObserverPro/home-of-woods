import { starterWardrobeItems } from '../content/wardrobe.ts';
import type {WildlifeState} from './wildlife.ts';
import {createWoodcraft} from './woodcraft.ts';
import type {WoodcraftState} from './woodcraft.ts';
import { START, WORLD_SEED } from "../content/world.ts";
import type { Point } from "../content/world.ts";
import {makeTrees} from '../world/layout.ts';
import type {Tree} from '../world/layout.ts';
import {createForestry} from './forestry.ts';
import type {ForestryState} from './forestry.ts';
import { createInventory } from './inventory.ts';
import type { InventoryState } from './inventory.ts';
import { createGathering } from './gathering.ts';
import type { GatheringState } from './gathering.ts';
import { createGatheringRegistry } from './gathering-registry.ts';
import { RUNTIME_MODELS } from '../content/assets.ts';
import type {RitualAction} from './ritual.ts';
import {createWorkshop} from './workshop.ts';
import {createMerchant} from './merchant.ts';
import type {MerchantState} from './merchant.ts';
import type {WorkshopState} from './workshop.ts';
import {createLocalClock} from './local-clock.ts';
import type {LocalClock} from './local-clock.ts';
import {createDayCycle} from './day-cycle.ts';
import type {DayCycleState} from './day-cycle.ts';
import {createFoodState} from './food.ts';
import type {FoodState} from './food.ts';
export type GameState = {
  /** Decorative encounter state is session-local, not an inventory or save slice. */
  wildlife?: WildlifeState;
  woodcraft:WoodcraftState;
  workshop:WorkshopState;
  merchant:MerchantState;
  clock:LocalClock;
  dayCycle:DayCycleState;
  food:FoodState;
  ritual: RitualAction | null;
  seed: number;
  time:number;
  forestry:ForestryState;
  inventory: InventoryState;
  gathering: GatheringState;
  player: Point & { facing: number; moving: boolean };
  selected: string | null;
  route: Point[];
  visited: string[];
};
export function createState(trees:Tree[]=makeTrees()): GameState {
  return {
    woodcraft:createWoodcraft(),
    ritual: null,
    workshop:createWorkshop(),
    merchant:createMerchant(),
    clock:createLocalClock(),
    dayCycle:createDayCycle(),
    food:createFoodState(),
    seed: WORLD_SEED,
    time:0,
    forestry:createForestry(trees),
    inventory: createInventory(),
    gathering: createGathering(createGatheringRegistry({ assetIds: RUNTIME_MODELS.map(a => a.assetId) })),
    player: { ...START, facing: 0, moving: false },
    selected: null,
    route: [],
    visited: ["home"],
  };
}

/** Only the actual new-game entry grants starter clothes; generic states and legacy saves stay unchanged. */
export function createStarterState(trees:Tree[]=makeTrees()):GameState {
  const state=createState(trees);
  state.inventory={...state.inventory,instances:starterWardrobeItems()};
  return state;
}
