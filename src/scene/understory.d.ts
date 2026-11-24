import * as T from 'three';
import type {Resources} from './resources.ts';
import type {Tree} from '../world/layout.ts';
import type {GameState} from '../domain/state.ts';
export function createUnderstory(r:Resources,trees:Tree[],selections:Map<string,T.Object3D>):{
 group:T.Group;
 /** Increment activeChunksRevision when mutating the supplied chunk set. Omit it to compare membership each update. */
 update(state:GameState,activeChunks?:ReadonlySet<string>,activeChunksRevision?:number):void;
 stats():Record<string,unknown>;
};
