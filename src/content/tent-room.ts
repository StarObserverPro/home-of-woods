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
  // Keep the standing actor below the sloping canvas, clear of the low hems.
  walkHalfX: 2.65,
} as const;

export const TENT_ENTRY = { x: 0, z: 2.85 };
export const TENT_USE_REACH = .4;
export const TENT_PORTAL = {
  threshold: { x: TENT.x, z: TENT.z + TENT_SHAPE.doorZ * TENT_SCALE },
  // The navigation grid is 1.5 m: +5.5 snaps to the clear +6 m row.
  landing: { x: TENT.x, z: TENT.z + 5.5 },
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
