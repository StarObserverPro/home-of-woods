import type { Point } from '../content/world.ts';
import type { WildlifeDefinitionId } from '../content/wildlife.ts';
/** Stable candidate anchors, not permanently populated positions. Patrol is a short, vetted local ledge/clearing route. */
export type WildlifeAnchor = Point & { id: string; definitionId: WildlifeDefinitionId; habitat: string;
  patrol?: Point; facing?: number; };
export const WILDLIFE_ANCHORS: readonly WildlifeAnchor[] = [
  { id: 'wildlife.home.squirrel', definitionId: 'wildlife.squirrel', habitat: 'forest-edge', x: -43, z: -4 },
  { id: 'wildlife.home.hare', definitionId: 'wildlife.hare', habitat: 'meadow-edge', x: -30, z: 5 },
  { id: 'wildlife.trail.squirrel', definitionId: 'wildlife.squirrel', habitat: 'forest-edge', x: -37, z: 23 },
  { id: 'wildlife.trail.hare', definitionId: 'wildlife.hare', habitat: 'meadow-edge', x: -29, z: 18 },
  // Far east ridge: relatively open grass/trees, good skyline silhouette looking from camp.
  { id: 'wildlife.ridge.stag.high', definitionId: 'wildlife.stag', habitat: 'ridge-meadow', x: 70, z: -40, patrol: {x: 68.6,z: -41}, facing: -2.4 },
  { id: 'wildlife.ridge.stag.lower', definitionId: 'wildlife.stag', habitat: 'ridge-meadow', x: 55, z: -40, patrol: {x: 56.3,z: -39.4}, facing: -1.6 },
  // Right-hand gorge shoulder: visually attached to the rock, outside the ordinary roaming pool.
  { id: 'wildlife.cliff.goat.shoulder', definitionId: 'wildlife.goat', habitat: 'cliff-ledge', x: 55, z: 36, patrol: {x: 55.9,z: 35.6}, facing: -1.8 },
  { id: 'wildlife.cliff.goat.rim', definitionId: 'wildlife.goat', habitat: 'cliff-ledge', x: 55, z: 48, patrol: {x: 55.7,z: 47.5}, facing: -.9 },
];
