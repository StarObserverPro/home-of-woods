import type { Point } from '../content/world.ts';
import type { WildlifeDefinitionId } from '../content/wildlife.ts';
/** Fixed candidates, never individual animals permanently installed at every site. */
export type WildlifeAnchor = Point & { id: string; definitionId: WildlifeDefinitionId; habitat: string };
export const WILDLIFE_ANCHORS: readonly WildlifeAnchor[] = [
  { id: 'wildlife.home.squirrel', definitionId: 'wildlife.squirrel', habitat: 'forest-edge', x: -43, z: -4 },
  { id: 'wildlife.home.hare', definitionId: 'wildlife.hare', habitat: 'meadow-edge', x: -30, z: 5 },
  { id: 'wildlife.trail.squirrel', definitionId: 'wildlife.squirrel', habitat: 'forest-edge', x: -37, z: 23 },
  { id: 'wildlife.trail.hare', definitionId: 'wildlife.hare', habitat: 'meadow-edge', x: -29, z: 18 },
];
