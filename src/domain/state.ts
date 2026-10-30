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
export type GameState = {
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
