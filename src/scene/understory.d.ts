import * as T from 'three';
import type {Resources} from './resources.ts';
import type {Tree} from '../world/layout.ts';
import type {GameState} from '../domain/state.ts';
export function createUnderstory(r:Resources,trees:Tree[],selections:Map<string,T.Object3D>):{group:T.Group;update(state:GameState):void;stats():Record<string,unknown>};
