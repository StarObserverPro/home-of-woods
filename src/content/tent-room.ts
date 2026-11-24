import { MOVEMENT, TENT } from './world.ts';
import { TENT_FURNISHINGS, TENT_SCALE, TENT_SHAPE } from './tent.ts';

/** A local room in the same metre scale and +Z doorway frame as the exterior. */
export const TENT_ROOM = {
  id: 'tent:interior', parentId: 'tent',
  width: TENT_SHAPE.halfWidth * 2 * TENT_SCALE,
  depth: TENT_SHAPE.halfDepth * 2 * TENT_SCALE,
  height: TENT_SHAPE.ridgeY * TENT_SCALE,
  floorY: TENT_SHAPE.floorY * TENT_SCALE,
  actorRadius: MOVEMENT.radius,
  // The real ranger is ~2.53 m tall and its turned head/hat reaches ~.66 m
  // beyond the standing point. The central band leaves room below the curved
  // inner canvas, including the full authored wind excursion.
  walkHalfX: 1.45,
  // The turned silhouette reaches .714 m; add the .056 m canvas thickness and
  // a small clearance. Feet still use the smaller radius around low belongings.
  wallClearance: .8,
} as const;

export const TENT_ENTRY = { x: 0, z: 2.85 };
export const TENT_USE_REACH = .4;
export const TENT_PORTAL = {
  threshold: { x: TENT.x, z: TENT.z + TENT_SHAPE.doorZ * TENT_SCALE },
  // The door and workbench leave a clear strip too narrow for the 1.5 m grid.
  // Enter it from the right shoulder instead of snapping the landing into either object.
  landing: { x: TENT.x, z: TENT.z + 5.15 },
  approach: { x: TENT.x + 5, z: TENT.z + 5.15 },
  outward: { x: 0, z: 1 }, outwardFacing: 0, approachReach: .65,
} as const;

/** Furnishing footprints share their source dimensions with both renderings. */
export const TENT_ROOM_BLOCKERS = [
  { id: 'tent:sleeping-bag', x: TENT_FURNISHINGS.sleepingBag.x * TENT_SCALE,
    z: TENT_FURNISHINGS.sleepingBag.z * TENT_SCALE,
    halfX: TENT_FURNISHINGS.sleepingBag.width * TENT_SCALE / 2,
    halfZ: TENT_FURNISHINGS.sleepingBag.length * TENT_SCALE / 2 },
  ...(['drum', 'bowl'] as const).map(id => ({ id: `tent:${id}`,
    x: TENT_FURNISHINGS[id].x * TENT_SCALE, z: TENT_FURNISHINGS[id].z * TENT_SCALE,
    halfX: TENT_FURNISHINGS[id].radius * TENT_SCALE,
    halfZ: TENT_FURNISHINGS[id].radius * TENT_SCALE })),
] as const;
