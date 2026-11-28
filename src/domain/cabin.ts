import { CABIN_ENTRY, CABIN_EXTERIOR, CABIN_PORTAL, CABIN_ROOM, CABIN_SCONCE_STAND, CABIN_USE_REACH } from '../content/cabin.ts';
import type { Point } from '../content/world.ts';
import type { Collider } from '../world/layout.ts';
import type { TravelAccess } from '../world/regions.ts';
import { movementOffset } from './movement.ts';
import { canStand, findPath, move, navigationGridPoint } from './navigation.ts';

export type CabinPlayer = Point & { facing: number; moving: boolean };
export type CabinAction = 'exit' | 'lamp';
export type CabinVisit = {
  player: CabinPlayer;
  destination: Point | null;
  action: CabinAction | null;
};

export function makeCabinVisit(): CabinVisit {
  return { player: { ...CABIN_ENTRY, facing: Math.PI, moving: false }, destination: null, action: null };
}

const radius = CABIN_ROOM.actorRadius;
export function cabinFloorPoint({ x, z }: Point): Point {
  const maxX = CABIN_ROOM.width / 2 - radius, maxZ = CABIN_ROOM.depth / 2 - radius;
  return { x: Math.max(-maxX, Math.min(maxX, x)), z: Math.max(-maxZ, Math.min(maxZ, z)) };
}

export function cabinActionPoint(action: CabinAction) {
  return action === 'exit' ? CABIN_ENTRY : CABIN_SCONCE_STAND;
}

export function nearCabinAction(point: Point, action: CabinAction) {
  const target = cabinActionPoint(action);
  return Math.hypot(point.x - target.x, point.z - target.z) <= CABIN_USE_REACH;
}

export function stepCabinVisit(visit: CabinVisit, input: Point, dt: number, loadSpeed: number, run: boolean, walkSpeed?:number,runSpeed?:number) {
  const { player } = visit;
  if (input.x || input.z) {
    visit.destination = null;
    visit.action = null;
  }
  let distance = Infinity;
  if (visit.destination) {
    const x = visit.destination.x - player.x, z = visit.destination.z - player.z;
    distance = Math.hypot(x, z);
    input = distance > .02 ? { x: x / distance, z: z / distance } : { x: 0, z: 0 };
    if (distance <= .02) visit.destination = null;
  }
  const step = movementOffset(input, loadSpeed, run, dt, distance, walkSpeed, runSpeed);
  const next = cabinFloorPoint({ x: player.x + step.x, z: player.z + step.z });
  const x = next.x - player.x, z = next.z - player.z;
  player.moving = Math.hypot(x, z) > .001;
  if (player.moving) player.facing = Math.atan2(x, z);
  Object.assign(player, next);
}

export function atCabinEntrance(point: Point) {
  const { landing } = CABIN_PORTAL;
  return Math.hypot(point.x - landing.x, point.z - landing.z) <= CABIN_EXTERIOR.approachReach;
}

export function cabinApproachRoute(from: Point, colliders: Collider[], access: TravelAccess): Point[] {
  const { landing } = CABIN_PORTAL;
  if (!canStand(landing, colliders, undefined, access)) return [];
  const grid = navigationGridPoint(landing);
  if (!canStand(grid, colliders, undefined, access)) return [];
  // The outdoor nav grid is coarser than the doorway. Keep its final connection
  // on the approach side and validate the short off-grid segment as well.
  const end = move(grid, landing.x - grid.x, landing.z - grid.z, colliders, access);
  if (Math.hypot(end.x - landing.x, end.z - landing.z) > .01) return [];
  return findPath(from, landing, colliders, access);
}
