import { RUNTIME_MODELS } from '../content/assets.ts';
import { makeTrees } from '../world/layout.ts';
import type { Tree } from '../world/layout.ts';
import { createGatheringRegistry } from './gathering-registry.ts';
import type { GatheringRegistry } from './gathering-registry.ts';
import {CAMP_PROPS} from '../content/scene-props.ts';
import {ALTAR_LAYOUT} from '../content/altar.ts';
export function createSaveContext(trees: Tree[] = makeTrees(), registry: GatheringRegistry = createGatheringRegistry({ assetIds: RUNTIME_MODELS.map(asset => asset.assetId) })) {
  return { trees: new Map(trees.filter(tree => tree.role !== 'scenery').map(tree => [tree.id, tree])), registry,
    selectable: new Set([...trees.map(tree => tree.id), ...registry.sources.keys(), 'cabin', 'tent',...Object.values(CAMP_PROPS).map(p=>p.id),ALTAR_LAYOUT.oracle.id]) };
}
export type SaveContext = ReturnType<typeof createSaveContext>;
