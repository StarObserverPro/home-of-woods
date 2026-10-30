import { START, WORLD_SEED } from "../content/world.ts";
import type { Point } from "../content/world.ts";
import {makeTrees} from '../world/layout.ts';
import type {Tree} from '../world/layout.ts';
import {createForestry} from './forestry.ts';
import type {ForestryState} from './forestry.ts';
export type GameState = {
  seed: number;
  time:number;
  forestry:ForestryState;
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
    player: { ...START, facing: 0, moving: false },
    selected: null,
    route: [],
    visited: ["home"],
  };
}
